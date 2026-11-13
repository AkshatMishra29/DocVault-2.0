import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  docVaultId: { type: String, unique: true, sparse: true, index: true }, // Unique non-sequential DocVault identifier (e.g. DV-XXXX-XXXX)
  passwordHash: { type: String, required: true },
  pinHash: { type: String, required: true }, // 4-to-6 digit quick unlock PIN
  pinLength: { type: Number, default: 4 },    // 4 or 6 digit preference
  pinSet: { type: Boolean, default: true },   // false when registered via OAuth until user sets their PIN
  authProvider: { type: String, default: 'local' }, // 'local' | 'google'
  failedAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  phone: { type: String },
  tier: { type: String, default: 'Vault Pro (Personal)' },
  singleSessionOnly: { type: Boolean, default: false }, // Enforce single active session
  sessionVersion: { type: Number, default: 1 },         // Incremented on new login if singleSessionOnly is true
  autoLockEnabled: { type: Boolean, default: true },    // Auto-lock vault after 10 min inactivity / device sleep
  biometricsEnabled: { type: Boolean, default: false },   // Master toggle for fingerprint unlock
  biometricCredentials: [
    {
      credentialId: { type: String, required: true },
      publicKey: { type: String, required: true },
      deviceName: { type: String, default: 'Fingerprint Device' },
      createdAt: { type: Date, default: Date.now },
    }
  ],
  offlineAccessEnabled: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.model('User', UserSchema);

