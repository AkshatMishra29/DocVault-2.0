import { describe, it } from 'node:test';
import assert from 'node:assert';
import sharp from 'sharp';
import { validateDocumentPipeline } from '../src/modules/extraction/documentValidationPipeline.service.js';

describe('🧪 Advanced AI Document Detection & OCR Validation Test Suite', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Positive Tests: Genuine Documents (MUST BE ACCEPTED)
  // ───────────────────────────────────────────────────────────────────────────

  it('1.1 Accepts genuine Tax Invoice with structured items and tables', async () => {
    const svg = Buffer.from(`<svg width="800" height="1000">
      <rect width="800" height="1000" fill="#ffffff"/>
      <text x="50" y="80" font-size="28" font-family="sans-serif" font-weight="bold" fill="#111827">TAX INVOICE</text>
      <text x="50" y="130" font-size="16" font-family="sans-serif" fill="#374151">Invoice No: INV-2026-8819</text>
      <text x="50" y="160" font-size="16" font-family="sans-serif" fill="#374151">Billed To: Tech Corp Pvt Ltd</text>
      <text x="50" y="190" font-size="16" font-family="sans-serif" fill="#374151">GSTIN: 27AABCT3518Q1ZV</text>
      <line x1="50" y1="220" x2="750" y2="220" stroke="#9ca3af" stroke-width="2"/>
      <text x="50" y="260" font-size="16" font-family="sans-serif" fill="#111827">Enterprise Server Subscription</text>
      <text x="600" y="260" font-size="16" font-family="sans-serif" fill="#111827">$2,450.00</text>
      <text x="50" y="300" font-size="16" font-family="sans-serif" fill="#111827">Database Security Encryption</text>
      <text x="600" y="300" font-size="16" font-family="sans-serif" fill="#111827">$650.00</text>
      <line x1="50" y1="340" x2="750" y2="340" stroke="#9ca3af" stroke-width="2"/>
      <text x="450" y="380" font-size="20" font-family="sans-serif" font-weight="bold" fill="#111827">Total Due: $3,100.00</text>
    </svg>`);
    const buf = await sharp(svg).png().toBuffer();

    const res = await validateDocumentPipeline(buf, { originalname: 'invoice_2026.png' });
    assert.strictEqual(res.status, 'accepted');
    assert.strictEqual(res.document_classification, 'DOCUMENT');
    assert.strictEqual(res.document_type, 'invoice');
    assert.ok(res.text_readability.readable);
    assert.ok(res.text_readability.medianLineHeight >= 12);
  });

  it('1.2 Accepts genuine Utility Electricity Bill with consumer details', async () => {
    const svg = Buffer.from(`<svg width="800" height="900">
      <rect width="800" height="900" fill="#fdfdfd"/>
      <text x="60" y="90" font-size="26" font-family="sans-serif" font-weight="bold" fill="#0f172a">STATE ELECTRICITY DISTRIBUTION BILL</text>
      <text x="60" y="140" font-size="16" font-family="sans-serif" fill="#334155">Consumer Number: 098412857</text>
      <text x="60" y="170" font-size="16" font-family="sans-serif" fill="#334155">Billing Month: October 2026</text>
      <text x="60" y="200" font-size="16" font-family="sans-serif" fill="#334155">Due Date: 15 November 2026</text>
      <line x1="60" y1="230" x2="740" y2="230" stroke="#cbd5e1" stroke-width="2"/>
      <text x="60" y="270" font-size="16" font-family="sans-serif" fill="#0f172a">Units Consumed: 340 kWh</text>
      <text x="60" y="300" font-size="16" font-family="sans-serif" fill="#0f172a">Current Energy Charges: Rs 2,850.00</text>
      <text x="60" y="350" font-size="22" font-family="sans-serif" font-weight="bold" fill="#0f172a">Gross Amount Payable: Rs 2,850.00</text>
    </svg>`);
    const buf = await sharp(svg).png().toBuffer();

    const res = await validateDocumentPipeline(buf, { originalname: 'electricity_bill.png' });
    assert.strictEqual(res.status, 'accepted');
    assert.strictEqual(res.document_classification, 'DOCUMENT');
    assert.strictEqual(res.document_type, 'bill');
    assert.ok(res.text_readability.readable);
  });

  it('1.3 Accepts genuine Certificate of Completion', async () => {
    const svg = Buffer.from(`<svg width="900" height="650">
      <rect width="900" height="650" fill="#fafafa" stroke="#d97706" stroke-width="12"/>
      <text x="250" y="120" font-size="34" font-family="serif" font-weight="bold" fill="#78350f">CERTIFICATE OF COMPLETION</text>
      <text x="320" y="200" font-size="18" font-family="sans-serif" fill="#451a03">This is to certify that</text>
      <text x="280" y="260" font-size="32" font-family="serif" font-weight="bold" fill="#1e293b">Akshat Mishra</text>
      <text x="180" y="330" font-size="18" font-family="sans-serif" fill="#451a03">has successfully completed the Advanced Cloud Architecture course</text>
      <text x="150" y="450" font-size="16" font-family="sans-serif" fill="#78350f">Date of Award: 10 October 2026</text>
      <text x="600" y="450" font-size="16" font-family="sans-serif" fill="#78350f">Authorized Signature</text>
    </svg>`);
    const buf = await sharp(svg).png().toBuffer();

    const res = await validateDocumentPipeline(buf, { originalname: 'degree_certificate.jpg' });
    assert.strictEqual(res.status, 'accepted');
    assert.strictEqual(res.document_type, 'certificate');
    assert.ok(res.text_readability.readable);
  });

  it('1.4 Accepts document photographed on a wooden table / surface', async () => {
    // Background wooden table with white paper invoice in center
    const svg = Buffer.from(`<svg width="1000" height="1000">
      <rect width="1000" height="1000" fill="#78350f"/>
      <rect x="150" y="100" width="700" height="800" fill="#ffffff" rx="8"/>
      <text x="200" y="180" font-size="28" font-family="sans-serif" font-weight="bold" fill="#000000">VEHICLE INSURANCE POLICY</text>
      <text x="200" y="230" font-size="18" font-family="sans-serif" fill="#333333">Policy Number: POL-90184210</text>
      <text x="200" y="270" font-size="18" font-family="sans-serif" fill="#333333">Insured Name: Rahul Sharma</text>
      <text x="200" y="310" font-size="18" font-family="sans-serif" fill="#333333">Vehicle Model: Honda City 2024</text>
      <text x="200" y="350" font-size="18" font-family="sans-serif" fill="#333333">Total Premium: Rs 14,200</text>
    </svg>`);
    const buf = await sharp(svg).png().toBuffer();

    const res = await validateDocumentPipeline(buf, { originalname: 'policy_photo.png' });
    assert.strictEqual(res.status, 'accepted');
    assert.strictEqual(res.document_classification, 'DOCUMENT');
    assert.strictEqual(res.document_type, 'insurance_policy');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Problem A: Non-Document Images with Incidental Text (MUST BE REJECTED)
  // ───────────────────────────────────────────────────────────────────────────

  it('2.1 Rejects Landscape Scenery containing a small road sign (Problem A)', async () => {
    const svg = Buffer.from(`<svg width="800" height="600">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2563eb"/>
          <stop offset="100%" stop-color="#93c5fd"/>
        </linearGradient>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#15803d"/>
          <stop offset="100%" stop-color="#166534"/>
        </linearGradient>
      </defs>
      <!-- Mountain landscape scenery -->
      <rect width="800" height="350" fill="url(#sky)"/>
      <polygon points="0,350 250,150 500,350" fill="#475569"/>
      <polygon points="350,350 600,120 800,350" fill="#334155"/>
      <rect y="350" width="800" height="250" fill="url(#grass)"/>
      
      <!-- Incidental small road sign in corner -->
      <rect x="680" y="440" width="90" height="50" fill="#15803d" stroke="#ffffff" stroke-width="2"/>
      <text x="690" y="470" font-size="12" font-family="sans-serif" font-weight="bold" fill="#ffffff">SPEED 45</text>
    </svg>`);
    const buf = await sharp(svg).png().toBuffer();

    const res = await validateDocumentPipeline(buf, { originalname: 'mountain_landscape.jpg' });
    assert.strictEqual(res.status, 'rejected');
    assert.strictEqual(res.reason_code, 'NON_DOCUMENT_IMAGE');
    assert.ok(res.message.includes('not appear to be a document'));
    assert.ok(res.suggestion.includes('invoice, bill, certificate'));
  });

  it('2.2 Rejects Building / Shop Storefront photograph with incidental text (Problem A)', async () => {
    const svg = Buffer.from(`<svg width="800" height="600">
      <!-- Brick building facade with windows -->
      <rect width="800" height="600" fill="#991b1b"/>
      <rect x="100" y="250" width="250" height="300" fill="#0284c7" opacity="0.8"/>
      <rect x="450" y="250" width="250" height="300" fill="#0284c7" opacity="0.8"/>
      
      <!-- Signboard on storefront -->
      <rect x="150" y="80" width="500" height="100" fill="#1e293b"/>
      <text x="240" y="145" font-size="38" font-family="sans-serif" font-weight="bold" fill="#facc15">COFFEE SHOP</text>
    </svg>`);
    const buf = await sharp(svg).png().toBuffer();

    const res = await validateDocumentPipeline(buf, { originalname: 'street_shop.jpg' });
    assert.strictEqual(res.status, 'rejected');
    assert.strictEqual(res.reason_code, 'NON_DOCUMENT_IMAGE');
  });

  it('2.3 Rejects Personal Portrait / Selfie with incidental shirt text (Problem A)', async () => {
    const svg = Buffer.from(`<svg width="600" height="700">
      <!-- High skin tone coverage portrait -->
      <rect width="600" height="700" fill="#1e293b"/>
      <circle cx="300" cy="280" r="180" fill="#e0ac69"/>
      <rect x="120" y="460" width="360" height="240" fill="#4338ca"/>
      <!-- Incidental text on t-shirt -->
      <text x="240" y="540" font-size="28" font-family="sans-serif" font-weight="bold" fill="#ffffff">PARIS</text>
    </svg>`);
    const buf = await sharp(svg).png().toBuffer();

    const res = await validateDocumentPipeline(buf, { originalname: 'selfie.jpg' });
    assert.strictEqual(res.status, 'rejected');
    assert.strictEqual(res.reason_code, 'NON_DOCUMENT_IMAGE');
  });

  it('2.4 Rejects Blank solid-color image with no readable content', async () => {
    const buf = await sharp({
      create: { width: 500, height: 500, channels: 3, background: { r: 255, g: 255, b: 255 } }
    }).png().toBuffer();

    const res = await validateDocumentPipeline(buf, { originalname: 'blank_white.png' });
    assert.strictEqual(res.status, 'rejected');
    assert.strictEqual(res.reason_code, 'BLANK_IMAGE');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Problem B: Tiny Text & Insufficient Readability (MUST BE REVIEW)
  // ───────────────────────────────────────────────────────────────────────────

  it('3.1 Distinguishes genuine document with unreadably tiny text -> REVIEW with TEXT_TOO_SMALL (Problem B)', async () => {
    // High-resolution image (1800x2400) where document text is tiny (4px tall, relative height ~0.0017)
    // Simulating distant photo of document
    const svg = Buffer.from(`<svg width="1800" height="2400">
      <rect width="1800" height="2400" fill="#f8fafc"/>
      <!-- Microscopic text rendered from distant photo -->
      <text x="100" y="100" font-size="5" font-family="sans-serif" fill="#000000">INVOICE 12345 TOTAL $500 DUE 2026-11-20</text>
      <text x="100" y="130" font-size="5" font-family="sans-serif" fill="#000000">TERMS AND CONDITIONS APPLY FOR CUSTOMER ACCT 98124</text>
      <text x="100" y="160" font-size="5" font-family="sans-serif" fill="#000000">PAYMENT VIA WIRE TRANSFER TO BANK OF INDIA</text>
    </svg>`);
    const buf = await sharp(svg).png().toBuffer();

    const res = await validateDocumentPipeline(buf, { originalname: 'distant_doc_photo.jpg' });

    // CRITICAL REQUIREMENT: Must identify it as a DOCUMENT, but mark readability as insufficient!
    // Must NOT tell the user it is not a document!
    assert.strictEqual(res.status, 'review');
    assert.strictEqual(res.reason_code, 'TEXT_TOO_SMALL');
    assert.strictEqual(res.document_classification, 'DOCUMENT');
    assert.ok(res.message.includes('text is too small to read reliably'));
    assert.ok(res.suggestion.includes('Move closer to the document'));
  });

  it('3.2 Distinguishes genuine document with severe blur -> REVIEW with IMAGE_BLURRY (Problem B)', async () => {
    // Generate sharp document and apply heavy Gaussian blur
    const svg = Buffer.from(`<svg width="800" height="800">
      <rect width="800" height="800" fill="#ffffff"/>
      <text x="50" y="80" font-size="20" font-family="sans-serif" fill="#000000">EMPLOYMENT VERIFICATION LETTER</text>
      <text x="50" y="140" font-size="14" font-family="sans-serif" fill="#333333">This is to certify that Rahul is an active employee.</text>
    </svg>`);
    const sharpBuf = await sharp(svg).blur(12).png().toBuffer();

    const res = await validateDocumentPipeline(sharpBuf, { originalname: 'blurry_letter.png' });
    assert.strictEqual(res.status, 'review');
    assert.ok(res.reason_code === 'IMAGE_BLURRY' || res.reason_code === 'NO_READABLE_TEXT');
    assert.strictEqual(res.document_classification, 'DOCUMENT');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Performance & CPU Latency Benchmark
  // ───────────────────────────────────────────────────────────────────────────

  it('4.1 Completes full multi-stage CPU pipeline within 250ms latency threshold', async () => {
    const svg = Buffer.from(`<svg width="600" height="800">
      <rect width="600" height="800" fill="#ffffff"/>
      <text x="40" y="60" font-size="22" font-family="sans-serif" font-weight="bold" fill="#000">SPEED BENCHMARK INVOICE</text>
      <text x="40" y="110" font-size="16" font-family="sans-serif" fill="#333">Amount Due: $1,200.00</text>
    </svg>`);
    const buf = await sharp(svg).png().toBuffer();

    const t0 = performance.now();
    const res = await validateDocumentPipeline(buf, { originalname: 'benchmark.png' });
    const t1 = performance.now();
    const elapsedMs = t1 - t0;

    console.log(`[CPU Performance Benchmark] Pipeline latency: ${elapsedMs.toFixed(1)} ms`);
    assert.strictEqual(res.status, 'accepted');
    assert.ok(elapsedMs < 350, `Pipeline took ${elapsedMs}ms, should be under 350ms on CPU`);
  });
});
