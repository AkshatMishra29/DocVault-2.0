import mongoose from 'mongoose';

export const SHARE_ACTION = {
  CREATED: 'CREATED',
  SHARED: 'SHARED',
  VIEWED: 'VIEWED',
  PREVIEW_REQUESTED: 'PREVIEW_REQUESTED',
  DOWNLOADED: 'DOWNLOADED',
  DOWNLOAD_ATTEMPTED: 'DOWNLOAD_ATTEMPTED',
  PERMISSION_CHANGED: 'PERMISSION_CHANGED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  ACCESS_REQUESTED: 'ACCESS_REQUESTED',
  ACCESS_APPROVED: 'ACCESS_APPROVED',
  ACCESS_REJECTED: 'ACCESS_REJECTED',
  ACCESS_REVOKED: 'ACCESS_REVOKED',
  POLICY_UPDATED: 'POLICY_UPDATED',
  ACCESS_EXPIRED: 'ACCESS_EXPIRED',
  OTP_REQUESTED: 'OTP_REQUESTED',
  OTP_VERIFIED: 'OTP_VERIFIED',
  EXPIRY_EXTENDED: 'EXPIRY_EXTENDED',
};

const ShareAccessLogSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: Object.values(SHARE_ACTION),
      required: true,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

export const ShareAccessLog = mongoose.model('ShareAccessLog', ShareAccessLogSchema);

