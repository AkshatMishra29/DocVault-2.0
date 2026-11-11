import mongoose from 'mongoose';

export const NOTIFICATION_TYPE = {
  CONNECTION_REQUEST: 'CONNECTION_REQUEST',
  CONNECTION_ACCEPTED: 'CONNECTION_ACCEPTED',
  DOCUMENT_SHARED: 'DOCUMENT_SHARED',
  ACCESS_REQUESTED: 'ACCESS_REQUESTED',
  ACCESS_APPROVED: 'ACCESS_APPROVED',
  ACCESS_REJECTED: 'ACCESS_REJECTED',
  ACCESS_REVOKED: 'ACCESS_REVOKED',
};

const ShareNotificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPE),
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

export const ShareNotification = mongoose.model('ShareNotification', ShareNotificationSchema);

