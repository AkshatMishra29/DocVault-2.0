import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from './auth.model.js';
import { OtpVerification } from './otp.model.js';
import { sendOtpEmail } from '../../services/emailService.js';
import { config } from '../../config/index.js';

/**
 * Dispatch 6-digit OTP to user email and store hash in MongoDB
 */
export async function sendOtp({ email, purpose = 'register' }) {
  if (!email) {
    const error = new Error('Email address is required.');
    error.status = 400;
    throw error;
  }

  const cleanEmail = email.toLowerCase().trim();

  // If registering, verify email not already claimed
  if (purpose === 'register') {
    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      const error = new Error('An account with this email already exists.');
      error.status = 400;
      throw error;
    }
  }

  // Generate secure 6-digit numeric OTP
  const rawOtp = crypto.randomInt(100000, 999999).toString();

  // Hash OTP before storing in MongoDB
  const salt = await bcrypt.genSalt(10);
  const otpHash = await bcrypt.hash(rawOtp, salt);

  // Expire in 10 minutes (TTL index will clean up automatically)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Remove existing pending OTPs for this email and purpose
  await OtpVerification.deleteMany({ email: cleanEmail, purpose });

  await OtpVerification.create({
    email: cleanEmail,
    otpHash,
    purpose,
    expiresAt,
  });

  // Send branded email through nodemailer (or dev logger)
  await sendOtpEmail(cleanEmail, rawOtp, purpose === 'register' ? 'Account Registration' : 'Vault Access');

  return {
    success: true,
    message: `Verification code sent to ${cleanEmail}`,
    email: cleanEmail,
    expiresInSeconds: 600
  };
}

/**
 * Verify submitted 6-digit OTP code against MongoDB record
 */
export async function verifyOtpCode({ email, otp, purpose = 'register' }) {
  if (!email || !otp) {
    const error = new Error('Email and 6-digit OTP code are required.');
    error.status = 400;
    throw error;
  }

  const cleanEmail = email.toLowerCase().trim();
  const record = await OtpVerification.findOne({ email: cleanEmail, purpose });

  if (!record) {
    const error = new Error('No pending verification code found or code has expired. Please request a new one.');
    error.status = 400;
    throw error;
  }

  if (record.attempts >= 5) {
    await OtpVerification.deleteOne({ _id: record._id });
    const error = new Error('Too many incorrect attempts. Please request a new code.');
    error.status = 429;
    throw error;
  }

  const isMatch = await bcrypt.compare(otp.toString().trim(), record.otpHash);
  if (!isMatch) {
    record.attempts += 1;
    await record.save();
    const error = new Error('Invalid verification code. Please check and try again.');
    error.status = 400;
    throw error;
  }

  // Valid OTP: delete record so it cannot be re-used
  await OtpVerification.deleteOne({ _id: record._id });

  return { success: true, verified: true, email: cleanEmail };
}

export async function registerUser({ name, email, password, pin, phone, otp }) {
  if (!name || !email || !password || !pin) {
    const error = new Error('Name, email, password, and PIN are required.');
    error.status = 400;
    throw error;
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanPin = pin.toString().trim();

  // If OTP is provided, verify it first before creating user
  if (otp) {
    await verifyOtpCode({ email: cleanEmail, otp, purpose: 'register' });
  }

  if (cleanPin.length < 4 || cleanPin.length > 6) {
    const error = new Error('PIN must be between 4 and 6 digits.');
    error.status = 400;
    throw error;
  }

  const existingUser = await User.findOne({ email: cleanEmail });
  if (existingUser) {
    const error = new Error('An account with this email already exists.');
    error.status = 400;
    throw error;
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  const pinHash = await bcrypt.hash(cleanPin, salt);

  const user = new User({
    name: name.trim(),
    email: cleanEmail,
    passwordHash,
    pinHash,
    pinLength: cleanPin.length === 6 ? 6 : 4,
    sessionVersion: 1,
    singleSessionOnly: false,
    phone: phone ? phone.trim() : '',
  });

  await user.save();

  const token = jwt.sign(
    { userId: user._id, email: user.email, sessionVersion: user.sessionVersion },
    config.jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      tier: user.tier,
      pinLength: user.pinLength || 4,
      singleSessionOnly: user.singleSessionOnly || false,
      autoLockEnabled: user.autoLockEnabled !== false,
      biometricsEnabled: user.biometricsEnabled,
      offlineAccessEnabled: user.offlineAccessEnabled,
    },
    token,
  };
}

export async function loginUser({ email, password }) {
  if (!email || !password) {
    const error = new Error('Email and password are required.');
    error.status = 400;
    throw error;
  }

  const cleanEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: cleanEmail });
  if (!user) {
    const error = new Error('Invalid email or password.');
    error.status = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    const error = new Error('Invalid email or password.');
    error.status = 401;
    throw error;
  }

  if (user.singleSessionOnly) {
    user.sessionVersion = (user.sessionVersion || 1) + 1;
    await user.save();
  }

  const token = jwt.sign(
    { userId: user._id, email: user.email, sessionVersion: user.sessionVersion || 1 },
    config.jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      tier: user.tier,
      pinLength: user.pinLength || 4,
      singleSessionOnly: Boolean(user.singleSessionOnly),
      sessionVersion: user.sessionVersion || 1,
      autoLockEnabled: user.autoLockEnabled !== false,
      biometricsEnabled: user.biometricsEnabled,
      offlineAccessEnabled: user.offlineAccessEnabled,
    },
    token,
    requiresPin: true,
  };
}

