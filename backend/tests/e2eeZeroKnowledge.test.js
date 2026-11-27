/**
 * Sample Zero-Knowledge E2EE Test Suite
 * ======================================
 * Verifies that:
 * 1. Sensitive documents & metadata are encrypted in-client BEFORE any network call.
 * 2. The server/database payload contains ZERO plaintext file bytes, titles, or PII.
 * 3. Wrong PIN/key is cryptographically rejected (OperationError).
 * 4. Tampered ciphertext fails AES-GCM-256 integrity authentication.
 * 5. Correct PIN unwraps the DEK and restores the exact original document & metadata.
 * 6. The Document model & Privacy Gate strictly block E2EE documents from cloud AI.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSalt,
  deriveMasterKey,
  encryptDocumentForVault,
  decryptDocumentFromVault,
  bytesToBase64,
  base64ToBytes,
} from '../../frontend/src/services/crypto/e2eeService.js';
import { Document } from '../src/modules/documents/document.model.js';
import { isAiAllowed, assertAiAllowed, PrivacyPolicyViolationError } from '../src/services/pipeline/privacyGate.js';

test('Zero-Knowledge E2EE: encrypts in-client, hides all PII from server, blocks wrong PIN & tampering, and decrypts cleanly', async () => {
  const userPin = '482910';
  const wrongPin = '999999';
  const salt = generateSalt();

  // Sample sensitive document (e.g. Aadhaar / ID record)
  const samplePlaintext = 'Government of India | Aadhaar: 4991 8822 1100 | Name: Sanjay Mishra | DOB: 1995-04-12';
  const sampleBytes = new TextEncoder().encode(samplePlaintext);
  const sampleMetadata = {
    title: 'Sanjay_Aadhaar_Card.pdf',
    originalName: 'Sanjay_Aadhaar_Card.pdf',
    mimetype: 'application/pdf',
    notes: 'Personal ID proof',
  };

  // 1. Client derives Master Key (KEK) from PIN locally
  const masterKey = await deriveMasterKey(userPin, salt);

  // 2. Client encrypts file + metadata in-browser with fresh per-document DEK
  const { ciphertext, ciphertextSha256, e2eeEnvelope } = await encryptDocumentForVault(
    sampleBytes,
    sampleMetadata,
    masterKey,
    salt
  );

  assert.equal(e2eeEnvelope.enabled, true);
  assert.equal(e2eeEnvelope.alg, 'AES-GCM-256');
  assert.ok(ciphertext.length > sampleBytes.length, 'Ciphertext should include 16-byte GCM auth tag');
  assert.equal(ciphertextSha256.length, 64, 'Ciphertext SHA-256 should be 64 hex chars');

  // 3. Verify Server Blindness (Zero-Knowledge property)
  // Simulate the exact JSON + ciphertext sent to /api/documents/e2ee/commit
  const serverPayloadString = JSON.stringify({
    title: 'Encrypted Vault Document',
    originalName: 'encrypted.bin',
    ciphertextBase64: bytesToBase64(ciphertext),
    ciphertextSha256,
    e2ee: e2eeEnvelope,
  });

  for (const sensitiveTerm of ['Aadhaar', '4991', '8822', 'Sanjay', '1995-04-12', 'Sanjay_Aadhaar_Card.pdf']) {
    assert.equal(
      serverPayloadString.includes(sensitiveTerm),
      false,
      `Server payload MUST NOT contain plaintext term: "${sensitiveTerm}"`
    );
  }

  // 4. Verify Wrong PIN is rejected
  const wrongMasterKey = await deriveMasterKey(wrongPin, salt);
  await assert.rejects(
    async () => decryptDocumentFromVault(ciphertext, e2eeEnvelope, wrongMasterKey),
    (err) => err && (err.name === 'OperationError' || /unwrap|decrypt|tag/i.test(err.message)),
    'Decryption with wrong PIN must fail'
  );

  // 5. Verify Tampering Detection (flip 1 bit in ciphertext)
  const tamperedCiphertext = new Uint8Array(ciphertext);
  tamperedCiphertext[0] ^= 0xff;
  await assert.rejects(
    async () => decryptDocumentFromVault(tamperedCiphertext, e2eeEnvelope, masterKey),
    (err) => err && (err.name === 'OperationError' || /decrypt|tag/i.test(err.message)),
    'Tampered ciphertext must fail AES-GCM authentication'
  );

  // 6. Verify Round-Trip Decryption with correct PIN
  const { fileBytes: decryptedBytes, metadata: decryptedMeta } = await decryptDocumentFromVault(
    ciphertext,
    e2eeEnvelope,
    masterKey
  );
  const decryptedText = new TextDecoder().decode(decryptedBytes);
  assert.equal(decryptedText, samplePlaintext);
  assert.deepEqual(decryptedMeta, sampleMetadata);

  // 7. Verify MongoDB Document Schema & Privacy Gate block cloud AI
  const doc = new Document({
    userId: '507f1f77bcf86cd799439011',
    title: 'Encrypted Vault Document',
    originalName: 'encrypted.bin',
    aiPolicy: 'storage_only',
    privacyMode: 'STORAGE_ONLY',
    sensitiveFlag: true,
    e2ee: e2eeEnvelope,
  });

  assert.equal(doc.aiPolicy, 'storage_only');
  assert.equal(doc.privacyMode, 'STORAGE_ONLY');
  assert.equal(doc.e2ee.enabled, true);
  assert.equal(isAiAllowed(doc), false, 'E2EE document must NEVER be allowed for AI');
  assert.throws(
    () => assertAiAllowed(doc, 'copilot_test'),
    (err) => err instanceof PrivacyPolicyViolationError && err.statusCode === 403
  );
});

import {
  setInMemoryMasterKey,
  getInMemoryMasterKey,
  clearInMemoryMasterKey,
  exportRawDekForFragment,
  decryptWithFragmentKey,
} from '../../frontend/src/services/crypto/e2eeService.js';
import { detectSensitiveFileLocally } from '../../frontend/src/services/crypto/clientSensitiveCheck.js';

test('In-memory key vault, #fragment link sharing, and local sensitive detector', async () => {
  const pin = '739104';
  const salt = generateSalt();
  const masterKey = await deriveMasterKey(pin, salt);

  // 1. In-memory key vault set / get / wipe
  setInMemoryMasterKey(masterKey);
  assert.equal(getInMemoryMasterKey(), masterKey);
  clearInMemoryMasterKey();
  assert.equal(getInMemoryMasterKey(), null);

  // 2. Zero-Knowledge #fragment link sharing
  const plainBytes = new TextEncoder().encode('Confidential Policy #9981');
  const { ciphertext, e2eeEnvelope } = await encryptDocumentForVault(
    plainBytes,
    { title: 'Policy 9981.pdf', originalName: 'Policy_9981.pdf' },
    masterKey,
    salt
  );
  const fragmentKey = await exportRawDekForFragment(e2eeEnvelope, masterKey);
  const { fileBytes: sharedBytes, metadata: sharedMeta } = await decryptWithFragmentKey(
    ciphertext,
    e2eeEnvelope,
    fragmentKey
  );
  assert.equal(new TextDecoder().decode(sharedBytes), 'Confidential Policy #9981');
  assert.equal(sharedMeta.title, 'Policy 9981.pdf');

  // 3. Local pre-upload sensitive detector (Aadhaar filename & encrypted PDF)
  const fakeAadhaarFile = { name: 'my_aadhaar_front.jpg', type: 'image/jpeg' };
  const aadhaarRes = await detectSensitiveFileLocally(fakeAadhaarFile);
  assert.equal(aadhaarRes.isSensitive, true);

  const encPdfBytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >> endobj');
  const fakeEncryptedPdf = {
    name: 'statement.pdf',
    type: 'application/pdf',
    slice: (start, end) => ({
      arrayBuffer: async () => encPdfBytes.slice(start, end).buffer,
    }),
  };
  const pdfRes = await detectSensitiveFileLocally(fakeEncryptedPdf);
  assert.equal(pdfRes.isSensitive, true);
  assert.equal(pdfRes.isEncryptedPdf, true);
});
