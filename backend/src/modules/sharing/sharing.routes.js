import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { DocumentAccessControlService } from './accessControl.service.js';
import {
  DocumentAccessPolicy,
  AUDIENCE_MODE,
  DocumentShareGrant,
  GRANT_STATUS,
  DocumentShare,
  SHARE_STATUS,
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
 * Reusable recipient lookup handler for DocVault ID or Email verification
 */
export async function lookupRecipientHandler(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.status(400).json({ success: false, error: 'Query parameter "q" is required.' });
    }

    let user = null;
    if (q.includes('@')) {
      user = await User.findOne({ email: q.toLowerCase() }).select('_id name docVaultId email');
    } else {
      user = await User.findOne({ docVaultId: q.toUpperCase() }).select('_id name docVaultId email');
    }

    if (!user) {
      return res.status(404).json({ success: false, error: 'No DocVault user found with this ID or email.' });
    }

    if (user._id.toString() === req.user.userId.toString()) {
      return res.status(400).json({ success: false, error: 'You cannot share documents with yourself.' });
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        docVaultId: user.docVaultId,
        email: user.email,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/sharing/lookup-recipient
 * Safe lookup of recipient by DocVault ID or Email for sharing
 */
router.get('/lookup-recipient', requireAuth, lookupRecipientHandler);

/**
 * GET /api/sharing/received
 * List all documents shared with the current user via active grants and direct shares
 */
router.get('/received', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();
    const userDoc = await User.findById(userId).select('email');
    const userEmail = userDoc?.email ? userDoc.email.toLowerCase().trim() : null;

    // 1. Grants
    const grants = await DocumentShareGrant.find({
      recipientId: userId,
      status: GRANT_STATUS.ACTIVE,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
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

    // 2. Direct Shares
    const directShares = await DocumentShare.find({
      status: SHARE_STATUS.ACTIVE,
      $or: [
        { recipientUserId: userId },
        ...(userEmail ? [{ recipientEmail: userEmail }] : []),
      ],
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
      ],
    })
      .populate({
        path: 'documentIds',
        select: 'title category format fileSizeFormatted createdAt summary tags sensitiveFlag',
      })
      .populate({
        path: 'ownerId',
        select: 'name docVaultId',
      })
      .lean()
      .sort({ createdAt: -1 });

    const seenDocIds = new Set();
    const validGrants = [];

    // Process grants
    for (const g of grants) {
      if (!g.documentId) continue;
      const dId = g.documentId._id.toString();
      seenDocIds.add(dId);
      validGrants.push({
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
      });
    }

    // Process direct shares
    for (const s of directShares) {
      for (const d of s.documentIds || []) {
        if (!d) continue;
        const dId = d._id.toString();
        if (seenDocIds.has(dId)) continue;
        seenDocIds.add(dId);
        validGrants.push({
          grantId: null,
          shareId: s._id,
          documentId: d._id,
          title: d.title,
          category: d.category,
          format: d.format,
          fileSizeFormatted: d.fileSizeFormatted,
          summary: d.summary,
          owner: {
            id: s.ownerId?._id,
            name: s.ownerId?.name || 'DocVault User',
            docVaultId: s.ownerId?.docVaultId || '',
          },
          permissions: s.permissions,
          expiresAt: s.expiresAt,
          sharedAt: s.createdAt,
        });
      }
    }

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
 * GET /api/sharing/access-overview
 * Accurate backend-derived counts across all documents, shares, and grants
 */
router.get('/access-overview', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();

    const [totalDocs, userShares, userGrants, incomingGrants, incomingShares, pendingRequests] = await Promise.all([
      Document.countDocuments({ userId }),
      DocumentShare.find({ ownerId: userId }).select('documentIds status expiresAt').lean(),
      DocumentShareGrant.find({ ownerId: userId }).select('documentId status expiresAt').lean(),
      DocumentShareGrant.find({
        recipientId: userId,
        status: GRANT_STATUS.ACTIVE,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      }).countDocuments(),
      DocumentShare.find({
        status: SHARE_STATUS.ACTIVE,
        $or: [
          { recipientUserId: userId },
          ...(req.user.email ? [{ recipientEmail: req.user.email.toLowerCase().trim() }] : []),
        ],
        $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }],
      }).countDocuments(),
      DocumentAccessRequest.countDocuments({ ownerId: userId, status: ACCESS_REQUEST_STATUS.PENDING }),
    ]);

    // Compute distinct active shared documents
    const activeSharedDocIds = new Set();
    let activeGrantsCount = 0;
    let expiredSharesCount = 0;
    let revokedSharesCount = 0;

    for (const s of userShares) {
      const isExpired = (s.expiresAt && new Date(s.expiresAt) <= now) || s.status === SHARE_STATUS.EXPIRED;
      if (s.status === SHARE_STATUS.REVOKED) {
        revokedSharesCount++;
      } else if (isExpired) {
        expiredSharesCount++;
      } else if (s.status === SHARE_STATUS.ACTIVE) {
        activeGrantsCount++;
        for (const docId of s.documentIds || []) {
          if (docId) activeSharedDocIds.add(docId.toString());
        }
      }
    }

    for (const g of userGrants) {
      const isExpired = (g.expiresAt && new Date(g.expiresAt) <= now) || g.status === GRANT_STATUS.EXPIRED;
      if (g.status === GRANT_STATUS.ACTIVE && !isExpired && g.documentId) {
        activeSharedDocIds.add(g.documentId.toString());
      }
    }

    const sharedByMeCount = activeSharedDocIds.size;
    const privateDocsCount = Math.max(0, totalDocs - sharedByMeCount);
    const sharedWithMeCount = incomingGrants + incomingShares;

    res.json({
      success: true,
      data: {
        totalDocuments: totalDocs,
        privateDocuments: privateDocsCount,
        sharedByMe: sharedByMeCount,
        sharedWithMe: sharedWithMeCount,
        activeGrants: activeGrantsCount,
        expiredShares: expiredSharesCount,
        revokedShares: revokedSharesCount,
        pendingRequests,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sharing/private-documents
 * List all documents strictly private to the authenticated user
 */
router.get('/private-documents', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();

    // 1. Get active shared document IDs
    const [userShares, userGrants, policies] = await Promise.all([
      DocumentShare.find({
        ownerId: userId,
        status: SHARE_STATUS.ACTIVE,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      }).select('documentIds').lean(),
      DocumentShareGrant.find({
        ownerId: userId,
        status: GRANT_STATUS.ACTIVE,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      }).select('documentId').lean(),
      DocumentAccessPolicy.find({
        audienceMode: { $ne: AUDIENCE_MODE.ONLY_ME },
      }).select('documentId').lean(),
    ]);

    const sharedDocIds = new Set();
    userShares.forEach((s) => (s.documentIds || []).forEach((id) => id && sharedDocIds.add(id.toString())));
    userGrants.forEach((g) => g.documentId && sharedDocIds.add(g.documentId.toString()));
    policies.forEach((p) => p.documentId && sharedDocIds.add(p.documentId.toString()));

    // 2. Query documents owned by user excluding sharedDocIds
    const privateDocs = await Document.find({
      userId,
      _id: { $nin: Array.from(sharedDocIds) },
    })
      .select('-fileData')
      .sort({ createdAt: -1 })
      .lean();

    const formatted = privateDocs.map((d) => ({
      ...d,
      isPrivate: true,
      privacyStatus: 'PRIVATE',
      accessSummary: 'Strictly private. No external links or connections can view this document.',
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sharing/all-activity
 * Combined access and audit timeline for all shared documents
 */
router.get('/all-activity', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      ShareAccessLog.find({ ownerId: userId })
        .populate('recipientId', 'name docVaultId email')
        .populate('documentId', 'title category format')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ShareAccessLog.countDocuments({ ownerId: userId }),
    ]);

    const formatted = logs.map((l) => ({
      _id: l._id,
      documentTitle: l.documentId?.title || 'Shared Document',
      documentId: l.documentId?._id || l.documentId,
      recipient: l.recipientId
        ? {
            name: l.recipientId.name || 'DocVault User',
            docVaultId: l.recipientId.docVaultId || '',
            email: l.recipientId.email || '',
          }
        : { name: 'External / Link Viewer', docVaultId: '' },
      action: l.action,
      result: l.action === SHARE_ACTION.ACCESS_DENIED ? 'DENIED' : 'SUCCESS',
      timestamp: l.createdAt,
      metadata: l.metadata || {},
    }));

    res.json({ success: true, count: formatted.length, total, page, data: formatted });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/sharing/:documentId
 * Get sharing policy & active grants for a specific document
 */
router.get('/:documentId', requireAuth, async (req, res, next) => {
  try {
    const { documentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(documentId)) {
      return next();
    }
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
    if (!mongoose.Types.ObjectId.isValid(req.params.documentId)) {
      return res.status(400).json({ success: false, error: 'Invalid document ID format.' });
    }
    const doc = await Document.findOne({ _id: req.params.documentId, userId: req.user.userId });
    if (!doc) {
      return res.status(404).json({ success: false, error: 'Document not found or unauthorized.' });
    }

    const logs = await ShareAccessLog.find({ documentId: req.params.documentId })
      .populate('recipientId', 'name docVaultId email')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const formatted = logs.map((l) => ({
      _id: l._id,
      action: l.action,
      result: l.action === SHARE_ACTION.ACCESS_DENIED ? 'DENIED' : 'SUCCESS',
      timestamp: l.createdAt,
      recipient: l.recipientId
        ? {
            name: l.recipientId.name || 'DocVault User',
            docVaultId: l.recipientId.docVaultId || '',
            email: l.recipientId.email || '',
          }
        : { name: 'External / Link Viewer', docVaultId: '' },
      metadata: l.metadata || {},
    }));

    res.json({ success: true, count: formatted.length, data: formatted });
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

