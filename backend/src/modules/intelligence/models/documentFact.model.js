import mongoose from 'mongoose';

const DocumentFactSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', default: null, index: true },
    fieldName: { type: String, required: true, trim: true, index: true },
    normalizedValue: { type: mongoose.Schema.Types.Mixed, required: true },
    originalValue: { type: mongoose.Schema.Types.Mixed },
    valueType: {
      type: String,
      enum: ['string', 'date', 'amount', 'identifier', 'boolean', 'number'],
      default: 'string',
    },
    sourcePage: { type: Number, default: 1 },
    sourceTextReference: { type: String, default: null },
    extractionMethod: {
      type: String,
      enum: ['rules', 'regex', 'groq_llm', 'gemini_vision', 'user_corrected', 'manual', 'fallback'],
      default: 'rules',
    },
    confidence: { type: Number, min: 0, max: 1, default: 0.9 },
    verificationStatus: {
      type: String,
      enum: ['unverified', 'verified', 'conflicted', 'user_corrected'],
      default: 'unverified',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast fact lookup and deduplication per document
DocumentFactSchema.index({ userId: 1, documentId: 1, fieldName: 1 });
DocumentFactSchema.index({ userId: 1, entityId: 1, fieldName: 1 });

export const DocumentFact = mongoose.model('DocumentFact', DocumentFactSchema);

