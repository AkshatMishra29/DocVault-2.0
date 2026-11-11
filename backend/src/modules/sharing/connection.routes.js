import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { ConnectionService } from './connection.service.js';
import { User } from '../auth/auth.model.js';

const router = Router();

// Rate-limiting / anti-abuse map for lookup and request endpoints
const requestTimestamps = new Map();
function rateLimit(windowMs = 60000, maxRequests = 30) {
  return (req, res, next) => {
    const key = `${req.ip}_${req.user?.userId || ''}`;
    const now = Date.now();
    const timestamps = (requestTimestamps.get(key) || []).filter((t) => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
      return res.status(429).json({ success: false, error: 'Too many requests. Please slow down.' });
    }
    timestamps.push(now);
    requestTimestamps.set(key, timestamps);
    next();
  };
}

/**
 * GET /api/connections/lookup/:docVaultId
 * Public lookup: Reveals ONLY name and docVaultId. Zero documents, assets or family details exposed!
 */
router.get('/lookup/:docVaultId', requireAuth, rateLimit(60000, 20), async (req, res) => {
  try {
    const cleanId = req.params.docVaultId.trim().toUpperCase();
    const user = await User.findOne({ docVaultId: cleanId }).select('name docVaultId createdAt');

    if (!user) {
      return res.status(404).json({ success: false, error: 'No user found with this DocVault ID.' });
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        docVaultId: user.docVaultId,
        memberSince: user.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/connections
 * List all connections with detailed relationship status
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const connections = await ConnectionService.getUserConnections(req.user.userId);
    res.json({ success: true, count: connections.length, data: connections });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/connections/requests
 * List incoming and outgoing pending connection requests
 */
router.get('/requests', requireAuth, async (req, res) => {
  try {
    const requests = await ConnectionService.getRequests(req.user.userId);
    res.json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/connections/request
 * Send a connection request via DocVault ID
 */
router.post('/request', requireAuth, rateLimit(60000, 15), async (req, res) => {
  try {
    const { docVaultId } = req.body;
    const result = await ConnectionService.sendRequest(req.user.userId, docVaultId);
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/connections/requests/:id/accept
 * Accept incoming connection request
 */
router.post('/requests/:id/accept', requireAuth, async (req, res) => {
  try {
    const result = await ConnectionService.acceptRequest(req.user.userId, req.params.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/connections/requests/:id/reject
 * Reject incoming connection request
 */
router.post('/requests/:id/reject', requireAuth, async (req, res) => {
  try {
    const result = await ConnectionService.rejectRequest(req.user.userId, req.params.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/connections/requests/:id
 * Cancel outgoing pending request
 */
router.delete('/requests/:id', requireAuth, async (req, res) => {
  try {
    const result = await ConnectionService.cancelRequest(req.user.userId, req.params.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/connections/:targetUserId
 * Remove connection (revokes all active document grants between users)
 */
router.delete('/:targetUserId', requireAuth, async (req, res) => {
  try {
    const result = await ConnectionService.removeConnection(req.user.userId, req.params.targetUserId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/connections/:targetUserId/block
 * Block user and revoke grants
 */
router.post('/:targetUserId/block', requireAuth, async (req, res) => {
  try {
    const result = await ConnectionService.blockUser(req.user.userId, req.params.targetUserId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/connections/:targetUserId/unblock
 * Unblock user
 */
router.post('/:targetUserId/unblock', requireAuth, async (req, res) => {
  try {
    const result = await ConnectionService.unblockUser(req.user.userId, req.params.targetUserId);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

export default router;

