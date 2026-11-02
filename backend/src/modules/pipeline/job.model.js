import mongoose from 'mongoose';

const JobSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'done', 'failed'],
      default: 'queued',
      index: true,
    },
    stage: {
      type: String,
      enum: ['init', 'adapter', 'ocr', 'classify', 'extract', 'verify', 'persist', 'done', 'failed'],
      default: 'init',
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    leasedAt: {
      type: Date,
      default: null,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    lockedBy: {
      type: String,
      default: null,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sha256: {
      type: String,
      required: true,
      index: true,
    },
    pipelineVersion: {
      type: String,
      default: '1.0.0',
    },
    pageCount: {
      type: Number,
      default: 1,
    },
    error: {
      type: String,
      default: null,
    },
    resultSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    nextRetryAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient job worker polling
JobSchema.index({ status: 1, nextRetryAt: 1, leaseExpiresAt: 1, createdAt: 1 });

export const Job = mongoose.model('Job', JobSchema);

