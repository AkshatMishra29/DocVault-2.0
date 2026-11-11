import mongoose from 'mongoose';

const DeadlineSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  date: { type: String, required: true }, // YYYY-MM-DD
  daysLeft: { type: Number },
  category: {
    type: String,
    enum: [
      'Insurance Expiry',
      'RC Renewal',
      'PUC Expiry',
      'Warranty Expiry',
      'Policy Renewal',
      'Bill Due Date',
      'Subscription Expiry',
      'Custom'
    ],
    default: 'Custom',
    index: true
  },
  severity: { type: String, enum: ['urgent', 'upcoming', 'normal'], default: 'upcoming' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  status: {
    type: String,
    enum: ['Upcoming', 'Due Soon', 'Overdue', 'Completed'],
    default: 'Upcoming',
    index: true
  },
  linkedDocId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null, index: true },
  linkedAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', default: null, index: true },
  action: { type: String, default: 'Renew document' },
  isCompleted: { type: Boolean, default: false },

  // Reminders config & shared family reminders
  reminderDaysBefore: { type: [Number], default: [30, 7, 1, 0] },
  sharedWithFamilyUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

DeadlineSchema.index({ userId: 1, date: 1, isCompleted: 1 });

export const Deadline = mongoose.model('Deadline', DeadlineSchema);

