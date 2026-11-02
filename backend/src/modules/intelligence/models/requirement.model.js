import mongoose from 'mongoose';
import { ENTITY_TYPES } from './entity.model.js';

const RequirementItemSchema = new mongoose.Schema(
  {
    requirementKey: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String },
    documentTypes: [{ type: String }],
    isRequired: { type: Boolean, default: true },
    warningPeriodDays: { type: Number, default: 30 },
  },
  { _id: false }
);

const RequirementTemplateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    entityType: {
      type: String,
      enum: Object.values(ENTITY_TYPES),
      required: true,
      index: true,
    },
    templateName: { type: String, required: true },
    description: { type: String },
    isSystemDefault: { type: Boolean, default: false },
    items: [RequirementItemSchema],
  },
  {
    timestamps: true,
  }
);

RequirementTemplateSchema.index({ entityType: 1, isSystemDefault: 1 });
RequirementTemplateSchema.index({ userId: 1, entityType: 1 });

export const RequirementTemplate = mongoose.model('RequirementTemplate', RequirementTemplateSchema);

