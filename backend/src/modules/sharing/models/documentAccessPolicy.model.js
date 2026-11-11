import mongoose from 'mongoose';

export const AUDIENCE_MODE = {
  ONLY_ME: 'ONLY_ME',                       // Default private
  ALL_CONNECTIONS: 'ALL_CONNECTIONS',       // All mutual connections at save time
  SELECTED: 'SELECTED',                     // Selected mutual connections
  ALL_EXCEPT: 'ALL_EXCEPT',                 // All mutual connections minus excluded
};

const DocumentAccessPolicySchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      unique: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    audienceMode: {
      type: String,
      enum: Object.values(AUDIENCE_MODE),
      default: AUDIENCE_MODE.ONLY_ME,
      required: true,
      index: true,
    },
    selectedUserIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    excludedUserIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    permissions: {
      view: { type: Boolean, default: true },
      download: { type: Boolean, default: false },
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

export const DocumentAccessPolicy = mongoose.model('DocumentAccessPolicy', DocumentAccessPolicySchema);

