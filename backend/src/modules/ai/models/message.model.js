import mongoose from 'mongoose';

const SourceDocumentSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      default: 'Document',
    },
    documentType: {
      type: String,
      default: 'pdf',
    },
    pageNumber: {
      type: Number,
      default: 1,
    },
    previewRoute: {
      type: String,
      required: true,
    },
    downloadUrl: {
      type: String,
    },
  },
  { _id: false }
);

const MessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    sources: {
      type: [SourceDocumentSchema],
      default: [],
    },
    referencedDocIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
      },
    ],
    confidence: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'high',
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast retrieval of a conversation's messages and user queries
MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ userId: 1, createdAt: -1 });

export const Message = mongoose.model('Message', MessageSchema);