export async function verifyUserPin({ email, pin }) {
  if (!email || !pin) {
    const error = new Error('Email and PIN are required.');
    error.status = 400;
    throw error;
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanPin = pin.toString().trim();
  const user = await User.findOne({ email: cleanEmail });
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  // Check if account is currently locked out
  if (user.lockUntil && user.lockUntil > new Date()) {
    const remainingSeconds = Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000);
    const error = new Error(`Vault is locked due to too many failed attempts. Try again in ${Math.ceil(remainingSeconds / 60)} minute(s).`);
    error.status = 423; // 423 Locked
    error.lockUntil = user.lockUntil;
    error.remainingSeconds = remainingSeconds;
    throw error;
  }

  const isPinMatch = await bcrypt.compare(cleanPin, user.pinHash);
  if (!isPinMatch) {
    user.failedAttempts = (user.failedAttempts || 0) + 1;
    
    // After 5 failed attempts, lock for 5 minutes
    if (user.failedAttempts >= 5) {
      user.lockUntil = new Date(Date.now() + 5 * 60 * 1000);
      await user.save();
      const error = new Error('Too many failed attempts. Your vault has been locked for 5 minutes.');
      error.status = 423;
      error.lockUntil = user.lockUntil;
      error.remainingSeconds = 300;
      throw error;
    }

    await user.save();
    const attemptsLeft = 5 - user.failedAttempts;
    const error = new Error(`Invalid Vault Security PIN. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining before 5-minute lockout.`);
    error.status = 401;
    error.attemptsLeft = attemptsLeft;
    throw error;
  }

  // On successful unlock, reset attempts and lockout timer
  if (user.failedAttempts > 0 || user.lockUntil) {
    user.failedAttempts = 0;
    user.lockUntil = null;
  }

  // If single session is enabled, bump sessionVersion so all previous sessions are invalidated
  if (user.singleSessionOnly) {
    user.sessionVersion = (user.sessionVersion || 1) + 1;
  }
  await user.save();

  const sessionToken = jwt.sign(
    {
      userId: user._id,
      email: user.email,
      pinVerified: true,
      sessionVersion: user.sessionVersion || 1,
    },
    config.jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      tier: user.tier,
      pinLength: user.pinLength || 4,
      singleSessionOnly: Boolean(user.singleSessionOnly),
      autoLockEnabled: user.autoLockEnabled !== false,
      biometricsEnabled: user.biometricsEnabled,
      offlineAccessEnabled: user.offlineAccessEnabled,
    },
    token: sessionToken,
  };
}

/**
 * Toggle singleSessionOnly, autoLockEnabled, and biometricsEnabled security settings
 */
export async function updateSessionSettings(userId, { singleSessionOnly, autoLockEnabled, biometricsEnabled }) {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  if (singleSessionOnly !== undefined) {
    user.singleSessionOnly = Boolean(singleSessionOnly);
    if (user.singleSessionOnly) {
      user.sessionVersion = (user.sessionVersion || 1) + 1;
    }
  }

  if (autoLockEnabled !== undefined) {
    user.autoLockEnabled = Boolean(autoLockEnabled);
  }

  if (biometricsEnabled !== undefined) {
    user.biometricsEnabled = Boolean(biometricsEnabled);
  }

  await user.save();

  const newToken = jwt.sign(
    {
      userId: user._id,
      email: user.email,
      pinVerified: true,
      sessionVersion: user.sessionVersion || 1,
    },
    config.jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    singleSessionOnly: user.singleSessionOnly,
    autoLockEnabled: user.autoLockEnabled,
    biometricsEnabled: user.biometricsEnabled,
    hasBiometrics: (user.biometricCredentials || []).length > 0,
    token: newToken,
  };
}

/**
 * Register a biometric credential for the user (Fingerprint / Touch ID / Face ID)
 */
