import { Router } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { upload } from '../../middleware/upload.middleware.js';
import { Document, Deadline, AuditLog } from '../../models/index.js';
import { sanitizeKeyDetails } from '../../utils/sanitize.js';
import { detectSensitiveDocument } from '../../services/pipeline/sensitiveDetector.js';
import { AI_POLICIES } from '../../services/pipeline/privacyGate.js';
import { enqueueDocumentJob, cancelJobsForDocument } from '../pipeline/jobQueue.service.js';
import { validateFileSignature, validateImageSafety, validatePdfSafety, generateSafeServerFilename, UploadSecurityError } from '../extraction/uploadValidation.service.js';
import { validateDocumentImage, DocumentImageValidationError } from '../extraction/documentImageValidation.service.js';
import { validateDocumentPipeline, DocumentValidationPipelineError } from '../extraction/documentValidationPipeline.service.js';
import { validateWithService } from '../extraction/validatorClient.service.js';
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
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid document ID format' });
    }
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

// GET /api/documents/:id/status - Status endpoint for polling/validation state
router.get('/:id/status', requireAuth, async (req, res) => {
  try {
    const access = await DocumentAccessControlService.canViewDocument(req.user.userId, req.params.id);
    if (!access.allowed) {
      return res.status(access.reason === 'Document not found' ? 404 : 403).json({
        success: false,
        error: access.reason || 'Access denied to this document.',
      });
    }

    const doc = await Document.findById(req.params.id).select(
      'status processingStatus doc_type score reject_reason validated_at title originalName sha256'
    );
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    res.json({
      success: true,
      data: {
        id: doc._id,
        status: doc.status,
        processingStatus: doc.processingStatus,
        doc_type: doc.doc_type,
        score: doc.score,
        reject_reason: doc.reject_reason,
        validated_at: doc.validated_at,
        sha256: doc.sha256,
        title: doc.title,
      },
    });
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
  let quarantineFilePath = null;
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

    // 1. Deterministic SHA-256 calculation
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // 1.5 Security Guardrail: Duplicate Document Check
    // Rejects re-uploading identical documents to prevent vault duplication and resource waste
    const allowDuplicate = req.body.allowDuplicate === 'true' || req.query.allowDuplicate === 'true';
    if (!allowDuplicate) {
      const existingDoc = await Document.findOne({
        userId: req.user.userId,
        $or: [{ sha256 }, { fileHash: sha256 }],
        status: { $nin: ['DELETED', 'deleted', 'REJECTED'] },
      }).select('_id title originalName category documentDate createdAt validated_at status');

      if (existingDoc) {
        const uploadDate = existingDoc.createdAt 
          ? new Date(existingDoc.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'earlier';
        return res.status(409).json({
          success: false,
          code: 'DUPLICATE_DOCUMENT',
          status: 'DUPLICATE',
          error: `Duplicate Document Detected: You have already secured this exact document in your vault as "${existingDoc.title}" (${uploadDate}).`,
          suggestion: `This document is already safely encrypted in your vault. You can view, search, or share the existing copy instead of uploading a duplicate.`,
          duplicateDocument: {
            id: existingDoc._id,
            title: existingDoc.title,
            category: existingDoc.category,
            originalName: existingDoc.originalName,
            date: existingDoc.documentDate || uploadDate,
          },
        });
      }
    }

    // 2. Quarantine Write (isolated temporary holding before validation & encryption)
    const quarantineDir = config.validator?.quarantineDir || path.resolve(process.cwd(), 'uploads', 'quarantine');
    if (!fs.existsSync(quarantineDir)) {
      fs.mkdirSync(quarantineDir, { recursive: true });
    }
    const safeQuarantineName = `${Date.now()}_${sha256.slice(0, 12)}_${originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    quarantineFilePath = path.join(quarantineDir, safeQuarantineName);
    fs.writeFileSync(quarantineFilePath, buffer);

    // 3. Layer 1: Strict File Security & Multi-Stage Validation
    let signature;
    let pageCount = 1;
    let pdfText = '';
    let validationResult = null;

    try {
      signature = validateFileSignature(buffer, mimetype, originalname);

      if (signature.detectedType === 'application/pdf') {
        const pdfCheck = validatePdfSafety(buffer);
        pageCount = pdfCheck.pageCount;

        // Verify PDF contains readable text or valid document page structure (reject blank PDF)
        pdfText = await extractTextFromPDF(buffer);
        const cleanPdfText = pdfText.replace(/-- \d+ of \d+ --/g, '').replace(/\s+/g, ' ').trim();
        if (cleanPdfText.length < 15) {
          // If digital text layer is minimal, inspect rendered first page image
          try {
            const renderedPages = await convertPdfToImages(buffer, 1, 1.0);
            if (renderedPages && renderedPages.length > 0) {
              await validateDocumentImage(renderedPages[0]);
              const serviceVal = await validateWithService({
                quarantinePath: quarantineFilePath,
                sha256,
                buffer: renderedPages[0],
                originalname,
                mimetype: 'image/png',
              });
              validationResult = serviceVal;
              if (serviceVal.decision === 'REJECT' || serviceVal.decision === 'REVIEW') {
                if (quarantineFilePath && fs.existsSync(quarantineFilePath)) fs.unlinkSync(quarantineFilePath);
                return res.status(400).json({
                  success: false,
                  status: serviceVal.decision,
                  error: serviceVal.reason,
                  code: serviceVal.reason_code,
                  suggestion: serviceVal.suggestion || 'Document clarity or structure could not be verified.',
                  doc_type: serviceVal.doc_type,
                  score: serviceVal.score,
                });
              }
            }
          } catch (renderErr) {
            if (renderErr instanceof DocumentImageValidationError) {
              throw renderErr;
            }
            console.warn('[PDF Guard] Page rendering inspection warning:', renderErr.message);
          }
        }
      } else if (signature.detectedType.startsWith('image/')) {
        await validateImageSafety(buffer);
        await validateDocumentImage(buffer);
        // Multi-Stage Intelligent Document Detection & Readability Engine
        const serviceVal = await validateWithService({
          quarantinePath: quarantineFilePath,
          sha256,
          buffer,
          originalname,
          mimetype: signature.detectedType,
        });
        validationResult = serviceVal;

        if (serviceVal.decision === 'REJECT' || serviceVal.decision === 'REVIEW') {
          if (quarantineFilePath && fs.existsSync(quarantineFilePath)) fs.unlinkSync(quarantineFilePath);
          return res.status(400).json({
            success: false,
            status: serviceVal.decision,
            error: serviceVal.reason,
            code: serviceVal.reason_code,
            suggestion: serviceVal.suggestion || (serviceVal.decision === 'REJECT'
              ? 'Please upload a clear photograph or scan of a legitimate document.'
              : 'Document image clarity is borderline. Please retake the photo with better lighting.'),
            doc_type: serviceVal.doc_type,
            score: serviceVal.score,
          });
        }
      }
    } catch (valErr) {
      if (quarantineFilePath && fs.existsSync(quarantineFilePath)) {
        try { fs.unlinkSync(quarantineFilePath); } catch (_) {}
      }
      const statusCode = (valErr instanceof UploadSecurityError || valErr instanceof DocumentImageValidationError || valErr instanceof DocumentValidationPipelineError) ? 400 : 500;
      return res.status(statusCode).json({
        success: false,
        error: valErr.message,
        code: valErr.code || valErr.reasonCode || 'VALIDATION_FAILED',
        suggestion: valErr.suggestion || null,
      });
    }

    // Move from quarantine to permanent encrypted storage (clean up quarantine file)
    if (quarantineFilePath && fs.existsSync(quarantineFilePath)) {
      try { fs.unlinkSync(quarantineFilePath); } catch (_) {}
      quarantineFilePath = null;
    }

    // 4. Local In-Process Sensitive Document Detection
    const sensitiveCheck = detectSensitiveDocument({
      filename: originalname,
      buffer,
    });

    // 5. Determine AI Policy: Sensitive files are strictly FORCED to storage_only
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
    let inferredCategory = req.body.category;
    if (!inferredCategory || inferredCategory === 'Other') {
      if (validationResult?.doc_type === 'invoice' || validationResult?.document_type === 'invoice') inferredCategory = 'Finance';
      else if (validationResult?.doc_type === 'receipt' || validationResult?.document_type === 'receipt') inferredCategory = 'Receipts';
      else if (validationResult?.doc_type === 'bill' || validationResult?.document_type === 'bill') inferredCategory = 'Bills';
      else if (validationResult?.doc_type === 'id_card' || validationResult?.document_type === 'id_card') inferredCategory = 'Identity';
      else if (validationResult?.doc_type === 'certificate' || validationResult?.document_type === 'certificate') inferredCategory = 'Education';
      else if (validationResult?.doc_type === 'insurance_policy' || validationResult?.document_type === 'insurance_policy') inferredCategory = 'Insurance';
      else if (validationResult?.doc_type === 'vehicle_document' || validationResult?.document_type === 'vehicle_document') inferredCategory = 'Automobile';
      else if (validationResult?.doc_type === 'legal_document' || validationResult?.document_type === 'legal_document') inferredCategory = 'Property';
    }
    const category = sensitiveCheck.isSensitive ? 'Identity' : (inferredCategory || 'Other');

    // 6. Persist Document Record with Validation Audit Data
    // Sanitize doc_type: map any unknown value to 'other' so Mongoose enum never rejects it.
    const VALID_DOC_TYPES = new Set([
      'invoice', 'receipt', 'bill', 'id_card', 'certificate', 'insurance_policy',
      'bank_statement', 'legal_document', 'vehicle_document',
      'printed', 'handwritten', 'mixed', 'scanned', 'other',
    ]);
    const rawDocType = validationResult?.doc_type || validationResult?.document_type || 'other';
    const safeDocType = VALID_DOC_TYPES.has(rawDocType) ? rawDocType : 'other';

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
      extractedText: isStorageOnly ? '[REDACTED - STORAGE ONLY DOCUMENT]' : (pdfText || validationResult?.extractedText || ''),
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
      status: isStorageOnly ? 'storage_only' : 'ACCEPTED',
      processingStatus: initialStatus,
      sha256,
      pageCount,
      pipelineVersion: config.pipeline?.version || '1.0.0',
      doc_type: safeDocType,
      score: validationResult?.score !== undefined ? validationResult.score : 0.90,
      reject_reason: null,
      validated_at: new Date(),
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
    if (quarantineFilePath && fs.existsSync(quarantineFilePath)) {
      try { fs.unlinkSync(quarantineFilePath); } catch (_) {}
    }
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

// GET /api/documents/:id/preview - Stream document content for inline preview (Protected with Central Access Control)
router.get('/:id/preview', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send('Invalid document ID format');
    }

    const access = await DocumentAccessControlService.canViewDocument(req.user.userId, req.params.id);
    if (!access.allowed) {
      if (req.user?.userId) {
        await ShareAccessLog.create({
          ownerId: access.doc?.userId || req.user.userId,
          recipientId: req.user.userId,
          documentId: req.params.id,
          action: SHARE_ACTION.ACCESS_DENIED,
          metadata: { reason: access.reason, attempted: 'preview', client: req.headers['user-agent'] || 'Web Client' },
        }).catch(() => {});
      }
      return res.status(access.reason === 'Document not found' ? 404 : 403).send(access.reason || 'View permission denied');
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
        action: SHARE_ACTION.VIEWED,
        metadata: { client: req.headers['user-agent'] || 'Web Client' },
      }).catch(() => {});
    } else {
      await AuditLog.create({
        userId: req.user.userId,
        action: 'VIEW',
        documentTitle: doc.title,
        device: req.headers['user-agent'] || 'Web Client',
      }).catch(() => {});
    }

    const fileBuffer = Buffer.from(doc.fileData, 'base64');
    const totalLength = fileBuffer.length;
    const rawFilename = (doc.originalName || doc.title || 'document').replace(/[\r\n"']/g, '_');
    const asciiFilename = rawFilename.replace(/[^\x20-\x7E]/g, '_') || 'document';
    const encodedFilename = encodeURIComponent(rawFilename);
    const etag = `"${doc._id.toString()}-${totalLength}"`;

    // Support ETag 304 validation for instant preview re-access
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }

    res.setHeader('Content-Type', doc.mimetype || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=600, must-revalidate');

    // Handle HTTP Range header for progressive PDF page streaming
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

      if (start >= totalLength || end >= totalLength || start > end) {
        res.setHeader('Content-Range', `bytes */${totalLength}`);
        return res.status(416).send('Requested range not satisfiable');
      }

      const chunkLength = end - start + 1;
      const chunk = fileBuffer.subarray(start, end + 1);

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalLength}`);
      res.setHeader('Content-Length', chunkLength);
      return res.send(chunk);
    }

    res.setHeader('Content-Length', totalLength);
    res.send(fileBuffer);
  } catch (err) {
    res.status(500).send('Error previewing document: ' + err.message);
  }
});

