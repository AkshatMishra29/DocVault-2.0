import express from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { config } from '../../config/index.js';
import { runCopilotOrchestrator } from './orchestrator.js';
import { CopilotRun } from './models/copilotRun.model.js';
import { CopilotMessage } from './models/copilotMessage.model.js';
import { executeConfirmedAction } from './services/execution.service.js';

const router = express.Router();

// Simple in-memory rate-limiter per user for beta protection
const userRequestCounts = new Map();
function copilotRateLimit(req, res, next) {
  const userId = req.user?.userId;
  if (!userId) return next();
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 min window
  const limit = 20;

  const record = userRequestCounts.get(userId) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  record.count++;
  userRequestCounts.set(userId, record);

  if (record.count > limit) {
    return res.status(429).json({ success: false, error: 'Rate limit exceeded. Please wait a minute.' });
  }
  next();
}

/**
 * Access Guard:
 * 1. Must be authenticated (requireAuth)
 * 2. Token MUST have pinVerified: true (vault unlocked)
 * 3. Optional allowlist check (COPILOT_BETA_USER_IDS)
 */
function guardCopilotBeta(req, res, next) {
  if (!config.copilotBetaEnabled) {
    return res.status(404).json({ success: false, error: 'DocVault Copilot Beta is currently disabled.' });
  }

  // Token pinVerified check
  if (!req.user || req.user.pinVerified !== true) {
    return res.status(403).json({
      success: false,
      error: 'PIN verification required. Please unlock your vault before using Copilot.',
    });
  }

  // Allowlist check if configured
  if (config.copilotBetaUserIds && config.copilotBetaUserIds.length > 0) {
    if (!config.copilotBetaUserIds.includes(req.user.userId)) {
      return res.status(403).json({
        success: false,
        error: 'Your account is not enrolled in the DocVault Copilot Beta test group.',
      });
    }
  }

  next();
}

/**
 * GET /api/copilot/status
 * Returns beta enablement status
 */
router.get('/status', (req, res) => {
  const isEnabled = Boolean(config.copilotBetaEnabled);
  let userAllowed = isEnabled;
  if (isEnabled && config.copilotBetaUserIds && config.copilotBetaUserIds.length > 0) {
    userAllowed = req.user ? config.copilotBetaUserIds.includes(req.user.userId) : false;
  }
  res.json({
    success: true,
    enabled: isEnabled,
    userAllowed,
    model: 'llama-3.3-70b-versatile',
  });
});

/**
 * POST /api/copilot/chat
 * Server-Sent Events (SSE) streaming chat endpoint
 */
router.post('/chat', requireAuth, guardCopilotBeta, copilotRateLimit, async (req, res) => {
  const { message, sessionId = 'default', history = [] } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: 'Message text is required.' });
  }

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {}
  };

  // Heartbeat comment every 15s to keep connections alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (e) {}
  }, 15000);

  const abortController = new AbortController();
  req.on('close', () => {
    clearInterval(heartbeat);
    abortController.abort();
  });

  // Save User message to copilot history
  CopilotMessage.create({
    userId: req.user.userId,
    sessionId,
    role: 'user',
    content: message,
  }).catch(() => {});

  let assistantContent = '';
  const sourcesCollected = [];

  try {
    await runCopilotOrchestrator({
      userId: req.user.userId,
      userMessage: message,
      history,
      sendEvent: (event, data) => {
        if (event === 'text_delta' && data.text) {
          assistantContent += data.text;
        }
        if (event === 'sources' && data.sources) {
          sourcesCollected.push(...data.sources);
        }
        sendEvent(event, data);
      },
      abortSignal: abortController.signal,
    });

    // Save assistant message to copilot history
    if (assistantContent) {
      await CopilotMessage.create({
        userId: req.user.userId,
        sessionId,
        role: 'assistant',
        content: assistantContent,
        sources: sourcesCollected,
      });
    }
  } catch (err) {
    sendEvent('error', { message: err.message || 'An unexpected error occurred in Copilot.' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

/**
 * GET /api/copilot/runs/:id
 */
router.get('/runs/:id', requireAuth, guardCopilotBeta, async (req, res) => {
  try {
    const run = await CopilotRun.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!run) return res.status(404).json({ success: false, error: 'Run not found.' });
    res.json({ success: true, run });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/copilot/runs/:id/cancel
 */
router.post('/runs/:id/cancel', requireAuth, guardCopilotBeta, async (req, res) => {
  try {
    const run = await CopilotRun.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId, status: 'awaiting_approval' },
      { $set: { status: 'cancelled' } },
      { new: true }
    );
    if (!run) {
      return res.status(404).json({ success: false, error: 'Run not found or already completed/cancelled.' });
    }
    res.json({ success: true, run });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/copilot/runs/:id/approve
 * Atomically transitions run status from 'awaiting_approval' to 'executing' -> 'completed'
 */
router.post('/runs/:id/approve', requireAuth, guardCopilotBeta, async (req, res) => {
  try {
    const run = await CopilotRun.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!run) {
      return res.status(404).json({ success: false, error: 'Action confirmation record not found.' });
    }

    if (run.status !== 'awaiting_approval') {
      return res.status(400).json({
        success: false,
        error: `Action cannot be approved because it is already ${run.status}.`,
      });
    }

    // Atomic status lock to prevent replay attacks
    const lockedRun = await CopilotRun.findOneAndUpdate(
      { _id: run._id, status: 'awaiting_approval' },
      { $set: { status: 'executing' } },
      { new: true }
    );

    if (!lockedRun) {
      return res.status(409).json({ success: false, error: 'Action is already currently being executed.' });
    }

    // Execute the action with user authentication context
    try {
      const result = await executeConfirmedAction({
        runId: run._id.toString(),
        action: run.action,
        args: run.args,
        userId: req.user.userId,
      });

      lockedRun.status = 'completed';
      lockedRun.executionResult = result;
      await lockedRun.save();

      res.json({ success: true, runId: run._id, result });
    } catch (execErr) {
      lockedRun.status = 'failed';
      lockedRun.errorMessage = execErr.message;
      await lockedRun.save();
      res.status(500).json({ success: false, error: execErr.message });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * History Endpoints for CopilotMessage
 */
router.get('/history', requireAuth, guardCopilotBeta, async (req, res) => {
  try {
    const { sessionId = 'default' } = req.query;
    const messages = await CopilotMessage.find({ userId: req.user.userId, sessionId })
      .sort({ createdAt: 1 })
      .limit(50)
      .lean();
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/history', requireAuth, guardCopilotBeta, async (req, res) => {
  try {
    const { sessionId = 'default' } = req.query;
    await CopilotMessage.deleteMany({ userId: req.user.userId, sessionId });
    res.json({ success: true, message: 'Copilot history cleared.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
