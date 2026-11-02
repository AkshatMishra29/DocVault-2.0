import mongoose from 'mongoose';

export const CONFLICT_STATUS = {
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
};

const ConflictRecordSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true, index: true },
    fieldName: { type: String, required: true, trim: true },
    documentAId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    factAValue: { type: mongoose.Schema.Types.Mixed, required: true },
    factAOriginal: { type: mongoose.Schema.Types.Mixed },
    documentBId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    factBValue: { type: mongoose.Schema.Types.Mixed, required: true },
    factBOriginal: { type: mongoose.Schema.Types.Mixed },
    status: {
      type: String,
      enum: Object.values(CONFLICT_STATUS),
      default: CONFLICT_STATUS.OPEN,
      index: true,
    },
    resolution: {
      type: String,
      enum: ['KEEP_A', 'KEEP_B', 'MANUAL_OVERRIDE', null],
      default: null,
    },
    resolvedValue: { type: mongoose.Schema.Types.Mixed, default: null },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
    notes: { type: String, default: null },
  },
  {
    timestamps: true,
  }
);

ConflictRecordSchema.index({ userId: 1, entityId: 1, fieldName: 1, status: 1 });

export const ConflictRecord = mongoose.model('ConflictRecord', ConflictRecordSchema);

