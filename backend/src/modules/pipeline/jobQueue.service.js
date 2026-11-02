import crypto from 'crypto';
import { Job } from './job.model.js';
import { Document } from '../documents/document.model.js';
import { config } from '../../config/index.js';
import { assertPolicyUnchangedBeforeSave, AI_POLICIES } from '../../services/pipeline/privacyGate.js';

const WORKER_ID = `worker-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

// Environment defaults
const LEASE_TIMEOUT_MS = config.pipeline?.leaseTimeoutMs || 60000; // 60s lease
const MAX_CONCURRENCY = config.pipeline?.maxConcurrency || 2;
const MAX_PAGES = config.pipeline?.maxPages || 25;
const PER_PAGE_TIMEOUT_MS = config.pipeline?.perPageTimeoutMs || 15000;
const MEMORY_LIMIT_BYTES = config.pipeline?.memoryGuardBytes || 450 * 1024 * 1024; // 450 MB guard

let isWorkerRunning = false;
let activeJobCount = 0;
let workerInterval = null;

/**
 * Enqueue a document for asynchronous processing.
 * Idempotent: If a job with sha256 + pipelineVersion exists, re-uses or re-queues it.
 */
export async function enqueueDocumentJob({
  documentId,
  userId,
  sha256,
  pipelineVersion = '1.0.0',
  pageCount = 1,
}) {
  const idempotencyKey = `${sha256}_${pipelineVersion}`;

  // Enforce 25-page cap immediately at enqueue
  if (pageCount > MAX_PAGES) {
    await Document.findByIdAndUpdate(documentId, {
      status: 'failed',
      processingStatus: 'failed',
      reviewStatus: 'rejected',
      summary: `Document rejected: Exceeds maximum allowance of ${MAX_PAGES} pages (found ${pageCount}).`,
    });
    throw new Error(`Document exceeds maximum limit of ${MAX_PAGES} pages.`);
  }

  // Find or create atomically
  const existing = await Job.findOne({ idempotencyKey });
  if (existing) {
    if (existing.status === 'done') {
      return { job: existing, isDuplicate: true };
    }
    // If previous attempt failed, reset attempts and re-queue
    if (existing.status === 'failed') {
      existing.status = 'queued';
      existing.attempts = 0;
      existing.error = null;
      existing.nextRetryAt = null;
      existing.documentId = documentId;
      await existing.save();
      return { job: existing, isDuplicate: false };
    }
    return { job: existing, isDuplicate: true };
  }

  const job = await Job.create({
    documentId,
    userId,
    sha256,
    pipelineVersion,
    pageCount,
    idempotencyKey,
    status: 'queued',
  });

  return { job, isDuplicate: false };
}

/**
 * Atomically claims the next eligible job from the queue
 */
export async function claimNextJob(workerId = WORKER_ID) {
  const now = new Date();

  // Guard against heap exhaustion
  const mem = process.memoryUsage();
  if (mem.heapUsed > MEMORY_LIMIT_BYTES) {
    console.warn(`[JobQueue Memory Guard] Heap usage high (${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB). Deferring job claim.`);
    return null;
  }

  const filter = {
    $or: [
      {
        status: 'queued',
        $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }],
      },
      {
        status: 'running',
        leaseExpiresAt: { $lt: now }, // Stale worker lease recovery
      },
    ],
  };

  const update = {
    $set: {
      status: 'running',
      leasedAt: now,
      leaseExpiresAt: new Date(now.getTime() + LEASE_TIMEOUT_MS),
      lockedBy: workerId,
    },
    $inc: { attempts: 1 },
  };

  const claimed = await Job.findOneAndUpdate(filter, update, {
    sort: { createdAt: 1 },
    returnDocument: 'after',
  });

  return claimed;
}

/**
 * Mark a job successfully completed
 */
export async function completeJob(jobId, resultSummary = null) {
  return await Job.findByIdAndUpdate(
    jobId,
    {
      status: 'done',
      stage: 'done',
      leaseExpiresAt: null,
      lockedBy: null,
      resultSummary,
    },
    { returnDocument: 'after' }
  );
}

/**
 * Handle job failure with exponential backoff (up to 3 attempts)
 */
export async function failJob(jobId, errorMsg) {
  const job = await Job.findById(jobId);
  if (!job) return null;

  const currentAttempts = job.attempts;
  const isFinal = currentAttempts >= job.maxAttempts;

  if (isFinal) {
    job.status = 'failed';
    job.stage = 'failed';
    job.error = errorMsg;
    job.leaseExpiresAt = null;
    job.lockedBy = null;
    await job.save();

    // Mark document as failed
    await Document.findByIdAndUpdate(job.documentId, {
      status: 'failed',
      processingStatus: 'failed',
      summary: `Extraction failed after ${currentAttempts} attempts: ${errorMsg}`,
    });
  } else {
    // Exponential backoff: 2s, 8s
    const backoffSeconds = Math.pow(currentAttempts + 1, 2);
    job.status = 'queued';
    job.error = `Attempt ${currentAttempts} failed: ${errorMsg}`;
    job.nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
    job.leaseExpiresAt = null;
    job.lockedBy = null;
    await job.save();

    await Document.findByIdAndUpdate(job.documentId, {
      status: 'queued',
      processingStatus: 'queued',
    });
  }

  return job;
}

/**
 * Cancel and delete any pending or running jobs for a document.
 * Invoked when document policy is switched to storage_only.
 */
export async function cancelJobsForDocument(documentId) {
  const result = await Job.deleteMany({
    documentId,
    status: { $in: ['queued', 'running'] },
  });
  return result.deletedCount;
}

/**
 * Core job execution cycle for a single claimed job
 */
export async function executeSingleJob(job) {
  const document = await Document.findById(job.documentId);
  if (!document) {
    return await failJob(job._id, 'Referenced document was deleted before job processing.');
  }

  // 1. Check if document was switched to storage_only before processing began
  if (document.aiPolicy === AI_POLICIES.STORAGE_ONLY || document.sensitiveFlag === true) {
    await completeJob(job._id, { mode: 'storage_only', note: 'Document is isolated to storage_only.' });
    await Document.findByIdAndUpdate(document._id, {
      status: 'storage_only',
      processingStatus: 'storage_only',
      extractedText: '',
      extractedFields: [],
    });
    return;
  }

  // 2. Mark document as processing
  await Document.findByIdAndUpdate(document._id, {
    status: 'processing',
    processingStatus: 'processing',
  });

  const overallTimeoutMs = Math.max(10000, (job.pageCount || 1) * PER_PAGE_TIMEOUT_MS);

  try {
    // Dynamic import to prevent circular dependency
    const { executeDocumentExtractionPipeline } = await import('../extraction/extractionPipeline.service.js');

    const jobPromise = executeDocumentExtractionPipeline({
      userId: document.userId,
      buffer: Buffer.from(document.fileData || '', 'base64'),
      mimetype: document.mimetype,
      originalname: document.originalName,
      userConsent: document.aiPolicy,
      existingDocumentId: document._id,
      expectedPolicyVersion: document.policyVersion,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Job timed out after ${overallTimeoutMs / 1000}s`)), overallTimeoutMs)
    );

    const result = await Promise.race([jobPromise, timeoutPromise]);

    // 3. Re-verify policy consistency before finalizing job
    await assertPolicyUnchangedBeforeSave(document._id, document.policyVersion);

    await completeJob(job._id, {
      status: 'success',
      fieldsExtracted: result?.extractedFields?.length || 0,
      tierUsed: result?.tierUsed || 'complete',
    });

    await Document.findByIdAndUpdate(document._id, {
      status: result?.processingStatus || 'completed',
      processingStatus: result?.processingStatus || 'completed',
    });
  } catch (err) {
    console.error(`[Job Worker Error on Job ${job._id}]:`, err.message);
    await failJob(job._id, err.message);
  }
}

/**
 * Start the background polling worker
 */
export function startJobWorker(pollIntervalMs = 2000) {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  workerInterval = setInterval(async () => {
    if (activeJobCount >= MAX_CONCURRENCY) return;

    try {
      const job = await claimNextJob();
      if (!job) return;

      activeJobCount++;
      executeSingleJob(job)
        .catch(err => console.error('[Job Worker Unhandled Exception]:', err))
        .finally(() => {
          activeJobCount = Math.max(0, activeJobCount - 1);
        });
    } catch (err) {
      console.warn('[Job Worker Loop Warning]:', err.message);
    }
  }, pollIntervalMs);

  console.log(`[Job Worker] Initialized worker: ${WORKER_ID} (Max Concurrency: ${MAX_CONCURRENCY}, Max Pages: ${MAX_PAGES})`);
}

/**
 * Stop the background polling worker (for graceful shutdown and tests)
 */
export function stopJobWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  isWorkerRunning = false;
  activeJobCount = 0;
}
