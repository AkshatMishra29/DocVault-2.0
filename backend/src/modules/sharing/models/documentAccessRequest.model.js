import mongoose from 'mongoose';

export const ACCESS_REQUEST_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
};

const DocumentAccessRequestSchema = new mongoose.Schema(
  {
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    status: {
      type: String,
      enum: Object.values(ACCESS_REQUEST_STATUS),
      default: ACCESS_REQUEST_STATUS.PENDING,
      index: true,
    },
  },
  { timestamps: true }
);

DocumentAccessRequestSchema.index({ requesterId: 1, documentId: 1 });

export const DocumentAccessRequest = mongoose.model('DocumentAccessRequest', DocumentAccessRequestSchema);

