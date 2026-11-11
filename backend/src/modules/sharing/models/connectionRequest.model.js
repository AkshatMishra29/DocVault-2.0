import mongoose from 'mongoose';

export const CONNECTION_REQUEST_STATUS = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
};

const ConnectionRequestSchema = new mongoose.Schema(
  {
    requesterId: {
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
    status: {
      type: String,
      enum: Object.values(CONNECTION_REQUEST_STATUS),
      default: CONNECTION_REQUEST_STATUS.PENDING,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound index to optimize lookup & unique constraint for pending requests
ConnectionRequestSchema.index({ requesterId: 1, recipientId: 1 });
ConnectionRequestSchema.index({ recipientId: 1, status: 1 });
ConnectionRequestSchema.index({ requesterId: 1, status: 1 });

export const ConnectionRequest = mongoose.model('ConnectionRequest', ConnectionRequestSchema);

