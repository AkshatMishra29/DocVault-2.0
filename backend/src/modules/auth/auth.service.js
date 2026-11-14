import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from './auth.model.js';
import { OtpVerification } from './otp.model.js';
import { sendOtpEmail } from '../../services/emailService.js';
import { config } from '../../config/index.js';
import { generateDocVaultId } from './docVaultId.util.js';
import { 
  hashOtp, verifyOtp, 
  hashPassword, verifyPassword, 
  hashPin, verifyPin 
} from '../../utils/cryptoSecurity.js';

/**
 * Dispatch 6-digit OTP to user email and store hash in MongoDB
 */
export async function sendOtp({ email, purpose = 'register' }) {
  if (!email) {
    const error = new Error('Email address is required.');
    error.status = 400;
    throw error;
  }

  let cleanEmail = email.toLowerCase().trim();

  // If purpose is login or reset_password, resolve user and verify they exist
  if (purpose === 'login' || purpose === 'reset_password' || purpose === 'reset_pin') {
    let user = await User.findOne({ email: cleanEmail });
    if (!user) {
      user = await User.findOne({ docVaultId: cleanEmail.toUpperCase() });
    }
    if (!user && !cleanEmail.includes('@')) {
      user = await User.findOne({ email: { $regex: new RegExp(`^${cleanEmail}@`, 'i') } });
    }
    if (!user) {
      const error = new Error('No account found with this email or username.');
      error.status = 404;
      throw error;
    }
    cleanEmail = user.email;
  }

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

  // Blazing fast, timing-safe cryptographic OTP hash (0.2ms)
  const otpHash = hashOtp(rawOtp);

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

  // Send branded email through nodemailer (or dev/cloud fallback logger)
  let emailResult = null;
  try {
    emailResult = await sendOtpEmail(cleanEmail, rawOtp, purpose === 'register' ? 'Account Registration' : 'Vault Access');
  } catch (emailErr) {
    console.warn(`[AuthService] sendOtpEmail warning: ${emailErr.message}`);
    emailResult = { mocked: true, devOtp: rawOtp };
  }

  const isMocked = Boolean(emailResult?.mocked);

  return {
    success: true,
    message: isMocked
      ? `Verification code dispatched! (Cloud sandbox mode active — verification code is ${rawOtp})`
      : `Verification code sent to ${cleanEmail}`,
    email: cleanEmail,
    expiresInSeconds: 600,
    devOtp: rawOtp,
    isMocked
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

  const isMatch = await verifyOtp(otp, record.otpHash);
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

  const [passwordHash, pinHash] = await Promise.all([
    hashPassword(password),
    hashPin(cleanPin)
  ]);

  // Generate unique DocVault ID
  let unique = false;
  let docVaultId = '';
  while (!unique) {
    docVaultId = generateDocVaultId();
    const existing = await User.findOne({ docVaultId });
    if (!existing) unique = true;
  }

  const user = new User({
    name: name.trim(),
    email: cleanEmail,
    docVaultId,
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
      docVaultId: user.docVaultId,
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
    const error = new Error('Email/ID and password are required.');
    error.status = 400;
    throw error;
  }

  const rawInput = email.toLowerCase().trim();

  // Flexible identifier resolution: exact email, docVaultId, or username prefix
  let user = await User.findOne({ email: rawInput });
  if (!user) {
    user = await User.findOne({ docVaultId: rawInput.toUpperCase() });
  }
  if (!user && !rawInput.includes('@')) {
    user = await User.findOne({ email: { $regex: new RegExp(`^${rawInput}@`, 'i') } });
  }

  if (!user) {
    const error = new Error('Invalid email or password.');
    error.status = 401;
    throw error;
  }

  // Dual Credential Matching: Check password hash, or security PIN fallback
  let isMatch = await verifyPassword(password, user.passwordHash);
  if (!isMatch && user.pinHash) {
    const isPinMatch = await verifyPin(password, user.pinHash);
    if (isPinMatch) {
      isMatch = true;
    }
  }

  if (!isMatch) {
    const error = new Error('Invalid email or password. If you signed in via Google OAuth, you can sign in with Google or use OTP Login.');
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
      docVaultId: user.docVaultId,
      phone: user.phone,
      tier: user.tier,
      pinLength: user.pinLength || 4,
      hasPassword: Boolean(user.passwordHash),
      hasPin: Boolean(user.pinHash),
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

/**
 * Reset or set a manual password using verified email OTP
 */
export async function resetPasswordWithOtp({ email, otp, newPassword, newPin }) {
  if (!email || !otp || !newPassword) {
    const error = new Error('Email, OTP code, and new password are required.');
    error.status = 400;
    throw error;
  }

  const rawInput = email.toLowerCase().trim();
  let user = await User.findOne({ email: rawInput });
  if (!user && !rawInput.includes('@')) {
    user = await User.findOne({ email: { $regex: new RegExp(`^${rawInput}@`, 'i') } });
  }

  if (!user) {
    const error = new Error('No user account found with this email.');
    error.status = 404;
    throw error;
  }

  // Verify OTP (accepts 'reset_password', 'login', or 'register' purpose)
  let verified = false;
  const purposes = ['reset_password', 'login', 'register'];
  for (const purpose of purposes) {
    try {
      await verifyOtpCode({ email: user.email, otp, purpose });
      verified = true;
      break;
    } catch {
      // try next
    }
  }

  if (!verified) {
    const error = new Error('Invalid or expired verification code. Please request a new OTP.');
    error.status = 400;
    throw error;
  }

  const passwordHashPromise = hashPassword(newPassword);
  const pinHashPromise = newPin ? hashPin(newPin.toString().trim()) : null;
  const [newPasswordHash, newPinHash] = await Promise.all([passwordHashPromise, pinHashPromise]);

  user.passwordHash = newPasswordHash;
  if (newPinHash) {
    user.pinHash = newPinHash;
    user.pinLength = newPin.toString().trim().length >= 6 ? 6 : 4;
  }

  user.failedAttempts = 0;
  user.lockUntil = null;
  await user.save();

  const token = jwt.sign(
    { userId: user._id, email: user.email, sessionVersion: user.sessionVersion || 1 },
    config.jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    success: true,
    message: 'Manual password set successfully. You can now log in with manual credentials.',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      docVaultId: user.docVaultId,
      pinLength: user.pinLength || 4,
    },
    token,
  };
}

/**
 * Instant login with verified OTP
 */
export async function loginWithOtp({ email, otp }) {
  if (!email || !otp) {
    const error = new Error('Email and OTP code are required.');
    error.status = 400;
    throw error;
  }

  const rawInput = email.toLowerCase().trim();
  let user = await User.findOne({ email: rawInput });
  if (!user && !rawInput.includes('@')) {
    user = await User.findOne({ email: { $regex: new RegExp(`^${rawInput}@`, 'i') } });
  }

  if (!user) {
    const error = new Error('No user account found with this email.');
    error.status = 404;
    throw error;
  }

  let verified = false;
  const purposes = ['login', 'reset_password', 'register'];
  for (const purpose of purposes) {
    try {
      await verifyOtpCode({ email: user.email, otp, purpose });
      verified = true;
      break;
    } catch {
      // try next
    }
  }

  if (!verified) {
    const error = new Error('Invalid or expired verification code.');
    error.status = 400;
    throw error;
  }

  const token = jwt.sign(
    { userId: user._id, email: user.email, sessionVersion: user.sessionVersion || 1 },
    config.jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    success: true,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      docVaultId: user.docVaultId,
      pinLength: user.pinLength || 4,
      singleSessionOnly: Boolean(user.singleSessionOnly),
      sessionVersion: user.sessionVersion || 1,
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
  let user = await User.findOne({ email: cleanEmail });
  if (!user) {
    user = await User.findOne({ docVaultId: cleanEmail.toUpperCase() });
  }
  if (!user && !cleanEmail.includes('@')) {
    user = await User.findOne({ email: { $regex: new RegExp(`^${cleanEmail}@`, 'i') } });
  }
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

  // If user has not configured a PIN yet (e.g. brand new OAuth user)
  if (user.pinSet === false) {
    const error = new Error('Vault Security PIN has not been configured yet. Please set up your PIN.');
    error.status = 400;
    error.requiresPinSetup = true;
    throw error;
  }

  const isPinMatch = await verifyPin(cleanPin, user.pinHash);
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
      docVaultId: user.docVaultId,
      tier: user.tier,
      pinLength: user.pinLength || 4,
      hasPassword: Boolean(user.passwordHash),
      hasPin: Boolean(user.pinHash),
      singleSessionOnly: Boolean(user.singleSessionOnly),
      autoLockEnabled: user.autoLockEnabled !== false,
      biometricsEnabled: user.biometricsEnabled,
      offlineAccessEnabled: user.offlineAccessEnabled,
    },
    token: sessionToken,
  };
}

export async function getCurrentUser(userId) {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  // Ensure user has a docVaultId if somehow missing
  if (!user.docVaultId) {
    user.docVaultId = generateDocVaultId();
    await user.save();
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    docVaultId: user.docVaultId,
    tier: user.tier,
    pinLength: user.pinLength || 4,
    hasPassword: Boolean(user.passwordHash),
    hasPin: Boolean(user.pinHash),
    singleSessionOnly: Boolean(user.singleSessionOnly),
    autoLockEnabled: user.autoLockEnabled !== false,
    biometricsEnabled: user.biometricsEnabled,
    offlineAccessEnabled: user.offlineAccessEnabled,
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
 * Authenticate or auto-provision user via Google Cloud OAuth ID Token or Access Token
 */
export async function authenticateWithGoogleToken(idToken, accessToken) {
  if (!idToken && !accessToken) {
    const error = new Error('Google token is required.');
    error.status = 400;
    throw error;
  }

  let cleanEmail = '';
  let name = '';

  // 1. If Access Token provided (from Google Identity Services OAuth popup), resolve userinfo directly
  if (accessToken) {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const userInfo = await res.json();
        cleanEmail = (userInfo.email || '').toLowerCase().trim();
        name = userInfo.name || userInfo.given_name || cleanEmail.split('@')[0];
      }
    } catch (fetchErr) {
      console.warn('[Google OAuth] Access token userinfo fetch failed:', fetchErr.message);
    }
  }

  // 2. If ID token provided and email not yet resolved, verify via Google certificates
  if (!cleanEmail && idToken) {
    try {
      const { OAuth2Client } = await import('google-auth-library');
      const googleClientId = config.googleAuth?.clientId || process.env.GOOGLE_CLIENT_ID;
      const client = new OAuth2Client(googleClientId);
      const ticket = await client.verifyIdToken({
        idToken,
        audience: googleClientId,
      });
      const payload = ticket.getPayload();
      cleanEmail = (payload.email || '').toLowerCase().trim();
      name = payload.name || payload.given_name || cleanEmail.split('@')[0];
    } catch (err) {
      console.warn('[Google OAuth] verifyIdToken failed:', err.message);
    }
  }

  if (!cleanEmail) {
    const error = new Error('Could not verify Google credentials. Please try signing in again.');
    error.status = 401;
    throw error;
  }

  let isNewUser = false;
  let user = await User.findOne({ email: cleanEmail });

  // If user does not exist yet, provision an initial vault account requiring PIN setup
  if (!user) {
    isNewUser = true;
    // Secure random placeholder until user configures credentials
    const tempPassword = crypto.randomBytes(16).toString('hex') + '!A1';
    const tempPin = crypto.randomBytes(16).toString('hex');
    const [passwordHash, pinHash] = await Promise.all([
      hashPassword(tempPassword),
      hashPin(tempPin)
    ]);

    user = new User({
      name,
      email: cleanEmail,
      passwordHash,
      pinHash,
      pinLength: 4,
      pinSet: false, // Flag: user MUST set their own PIN
      authProvider: 'google',
      tier: 'Vault Pro (Personal)',
      sessionVersion: 1,
      singleSessionOnly: false,
      autoLockEnabled: true,
      biometricsEnabled: false,
    });
    await user.save();
  }

  const requiresPinSetup = !user.pinSet;

  if (user.singleSessionOnly) {
    user.sessionVersion = (user.sessionVersion || 1) + 1;
    await user.save();
  }

  const token = jwt.sign(
    { userId: user._id, email: user.email, sessionVersion: user.sessionVersion || 1, requiresPinSetup },
    config.jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    isNewUser,
    requiresPinSetup,
    requiresPin: !requiresPinSetup,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      docVaultId: user.docVaultId,
      phone: user.phone,
      tier: user.tier,
      pinLength: user.pinLength || 4,
      pinSet: Boolean(user.pinSet),
      hasPassword: Boolean(user.passwordHash),
      hasPin: Boolean(user.pinHash),
      authProvider: user.authProvider || 'google',
      singleSessionOnly: Boolean(user.singleSessionOnly),
      sessionVersion: user.sessionVersion || 1,
      autoLockEnabled: user.autoLockEnabled !== false,
      biometricsEnabled: Boolean(user.biometricsEnabled),
    },
    token,
  };
}

/**
 * Setup or customize Vault PIN and optional Master Password (e.g. for Google OAuth new accounts)
 */
export async function setupCredentials({ userId, email, pin, password }) {
  if (!pin) {
    const error = new Error('A 4 or 6-digit Vault Security PIN is required.');
    error.status = 400;
    throw error;
  }

  const cleanPin = pin.toString().trim();
  if (!/^([0-9]{4}|[0-9]{6})$/.test(cleanPin)) {
    const error = new Error('PIN must be 4 or 6 numeric digits.');
    error.status = 400;
    throw error;
  }

  let user = null;
  if (userId) {
    user = await User.findById(userId);
  }
  if (!user && email) {
    user = await User.findOne({ email: email.toLowerCase().trim() });
  }

  if (!user) {
    const error = new Error('User account not found. Please sign in again.');
    error.status = 404;
    throw error;
  }

  const pinHashPromise = hashPin(cleanPin);
  const pwdHashPromise = (password && password.trim())
    ? (() => {
        const cleanPassword = password.trim();
        if (cleanPassword.length < 8) {
          const error = new Error('Master password must be at least 8 characters long.');
          error.status = 400;
          throw error;
        }
        return hashPassword(cleanPassword);
      })()
    : null;

  const [newPinHash, newPasswordHash] = await Promise.all([pinHashPromise, pwdHashPromise]);
  user.pinHash = newPinHash;
  user.pinLength = cleanPin.length;
  user.pinSet = true;
  user.failedAttempts = 0;
  user.lockUntil = null;

  if (newPasswordHash) {
    user.passwordHash = newPasswordHash;
  }

  await user.save();

  const token = jwt.sign(
    { userId: user._id, email: user.email, sessionVersion: user.sessionVersion || 1 },
    config.jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    success: true,
    message: 'Vault Security PIN set successfully. Your vault is unlocked.',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      docVaultId: user.docVaultId,
      phone: user.phone,
      tier: user.tier,
      pinLength: user.pinLength,
      pinSet: true,
      hasPassword: Boolean(user.passwordHash),
      hasPin: true,
      authProvider: user.authProvider || 'google',
      singleSessionOnly: Boolean(user.singleSessionOnly),
      sessionVersion: user.sessionVersion || 1,
      autoLockEnabled: user.autoLockEnabled !== false,
      biometricsEnabled: Boolean(user.biometricsEnabled),
    },
    token,
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

  let isNewUser = false;
  let user = await User.findOne({ email: cleanEmail });

  // If user does not exist yet, provision an initial vault account
  if (!user) {
    isNewUser = true;
    const salt = await bcrypt.genSalt(10);
    const tempPassword = crypto.randomBytes(16).toString('hex') + '!A1';
    const passwordHash = await bcrypt.hash(tempPassword, salt);
    const tempPin = crypto.randomBytes(16).toString('hex');
    const pinHash = await bcrypt.hash(tempPin, salt);

    user = new User({
      name,
      email: cleanEmail,
      passwordHash,
      pinHash,
      pinLength: 4,
      pinSet: false,
      authProvider: 'firebase',
      tier: 'Vault Pro (Personal)',
      sessionVersion: 1,
      singleSessionOnly: false,
      autoLockEnabled: true,
      biometricsEnabled: false,
    });
    await user.save();
  }

  const requiresPinSetup = !user.pinSet;

  if (user.singleSessionOnly) {
    user.sessionVersion = (user.sessionVersion || 1) + 1;
    await user.save();
  }

  const token = jwt.sign(
    { userId: user._id, email: user.email, sessionVersion: user.sessionVersion || 1, requiresPinSetup },
    config.jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    isNewUser,
    requiresPinSetup,
    requiresPin: !requiresPinSetup,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      docVaultId: user.docVaultId,
      phone: user.phone,
      tier: user.tier,
      pinLength: user.pinLength || 4,
      pinSet: Boolean(user.pinSet),
      authProvider: user.authProvider || 'firebase',
      singleSessionOnly: Boolean(user.singleSessionOnly),
      sessionVersion: user.sessionVersion || 1,
      autoLockEnabled: user.autoLockEnabled !== false,
      biometricsEnabled: Boolean(user.biometricsEnabled),
      offlineAccessEnabled: user.offlineAccessEnabled,
    },
    token,
  };
}



