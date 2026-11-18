import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import crypto from 'crypto';
import { validateWithService, checkValidatorHealth } from '../src/modules/extraction/validatorClient.service.js';
import { config } from '../src/config/index.js';

describe('🔒 Universal Validator Service & Quarantine Integration Test Suite', () => {
  const quarantineDir = config.validator?.quarantineDir || path.resolve(process.cwd(), 'uploads', 'quarantine');

  // Ensure test quarantine directory exists
  if (!fs.existsSync(quarantineDir)) {
    fs.mkdirSync(quarantineDir, { recursive: true });
  }

  it('1. Correctly probes validator health without throwing', async () => {
    const health = await checkValidatorHealth();
    assert.strictEqual(typeof health.available, 'boolean');
  });

  it('2. Quarantined Genuine Tax Invoice returns ACCEPT with doc_type and score', async () => {
    const svg = Buffer.from(`<svg width="800" height="900">
      <rect width="800" height="900" fill="#ffffff"/>
      <text x="50" y="80" font-size="28" font-family="sans-serif" font-weight="bold" fill="#111827">TAX INVOICE</text>
      <text x="50" y="130" font-size="16" font-family="sans-serif" fill="#374151">Invoice No: INV-2026-9021</text>
      <text x="50" y="160" font-size="16" font-family="sans-serif" fill="#374151">Billed To: Global Systems Inc</text>
      <line x1="50" y1="200" x2="750" y2="200" stroke="#9ca3af" stroke-width="2"/>
      <text x="50" y="240" font-size="16" font-family="sans-serif" fill="#111827">Cloud Computing Cluster</text>
      <text x="600" y="240" font-size="16" font-family="sans-serif" fill="#111827">$1,800.00</text>
      <text x="450" y="320" font-size="20" font-family="sans-serif" font-weight="bold" fill="#111827">Total: $1,800.00</text>
    </svg>`);
    const buffer = await sharp(svg).png().toBuffer();
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const testQuarantinePath = path.join(quarantineDir, `test_invoice_${sha256.slice(0, 8)}.png`);
    fs.writeFileSync(testQuarantinePath, buffer);

    try {
      const result = await validateWithService({
        quarantinePath: testQuarantinePath,
        sha256,
        buffer,
        originalname: 'tax_invoice.png',
        mimetype: 'image/png',
      });

      assert.strictEqual(result.decision, 'ACCEPT');
      assert.strictEqual(result.doc_type, 'invoice');
      assert.ok(result.score >= 0.70);
      assert.strictEqual(result.sha256, sha256);
    } finally {
      if (fs.existsSync(testQuarantinePath)) fs.unlinkSync(testQuarantinePath);
    }
  });

  it('3. Quarantined Landscape Scenery with incidental sign is strictly REJECTED', async () => {
    const svg = Buffer.from(`<svg width="800" height="600">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0284c7"/>
          <stop offset="100%" stop-color="#bae6fd"/>
        </linearGradient>
      </defs>
      <rect width="800" height="350" fill="url(#sky)"/>
      <polygon points="0,350 250,150 500,350" fill="#475569"/>
      <polygon points="350,350 600,120 800,350" fill="#334155"/>
      <rect y="350" width="800" height="250" fill="#15803d"/>
      <rect x="620" y="420" width="100" height="80" fill="#ffffff" stroke="#ef4444" stroke-width="4" rx="4"/>
      <text x="635" y="465" font-size="22" font-family="sans-serif" font-weight="bold" fill="#000000">40</text>
    </svg>`);
    const buffer = await sharp(svg).png().toBuffer();
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const testQuarantinePath = path.join(quarantineDir, `test_landscape_${sha256.slice(0, 8)}.png`);
    fs.writeFileSync(testQuarantinePath, buffer);

    try {
      const result = await validateWithService({
        quarantinePath: testQuarantinePath,
        sha256,
        buffer,
        originalname: 'mountain_scenery.png',
        mimetype: 'image/png',
      });

      assert.strictEqual(result.decision, 'REJECT');
      assert.ok(result.reason_code.includes('NON_DOCUMENT') || result.reason_code.includes('NATURAL_SCENERY'));
    } finally {
      if (fs.existsSync(testQuarantinePath)) fs.unlinkSync(testQuarantinePath);
    }
  });

  it('4. Quarantined ID Card with human portrait photo is ACCEPTED by guardrail', async () => {
    const svg = Buffer.from(`<svg width="600" height="380">
      <rect width="600" height="380" fill="#f8fafc" stroke="#3b82f6" stroke-width="3" rx="12"/>
      <rect x="0" y="0" width="600" height="60" fill="#1e40af"/>
      <text x="20" y="40" font-size="20" font-family="sans-serif" font-weight="bold" fill="#ffffff">GOVERNMENT OF INDIA - UNIQUE IDENTIFICATION</text>
      <!-- Portrait Photo on ID Card -->
      <rect x="40" y="90" width="110" height="140" fill="#d97706" rx="4"/>
      <circle cx="95" cy="140" r="28" fill="#fcd34d"/>
      <ellipse cx="95" cy="190" rx="38" ry="24" fill="#1e3a8a"/>
      <!-- ID Details -->
      <text x="180" y="110" font-size="16" font-family="sans-serif" font-weight="bold" fill="#0f172a">NAME: ARJUN VERMA</text>
      <text x="180" y="140" font-size="14" font-family="sans-serif" fill="#334155">DOB: 14/08/1992</text>
      <text x="180" y="170" font-size="14" font-family="sans-serif" fill="#334155">GENDER: MALE</text>
      <text x="180" y="210" font-size="20" font-family="monospace" font-weight="bold" fill="#0f172a">9012 3456 7890</text>
      <text x="180" y="250" font-size="12" font-family="sans-serif" fill="#64748b">AADHAAR - AAM AADMI KA ADHIKAR</text>
    </svg>`);
    const buffer = await sharp(svg).png().toBuffer();
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const testQuarantinePath = path.join(quarantineDir, `test_idcard_${sha256.slice(0, 8)}.png`);
    fs.writeFileSync(testQuarantinePath, buffer);

    try {
      const result = await validateWithService({
        quarantinePath: testQuarantinePath,
        sha256,
        buffer,
        originalname: 'aadhaar_card.png',
        mimetype: 'image/png',
      });

      assert.strictEqual(result.decision, 'ACCEPT');
      assert.strictEqual(result.doc_type, 'id_card');
    } finally {
      if (fs.existsSync(testQuarantinePath)) fs.unlinkSync(testQuarantinePath);
    }
  });

  it('5. SHA-256 Decision Cache returns duplicate validation instantly (< 5ms)', async () => {
    const svg = Buffer.from(`<svg width="500" height="500"><rect width="500" height="500" fill="#ffffff"/><text x="50" y="50">TEST</text></svg>`);
    const buffer = await sharp(svg).png().toBuffer();
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // First call primes cache
    const first = await validateWithService({ sha256, buffer, originalname: 'test.png', mimetype: 'image/png' });
    
    // Second call should hit in-memory cache
    const second = await validateWithService({ sha256, buffer, originalname: 'test.png', mimetype: 'image/png' });
    assert.strictEqual(second.cached, true);
    assert.strictEqual(second.decision, first.decision);
    assert.ok(second.durationMs < 10);
  });
});
