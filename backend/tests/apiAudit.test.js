import assert from 'node:assert/strict';
import http from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { config } from '../src/config/index.js';
import { User } from '../src/modules/auth/auth.model.js';
import { Document } from '../src/modules/documents/document.model.js';
import { Asset } from '../src/modules/assets/asset.model.js';

let server;
let baseUrl;
let authToken;
let testUserId;
let testUserEmail = 'akshatmishra2904@gmail.com';
let createdDocId;
let createdAssetId;

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

async function request(endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
  const headers = { ...(options.headers || {}) };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  if (options.json) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.json);
  }

  const res = await fetch(url, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';
  let body = null;

  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }

  return { status: res.status, headers: res.headers, body };
}

console.log('\n===============================================================');
console.log('            DOCVAULT COMPREHENSIVE API AUDIT SUITE             ');
console.log('===============================================================\n');

async function runApiAudit() {
  // 1. Initialize MongoDB connection & Server
  await mongoose.connect(config.mongoUri);
  console.log('[Setup] Connected to MongoDB Atlas');

  let user = await User.findOne({ email: testUserEmail });
  if (!user) {
    user = await User.findOne({});
  }
  assert.ok(user, 'At least one user must exist in the database for API testing');
  testUserId = user._id.toString();
  testUserEmail = user.email;

  // Generate valid session JWT token
  authToken = jwt.sign(
    { userId: testUserId, email: testUserEmail, pinVerified: true, sessionVersion: user.sessionVersion || 1 },
    config.jwtSecret,
    { expiresIn: '1h' }
  );

  // Start HTTP server on random free port
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`[Setup] Test server listening on ${baseUrl}\n`);

  // -----------------------------------------------------------------
  // 1. HEALTH CHECK API
  // -----------------------------------------------------------------
  console.log('--- 1. System Health & Infrastructure API ---');

  await test('GET /api/health returns 200 and connected services', async () => {
    const res = await request('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.services.mongodb, 'Connected');
  });

  // -----------------------------------------------------------------
  // 2. AUTHENTICATION APIS
  // -----------------------------------------------------------------
  console.log('\n--- 2. Authentication & Security APIs ---');

  await test('POST /api/auth/login with wrong credentials returns 401', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      json: { email: testUserEmail, password: 'wrong_password_123' },
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  await test('POST /api/auth/login with empty body returns 400', async () => {
    const res = await request('/api/auth/login', {
      method: 'POST',
      json: {},
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  await test('POST /api/auth/send-otp validates missing email', async () => {
    const res = await request('/api/auth/send-otp', {
      method: 'POST',
      json: {},
    });
    assert.equal(res.status, 400);
  });

  await test('POST /api/auth/verify-otp validates missing fields', async () => {
    const res = await request('/api/auth/verify-otp', {
      method: 'POST',
      json: { email: testUserEmail },
    });
    assert.equal(res.status, 400);
  });

  await test('POST /api/auth/verify-pin validates missing PIN', async () => {
    const res = await request('/api/auth/verify-pin', {
      method: 'POST',
      json: { email: testUserEmail },
    });
    assert.equal(res.status, 400);
  });

  await test('POST /api/auth/firebase handles missing idToken', async () => {
    const res = await request('/api/auth/firebase', {
      method: 'POST',
      json: {},
    });
    assert.ok([400, 500].includes(res.status));
  });

  await test('POST /api/auth/biometrics/verify handles unconfigured credentials', async () => {
    const res = await request('/api/auth/biometrics/verify', {
      method: 'POST',
      json: { email: testUserEmail, credentialId: 'mock-cred-123' },
    });
    assert.ok([403, 404].includes(res.status));
  });

  await test('PATCH /api/auth/session-settings updates user preferences', async () => {
    const res = await request('/api/auth/session-settings', {
      method: 'PATCH',
      token: authToken,
      json: { singleSessionOnly: false, autoLockEnabled: true },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  // -----------------------------------------------------------------
  // 3. DOCUMENTS APIS
  // -----------------------------------------------------------------
  console.log('\n--- 3. Documents & Extraction Pipeline APIs ---');

  await test('GET /api/documents returns user documents array', async () => {
    const res = await request('/api/documents', { token: authToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
  });

  await test('POST /api/documents/upload ingests and executes pipeline', async () => {
    // Generate valid minimal PDF in-memory
    const pdfContent = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000108 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
183
%%EOF`;
    const boundary = '----WebKitFormBoundaryTest123456';
    const bodyBuffer = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test_policy_doc.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      Buffer.from(pdfContent),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await request('/api/documents/upload', {
      method: 'POST',
      token: authToken,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyBuffer,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data._id);
    createdDocId = res.body.data._id;
  });

  await test('GET /api/documents/:id returns specific document metadata', async () => {
    assert.ok(createdDocId, 'Document ID must exist from previous upload');
    const res = await request(`/api/documents/${createdDocId}`, { token: authToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data._id, createdDocId);
  });

  await test('GET /api/documents/:id/download streams raw binary file', async () => {
    assert.ok(createdDocId);
    const res = await request(`/api/documents/${createdDocId}/download`);
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('%PDF-1.4'));
  });

  await test('PATCH /api/documents/:id updates document tags and category', async () => {
    assert.ok(createdDocId);
    const res = await request(`/api/documents/${createdDocId}`, {
      method: 'PATCH',
      token: authToken,
      json: { category: 'Insurance', tags: ['Audit', 'Verified'] },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.category, 'Insurance');
  });

  await test('DELETE /api/documents/:id removes document', async () => {
    assert.ok(createdDocId);
    const res = await request(`/api/documents/${createdDocId}`, {
      method: 'DELETE',
      token: authToken,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  // -----------------------------------------------------------------
  // 4. ASSET REGISTRY APIS
  // -----------------------------------------------------------------
  console.log('\n--- 4. Asset Registry APIs ---');

  await test('POST /api/assets creates an asset record', async () => {
    const res = await request('/api/assets', {
      method: 'POST',
      token: authToken,
      json: {
        name: 'MacBook Pro M3 Max',
        category: 'Electronics',
        purchaseDate: '2024-01-15',
        warrantyExpiry: '2027-01-14',
        estimatedValue: 350000,
        currency: 'INR',
        notes: 'Corporate asset under DocVault management',
      },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data._id);
    createdAssetId = res.body.data._id;
  });

  await test('GET /api/assets returns list of tracked assets', async () => {
    const res = await request('/api/assets', { token: authToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.length > 0);
  });

  await test('DELETE /api/assets/:id deletes an asset record', async () => {
    assert.ok(createdAssetId);
    const res = await request(`/api/assets/${createdAssetId}`, {
      method: 'DELETE',
      token: authToken,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });

  // -----------------------------------------------------------------
  // 5. DEADLINES & CALENDAR APIS
  // -----------------------------------------------------------------
  console.log('\n--- 5. Deadlines & Calendar Sync APIs ---');

  await test('GET /api/deadlines returns scheduled deadlines', async () => {
    const res = await request('/api/deadlines', { token: authToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
  });

  await test('GET /api/deadlines/calendar.ics downloads iCalendar stream', async () => {
    const res = await request('/api/deadlines/calendar.ics');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('BEGIN:VCALENDAR'));
    assert.ok(res.body.includes('END:VCALENDAR'));
  });

  // -----------------------------------------------------------------
  // 6. AI COPILOT QUERY API
  // -----------------------------------------------------------------
  console.log('\n--- 6. AI Copilot RAG API ---');

  await test('POST /api/ai/query handles questions gracefully', async () => {
    const res = await request('/api/ai/query', {
      method: 'POST',
      token: authToken,
      json: { question: 'When is my upcoming deadline?' },
    });
    // Should return 200 with answer
    assert.equal(res.status, 200);
    assert.ok(res.body.answer || res.body.data || res.body.success !== undefined);
  });

  // -----------------------------------------------------------------
  // 7. VAULT & ADMIN TELEMETRY APIS
  // -----------------------------------------------------------------
  console.log('\n--- 7. Vault Security & Admin Telemetry APIs ---');

  await test('GET /api/vault/admin/stats returns cluster analytics', async () => {
    const res = await request('/api/vault/admin/stats', { token: authToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.stats.totalCustodians >= 1);
  });

  await test('GET /api/vault/audit-trail returns security audit log', async () => {
    const res = await request('/api/vault/audit-trail', { token: authToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
  });

  await test('GET /api/vault/export exports vault backup envelope', async () => {
    const res = await request('/api/vault/export', { token: authToken });
    assert.equal(res.status, 200);
    assert.ok(res.body.vaultVersion);
    assert.ok(res.body.user);
  });

  // -----------------------------------------------------------------
  // 8. EXTRACTION & HUMAN REVIEW QUEUE APIS
  // -----------------------------------------------------------------
  console.log('\n--- 8. Extraction Verification & Review Queue APIs ---');

  await test('GET /api/extraction/review-queue returns items requiring review', async () => {
    const res = await request('/api/extraction/review-queue', { token: authToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
  });

  await test('GET /api/extraction/token-stats returns token ledger usage', async () => {
    const res = await request('/api/extraction/token-stats', { token: authToken });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.budget !== undefined);
  });

  await test('POST /api/extraction/correct-field validates missing fields', async () => {
    const res = await request('/api/extraction/correct-field', {
      method: 'POST',
      token: authToken,
      json: {},
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  // -----------------------------------------------------------------
  // SUMMARY
  // -----------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`   API AUDIT SUITE: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  // Teardown
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runApiAudit().catch((err) => {
  console.error('[FATAL AUDIT ERROR]', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
