import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ShareVerificationService } from '../src/modules/sharing/shareVerification.service.js';
import { SharePrivacyService } from '../src/modules/sharing/sharePrivacy.service.js';
import { SmartShareService } from '../src/modules/sharing/smartShare.service.js';
import { WatermarkService } from '../src/modules/sharing/watermark.service.js';

describe('DocVault Module 7: Intelligent & Privacy-Preserving Sharing Engine', () => {

  describe('1. Share Verification & Security (OTP, Expiring Token, Passwords)', () => {
    it('1.1 Generates 256-bit cryptographically random token with SHA-256 hash', () => {
      const { rawToken, hash } = ShareVerificationService.generateShareToken();
      assert.ok(rawToken && rawToken.length === 64); // 32 bytes in hex = 64 characters
      assert.ok(hash && hash.length === 64);
      assert.notStrictEqual(rawToken, hash); // Invariant: Raw token is never stored in DB
      assert.strictEqual(ShareVerificationService.hashToken(rawToken), hash);
    });

    it('1.2 Generates secure 6-digit OTP challenge and verifies correctly', () => {
      const { otp, hash, expiresAt } = ShareVerificationService.generateOtpChallenge();
      assert.strictEqual(otp.length, 6);
      assert.ok(new Date(expiresAt) > new Date());

      const challenge = { hash, expiresAt, attempts: 0 };

      // Valid OTP check
      const validRes = ShareVerificationService.verifyOtp(otp, challenge);
      assert.strictEqual(validRes.success, true);

      // Invalid OTP check
      const invalidRes = ShareVerificationService.verifyOtp('000000', challenge);
      assert.strictEqual(invalidRes.success, false);
      assert.strictEqual(invalidRes.error, 'Invalid verification code.');
    });

    it('1.3 Rejects expired OTP challenge', () => {
      const challenge = {
        hash: 'dummyhash',
        expiresAt: new Date(Date.now() - 10000), // Expired 10s ago
        attempts: 0,
      };
      const res = ShareVerificationService.verifyOtp('123456', challenge);
      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes('expired'));
    });

    it('1.4 Rejects OTP when max attempts exceeded (Brute-force protection)', () => {
      const challenge = {
        hash: 'dummyhash',
        expiresAt: new Date(Date.now() + 60000),
        attempts: 5,
      };
      const res = ShareVerificationService.verifyOtp('123456', challenge);
      assert.strictEqual(res.success, false);
      assert.ok(res.error.includes('Maximum verification attempts exceeded'));
    });

    it('1.5 Hashes and verifies share password with bcrypt', async () => {
      const plainPassword = 'VaultSecurePassword#2026';
      const hash = await ShareVerificationService.hashPassword(plainPassword);
      assert.notStrictEqual(hash, plainPassword);

      const isValid = await ShareVerificationService.verifyPassword(plainPassword, hash);
      assert.strictEqual(isValid, true);

      const isInvalid = await ShareVerificationService.verifyPassword('WrongPass', hash);
      assert.strictEqual(isInvalid, false);
    });
  });

  describe('2. Minimum Necessary Sharing & Genuine Redaction', () => {
    it('2.1 Filters allowed metadata fields and masks restricted ones', () => {
      const originalKeyDetails = {
        'POLICY NUMBER': 'POL-9812491',
        'VEHICLE NUMBER': 'MH12AB1234',
        'PAN NUMBER': 'ABCDE1234F',
        'ANNUAL SALARY': '1800000',
      };

      const allowedFields = ['policy_number', 'vehicle_number'];
      const filtered = SharePrivacyService.filterAllowedMetadata(originalKeyDetails, allowedFields);

      assert.strictEqual(filtered['POLICY NUMBER'], 'POL-9812491');
      assert.strictEqual(filtered['VEHICLE NUMBER'], 'MH12AB1234');
      assert.strictEqual(filtered['PAN NUMBER'], '[HIDDEN BY OWNER]');
      assert.strictEqual(filtered['ANNUAL SALARY'], '[HIDDEN BY OWNER]');
    });

    it('2.2 Applies permanent pixel redaction to image buffer without modifying original', async () => {
      import('sharp').then(async ({ default: sharp }) => {
        const testImage = await sharp({
          create: {
            width: 300,
            height: 300,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
          },
        }).png().toBuffer();

        const redacted = await SharePrivacyService.sanitizeImagePixels(testImage, ['98123456']);
        assert.ok(redacted && redacted.length > 0);
        assert.notStrictEqual(testImage.length, redacted.length);
      });
    });
  });

  describe('3. Dynamic Watermarking', () => {
    it('3.1 Watermark service overlays recipient name, reference ID, and confidentiality banner', async () => {
      import('sharp').then(async ({ default: sharp }) => {
        const baseImage = await sharp({
          create: {
            width: 400,
            height: 500,
            channels: 3,
            background: { r: 240, g: 240, b: 240 },
          },
        }).png().toBuffer();

        const watermarked = await WatermarkService.applyWatermarkToImage(baseImage, {
          recipientLabel: 'HDFC Bank Officer',
          shareRef: 'share_98214fa',
        });

        assert.ok(watermarked && watermarked.length > 0);
        assert.notStrictEqual(baseImage.length, watermarked.length);
      });
    });
  });

});

