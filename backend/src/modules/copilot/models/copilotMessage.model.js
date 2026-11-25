import mongoose from 'mongoose';

/**
 * CopilotMessage Schema
 * Dedicated Copilot conversation history (isolated from existing Conversation / Message models).
 */
const CopilotMessageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    title: { type: String, default: 'New Conversation' },
    role: { type: String, enum: ['user', 'assistant', 'system', 'tool'], required: true },
    content: { type: String, default: '' },
    toolCalls: { type: Array, default: [] },
    toolResults: { type: Array, default: [] },
    sources: { type: Array, default: [] },
    confirmations: { type: Array, default: [] },
  },
  { timestamps: true }
);

CopilotMessageSchema.index({ userId: 1, sessionId: 1, createdAt: 1 });

export const CopilotMessage = mongoose.models.CopilotMessage || mongoose.model('CopilotMessage', CopilotMessageSchema);
