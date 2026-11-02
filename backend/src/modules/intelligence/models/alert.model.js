import mongoose from 'mongoose';

export const ALERT_TYPES = {
  DOCUMENT_EXPIRY: 'DOCUMENT_EXPIRY',
  DOCUMENT_EXPIRED: 'DOCUMENT_EXPIRED',
  MISSING_DOCUMENT: 'MISSING_DOCUMENT',
  INFORMATION_CONFLICT: 'INFORMATION_CONFLICT',
  DOCUMENT_UPDATE: 'DOCUMENT_UPDATE',
  DOCUMENT_REVIEW_REQUIRED: 'DOCUMENT_REVIEW_REQUIRED',
  VERIFICATION_RESULT: 'VERIFICATION_RESULT',
};

export const ALERT_SEVERITY = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
};

export const ALERT_STATUS = {
  ACTIVE: 'ACTIVE',
  DISMISSED: 'DISMISSED',
  RESOLVED: 'RESOLVED',
};

const IntelligenceAlertSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    alertType: {
      type: String,
      enum: Object.values(ALERT_TYPES),
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: Object.values(ALERT_SEVERITY),
      default: ALERT_SEVERITY.INFO,
      index: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    relatedDocumentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
    relatedEntityIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Entity' }],
    evidenceReferences: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: Object.values(ALERT_STATUS),
      default: ALERT_STATUS.ACTIVE,
      index: true,
    },
    deduplicationKey: { type: String, required: true, index: true },
    actionLabel: { type: String, default: 'Review' },
    actionUrl: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
    dismissedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

// Compound index guaranteeing no duplicate alerts per user
IntelligenceAlertSchema.index({ userId: 1, deduplicationKey: 1 }, { unique: true });
IntelligenceAlertSchema.index({ userId: 1, status: 1, severity: 1 });

export const IntelligenceAlert = mongoose.model('IntelligenceAlert', IntelligenceAlertSchema);

