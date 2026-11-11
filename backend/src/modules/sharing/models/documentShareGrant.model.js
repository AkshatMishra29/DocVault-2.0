import mongoose from 'mongoose';

export const GRANT_STATUS = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
  SUSPENDED: 'SUSPENDED',
};

export const GRANT_SOURCE = {
  DOCUMENT_POLICY: 'DOCUMENT_POLICY',
  BULK_SHARE: 'BULK_SHARE',
  CATEGORY_RULE: 'CATEGORY_RULE',
  ACCESS_REQUEST: 'ACCESS_REQUEST',
};

const DocumentShareGrantSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    permissions: {
      view: { type: Boolean, default: true },
      download: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: Object.values(GRANT_STATUS),
      default: GRANT_STATUS.ACTIVE,
      index: true,
    },
    source: {
      type: String,
      enum: Object.values(GRANT_SOURCE),
      default: GRANT_SOURCE.DOCUMENT_POLICY,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound indexes for optimal authorization query speed
DocumentShareGrantSchema.index({ documentId: 1, recipientId: 1 }, { unique: true });
DocumentShareGrantSchema.index({ recipientId: 1, status: 1, expiresAt: 1 });
DocumentShareGrantSchema.index({ ownerId: 1, status: 1 });

export const DocumentShareGrant = mongoose.model('DocumentShareGrant', DocumentShareGrantSchema);