// GET /api/documents/:id/download - Stream document content directly (Protected with Central Access Control)
router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send('Invalid document ID format');
    }

    const access = await DocumentAccessControlService.canDownloadDocument(req.user.userId, req.params.id);
    if (!access.allowed) {
      if (req.user?.userId) {
        await ShareAccessLog.create({
          ownerId: access.doc?.userId || req.user.userId,
          recipientId: req.user.userId,
          documentId: req.params.id,
          action: SHARE_ACTION.ACCESS_DENIED,
          metadata: { reason: access.reason, attempted: 'download', client: req.headers['user-agent'] || 'Web Client' },
        }).catch(() => {});
      }
      return res.status(access.reason === 'Document not found' ? 404 : 403).send(access.reason || 'Download permission denied');
    }

    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).send('Document not found');
    }

    if (doc.status === 'REJECTED' || doc.status === 'PENDING') {
      return res.status(403).send(`Cannot download document with status "${doc.status}".`);
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
    const rawFilename = (doc.originalName || doc.title || 'document').replace(/[\r\n"']/g, '_');
    const asciiFilename = rawFilename.replace(/[^\x20-\x7E]/g, '_') || 'document';
    const encodedFilename = encodeURIComponent(rawFilename);

    res.setHeader('Content-Type', doc.mimetype || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Accept-Ranges', 'bytes');
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
