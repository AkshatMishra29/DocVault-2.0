import mongoose from 'mongoose';

export const RELATIONSHIP_TYPES = {
  OWNS: 'OWNS',
  BELONGS_TO: 'BELONGS_TO',
  PROTECTED_BY: 'PROTECTED_BY',
  ISSUED_BY: 'ISSUED_BY',
  PURCHASED_FROM: 'PURCHASED_FROM',
  REGISTERED_TO: 'REGISTERED_TO',
  RELATED_TO: 'RELATED_TO',
  REPLACES: 'REPLACES',
  EXPIRES_ON: 'EXPIRES_ON',
};

const RelationshipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    familyId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    fromEntityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true, index: true },
    relationshipType: {
      type: String,
      enum: Object.values(RELATIONSHIP_TYPES),
      required: true,
      index: true,
    },
    toEntityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Entity', required: true, index: true },
    sourceDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null, index: true },
    evidenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'DocumentFact', default: null },
    confidence: { type: Number, min: 0, max: 1, default: 1.0 },
    verificationStatus: {
      type: String,
      enum: ['unverified', 'confirmed', 'rejected'],
      default: 'unverified',
      index: true,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate relationship edges between same entities with same type for a user
RelationshipSchema.index(
  { userId: 1, fromEntityId: 1, toEntityId: 1, relationshipType: 1 },
  { unique: true }
);

export const Relationship = mongoose.model('Relationship', RelationshipSchema);

