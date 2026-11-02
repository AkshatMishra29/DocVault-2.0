import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { upload } from '../../middleware/upload.middleware.js';
import { Document, Deadline, AuditLog } from '../../models/index.js';
import { extractDocumentMetadata } from '../../services/ai/groqService.js';
import { generateEmbedding } from '../../services/ai/huggingFaceService.js';
import { extractTextFromPDF, extractTextFromImage, convertPdfToImages } from '../../services/ocr/ocrService.js';
import { sanitizeKeyDetails } from '../../utils/sanitize.js';
import { executeDocumentExtractionPipeline } from '../extraction/extractionPipeline.service.js';

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

// GET /api/documents/:id - Get single document details
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.userId }).select('-fileData');
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    // Record audit trail
    await AuditLog.create({
      userId: req.user.userId,
      action: 'VIEW',
      documentTitle: doc.title,
      device: req.headers['user-agent'] || 'Web Client',
    }).catch(err => console.warn('[Audit Log] Failed to save view audit:', err.message));

    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/documents/upload - Upload file with Guardrails, Privacy Gate, Multi-Tier Extraction & Verification
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const { originalname, mimetype, buffer } = req.file;
    const userConsent = req.body.userConsent || 'PROCESSABLE';

    // Execute Production Extraction & Verification Pipeline
    const pipelineResult = await executeDocumentExtractionPipeline({
      userId: req.user.userId,
      buffer,
      mimetype,
      originalname,
      userConsent,
    });

    const savedDoc = pipelineResult.document;

    // Record audit log
    await AuditLog.create({
      userId: req.user.userId,
      action: 'UPLOAD',
      documentTitle: savedDoc.title,
      device: req.headers['user-agent'] || 'Web Client',
    }).catch(err => console.warn('[Audit Log] Failed to save upload audit:', err.message));

    const responseDoc = savedDoc.toObject ? savedDoc.toObject() : savedDoc;
    delete responseDoc.fileData;

    res.status(201).json({
      success: true,
      message: pipelineResult.privacyMode === 'STORAGE_ONLY' 
        ? 'Sensitive document secured in encrypted Storage-Only vault.' 
        : 'Document verified and structured metadata extracted.',
      data: responseDoc,
      privacyMode: pipelineResult.privacyMode,
      tierUsed: pipelineResult.tierUsed,
      processingStatus: pipelineResult.processingStatus,
    });
  } catch (err) {
    console.error('[Upload Pipeline Error]', err.message);
    const statusCode = err.message.startsWith('Security Guardrail:') ? 400 : 500;
    res.status(statusCode).json({ success: false, error: err.message });
  }
});

// GET /api/documents/:id/download - Stream document content directly
router.get('/:id/download', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).send('Document not found');
    }

    if (!doc.fileData) {
      return res.status(404).send('File content unavailable in database storage');
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

// PATCH /api/documents/:id - Update document details or link asset
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates._id;
    delete updates.userId;
    delete updates.fileData;
    delete updates.downloadUrl;
    delete updates.storagePath;

    if (updates.keyDetails) {
      updates.keyDetails = sanitizeKeyDetails(updates.keyDetails);
    }

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

// DELETE /api/documents/:id - Delete document & clean up reminders
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found or access denied' });
    }

    await Document.deleteOne({ _id: doc._id });
    await Deadline.deleteMany({ linkedDocId: doc._id });

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

