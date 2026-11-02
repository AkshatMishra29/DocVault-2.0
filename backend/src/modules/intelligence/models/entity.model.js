import mongoose from 'mongoose';

export const ENTITY_TYPES = {
  PERSON: 'PERSON',
  VEHICLE: 'VEHICLE',
  PROPERTY: 'PROPERTY',
  BANK_ACCOUNT: 'BANK_ACCOUNT',
  INSURANCE_POLICY: 'INSURANCE_POLICY',
  ORGANISATION: 'ORGANISATION',
  PRODUCT: 'PRODUCT',
  OTHER: 'OTHER',
};

const EntitySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    entityType: {
      type: String,
      enum: Object.values(ENTITY_TYPES),
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true, lowercase: true, index: true },
    attributes: { type: mongoose.Schema.Types.Mixed, default: {} },
    aliases: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ['active', 'archived', 'deleted'],
      default: 'active',
      index: true,
    },
    linkedDocumentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
    linkedAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', default: null },
  },
  {
    timestamps: true,
  }
);

// Compound unique index per user to guarantee deduplication
EntitySchema.index({ userId: 1, entityType: 1, normalizedName: 1 }, { unique: true });

// Pre-save hook to normalize name
EntitySchema.pre('validate', function () {
  if (this.name && !this.normalizedName) {
    this.normalizedName = this.name.trim().toLowerCase().replace(/\s+/g, ' ');
  }
});

export const Entity = mongoose.model('Entity', EntitySchema);

