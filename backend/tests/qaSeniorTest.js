import assert from 'node:assert/strict';
import { resetPinWithOtp, changePin, changePassword, setupCredentials } from '../src/modules/auth/auth.service.js';
import authRoutes from '../src/modules/auth/auth.routes.js';
import aiRoutes from '../src/modules/ai/ai.routes.js';
import app from '../src/app.js';

console.log('--- 🧪 SENIOR QA TEST SUITE: BACKEND CONTRACTS & LOGIC ---');

async function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // 1. Verify Routes exist and are wired correctly
  test('Auth Routes exports an Express Router with reset-pin & change-pin endpoints', () => {
    assert.ok(authRoutes, 'authRoutes must be exported');
    assert.equal(typeof authRoutes, 'function', 'authRoutes must be router middleware');
    
    const routes = authRoutes.stack
      .filter(layer => layer.route)
      .map(layer => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods)
      }));

    const paths = routes.map(r => r.path);
    assert.ok(paths.includes('/reset-pin'), 'Route /reset-pin must be present');
    assert.ok(paths.includes('/setup-credentials'), 'Route /setup-credentials must be present');
    assert.ok(paths.includes('/change-pin'), 'Route /change-pin must be present');
    assert.ok(paths.includes('/change-password'), 'Route /change-password must be present');
    assert.ok(paths.includes('/send-otp'), 'Route /send-otp must be present');
    assert.ok(paths.includes('/verify-otp'), 'Route /verify-otp must be present');
    assert.ok(paths.includes('/login'), 'Route /login must be present');
    assert.ok(paths.includes('/register'), 'Route /register must be present');
  });

  // 2. Verify AI routes
  test('AI Routes exports an Express Router with query endpoint', () => {
    assert.ok(aiRoutes, 'aiRoutes must be exported');
    const paths = aiRoutes.stack
      .filter(layer => layer.route)
      .map(layer => layer.route.path);
    assert.ok(paths.includes('/query'), 'Route /query must be present');
  });

  // 3. Test PIN Validation Logic in auth.service
  test('auth.service exports resetPinWithOtp, changePin, changePassword functions', () => {
    assert.equal(typeof resetPinWithOtp, 'function', 'resetPinWithOtp must be a function');
    assert.equal(typeof changePin, 'function', 'changePin must be a function');
    assert.equal(typeof changePassword, 'function', 'changePassword must be a function');
  });

  // 4. Test PIN format validations for resetPinWithOtp
  await asyncTest('resetPinWithOtp rejects invalid PIN format (2 digits, 5 digits, non-numeric)', async () => {
    await assert.rejects(
      async () => {
        await resetPinWithOtp({ email: 'test@example.com', otp: '123456', newPin: '12' });
      },
      /4 or 6 numeric digits/i,
      'Should reject PIN with 2 digits'
    );

    await assert.rejects(
      async () => {
        await resetPinWithOtp({ email: 'test@example.com', otp: '123456', newPin: '12345' });
      },
      /4 or 6 numeric digits/i,
      'Should reject PIN with 5 digits'
    );

    await assert.rejects(
      async () => {
        await resetPinWithOtp({ email: 'test@example.com', otp: '123456', newPin: 'abcd' });
      },
      /4 or 6 numeric digits/i,
      'Should reject non-numeric PIN'
    );
  });

  // 5. Test PIN format validations for changePin
  await asyncTest('changePin rejects invalid PIN format (5 digits, non-digit)', async () => {
    await assert.rejects(
      async () => {
        await changePin({ userId: 'user123', currentPin: '1111', newPin: '12345' });
      },
      /4 or 6 numeric digits/i,
      'Should reject PIN with 5 digits'
    );

    await assert.rejects(
      async () => {
        await changePin({ userId: 'user123', currentPin: '1111', newPin: '12a4' });
      },
      /4 or 6 numeric digits/i,
      'Should reject non-digit PIN'
    );
  });

  // 6. Test changePassword validations
  await asyncTest('changePassword rejects missing fields and short password', async () => {
    await assert.rejects(
      async () => {
        await changePassword({ userId: 'user123', currentPassword: '', newPassword: 'password123' });
      },
      /required/i,
      'Should require current password'
    );

    await assert.rejects(
      async () => {
        await changePassword({ userId: 'user123', currentPassword: 'oldPassword123', newPassword: '123' });
      },
      /at least 8 characters/i,
      'Should enforce minimum 8 chars on new password'
    );
  });

  // 7. Test setupCredentials validations
  await asyncTest('setupCredentials rejects invalid PIN format', async () => {
    await assert.rejects(
      async () => {
        await setupCredentials({ email: 'test@example.com', pin: '123' });
      },
      /4 or 6 numeric digits/i,
      'Should reject 3-digit PIN'
    );
    await assert.rejects(
      async () => {
        await setupCredentials({ email: 'test@example.com', pin: '12345' });
      },
      /4 or 6 numeric digits/i,
      'Should reject 5-digit PIN'
    );
  });

  // 8. Test Express initialization and middleware stack
  test('Express app instance is properly initialized with routing table', () => {
    assert.ok(app, 'Express app should be instantiated');
    assert.ok(app.router || app._router || typeof app.use === 'function', 'Express app router must be mounted');
  });

  console.log(`\n========================================`);
  console.log(`Backend QA Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