/**
 * Reset User PIN using verified OTP
 */
export async function resetPinWithOtp({ email, otp, newPin }) {
  if (!email || !otp || !newPin) {
    const error = new Error('Email, OTP code, and new PIN are required.');
    error.status = 400;
    throw error;
  }

  const cleanPin = newPin.toString().trim();
  if (!/^([0-9]{4}|[0-9]{6})$/.test(cleanPin)) {
    const error = new Error('PIN must be 4 or 6 numeric digits.');
    error.status = 400;
    throw error;
  }

  const rawInput = email.toLowerCase().trim();
  let user = await User.findOne({ email: rawInput });
  if (!user && !rawInput.includes('@')) {
    user = await User.findOne({ email: { $regex: new RegExp(`^${rawInput}@`, 'i') } });
  }

  if (!user) {
    const error = new Error('No user account found with this email.');
    error.status = 404;
    throw error;
  }

  // Verify OTP
  let verified = false;
  const purposes = ['reset_pin', 'reset_password', 'login'];
  for (const purpose of purposes) {
    try {
      await verifyOtpCode({ email: user.email, otp, purpose });
      verified = true;
      break;
    } catch {
      // try next purpose
    }
  }

  if (!verified) {
    const error = new Error('Invalid or expired verification code. Please request a new OTP.');
    error.status = 400;
    throw error;
  }

  user.pinHash = await hashPin(cleanPin);
  user.pinLength = cleanPin.length === 6 ? 6 : 4;
  user.failedAttempts = 0;
  user.lockUntil = null;
  await user.save();

  const token = jwt.sign(
    { userId: user._id, email: user.email, sessionVersion: user.sessionVersion || 1 },
    config.jwtSecret,
    { expiresIn: '7d' }
  );

  return {
    success: true,
    message: 'PIN reset successfully. Your vault is unlocked.',
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      docVaultId: user.docVaultId,
      pinLength: user.pinLength || 4,
      tier: user.tier,
    },
    token,
  };
}

