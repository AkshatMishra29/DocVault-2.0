import mongoose from 'mongoose';

/**
 * Token Ledger Schema
 * Tracks LLM token usage across all providers, models, documents, and users.
 */
const TokenLedgerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', index: true },
  provider: { type: String, enum: ['groq', 'gemini', 'huggingface'], required: true },
  model: { type: String, required: true },
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  totalTokens: { type: Number, default: 0 },
  processingStage: { 
    type: String, 
    enum: ['classification', 'extraction_fallback', 'qa_rag', 'vision_ocr'], 
    default: 'extraction_fallback' 
  },
  timestamp: { type: Date, default: Date.now, index: true },
});

export const TokenLedger = mongoose.model('TokenLedger', TokenLedgerSchema);
