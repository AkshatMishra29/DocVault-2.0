import { describe, it } from 'node:test';
import assert from 'node:assert';
import sharp from 'sharp';
import { validateDocumentImage, DocumentImageValidationError, calculateLaplacianVariance } from '../src/modules/extraction/documentImageValidation.service.js';
import { validateDocumentPipeline } from '../src/modules/extraction/documentValidationPipeline.service.js';
import { inspectImageGuardrails } from '../src/modules/extraction/ingestionGuard.service.js';

describe('DocVault Security Guardrail: Image Blur & Clarity Enforcement', () => {

  const sharpInvoiceSvg = `
    <svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="1000" fill="#ffffff"/>
      <text x="50" y="80" font-family="Arial" font-size="26" font-weight="bold" fill="#000000">COMMERCIAL TAX INVOICE</text>
      <text x="50" y="130" font-family="Arial" font-size="16" fill="#333333">Invoice Number: INV-2026-9042</text>
      <text x="50" y="170" font-family="Arial" font-size="16" fill="#333333">Billed To: Acme Financial Services</text>
      <text x="50" y="210" font-family="Arial" font-size="16" fill="#333333">Total Payable: $4,520.00 USD</text>
      <text x="50" y="250" font-family="Arial" font-size="14" fill="#666666">Due Date: 30 November 2026</text>
      <line x1="50" y1="280" x2="750" y2="280" stroke="#cccccc" stroke-width="2"/>
      <text x="50" y="320" font-family="Arial" font-size="14" fill="#333333">Item 1: Enterprise Cloud Security Vault License</text>
    </svg>
  `;

  it('1. Calculates high Laplacian variance (> 15) for crisp sharp documents', async () => {
    const sharpBuf = await sharp(Buffer.from(sharpInvoiceSvg)).png().toBuffer();
    const raw = await sharp(sharpBuf)
      .resize({ width: 400, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .toColourspace('b-w')
      .raw()
      .toBuffer({ resolveWithObject: true });

    const stats = calculateLaplacianVariance(raw.data, raw.info.width, raw.info.height);
    console.log('[Clarity Metrics] Sharp Document Laplacian stdev:', stats.stdev, 'variance:', stats.variance);
    assert.ok(stats.stdev > 10.0, `Expected stdev > 10.0, got ${stats.stdev}`);
    assert.ok(stats.variance > 100.0, `Expected variance > 100.0, got ${stats.variance}`);
  });

  it('2. MUST REJECT blurred image in validateDocumentImage (Layer 2 guardrail)', async () => {
    // Generate blurred document (simulating out-of-focus camera capture)
    const blurryBuf = await sharp(Buffer.from(sharpInvoiceSvg))
      .blur(4)
      .png()
      .toBuffer();

    await assert.rejects(async () => {
      await validateDocumentImage(blurryBuf);
    }, (err) => {
      assert.ok(err instanceof DocumentImageValidationError, `Expected DocumentImageValidationError, got ${err.name}`);
      assert.strictEqual(err.reasonCode, 'IMAGE_BLURRY');
      assert.ok(err.message.includes('too blurry'), `Message was: ${err.message}`);
      return true;
    });
  });

  it('3. MUST ACCEPT sharp document in validateDocumentImage without false positive', async () => {
    const sharpBuf = await sharp(Buffer.from(sharpInvoiceSvg)).jpeg().toBuffer();
    const res = await validateDocumentImage(sharpBuf);
    assert.strictEqual(res.valid, true);
    assert.ok(res.edgeVariance > 10.0);
  });

  it('4. MUST REJECT / GATE blurred image in multi-stage validateDocumentPipeline', async () => {
    const blurryBuf = await sharp(Buffer.from(sharpInvoiceSvg))
      .blur(3)
      .png()
      .toBuffer();

    const result = await validateDocumentPipeline(blurryBuf, {
      originalname: 'blurry_invoice_scan.png',
      mimetype: 'image/png',
    });

    console.log('[Pipeline Result on Blur]:', result.status, result.reason_code, result.message);
    assert.strictEqual(result.status, 'review', 'Status must be review/reject');
    assert.strictEqual(result.reason_code, 'IMAGE_BLURRY');
    assert.ok(result.message.toLowerCase().includes('blurry'));
  });

  it('5. MUST REJECT blurred image in inspectImageGuardrails (Ingestion worker gate)', async () => {
    const blurryBuf = await sharp(Buffer.from(sharpInvoiceSvg))
      .blur(3.5)
      .png()
      .toBuffer();

    await assert.rejects(async () => {
      await inspectImageGuardrails(blurryBuf, 'blurred_contract.png');
    }, (err) => {
      assert.ok(err.message.startsWith('Security Guardrail: Uploaded image is too blurry'));
      return true;
    });
  });

  it('6. Accepts sharp ID Card with photo and text without false rejection', async () => {
    const idCardSvg = `
      <svg width="800" height="500">
        <rect width="800" height="500" fill="#f4f6f8"/>
        <rect x="30" y="30" width="740" height="440" rx="16" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
        <rect x="60" y="60" width="160" height="200" rx="8" fill="#d97706"/>
        <circle cx="140" cy="130" r="45" fill="#fcd34d"/>
        <text x="250" y="100" font-size="26" font-family="sans-serif" font-weight="bold" fill="#0f172a">NATIONAL IDENTITY CARD</text>
        <text x="250" y="140" font-size="18" font-family="sans-serif" fill="#334155">Name: Sanjay Mishra</text>
        <text x="250" y="180" font-size="18" font-family="sans-serif" fill="#334155">ID: 8934 1029 4812</text>
      </svg>
    `;
    const sharpId = await sharp(Buffer.from(idCardSvg)).png().toBuffer();
    const res = await validateDocumentImage(sharpId);
    assert.strictEqual(res.valid, true);
  });
});
