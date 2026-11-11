import mongoose from 'mongoose';

export const SHARE_STATUS = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
};

export const SHARE_TYPE = {
  CONNECTION: 'CONNECTION', // Shared directly with a mutual DocVault connection
  DIRECT: 'DIRECT',         // Shared with specific email/phone
  LINK: 'LINK',             // Expiring cryptographic share link
};

const DocumentShareSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Array of document IDs included in this share (supports multi-document / Smart Share Packs)
    documentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
        required: true,
      },
    ],
    // Purpose / title for this share (e.g. "Home Loan Application", "CA Tax Filing 2026")
    purpose: {
      type: String,
      default: 'Document Access',
      trim: true,
    },
    shareType: {
      type: String,
      enum: Object.values(SHARE_TYPE),
      default: SHARE_TYPE.CONNECTION,
    },

    // Recipient specifications
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    recipientEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    recipientPhone: {
      type: String,
      trim: true,
      default: null,
    },

    // Cryptographic Expiring Token (Store only SHA-256 hash, NEVER plaintext)
    tokenHash: {
      type: String,
      index: true,
      default: null,
    },

    // Access control & Security
    permissions: {
      view: { type: Boolean, default: true },
      download: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: Object.values(SHARE_STATUS),
      default: SHARE_STATUS.ACTIVE,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },

    // Password Protection (Hashed with bcryptjs)
    passwordHash: {
      type: String,
      default: null,
    },
    passwordRequired: {
      type: Boolean,
      default: false,
    },

    // OTP Verification Challenge (Stores SHA-256 hash of OTP)
    otpRequired: {
      type: Boolean,
      default: false,
    },
    otpChallenge: {
      hash: { type: String, default: null },
      expiresAt: { type: Date, default: null },
      attempts: { type: Number, default: 0 },
      verifiedAt: { type: Date, default: null },
      lastSentAt: { type: Date, default: null },
    },

    // Dynamic Watermark
    watermarkEnabled: {
      type: Boolean,
      default: true,
    },
    watermarkCustomText: {
      type: String,
      default: null,
    },

    // Minimum Necessary Sharing & Allowed Fields configuration
    // Maps documentId -> { allowedFields: ['invoice_number', 'amount'], maskedFields: ['pan', 'phone'] }
    minimumNecessaryConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Redacted copies mapping: documentId -> RedactedDocument ObjectId
    redactedDocMap: {
      type: Map,
      of: { type: mongoose.Schema.Types.ObjectId, ref: 'RedactedDocument' },
      default: {},
    },

    // Versioning policy: If owner uploads a new version, require approval before exposing
    versionSyncPolicy: {
      type: String,
      enum: ['PINNED', 'PROMPT_UPDATE'],
      default: 'PINNED',
    },
  },
  {
    timestamps: true,
  }
);

DocumentShareSchema.index({ ownerId: 1, status: 1 });
DocumentShareSchema.index({ recipientUserId: 1, status: 1 });
DocumentShareSchema.index({ tokenHash: 1, status: 1 });

export const DocumentShare = mongoose.model('DocumentShare', DocumentShareSchema);

