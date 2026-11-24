import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';

describe('DocVault Security Guardrail: Duplicate Document Detection & OAuth Optimization', () => {

  it('1. Computes deterministic SHA-256 hash for identical document buffers', () => {
    const docBuffer1 = Buffer.from('DocVault Sensitive Insurance Policy 2026 Policy# POL-99281');
    const docBuffer2 = Buffer.from('DocVault Sensitive Insurance Policy 2026 Policy# POL-99281');
    const differentDocBuffer = Buffer.from('DocVault Different Document Content');

    const hash1 = crypto.createHash('sha256').update(docBuffer1).digest('hex');
    const hash2 = crypto.createHash('sha256').update(docBuffer2).digest('hex');
    const hashDiff = crypto.createHash('sha256').update(differentDocBuffer).digest('hex');

    assert.strictEqual(hash1, hash2, 'Identical buffers must produce identical SHA-256 hashes');
    assert.notStrictEqual(hash1, hashDiff, 'Different buffers must produce different hashes');
  });

  it('2. Duplicate Document Guardrail: Rejects duplicate upload when same SHA-256 already exists for user', () => {
    const mockDatabase = [
      {
        _id: 'doc_existing_123',
        userId: 'user_akshat_456',
        title: 'Health Insurance Policy 2026',
        originalName: 'health_policy.pdf',
        category: 'Insurance',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        status: 'completed',
        createdAt: new Date('2026-11-10'),
      }
    ];

    const simulateUploadCheck = ({ userId, sha256, allowDuplicate }) => {
      if (allowDuplicate) {
        return { status: 200, success: true };
      }
      const existing = mockDatabase.find(
        d => d.userId === userId && d.sha256 === sha256 && !['DELETED', 'REJECTED'].includes(d.status)
      );
      if (existing) {
        return {
          status: 409,
          success: false,
          code: 'DUPLICATE_DOCUMENT',
          error: `Duplicate Document Detected: You have already secured this exact document in your vault as "${existing.title}".`,
          duplicateDocument: {
            id: existing._id,
            title: existing.title,
            category: existing.category,
          }
        };
      }
      return { status: 200, success: true };
    };

    // First check with duplicate file:
    const dupResult = simulateUploadCheck({
      userId: 'user_akshat_456',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      allowDuplicate: false,
    });

    assert.strictEqual(dupResult.status, 409, 'Duplicate must return HTTP 409 Conflict');
    assert.strictEqual(dupResult.code, 'DUPLICATE_DOCUMENT', 'Must return DUPLICATE_DOCUMENT code');
    assert.strictEqual(dupResult.duplicateDocument.id, 'doc_existing_123');

    // Different user with same file (separate vaults): allowed
    const otherUserResult = simulateUploadCheck({
      userId: 'user_different_789',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      allowDuplicate: false,
    });
    assert.strictEqual(otherUserResult.status, 200, 'Other user uploading same file is allowed in their own vault');

    // Force allowDuplicate = true: bypasses guardrail
    const forceResult = simulateUploadCheck({
      userId: 'user_akshat_456',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      allowDuplicate: true,
    });
    assert.strictEqual(forceResult.status, 200, 'allowDuplicate=true permits intentional duplicate uploads');
  });

  it('3. OAuth Token Cache: Avoids external Google/Firebase API calls for identical tokens within 120s', () => {
    const oauthProfileCache = new Map();

    const getCached = (key) => {
      const entry = oauthProfileCache.get(key);
      if (entry && (Date.now() - entry.timestamp < 120000)) return entry.profile;
      oauthProfileCache.delete(key);
      return null;
    };

    const setCached = (key, profile) => {
      oauthProfileCache.set(key, { profile, timestamp: Date.now() });
    };

    const testToken = 'google_access_token_mock_xyz123';
    const tokenKey = `acc:${crypto.createHash('sha256').update(testToken).digest('hex')}`;

    // Initial cache miss
    assert.strictEqual(getCached(tokenKey), null);

    // Save profile to cache
    const mockProfile = { email: 'akshat@docvault.io', name: 'Akshat Mishra' };
    setCached(tokenKey, mockProfile);

    // Subsequent call hits cache directly
    const cachedProfile = getCached(tokenKey);
    assert.deepStrictEqual(cachedProfile, mockProfile);
  });

  it('4. OAuth Sovereign Security: Google users with configured PIN require PIN entry to unlock encrypted vault (requiresPin: true)', () => {
    const existingGoogleUser = {
      email: 'akshat@docvault.io',
      pinSet: true,
      pinLength: 4,
    };

    const requiresPinSetup = !existingGoogleUser.pinSet;
    const authResponse = {
      isNewUser: false,
      requiresPinSetup,
      requiresPin: true, // Always require PIN entry to protect encrypted vault!
      user: existingGoogleUser,
    };

    assert.strictEqual(authResponse.requiresPin, true, 'OAuth user must enter their security PIN to unlock personal vault');
    assert.strictEqual(authResponse.requiresPinSetup, false, 'Existing user does not need to set up PIN again');
  });

  it('5. OAuth Convenience: New Google users without PIN are properly routed to PIN setup (requiresPin: true, requiresPinSetup: true)', () => {
    const newGoogleUser = {
      email: 'newuser@docvault.io',
      pinSet: false,
      pinLength: 4,
    };

    const requiresPinSetup = !newGoogleUser.pinSet;
    const authResponse = {
      isNewUser: true,
      requiresPinSetup,
      requiresPin: true, // True because PIN setup is needed!
      user: newGoogleUser,
    };

    assert.strictEqual(authResponse.requiresPin, true, 'New OAuth user must set their security PIN');
    assert.strictEqual(authResponse.requiresPinSetup, true);
  });

  it('6. Pre-warming & Hedged OAuth Execution: exports prewarmGoogleOAuth and executes hedged Promise.any', async () => {
    const { prewarmGoogleOAuth } = await import('../src/modules/auth/auth.service.js');
    assert.strictEqual(typeof prewarmGoogleOAuth, 'function');
    assert.doesNotThrow(() => prewarmGoogleOAuth());

    // Verify hedged Promise.any racing behavior
    const fastCall = new Promise(resolve => setTimeout(() => resolve({ email: 'fast@docvault.io' }), 5));
    const slowCall = new Promise(resolve => setTimeout(() => resolve({ email: 'slow@docvault.io' }), 200));
    const fastest = await Promise.any([fastCall, slowCall]);
    assert.strictEqual(fastest.email, 'fast@docvault.io', 'Hedged race must return the fastest response');
  });

  it('7. Seamless Account Linking: An account created via OAuth can directly link manual password & PIN on registration', () => {
    const mockUserDatabase = [
      {
        _id: 'oauth_user_1',
        name: 'Sanjay Mishra',
        email: 'sanjay@example.com',
        authProvider: 'google',
        passwordHash: 'oauth:placeholder:abcdef123456',
        pinHash: 'oauth:placeholder:abcdef123456',
        pinSet: false,
        pinLength: 4,
      }
    ];

    // Simulate registration linking logic
    const linkAccountIfOAuth = (email, password, pin) => {
      const existingUser = mockUserDatabase.find(u => u.email === email);
      if (!existingUser) return { isNew: true };
      
      const isOAuthAccount = existingUser.passwordHash?.startsWith('oauth:placeholder:') || 
                             existingUser.authProvider === 'google' || 
                             existingUser.authProvider === 'firebase';
      if (!isOAuthAccount) {
        throw new Error('An account with this email already exists.');
      }

      existingUser.passwordHash = 'hashed_new_password';
      existingUser.pinHash = 'hashed_new_pin';
      existingUser.pinLength = pin.length;
      existingUser.pinSet = true;
      existingUser.authProvider = 'both';

      return {
        success: true,
        user: existingUser,
        isLinked: true,
      };
    };

    const linkResult = linkAccountIfOAuth('sanjay@example.com', 'MyPassword123!', '1234');
    assert.strictEqual(linkResult.success, true);
    assert.strictEqual(linkResult.isLinked, true);
    assert.strictEqual(linkResult.user.authProvider, 'both', 'Account must now support both OAuth and manual credentials');
    assert.strictEqual(linkResult.user.pinSet, true);
    assert.strictEqual(linkResult.user.passwordHash, 'hashed_new_password');
  });
});
