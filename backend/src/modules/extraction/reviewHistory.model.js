import mongoose from 'mongoose';

/**
 * Review History Schema
 * Preserves audit trail of user corrections without training models or leaking data.
 */
const ReviewHistorySchema = new mongoose.Schema({
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  fieldName: { type: String, required: true },
  originalValue: { type: mongoose.Schema.Types.Mixed },
  originalConfidence: { type: Number },
  originalEvidence: { type: String },
  correctedValue: { type: mongoose.Schema.Types.Mixed, required: true },
  userAction: { type: String, enum: ['confirmed', 'corrected', 'rejected'], default: 'corrected' },
  timestamp: { type: Date, default: Date.now },
});

export const ReviewHistory = mongoose.model('ReviewHistory', ReviewHistorySchema);