export async function registerBiometricCredential(userId, { credentialId, publicKey, deviceName }) {
  if (!credentialId || !publicKey) {
    const error = new Error('Credential ID and Public Key are required.');
    error.status = 400;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  if (!user.biometricCredentials) {
    user.biometricCredentials = [];
  }

  // Check if credentialId already exists, update or push
  const existingIdx = user.biometricCredentials.findIndex(c => c.credentialId === credentialId);
  if (existingIdx >= 0) {
    user.biometricCredentials[existingIdx] = {
      credentialId,
      publicKey,
      deviceName: deviceName || 'Fingerprint Device',
      createdAt: new Date(),
    };
  } else {
    user.biometricCredentials.push({
      credentialId,
      publicKey,
      deviceName: deviceName || 'Fingerprint Device',
      createdAt: new Date(),
    });
  }

  user.biometricsEnabled = true;
  await user.save();

  return {
    success: true,
    biometricsEnabled: true,
    devicesCount: user.biometricCredentials.length,
  };
}

/**
 * Verify Biometric Unlock and issue authenticated session token
 */
export async function verifyBiometricUnlock({ email, credentialId, clientChallenge }) {
  if (!email || !credentialId) {
    const error = new Error('Email and Credential ID are required.');
    error.status = 400;
    throw error;
  }

  const user = await User.findOne({ email });
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  if (user.biometricsEnabled === false) {
    const error = new Error('Biometric unlock is disabled for this account in Settings.');
    error.status = 403;
    throw error;
  }

  // Check if account is currently locked out from too many failed PIN attempts
  if (user.lockUntil && user.lockUntil > new Date()) {
    const remainingSeconds = Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000);
    const error = new Error(`Vault is locked due to too many failed attempts. Try again in ${Math.ceil(remainingSeconds / 60)} minute(s).`);
    error.status = 423;
    error.lockUntil = user.lockUntil;
    error.remainingSeconds = remainingSeconds;
    throw error;
  }

  // Verify that the credentialId belongs to this user
  const matchingCred = (user.biometricCredentials || []).find(c => c.credentialId === credentialId);
  if (!matchingCred) {
    const error = new Error('Biometric credential not recognized for this account. Please unlock with your PIN.');
    error.status = 401;
    throw error;
  }

  // Reset any prior failed PIN attempts
  if (user.failedAttempts > 0 || user.lockUntil) {
    user.failedAttempts = 0;
    user.lockUntil = null;
  }

  if (user.singleSessionOnly) {
    user.sessionVersion = (user.sessionVersion || 1) + 1;
  }
  await user.save();

  const sessionToken = jwt.sign(
    {
      userId: user._id,
      email: user.email,
      pinVerified: true,
      sessionVersion: user.sessionVersion || 1,
    },
    config.jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      tier: user.tier,
      singleSessionOnly: Boolean(user.singleSessionOnly),
      autoLockEnabled: user.autoLockEnabled !== false,
      biometricsEnabled: Boolean(user.biometricsEnabled),
      offlineAccessEnabled: user.offlineAccessEnabled,
    },
    token: sessionToken,
  };
}

/**
 * Authenticate or auto-provision user via Firebase ID Token (Google OAuth / Email Link)
 */
export async function authenticateWithFirebaseIdToken(idToken) {
  if (!idToken) {
    const error = new Error('Firebase ID Token is required.');
    error.status = 400;
    throw error;
  }

  // Ensure Firebase Admin is initialized
  const { initFirebaseAdmin } = await import('../../services/storage/firebaseService.js');
  initFirebaseAdmin();

  // Dynamically import or verify using Firebase Admin SDK
  const { getAuth } = await import('firebase-admin/auth');
  const decoded = await getAuth().verifyIdToken(idToken);
  const cleanEmail = (decoded.email || '').toLowerCase().trim();
  const name = decoded.name || cleanEmail.split('@')[0];

  if (!cleanEmail) {
    const error = new Error('No verified email found in Firebase token.');
    error.status = 400;
    throw error;
  }

  let user = await User.findOne({ email: cleanEmail });

  // If user does not exist yet, provision an initial vault account
  if (!user) {
    const salt = await bcrypt.genSalt(10);
    // Random dummy password hash; user signs in via OAuth
    const dummyPassword = Math.random().toString(36).slice(-10) + '!A1';
    const passwordHash = await bcrypt.hash(dummyPassword, salt);
    // Default PIN: 1234
    const pinHash = await bcrypt.hash('1234', salt);

    user = new User({
      name,
      email: cleanEmail,
      passwordHash,
      pinHash,
      pinLength: 4,
      tier: 'Vault Pro (Personal)',
      sessionVersion: 1,
      singleSessionOnly: false,
      autoLockEnabled: true,
      biometricsEnabled: false,
    });
    await user.save();
  }

  if (user.singleSessionOnly) {
    user.sessionVersion = (user.sessionVersion || 1) + 1;
    await user.save();
  }

  const token = jwt.sign(
    { userId: user._id, email: user.email, sessionVersion: user.sessionVersion || 1 },
    config.jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      tier: user.tier,
      pinLength: user.pinLength || 4,
      singleSessionOnly: Boolean(user.singleSessionOnly),
      sessionVersion: user.sessionVersion || 1,
      autoLockEnabled: user.autoLockEnabled !== false,
      biometricsEnabled: Boolean(user.biometricsEnabled),
      offlineAccessEnabled: user.offlineAccessEnabled,
    },
    token,
    requiresPin: true,
  };
}


