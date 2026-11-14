import crypto from 'crypto';
import { hashPassword, verifyPassword } from '../../utils/cryptoSecurity.js';

/**
 * DocVault Share Verification Service
 * 
 * Handles:
 * 1. Cryptographically secure expiring token generation & SHA-256 hashing.
 * 2. OTP challenge generation, short-lived expiry (5 min), attempt rate limiting, and hashing.
 * 3. Password protection hashing with bcrypt.
 */
export class ShareVerificationService {
  /**
   * Generates a 256-bit cryptographically random share token
   * Returns: { token: 'raw-url-safe-token', hash: 'sha256-hash' }
   */
  static generateShareToken() {
    const rawToken = crypto.randomBytes(32).toString('hex'); // 256 bits
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    return { rawToken, hash };
  }

  /**
   * Hash a raw token with SHA-256 for database lookup
   */
  static hashToken(rawToken) {
    if (!rawToken) return null;
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Generates a secure 6-digit OTP challenge (valid for 5 minutes)
   */
  static generateOtpChallenge() {
    // Generate secure 6-digit number between 100000 and 999999
    const randomInt = crypto.randomInt(100000, 1000000);
    const otp = String(randomInt);
    const hash = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

    return {
      otp, // Only returned in caller for delivery dispatch, NEVER saved in DB
      hash,
      expiresAt,
    };
  }

  /**
   * Verifies an entered OTP against a stored challenge
   */
  static verifyOtp(enteredOtp, challenge) {
    if (!challenge || !challenge.hash) {
      return { success: false, error: 'No active OTP verification challenge found.' };
    }

    if (challenge.attempts >= 5) {
      return { success: false, error: 'Maximum verification attempts exceeded. Please request a new code.' };
    }

    if (new Date() > new Date(challenge.expiresAt)) {
      return { success: false, error: 'Verification code has expired. Please request a new code.' };
    }

    const enteredHash = crypto.createHash('sha256').update(String(enteredOtp).trim()).digest('hex');
    if (enteredHash !== challenge.hash) {
      return { success: false, error: 'Invalid verification code.' };
    }

    return { success: true };
  }

  /**
   * Hashes a share password with PBKDF2-SHA256 (native OpenSSL C++)
   */
  static async hashPassword(password) {
    if (!password) return null;
    return await hashPassword(password);
  }

  /**
   * Verifies an entered share password (with legacy bcrypt backward compatibility)
   */
  static async verifyPassword(enteredPassword, passwordHash) {
    if (!passwordHash) return true;
    if (!enteredPassword) return false;
    return await verifyPassword(enteredPassword, passwordHash);
  }
}

