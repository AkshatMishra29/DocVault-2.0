import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { DocumentAccessControlService } from './accessControl.service.js';
import {
  DocumentAccessPolicy,
  AUDIENCE_MODE,
  DocumentShareGrant,
  GRANT_STATUS,
  DocumentAccessRequest,
  ACCESS_REQUEST_STATUS,
  ShareAccessLog,
  SHARE_ACTION,
  ShareNotification,
  NOTIFICATION_TYPE,
} from './models/index.js';
import { Document } from '../documents/document.model.js';
import { User } from '../auth/auth.model.js';

const router = Router();

/**
 * GET /api/sharing/received
 * List all documents shared with the current user via active grants
 */
router.get('/received', requireAuth, async (req, res) => {
  try {
    const grants = await DocumentShareGrant.find({
      recipientId: req.user.userId,
      status: GRANT_STATUS.ACTIVE,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    })
      .populate({
        path: 'documentId',
        select: 'title category format fileSizeFormatted createdAt summary tags sensitiveFlag',
      })
      .populate({
        path: 'ownerId',
        select: 'name docVaultId',
      })
      .lean()
      .sort({ createdAt: -1 });

    const validGrants = grants
      .filter((g) => g.documentId)
      .map((g) => ({
        grantId: g._id,
        documentId: g.documentId._id,
        title: g.documentId.title,
        category: g.documentId.category,
        format: g.documentId.format,
        fileSizeFormatted: g.documentId.fileSizeFormatted,
        summary: g.documentId.summary,
        owner: {
          id: g.ownerId?._id,
          name: g.ownerId?.name || 'DocVault User',
          docVaultId: g.ownerId?.docVaultId || '',
        },
        permissions: g.permissions,
        expiresAt: g.expiresAt,
        sharedAt: g.createdAt,
      }));

    res.json({ success: true, count: validGrants.length, data: validGrants });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sharing/sent
 * List all active document share grants created by the current user
 */
router.get('/sent', requireAuth, async (req, res) => {
  try {
    const grants = await DocumentShareGrant.find({
      ownerId: req.user.userId,
      status: GRANT_STATUS.ACTIVE,
    })
      .populate({
        path: 'documentId',
        select: 'title category format',
      })
      .populate({
        path: 'recipientId',
        select: 'name docVaultId',
      })
      .lean()
      .sort({ createdAt: -1 });

    const formatted = grants
      .filter((g) => g.documentId)
      .map((g) => ({
        grantId: g._id,
        documentId: g.documentId._id,
        title: g.documentId.title,
        category: g.documentId.category,
        recipient: {
          id: g.recipientId?._id,
          name: g.recipientId?.name || 'User',
          docVaultId: g.recipientId?.docVaultId || '',
        },
        permissions: g.permissions,
        expiresAt: g.expiresAt,
        status: g.status,
      }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sharing/:documentId
 * Get sharing policy & active grants for a specific document
 */
router.get('/:documentId', requireAuth, async (req, res) => {
  try {
    const { documentId } = req.params;
    const doc = await Document.findOne({ _id: documentId, userId: req.user.userId });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found or unauthorized.' });
    }

    const policy = (await DocumentAccessPolicy.findOne({ documentId })) || {
      audienceMode: AUDIENCE_MODE.ONLY_ME,
      permissions: { view: true, download: false },
      expiresAt: null,
      selectedUserIds: [],
      excludedUserIds: [],
    };

    const activeGrants = await DocumentShareGrant.find({
      documentId,
      status: GRANT_STATUS.ACTIVE,
    }).populate('recipientId', 'name docVaultId');

    res.json({
      success: true,
      data: {
        policy,
        activeGrants: activeGrants.map((g) => ({
          grantId: g._id,
          recipient: g.recipientId,
          permissions: g.permissions,
          expiresAt: g.expiresAt,
        })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sharing/policy
 * Save/update WhatsApp-style audience policy for a document
 */
router.post('/policy', requireAuth, async (req, res) => {
  try {
    const { documentId, audienceMode, selectedUserIds, excludedUserIds, permissions, expiresAt } = req.body;
    const result = await DocumentAccessControlService.setDocumentPolicy(req.user.userId, documentId, {
      audienceMode,
      selectedUserIds,
      excludedUserIds,
      permissions,
      expiresAt,
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sharing/bulk
 * Smart Share multiple documents atomically
 */
router.post('/bulk', requireAuth, async (req, res) => {
  try {
    const result = await DocumentAccessControlService.bulkShare(req.user.userId, req.body);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sharing/category-rule
 * Share entire document category (existing and optionally future documents)
 */
router.post('/category-rule', requireAuth, async (req, res) => {
  try {
    const result = await DocumentAccessControlService.createCategoryRule(req.user.userId, req.body);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/sharing/grants/:id
 * Revoke a specific share grant immediately
 */
router.delete('/grants/:id', requireAuth, async (req, res) => {
  try {
    const grant = await DocumentShareGrant.findOne({ _id: req.params.id, ownerId: req.user.userId });
    if (!grant) {
      return res.status(404).json({ success: false, error: 'Grant not found or unauthorized.' });
    }

    grant.status = GRANT_STATUS.REVOKED;
    await grant.save();

    await ShareAccessLog.create({
      ownerId: req.user.userId,
      recipientId: grant.recipientId,
      documentId: grant.documentId,
      action: SHARE_ACTION.ACCESS_REVOKED,
    }).catch(() => {});

    res.json({ success: true, message: 'Access revoked immediately.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sharing/request-access
 * Submit an in-app document access request to an owner
 */
router.post('/request-access', requireAuth, async (req, res) => {
  try {
    const { documentId, message } = req.body;
    const doc = await Document.findById(documentId).select('userId title');
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found.' });
    }

    if (doc.userId.toString() === req.user.userId.toString()) {
      return res.status(400).json({ success: false, error: 'You already own this document.' });
    }

    const request = await DocumentAccessRequest.create({
      requesterId: req.user.userId,
      ownerId: doc.userId,
      documentId,
      message: message || '',
    });

    const requester = await User.findById(req.user.userId).select('name docVaultId');
    await ShareNotification.create({
      userId: doc.userId,
      senderId: req.user.userId,
      type: NOTIFICATION_TYPE.ACCESS_REQUESTED,
      title: 'Document Access Request',
      message: `${requester?.name || 'Someone'} (${requester?.docVaultId || ''}) requested access to "${doc.title}".`,
      data: { requestId: request._id, documentId: doc._id },
    }).catch(() => {});

    res.status(201).json({ success: true, request });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sharing/access-requests
 * View pending document access requests for documents owned by user
 */
router.get('/access-requests', requireAuth, async (req, res) => {
  try {
    const requests = await DocumentAccessRequest.find({
      ownerId: req.user.userId,
      status: ACCESS_REQUEST_STATUS.PENDING,
    })
      .populate('requesterId', 'name docVaultId')
      .populate('documentId', 'title category')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sharing/access-requests/:id/approve
 * Approve access request with customizable view/download permissions and expiry
 */
router.post('/access-requests/:id/approve', requireAuth, async (req, res) => {
  try {
    const { permissions = { view: true, download: false }, expiresAt = null } = req.body;
    const request = await DocumentAccessRequest.findOne({
      _id: req.params.id,
      ownerId: req.user.userId,
      status: ACCESS_REQUEST_STATUS.PENDING,
    });

    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found or already processed.' });
    }

    request.status = ACCESS_REQUEST_STATUS.APPROVED;
    await request.save();

    // Create active grant
    const grant = await DocumentShareGrant.findOneAndUpdate(
      { documentId: request.documentId, recipientId: request.requesterId },
      {
        ownerId: req.user.userId,
        permissions,
        status: GRANT_STATUS.ACTIVE,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      { upsert: true, new: true }
    );

    // Notify requester
    await ShareNotification.create({
      userId: request.requesterId,
      senderId: req.user.userId,
      type: NOTIFICATION_TYPE.ACCESS_APPROVED,
      title: 'Access Request Approved',
      message: 'Your document access request was approved!',
      data: { documentId: request.documentId },
    }).catch(() => {});

    res.json({ success: true, grant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/sharing/access-requests/:id/reject
 * Reject document access request
 */
router.post('/access-requests/:id/reject', requireAuth, async (req, res) => {
  try {
    const request = await DocumentAccessRequest.findOne({
      _id: req.params.id,
      ownerId: req.user.userId,
      status: ACCESS_REQUEST_STATUS.PENDING,
    });

    if (!request) {
      return res.status(404).json({ success: false, error: 'Request not found.' });
    }

    request.status = ACCESS_REQUEST_STATUS.REJECTED;
    await request.save();

    res.json({ success: true, message: 'Request rejected.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sharing/audit/:documentId
 * View sharing access history for a document (owner only)
 */
router.get('/audit/:documentId', requireAuth, async (req, res) => {
  try {
    const doc = await Document.findOne({ _id: req.params.documentId, userId: req.user.userId });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found or unauthorized.' });
    }

    const logs = await ShareAccessLog.find({ documentId: req.params.documentId })
      .populate('recipientId', 'name docVaultId')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sharing/notifications
 * In-app share notifications
 */
router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const notifications = await ShareNotification.find({ userId: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(30);

    res.json({ success: true, data: notifications });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

