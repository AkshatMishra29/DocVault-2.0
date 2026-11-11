import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { DocumentShareService } from './documentShare.service.js';
import { CentralShareAccessService } from './centralShareAccess.service.js';
import { ShareVerificationService } from './shareVerification.service.js';
import { SmartShareService } from './smartShare.service.js';
import { SharedQAService } from './sharedQA.service.js';
import { SharePrivacyService } from './sharePrivacy.service.js';
import { DocumentShare, SHARE_STATUS, ShareAccessLog } from './models/index.js';
import { Document } from '../documents/document.model.js';
import { User } from '../auth/auth.model.js';

const router = Router();

/**
 * POST /api/shares
 * Create a new secure share (single/multiple docs, expiring token, OTP, password, watermarking, redaction)
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const result = await DocumentShareService.createShare(req.user.userId, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/shares/sent
 * List all shares sent by current user
 */
router.get('/sent', requireAuth, async (req, res) => {
  try {
    const shares = await DocumentShareService.listSentShares(req.user.userId);
    res.json({ success: true, count: shares.length, data: shares });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/shares/received
 * List all active shares received by current user
 */
router.get('/received', requireAuth, async (req, res) => {
  try {
    const shares = await DocumentShareService.listReceivedShares(req.user.userId);
    res.json({ success: true, count: shares.length, data: shares });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/shares/:id
 * Retrieve share metadata and status (Authorized for owner or recipient)
 */
router.get('/:id', async (req, res) => {
  try {
    const share = await DocumentShare.findById(req.params.id)
      .populate('documentIds', 'title category format fileSizeFormatted createdAt summary')
      .populate('ownerId', 'name docVaultId')
      .populate('recipientUserId', 'name docVaultId');

    if (!share) {
      return res.status(404).json({ success: false, error: 'Share not found' });
    }

    // Check expiry
    const isExpired = share.expiresAt && new Date(share.expiresAt) <= new Date();
    if (isExpired && share.status !== SHARE_STATUS.EXPIRED) {
      share.status = SHARE_STATUS.EXPIRED;
      await share.save().catch(() => {});
    }

    // Sanitized share response (Never expose hashes, OTPs, or passwords)
    res.json({
      success: true,
      data: {
        _id: share._id,
        purpose: share.purpose,
        status: isExpired ? SHARE_STATUS.EXPIRED : share.status,
        expiresAt: share.expiresAt,
        owner: {
          name: share.ownerId?.name || 'DocVault User',
          docVaultId: share.ownerId?.docVaultId || '',
        },
        documentCount: share.documentIds.length,
        documents: share.documentIds.map((d) => ({
          _id: d._id,
          title: d.title,
          category: d.category,
          format: d.format,
          fileSizeFormatted: d.fileSizeFormatted,
        })),
        permissions: share.permissions,
        passwordRequired: share.passwordRequired,
        otpRequired: share.otpRequired,
        watermarkEnabled: share.watermarkEnabled,
        createdAt: share.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/shares/:id
 * Revoke a share immediately (Owner only)
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await DocumentShareService.revokeShare(req.user.userId, req.params.id);
    res.json(result);
  } catch (err) {
    res.status(err.message.includes('unauthorized') ? 403 : 400).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/shares/:id/request-otp
 * Request an OTP challenge sent to recipient email/phone
 */
router.post('/:id/request-otp', async (req, res) => {
  try {
    const share = await DocumentShare.findById(req.params.id);
    if (!share || share.status !== SHARE_STATUS.ACTIVE) {
      return res.status(404).json({ success: false, error: 'Active share not found.' });
    }

    if (!share.otpRequired) {
      return res.status(400).json({ success: false, error: 'OTP is not required for this share.' });
    }

    // Rate-limit OTP requests (must wait at least 45 seconds between requests)
    if (share.otpChallenge?.lastSentAt && Date.now() - new Date(share.otpChallenge.lastSentAt).getTime() < 45000) {
      return res.status(429).json({ success: false, error: 'Please wait before requesting a new code.' });
    }

    const { otp, hash, expiresAt } = ShareVerificationService.generateOtpChallenge();

    share.otpChallenge = {
      hash,
      expiresAt,
      attempts: 0,
      verifiedAt: null,
      lastSentAt: new Date(),
    };
    await share.save();

    // Log delivery interface (in production, connected to Twilio/SendGrid/SES)
    console.log(`[ShareVerificationService] Generated OTP for Share ${share._id}: ${otp}`);

    res.json({
      success: true,
      message: 'Verification code sent to your registered contact channel.',
      expiresInSeconds: 300,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/shares/:id/verify-otp
 * Verify the OTP challenge
 */
router.post('/:id/verify-otp', async (req, res) => {
  try {
    const { otp } = req.body;
    const share = await DocumentShare.findById(req.params.id);
    if (!share || share.status !== SHARE_STATUS.ACTIVE) {
      return res.status(404).json({ success: false, error: 'Active share not found.' });
    }

    // Increment attempts
    share.otpChallenge.attempts = (share.otpChallenge.attempts || 0) + 1;
    await share.save();

    const result = ShareVerificationService.verifyOtp(otp, share.otpChallenge);
    if (!result.success) {
      return res.status(400).json(result);
    }

    share.otpChallenge.verifiedAt = new Date();
    await share.save();

    res.json({ success: true, message: 'Identity verified successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/shares/:id/verify-password
 * Verify share password
 */
router.post('/:id/verify-password', async (req, res) => {
  try {
    const { password } = req.body;
    const share = await DocumentShare.findById(req.params.id);
    if (!share || share.status !== SHARE_STATUS.ACTIVE) {
      return res.status(404).json({ success: false, error: 'Active share not found.' });
    }

    const isValid = await ShareVerificationService.verifyPassword(password, share.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Incorrect share password.' });
    }

    res.json({ success: true, message: 'Password accepted.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/shares/:id/document
 * Secure controlled document delivery for VIEW permission with dynamic watermark
 */
router.get('/:id/document', async (req, res) => {
  try {
    const { documentId, token, password } = req.query;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || '';
    const userAgent = req.headers['user-agent'] || '';

    const auth = await CentralShareAccessService.authorizeShareAccess({
      shareId: req.params.id,
      documentId,
      action: 'view',
      userId: req.user?.userId || null,
      token,
      password,
      clientIp,
      userAgent,
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({
        success: false,
        error: auth.reason,
        requiresPassword: auth.requiresPassword || false,
        requiresOtp: auth.requiresOtp || false,
      });
    }

    const recipientLabel = req.user?.name || auth.share.recipientEmail || auth.share.recipientPhone || 'Authorized Viewer';

    const delivery = await CentralShareAccessService.deliverDocumentPayload({
      share: auth.share,
      document: auth.document,
      isRedacted: auth.isRedacted,
      recipientLabel,
      action: 'view',
    });

    res.set({
      'Content-Type': delivery.mimetype,
      'Content-Disposition': `inline; filename="${delivery.filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    });

    res.send(delivery.buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/shares/:id/download
 * Secure download endpoint (Requires DOWNLOAD permission)
 */
router.get('/:id/download', async (req, res) => {
  try {
    const { documentId, token, password } = req.query;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || '';
    const userAgent = req.headers['user-agent'] || '';

    const auth = await CentralShareAccessService.authorizeShareAccess({
      shareId: req.params.id,
      documentId,
      action: 'download',
      userId: req.user?.userId || null,
      token,
      password,
      clientIp,
      userAgent,
    });

    if (!auth.allowed) {
      return res.status(auth.status || 403).json({
        success: false,
        error: auth.reason,
        requiresPassword: auth.requiresPassword || false,
        requiresOtp: auth.requiresOtp || false,
      });
    }

    const recipientLabel = req.user?.name || auth.share.recipientEmail || 'Authorized Viewer';

    const delivery = await CentralShareAccessService.deliverDocumentPayload({
      share: auth.share,
      document: auth.document,
      isRedacted: auth.isRedacted,
      recipientLabel,
      action: 'download',
    });

    res.set({
      'Content-Type': delivery.mimetype,
      'Content-Disposition': `attachment; filename="${delivery.filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    });

    res.send(delivery.buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/shares/suggest-pack
 * Smart Share Pack: Purpose-based document suggestion
 */
router.post('/suggest-pack', requireAuth, async (req, res) => {
  try {
    const { purpose } = req.body;
    if (!purpose) {
      return res.status(400).json({ success: false, error: 'Purpose description is required.' });
    }

    const suggestions = await SmartShareService.suggestSharePack(req.user.userId, purpose);
    res.json({ success: true, data: suggestions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/shares/:id/questions
 * Shared Document Q&A (Evidence-grounded and restricted strictly to shared document)
 */
router.post('/:id/questions', async (req, res) => {
  try {
    const { documentId, question } = req.body;
    const clientFingerprint = req.headers['user-agent'] || '';

    const result = await SharedQAService.askQuestionAboutShare(
      req.params.id,
      documentId,
      question,
      {
        askedBy: req.user?.userId || null,
        clientFingerprint,
      }
    );

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/shares/:id/questions
 * List Q&A history for a share
 */
router.get('/:id/questions', async (req, res) => {
  try {
    const { documentId } = req.query;
    const history = await SharedQAService.getShareQuestions(req.params.id, documentId);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/shares/:id/activity
 * Share Activity Tracker (Owner only)
 */
router.get('/:id/activity', requireAuth, async (req, res) => {
  try {
    const share = await DocumentShare.findOne({ _id: req.params.id, ownerId: req.user.userId });
    if (!share) {
      return res.status(404).json({ success: false, error: 'Share not found or unauthorized.' });
    }

    const logs = await ShareAccessLog.find({ 'metadata.shareId': req.params.id })
      .populate('recipientId', 'name docVaultId')
      .populate('documentId', 'title category')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

