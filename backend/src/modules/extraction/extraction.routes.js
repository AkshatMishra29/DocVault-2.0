import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { Document, Deadline } from '../../models/index.js';
import { ReviewHistory } from './reviewHistory.model.js';
import { checkTokenBudget } from './tokenLedger.service.js';

const router = Router();

// GET /api/extraction/review-queue - Lists documents requiring human review
router.get('/review-queue', requireAuth, async (req, res) => {
  try {
    const docs = await Document.find({
      userId: req.user.userId,
      $or: [
        { processingStatus: 'needs_review' },
        { reviewStatus: 'pending_review' },
        { 'extractedFields.verificationStatus': 'needs_review' },
      ],
    })
      .select('-fileData')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: docs.length, data: docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/extraction/correct-field - User reviews, confirms, or corrects an extracted field
router.post('/correct-field', requireAuth, async (req, res) => {
  try {
    const { documentId, fieldName, action, correctedValue } = req.body;
    // action: 'confirmed' | 'corrected' | 'rejected'

    if (!documentId || !fieldName || !action) {
      return res.status(400).json({ success: false, error: 'documentId, fieldName, and action are required.' });
    }

    const doc = await Document.findOne({ _id: documentId, userId: req.user.userId });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found.' });
    }

    const fieldIndex = doc.extractedFields.findIndex(f => f.fieldName === fieldName);
    const existingField = fieldIndex >= 0 ? doc.extractedFields[fieldIndex] : null;

    const originalVal = existingField ? existingField.value : null;
    const finalValue = action === 'corrected' ? correctedValue : originalVal;
    const finalStatus = action === 'rejected' ? 'rejected' : 'user_corrected';

    // 1. Audit in ReviewHistory
    await ReviewHistory.create({
      documentId: doc._id,
      userId: req.user.userId,
      fieldName,
      originalValue: originalVal,
      originalConfidence: existingField?.confidence || 0,
      originalEvidence: existingField?.evidence || '',
      correctedValue: finalValue,
      userAction: action,
    });

    // 2. Update or insert in Document.extractedFields
    if (fieldIndex >= 0) {
      doc.extractedFields[fieldIndex].value = finalValue;
      doc.extractedFields[fieldIndex].verificationStatus = finalStatus;
      doc.extractedFields[fieldIndex].confidence = 1.0; // User-verified precision
      doc.extractedFields[fieldIndex].rejectionReason = null;
    } else {
      doc.extractedFields.push({
        fieldName,
        value: finalValue,
        evidence: 'User manually entered/confirmed',
        pageNumber: 1,
        extractionMethod: 'user_corrected',
        confidence: 1.0,
        verificationStatus: finalStatus,
      });
    }

    // 3. Update top-level legacy fields if applicable (e.g. expiryDate)
    if (fieldName === 'expiry_date' && action !== 'rejected') {
      doc.expiryDate = finalValue;

      // Idempotently create or update Deadline reminder from user-verified date
      const expiry = new Date(finalValue);
      const today = new Date();
      const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

      await Deadline.deleteMany({ linkedDocId: doc._id });
      await Deadline.create({
        userId: req.user.userId,
        title: `${doc.title} Renewal`,
        date: finalValue,
        daysLeft,
        severity: daysLeft <= 15 ? 'urgent' : 'upcoming',
        linkedDocId: doc._id,
        action: `Renew ${doc.category} document`,
      });
    }

    // 4. Update overall document review status if all fields are reviewed
    const stillNeedsReview = doc.extractedFields.some(f => f.verificationStatus === 'needs_review');
    if (!stillNeedsReview) {
      doc.processingStatus = 'completed';
      doc.reviewStatus = 'reviewed';
    }

    // Update keyDetails dictionary
    if (!doc.keyDetails) doc.keyDetails = {};
    doc.keyDetails[fieldName.replace(/_/g, ' ').toUpperCase()] = finalValue;
    doc.markModified('keyDetails');
    doc.markModified('extractedFields');

    await doc.save();

    res.json({
      success: true,
      message: `Field "${fieldName}" successfully ${action}.`,
      document: doc,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/extraction/token-stats - User token budget and usage
router.get('/token-stats', requireAuth, async (req, res) => {
  try {
    const budget = await checkTokenBudget(req.user.userId);
    res.json({ success: true, budget });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
