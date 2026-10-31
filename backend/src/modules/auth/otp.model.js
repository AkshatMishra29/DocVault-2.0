import mongoose from 'mongoose';

const OtpVerificationSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  otpHash: { type: String, required: true },
  purpose: { type: String, enum: ['register', 'login'], default: 'register' },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, expires: 0 }, // MongoDB automatic TTL deletion
  createdAt: { type: Date, default: Date.now }
});

// Index to ensure efficient lookup
OtpVerificationSchema.index({ email: 1, purpose: 1 });

export const OtpVerification = mongoose.model('OtpVerification', OtpVerificationSchema);

