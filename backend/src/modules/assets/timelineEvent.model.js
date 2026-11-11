import mongoose from 'mongoose';

const TimelineEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  eventType: {
    type: String,
    enum: [
      'DOCUMENT_UPLOADED',
      'DOCUMENT_UPDATED',
      'ASSET_CREATED',
      'ASSET_UPDATED',
      'WARRANTY_STARTED',
      'WARRANTY_EXPIRED',
      'INSURANCE_RENEWED',
      'DEADLINE_CREATED',
      'DEADLINE_COMPLETED',
      'EXPENSE_LOGGED'
    ],
    required: true,
    index: true
  },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  eventDate: { type: String, required: true, index: true }, // YYYY-MM-DD
  year: { type: Number, required: true, index: true },
  category: { type: String, default: 'General', index: true },

  // Polymorphic References
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', default: null, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
  deadlineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deadline', default: null },
  expenseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense', default: null },

  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
});

TimelineEventSchema.index({ userId: 1, year: -1, eventDate: -1 });

export const TimelineEvent = mongoose.model('TimelineEvent', TimelineEventSchema);

