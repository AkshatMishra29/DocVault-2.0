import mongoose from 'mongoose';

export const USER_CONNECTION_STATUS = {
  NOT_CONNECTED: 'NOT_CONNECTED',
  ONE_WAY: 'ONE_WAY',
  MUTUAL: 'MUTUAL',
  BLOCKED: 'BLOCKED',
};

/**
 * Tracks bidirectional connection between two users
 * userA is always < userB (lexicographically by string ID) to ensure a single canonical pair document
 */
const UserConnectionSchema = new mongoose.Schema(
  {
    userA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userB: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userAApprovedB: {
      type: Boolean,
      default: false,
    },
    userBApprovedA: {
      type: Boolean,
      default: false,
    },
    // User who blocked the other (if any)
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(USER_CONNECTION_STATUS),
      default: USER_CONNECTION_STATUS.NOT_CONNECTED,
      index: true,
    },
    connectedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

UserConnectionSchema.index({ userA: 1, userB: 1 }, { unique: true });

export const UserConnection = mongoose.model('UserConnection', UserConnectionSchema);

