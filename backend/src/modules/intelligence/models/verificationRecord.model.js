import mongoose from 'mongoose';

export const VERIFICATION_METHODS = {
  DIGITAL_SIGNATURE: 'digital_signature',
  TRUSTED_ISSUER_API: 'trusted_issuer_api',
  REFERENCE_LOOKUP: 'reference_lookup',
  MANUAL_AUDIT: 'manual_audit',
};

export const VERIFICATION_RESULTS = {
  VERIFIED: 'VERIFIED',
  NOT_VERIFIED: 'NOT_VERIFIED',
  VERIFICATION_UNAVAILABLE: 'VERIFICATION_UNAVAILABLE',
  NEEDS_MANUAL_REVIEW: 'NEEDS_MANUAL_REVIEW',
};

const VerificationRecordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    verificationMethod: {
      type: String,
      enum: Object.values(VERIFICATION_METHODS),
      required: true,
      index: true,
    },
    provider: { type: String, required: true },
    result: {
      type: String,
      enum: Object.values(VERIFICATION_RESULTS),
      required: true,
      index: true,
    },
    evidence: { type: mongoose.Schema.Types.Mixed, default: {} },
    failureReason: { type: String, default: null },
    checkedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

VerificationRecordSchema.index({ userId: 1, documentId: 1, verificationMethod: 1 });

export const VerificationRecord = mongoose.model('VerificationRecord', VerificationRecordSchema);
