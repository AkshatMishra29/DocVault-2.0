import mongoose from 'mongoose';

const DocumentVersionItemSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    versionNumber: { type: Number, required: true },
    previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    uploadedAt: { type: Date, default: Date.now },
    changeSummary: { type: String, default: null },
    changedFields: [{
      fieldName: { type: String },
      oldValue: { type: mongoose.Schema.Types.Mixed },
      newValue: { type: mongoose.Schema.Types.Mixed },
    }],
    isCurrentVersion: { type: Boolean, default: true },
  },
  { _id: false }
);

const DocumentVersionGroupSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    documentGroupId: { type: String, required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', default: null, index: true },
    documentType: { type: String, default: 'Other' },
    title: { type: String, default: 'Document Version Group' },
    versions: [DocumentVersionItemSchema],
  },
  {
    timestamps: true,
  }
);

DocumentVersionGroupSchema.index({ userId: 1, documentGroupId: 1 }, { unique: true });
DocumentVersionGroupSchema.index({ userId: 1, 'versions.documentId': 1 });

export const DocumentVersionGroup = mongoose.model('DocumentVersionGroup', DocumentVersionGroupSchema);
