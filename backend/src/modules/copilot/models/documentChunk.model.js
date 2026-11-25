import mongoose from 'mongoose';

/**
 * DocumentChunk Schema
 * Stores page-aware chunked text and 384-d vector embeddings for non-sensitive, ai_enabled documents.
 */
const DocumentChunkSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    pageNumber: { type: Number, default: 1 },
    chunkIndex: { type: Number, default: 0 },
    text: { type: String, required: true },
    embedding: {
      type: [Number],
      validate: {
        validator: function (v) {
          return !v || v.length === 384;
        },
        message: 'Embedding must be a 384-dimensional vector',
      },
      index: false,
    },
    tokenCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

DocumentChunkSchema.index({ userId: 1, documentId: 1, chunkIndex: 1 }, { unique: true });
DocumentChunkSchema.index({ text: 'text' });

export const DocumentChunk = mongoose.models.DocumentChunk || mongoose.model('DocumentChunk', DocumentChunkSchema);
