import mongoose from 'mongoose';

/**
 * Background Extraction Job Schema
 * Implements atomic leases, heartbeats, retry counts, and worker recovery.
 */
const ExtractionJobSchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['queued', 'running', 'done', 'failed', 'queued_ai', 'needs_review', 'storage_only'],
    default: 'queued',
    index: true,
  },
  retryCount: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 3 },
  workerId: { type: String, default: null },
  leaseExpiresAt: { type: Date, default: null, index: true },
  errorReason: { type: String, default: null },
  pipelineVersion: { type: String, default: '1.0.0' },
  progressStep: { type: String, default: 'Enqueued' },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
});

export const ExtractionJob = mongoose.model('ExtractionJob', ExtractionJobSchema);
