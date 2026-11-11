import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { upload } from '../../middleware/upload.middleware.js';
import { Document, Deadline, AuditLog } from '../../models/index.js';
import { sanitizeKeyDetails } from '../../utils/sanitize.js';
import { detectSensitiveDocument } from '../../services/pipeline/sensitiveDetector.js';
import { AI_POLICIES } from '../../services/pipeline/privacyGate.js';
import { enqueueDocumentJob, cancelJobsForDocument } from '../pipeline/jobQueue.service.js';
import { validateFileSignature, validateImageSafety, validatePdfSafety, generateSafeServerFilename, UploadSecurityError } from '../extraction/uploadValidation.service.js';
import { validateDocumentImage, DocumentImageValidationError } from '../extraction/documentImageValidation.service.js';
import { extractTextFromPDF, convertPdfToImages } from '../../services/ocr/ocrService.js';
import { checkUploadRateLimit } from '../extraction/uploadRateLimiter.js';
import { DocumentAccessControlService } from '../sharing/accessControl.service.js';
import { ShareAccessLog, SHARE_ACTION } from '../sharing/models/shareAccessLog.model.js';
import { config } from '../../config/index.js';

const router = Router();

// GET /api/documents - List documents with optional category filter & full-text search
router.get('/', requireAuth, async (req, res) => {
  try {
    const { category, q } = req.query;
    const filter = { userId: req.user.userId };

    if (category && category !== 'All') {
      filter.category = { $regex: new RegExp(`^${category}`, 'i') };
    }

    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { summary: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } },
      ];
    }

    const documents = await Document.find(filter)
      .select('-fileData') // Exclude raw base64 data to keep payload fast
      .sort({ createdAt: -1 });

    res.json({ success: true, count: documents.length, data: documents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/documents/:id - Get single document details (Protected with Central Access Control)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const access = await DocumentAccessControlService.canViewDocument(req.user.userId, req.params.id);
    if (!access.allowed) {
      return res.status(access.reason === 'Document not found' ? 404 : 403).json({
        success: false,
        error: access.reason || 'Access denied to this document.',
      });
    }

    const doc = await Document.findById(req.params.id).select('-fileData');
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    // Record audit trail
    if (access.isOwner) {
      await AuditLog.create({
        userId: req.user.userId,
        action: 'VIEW',
        documentTitle: doc.title,
        device: req.headers['user-agent'] || 'Web Client',
      }).catch(err => console.warn('[Audit Log] Failed to save view audit:', err.message));
    } else {
      await ShareAccessLog.create({
        ownerId: doc.userId,
        recipientId: req.user.userId,
        documentId: doc._id,
        action: SHARE_ACTION.VIEWED,
        metadata: { client: req.headers['user-agent'] || 'Web Client' },
      }).catch(() => {});
    }

    res.json({ success: true, data: doc, isOwner: access.isOwner, permissions: access.grant?.permissions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/documents/upload
 * 
 * Asynchronous Ingestion & Privacy Gate (Phase A):
 * 1. Binary Magic Bytes Validation
 * 2. Deterministic SHA-256 calculation
 * 3. Local Sensitive Document Detection (Aadhaar, PAN, Passport, Voter ID, DL, Luhn)
 * 4. Privacy Gate: Forces storage_only for sensitive documents (no third-party AI)
 * 5. Asynchronous Job Enqueue: Returns immediately with status 'queued', eliminating timeouts
 */
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    // 0. Upload Rate Limiting (Protects server from DoS / resource exhaustion)
    const rateCheck = checkUploadRateLimit(req.user.userId);
    if (!rateCheck.allowed) {
      return res.status(429).json({ success: false, error: rateCheck.error, retryAfter: rateCheck.retryAfterSec });
    }

    const { originalname, mimetype, buffer } = req.file;

    // 1. Layer 1: Strict File Security & Signature Validation
    let signature;
    let pageCount = 1;

    try {
      signature = validateFileSignature(buffer, mimetype, originalname);

      if (signature.detectedType === 'application/pdf') {
        const pdfCheck = validatePdfSafety(buffer);
        pageCount = pdfCheck.pageCount;

        // Verify PDF contains readable text or valid document page structure (reject blank PDF)
        const pdfText = await extractTextFromPDF(buffer);
        const cleanPdfText = pdfText.replace(/-- \d+ of \d+ --/g, '').replace(/\s+/g, ' ').trim();
        if (cleanPdfText.length < 15) {
          // If digital text layer is minimal, inspect rendered first page image
          try {
            const renderedPages = await convertPdfToImages(buffer, 1, 1.0);
            if (renderedPages && renderedPages.length > 0) {
              await validateDocumentImage(renderedPages[0]);
            }
          } catch (renderErr) {
            if (renderErr instanceof DocumentImageValidationError && renderErr.reasonCode === 'BLANK_IMAGE') {
              throw renderErr;
            }
            console.warn('[PDF Guard] Page rendering inspection warning:', renderErr.message);
          }
        }
      } else if (signature.detectedType.startsWith('image/')) {
        const imgMeta = await validateImageSafety(buffer);
        // 2. Layer 2: Document Image Guardrail (Rejects blank, casual portraits, selfies, collages)
        await validateDocumentImage(buffer, imgMeta);
      }
    } catch (valErr) {
      const statusCode = (valErr instanceof UploadSecurityError || valErr instanceof DocumentImageValidationError) ? 400 : 500;
      return res.status(statusCode).json({
        success: false,
        error: valErr.message,
        code: valErr.code || valErr.reasonCode || 'VALIDATION_FAILED'
      });
    }

    // 2. Compute deterministic SHA-256
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // 3. Local In-Process Sensitive Document Detection
    const sensitiveCheck = detectSensitiveDocument({
      filename: originalname,
      buffer,
    });

    // 4. Determine AI Policy: Sensitive files are strictly FORCED to storage_only
    let requestedPolicy = req.body.aiPolicy;
    if (!requestedPolicy) {
      if (req.body.userConsent === 'PROCESSABLE' || req.body.privacyMode === 'PROCESSABLE' || req.body.userConsent === 'ai_enabled') {
        requestedPolicy = AI_POLICIES.AI_ENABLED;
      } else if (req.body.userConsent === 'STORAGE_ONLY' || req.body.privacyMode === 'STORAGE_ONLY' || req.body.userConsent === 'storage_only') {
        requestedPolicy = AI_POLICIES.STORAGE_ONLY;
      } else {
        requestedPolicy = config.pipeline?.defaultAiPolicy || AI_POLICIES.STORAGE_ONLY;
      }
    }

    if (sensitiveCheck.isSensitive) {
      requestedPolicy = AI_POLICIES.STORAGE_ONLY;
    }

    // Check user informed consent if ai_enabled requested
    let aiConsent = { grantedAt: null, noticeVersion: null };
    if (requestedPolicy === AI_POLICIES.AI_ENABLED && !sensitiveCheck.isSensitive) {
      aiConsent = {
        grantedAt: new Date(),
        noticeVersion: req.body.noticeVersion || config.pipeline?.noticeVersion || '1.0.0',
      };
    }

    const isStorageOnly = requestedPolicy === AI_POLICIES.STORAGE_ONLY;
    const initialStatus = isStorageOnly ? 'storage_only' : 'queued';
    const category = sensitiveCheck.isSensitive ? 'Identity' : (req.body.category || 'Other');

    // 5. Persist Document Record
    const docData = {
      userId: req.user.userId,
      title: (req.body.title || originalname).replace(/\.[^/.]+$/, ''),
      originalName: originalname,
      category,
      format: signature.extension,
      mimetype: signature.detectedType,
      fileData: buffer.toString('base64'),
      sizeBytes: buffer.length,
      fileSizeFormatted: `${(buffer.length / 1024).toFixed(1)} KB`,
      storagePath: 'mongodb-embedded',
      extractedText: isStorageOnly ? '[REDACTED - STORAGE ONLY DOCUMENT]' : '',
      summary: isStorageOnly
        ? (sensitiveCheck.isSensitive
            ? `Protected in Storage-Only vault (${sensitiveCheck.reason}). Zero AI processing.`
            : 'Stored in Storage-Only vault by privacy policy.')
        : 'Uploaded document queued for background processing.',
      keyDetails: isStorageOnly
        ? { 'Privacy Policy': 'Storage-Only (Zero AI Processing)', 'Sensitive Flag': sensitiveCheck.isSensitive ? 'Yes' : 'No' }
        : {},
      tags: sensitiveCheck.isSensitive ? ['Identity', 'Storage-Only', 'Protected'] : ['Document', category],
      aiPolicy: requestedPolicy,
      policyVersion: config.pipeline?.version || '1.0.0',
      sensitiveFlag: sensitiveCheck.isSensitive,
      sensitiveReason: sensitiveCheck.reason,
      aiConsent,
      status: initialStatus,
      processingStatus: initialStatus,
      sha256,
      pageCount,
      pipelineVersion: config.pipeline?.version || '1.0.0',
      extractedFields: [],
      reviewStatus: 'not_required',
    };

    const savedDoc = await Document.create(docData);
    savedDoc.downloadUrl = `/api/documents/${savedDoc._id}/download`;
    await savedDoc.save();

    // 6. If AI-enabled and not sensitive, enqueue background job
    let jobInfo = null;
    if (!isStorageOnly) {
      const enqueueResult = await enqueueDocumentJob({
        documentId: savedDoc._id,
        userId: req.user.userId,
        sha256,
        pipelineVersion: config.pipeline?.version || '1.0.0',
        pageCount,
      });
      jobInfo = {
        jobId: enqueueResult.job._id,
        status: enqueueResult.job.status,
        isDuplicate: enqueueResult.isDuplicate,
      };

      // Trigger immediate background worker dispatch
      import('../pipeline/jobQueue.service.js').then(({ executeSingleJob }) => {
        setImmediate(() => {
          executeSingleJob(enqueueResult.job).catch(err =>
            console.error('[Immediate Job Execution Error]:', err.message)
          );
        });
      }).catch(err => console.warn('[Job Dispatch Warning]:', err.message));
    }

    // 7. Audit log
    await AuditLog.create({
      userId: req.user.userId,
      action: 'UPLOAD',
      documentTitle: savedDoc.title,
      device: req.headers['user-agent'] || 'Web Client',
    }).catch(err => console.warn('[Audit Log] Failed to save upload audit:', err.message));

    const responseDoc = savedDoc.toObject();
    delete responseDoc.fileData;

    res.status(201).json({
      success: true,
      message: isStorageOnly
        ? (sensitiveCheck.isSensitive
            ? `Sensitive document secured in encrypted Storage-Only vault (${sensitiveCheck.reason}).`
            : 'Document saved in Storage-Only vault.')
        : 'Document securely uploaded and queued for processing.',
      data: responseDoc,
      job: jobInfo,
      privacyMode: savedDoc.privacyMode,
      aiPolicy: savedDoc.aiPolicy,
      status: savedDoc.status,
    });
  } catch (err) {
    console.error('[Upload Pipeline Error]', err.message);
    const statusCode = err.message.startsWith('Security Guardrail:') || err.message.includes('exceeds maximum') ? 400 : 500;
    res.status(statusCode).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/documents/:id/ai-policy
 * 
 * Dynamically toggles aiPolicy between 'storage_only' and 'ai_enabled'.
 * Switching to storage_only immediately deletes all extracted text, pages,
 * chunks, embeddings, extracted fields, and cached answers, and logs an audit event.
 */
router.patch('/:id/ai-policy', requireAuth, async (req, res) => {
  try {
    const { aiPolicy, noticeVersion } = req.body;

    if (![AI_POLICIES.STORAGE_ONLY, AI_POLICIES.AI_ENABLED].includes(aiPolicy)) {
      return res.status(400).json({
        success: false,
        error: `Invalid aiPolicy. Must be one of: "${AI_POLICIES.STORAGE_ONLY}", "${AI_POLICIES.AI_ENABLED}"`,
      });
    }

    // Ownership check (404 for other users)
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    // Block enabling AI on sensitive identity documents
    if (aiPolicy === AI_POLICIES.AI_ENABLED && doc.sensitiveFlag === true) {
      return res.status(400).json({
        success: false,
        error: `Cannot enable AI on sensitive identity document (${doc.sensitiveReason || 'Sensitive Record'}). Document is locked to storage_only.`,
      });
    }

    const oldPolicy = doc.aiPolicy;
    const currentVersionNum = parseInt(doc.policyVersion || '1', 10);
    const newPolicyVersion = `${currentVersionNum + 1}.0.0`;

    if (aiPolicy === AI_POLICIES.STORAGE_ONLY) {
      // 1. Immediately purge all derived AI data
      doc.aiPolicy = AI_POLICIES.STORAGE_ONLY;
      doc.privacyMode = 'STORAGE_ONLY';
      doc.status = 'storage_only';
      doc.processingStatus = 'storage_only';
      doc.extractedText = '[REDACTED - STORAGE ONLY DOCUMENT]';
      doc.summary = 'Protected in Storage-Only vault. Content purged by privacy policy.';
      doc.keyDetails = { 'Privacy Policy': 'Storage-Only Isolated (Zero AI Processing)' };
      doc.embedding = [];
      doc.extractedFields = [];
      doc.policyVersion = newPolicyVersion;
      doc.aiConsent = { grantedAt: null, noticeVersion: null };

      // 2. Cancel and purge any active background jobs
      await cancelJobsForDocument(doc._id);

      // 3. Write immutable audit log
      await AuditLog.create({
        userId: req.user.userId,
        action: 'AI_POLICY_CHANGE',
        documentTitle: doc.title,
        device: req.headers['user-agent'] || 'Web Client',
      }).catch(err => console.warn('[Audit Log] Failed to save policy change audit:', err.message));

      await doc.save();

      const responseDoc = doc.toObject();
      delete responseDoc.fileData;

      return res.json({
        success: true,
        message: 'Document policy updated to storage_only. All derived text, fields, and embeddings purged.',
        data: responseDoc,
      });
    }

    // Switching to ai_enabled
    doc.aiPolicy = AI_POLICIES.AI_ENABLED;
    doc.privacyMode = 'PROCESSABLE';
    doc.policyVersion = newPolicyVersion;
    doc.aiConsent = {
      grantedAt: new Date(),
      noticeVersion: noticeVersion || config.pipeline?.noticeVersion || '1.0.0',
    };
    doc.status = 'queued';
    doc.processingStatus = 'pending';

    await doc.save();

    // Enqueue background processing job
    const enqueueResult = await enqueueDocumentJob({
      documentId: doc._id,
      userId: req.user.userId,
      sha256: doc.sha256 || doc.fileHash,
      pipelineVersion: doc.pipelineVersion || '1.0.0',
      pageCount: doc.pageCount || 1,
    });

    // Write audit log
    await AuditLog.create({
      userId: req.user.userId,
      action: 'AI_POLICY_CHANGE',
      documentTitle: doc.title,
      device: req.headers['user-agent'] || 'Web Client',
    }).catch(err => console.warn('[Audit Log] Failed to save policy change audit:', err.message));

    const responseDoc = doc.toObject();
    delete responseDoc.fileData;

    res.json({
      success: true,
      message: 'Document policy updated to ai_enabled. Document queued for processing.',
      data: responseDoc,
      job: {
        jobId: enqueueResult.job._id,
        status: enqueueResult.job.status,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/documents/:id/download - Stream document content directly (Protected with Central Access Control)
router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const access = await DocumentAccessControlService.canDownloadDocument(req.user.userId, req.params.id);
    if (!access.allowed) {
      return res.status(access.reason === 'Document not found' ? 404 : 403).send(access.reason || 'Download permission denied');
    }

    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).send('Document not found');
    }

    if (!doc.fileData) {
      return res.status(404).send('File content unavailable in database storage');
    }

    if (!access.isOwner) {
      await ShareAccessLog.create({
        ownerId: doc.userId,
        recipientId: req.user.userId,
        documentId: doc._id,
        action: SHARE_ACTION.DOWNLOADED,
        metadata: { client: req.headers['user-agent'] || 'Web Client' },
      }).catch(() => {});
    }

    const fileBuffer = Buffer.from(doc.fileData, 'base64');
    res.setHeader('Content-Type', doc.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${doc.originalName || doc.title}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
  } catch (err) {
    res.status(500).send('Error streaming document file: ' + err.message);
  }
});

// PATCH /api/documents/:id - Update document details or link asset (Protected with ownership check)
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates._id;
    delete updates.userId;
    delete updates.fileData;
    delete updates.downloadUrl;
    delete updates.storagePath;
    delete updates.sha256;
    delete updates.sensitiveFlag;
    delete updates.sensitiveReason;

    if (updates.keyDetails) {
      updates.keyDetails = sanitizeKeyDetails(updates.keyDetails);
    }

    // Ownership check (404 for other users)
    const doc = await Document.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { $set: updates },
      { returnDocument: 'after' }
    ).select('-fileData');

    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/documents/:id - Delete document, linked deadlines & jobs (Protected with ownership check)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    // Ownership check (404 for other users)
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    await Document.deleteOne({ _id: doc._id });
    await Deadline.deleteMany({ linkedDocId: doc._id });
    await cancelJobsForDocument(doc._id);

    // Record audit log
    await AuditLog.create({
      userId: req.user.userId,
      action: 'DELETE',
      documentTitle: doc.title,
      device: req.headers['user-agent'] || 'Web Client',
    }).catch(err => console.warn('[Audit Log] Failed to save delete audit:', err.message));

    res.json({ success: true, message: 'Document and linked reminders deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
