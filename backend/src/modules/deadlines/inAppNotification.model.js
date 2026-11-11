import mongoose from 'mongoose';

const InAppNotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ['DEADLINE_REMINDER', 'WARRANTY_ALERT', 'POLICY_HEALTH', 'EXPENSE_ALERT', 'GENERAL'],
    default: 'GENERAL',
    index: true
  },
  severity: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
  read: { type: Boolean, default: false, index: true },
  linkUrl: { type: String, default: '' },
  linkedAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', default: null },
  linkedDeadlineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deadline', default: null },
  createdAt: { type: Date, default: Date.now, index: true }
});

InAppNotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export const InAppNotification = mongoose.model('InAppNotification', InAppNotificationSchema);

