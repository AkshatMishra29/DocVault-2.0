import mongoose from 'mongoose';

/**
 * CopilotRun Schema
 * Tracks tool executions, safety confirmations, and state for multi-step copilot requests.
 */
const CopilotRunSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['awaiting_approval', 'executing', 'completed', 'cancelled', 'failed', 'expired'],
      default: 'awaiting_approval',
      index: true,
    },
    action: { type: String, required: true },
    args: { type: mongoose.Schema.Types.Mixed, default: {} },
    humanSummary: { type: String, required: true },
    executionResult: { type: mongoose.Schema.Types.Mixed, default: null },
    errorMessage: { type: String, default: null },
    idempotencyKey: { type: String, required: true, unique: true },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 15 * 60 * 1000), // 15 min TTL
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

CopilotRunSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const CopilotRun = mongoose.models.CopilotRun || mongoose.model('CopilotRun', CopilotRunSchema);