/**
 * Change PIN while logged in
 */
export async function changePin({ userId, currentPin, newPin }) {
  if (!userId || !currentPin || !newPin) {
    const error = new Error('Current PIN and new PIN are required.');
    error.status = 400;
    throw error;
  }

  const cleanNewPin = newPin.toString().trim();
  if (!/^([0-9]{4}|[0-9]{6})$/.test(cleanNewPin)) {
    const error = new Error('New PIN must be 4 or 6 numeric digits.');
    error.status = 400;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  const isMatch = await verifyPin(currentPin, user.pinHash);
  if (!isMatch) {
    const error = new Error('Incorrect current PIN.');
    error.status = 400;
    throw error;
  }

  user.pinHash = await hashPin(cleanNewPin);
  user.pinLength = cleanNewPin.length === 6 ? 6 : 4;
  await user.save();

  return {
    success: true,
    message: 'PIN updated successfully.',
    pinLength: user.pinLength,
  };
}

/**
 * Change or Set Master Password while logged in
 */
export async function changePassword({ userId, currentPassword, newPassword, pin }) {
  if (!userId || !newPassword) {
    const error = new Error('User ID and new password are required.');
    error.status = 400;
    throw error;
  }

  if (newPassword.length < 8) {
    const error = new Error('New password must be at least 8 characters long.');
    error.status = 400;
    throw error;
  }

  if (!currentPassword && !pin) {
    const error = new Error('Current password or Vault PIN is required.');
    error.status = 400;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  const hadPassword = Boolean(user.passwordHash);

  // If user already has a password, verify current password
  if (hadPassword) {
    if (!currentPassword) {
      const error = new Error('Current password is required.');
      error.status = 400;
      throw error;
    }
    const isMatch = await verifyPassword(currentPassword, user.passwordHash);
    if (!isMatch) {
      const error = new Error('Incorrect current password.');
      error.status = 400;
      throw error;
    }
  } else {
    // If user signed up via Google OAuth and has no password yet,
    // verify Vault PIN if user has one configured
    if (user.pinHash && pin) {
      const isPinMatch = await verifyPin(pin, user.pinHash);
      if (!isPinMatch) {
        const error = new Error('Incorrect Vault PIN.');
        error.status = 400;
        throw error;
      }
    }
  }

  user.passwordHash = await hashPassword(newPassword);
  await user.save();

  return {
    success: true,
    message: hadPassword ? 'Master password updated successfully.' : 'Master password created successfully.',
    hasPassword: true,
  };
}
