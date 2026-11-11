import mongoose from 'mongoose';
import { AUDIENCE_MODE } from './documentAccessPolicy.model.js';

export const RULE_SCOPE = {
  EXISTING_ONLY: 'EXISTING_ONLY',
  EXISTING_AND_FUTURE: 'EXISTING_AND_FUTURE',
};

const SharingRuleSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    audienceMode: {
      type: String,
      enum: Object.values(AUDIENCE_MODE),
      default: AUDIENCE_MODE.SELECTED,
      required: true,
    },
    selectedUserIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    excludedUserIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    permissions: {
      view: { type: Boolean, default: true },
      download: { type: Boolean, default: false },
    },
    scope: {
      type: String,
      enum: Object.values(RULE_SCOPE),
      default: RULE_SCOPE.EXISTING_ONLY,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export const SharingRule = mongoose.model('SharingRule', SharingRuleSchema);

