import mongoose from 'mongoose';

const SharedQuestionSchema = new mongoose.Schema(
  {
    shareId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocumentShare',
      required: true,
      index: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    askedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    clientFingerprint: {
      type: String,
      default: '',
    },
    question: {
      type: String,
      required: true,
      trim: true,
    },
    answer: {
      type: String,
      required: true,
    },
    evidence: {
      type: String,
      default: null,
    },
    sourceDocumentTitle: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

SharedQuestionSchema.index({ shareId: 1, createdAt: -1 });

export const SharedQuestion = mongoose.model('SharedQuestion', SharedQuestionSchema);

