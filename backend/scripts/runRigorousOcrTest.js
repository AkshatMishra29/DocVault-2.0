import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractTextFromImage } from '../src/services/ocr/ocrService.js';
import { executeDocumentExtractionPipeline } from '../src/modules/extraction/extractionPipeline.service.js';
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to escape XML characters in SVG
function xml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Builds an authentic, high-density SVG representing a complex commercial tax invoice
 * with multi-column tables, fine print, GST breakdowns, bank details, and warranty clauses.
 */
function generateComplexInvoiceSvg() {
  const width = 1400;
  const height = 1950;

  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff; font-family:'Helvetica Neue', Arial, sans-serif;">
  <!-- Document Border & Header Bar -->
  <rect x="30" y="30" width="1340" height="1890" fill="#ffffff" stroke="#1e293b" stroke-width="2"/>
  <rect x="30" y="30" width="1340" height="110" fill="#0f172a"/>
  
  <text x="60" y="75" font-size="28" font-weight="bold" fill="#ffffff">APEX INDUSTRIAL DYNAMICS INDIA LIMITED</text>
  <text x="60" y="105" font-size="14" fill="#94a3b8">Corporate Office: Plot 42-B, MIDC Industrial Area, Andheri East, Mumbai, Maharashtra 400093</text>
  <text x="60" y="125" font-size="13" fill="#cbd5e1">GSTIN: 27AAACA1234A1Z5 | PAN: AAACA1234A | CIN: U29100MH2012PLC238910</text>
  
  <rect x="1080" y="55" width="260" height="42" fill="#2563eb" rx="6"/>
  <text x="1210" y="82" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="middle">TAX INVOICE</text>

  <!-- Two-Column Header: Invoice Details & Billed To -->
  <line x1="30" y1="260" x2="1370" y2="260" stroke="#cbd5e1" stroke-width="1.5"/>
  
  <!-- Left Column: Invoice Metadata -->
  <text x="60" y="170" font-size="14" font-weight="bold" fill="#475569">INVOICE NUMBER:</text>
  <text x="210" y="170" font-size="16" font-weight="bold" fill="#0f172a">INV-2026-X8921</text>

  <text x="60" y="200" font-size="14" font-weight="bold" fill="#475569">INVOICE DATE:</text>
  <text x="210" y="200" font-size="15" fill="#0f172a">2026-03-24</text>

  <text x="60" y="230" font-size="14" font-weight="bold" fill="#475569">PAYMENT DUE DATE:</text>
  <text x="210" y="230" font-size="15" font-weight="bold" fill="#b91c1c">2026-04-23</text>

  <text x="440" y="170" font-size="14" font-weight="bold" fill="#475569">P.O. REFERENCE:</text>
  <text x="590" y="170" font-size="15" fill="#0f172a">PO-IND-88410</text>

  <text x="440" y="200" font-size="14" font-weight="bold" fill="#475569">PLACE OF SUPPLY:</text>
  <text x="590" y="200" font-size="15" fill="#0f172a">Delhi (State Code: 07)</text>

  <text x="440" y="230" font-size="14" font-weight="bold" fill="#475569">REVERSE CHARGE:</text>
  <text x="590" y="230" font-size="15" fill="#0f172a">No</text>

  <!-- Right Column: Billed To / Consignee -->
  <text x="820" y="165" font-size="13" font-weight="bold" fill="#64748b">BILLED TO (BUYER):</text>
  <text x="820" y="190" font-size="16" font-weight="bold" fill="#0f172a">TechVault Cloud Infrastructure Private Limited</text>
  <text x="820" y="212" font-size="13" fill="#334155">Building 8C, Cyber City, DLF Phase II, Gurugram, Haryana 122002</text>
  <text x="820" y="232" font-size="13" fill="#334155">GSTIN: 07BBBCB5678B2Z1 | Contact: accounts@techvault.example</text>

  <!-- Complex Multi-Column Line Items Table Header -->
  <rect x="50" y="280" width="1300" height="40" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1"/>
  <text x="70" y="305" font-size="13" font-weight="bold" fill="#1e293b">ITEM</text>
  <text x="130" y="305" font-size="13" font-weight="bold" fill="#1e293b">DESCRIPTION OF GOODS &amp; SERVICES</text>
  <text x="610" y="305" font-size="13" font-weight="bold" fill="#1e293b">HSN/SAC</text>
  <text x="730" y="305" font-size="13" font-weight="bold" fill="#1e293b">QTY</text>
  <text x="810" y="305" font-size="13" font-weight="bold" fill="#1e293b">RATE (INR)</text>
  <text x="960" y="305" font-size="13" font-weight="bold" fill="#1e293b">TAXABLE VALUE</text>
  <text x="1150" y="305" font-size="13" font-weight="bold" fill="#1e293b">IGST (18%)</text>
  <text x="1260" y="305" font-size="13" font-weight="bold" fill="#1e293b">TOTAL (INR)</text>

  <!-- Line Item 1 -->
  <rect x="50" y="320" width="1300" height="70" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
  <text x="70" y="350" font-size="14" fill="#334155">01</text>
  <text x="130" y="348" font-size="14" font-weight="bold" fill="#0f172a">High-Density Enterprise Server Rack 42U</text>
  <text x="130" y="370" font-size="12" fill="#64748b">Model: SRK-42U-HD | Dual PDU &amp; Smart Biometric Sensor Locks</text>
  <text x="610" y="355" font-size="13" fill="#334155">84715000</text>
  <text x="730" y="355" font-size="13" fill="#334155">2 NOS</text>
  <text x="810" y="355" font-size="13" fill="#334155">145,000.00</text>
  <text x="960" y="355" font-size="13" fill="#334155">290,000.00</text>
  <text x="1150" y="355" font-size="13" fill="#334155">52,200.00</text>
  <text x="1260" y="355" font-size="14" font-weight="bold" fill="#0f172a">342,200.00</text>

  <!-- Line Item 2 -->
  <rect x="50" y="390" width="1300" height="70" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
  <text x="70" y="420" font-size="14" fill="#334155">02</text>
  <text x="130" y="418" font-size="14" font-weight="bold" fill="#0f172a">Redundant Precision In-Row Liquid Chiller 10kW</text>
  <text x="130" y="440" font-size="12" fill="#64748b">Serial No: CHL-2026-9042A | Eco Refrigerant R-410A Closed Loop</text>
  <text x="610" y="425" font-size="13" fill="#334155">84186990</text>
  <text x="730" y="425" font-size="13" fill="#334155">1 SET</text>
  <text x="810" y="425" font-size="13" fill="#334155">385,000.00</text>
  <text x="960" y="425" font-size="13" fill="#334155">385,000.00</text>
  <text x="1150" y="425" font-size="13" fill="#334155">69,300.00</text>
  <text x="1260" y="425" font-size="14" font-weight="bold" fill="#0f172a">454,300.00</text>

  <!-- Line Item 3 -->
  <rect x="50" y="460" width="1300" height="70" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
  <text x="70" y="490" font-size="14" fill="#334155">03</text>
  <text x="130" y="488" font-size="14" font-weight="bold" fill="#0f172a">High-Speed Optical Fiber Patch Panel 96-Port</text>
  <text x="130" y="510" font-size="12" fill="#64748b">LC-Duplex Singlemode OS2 100G Ready | Zero Splice Loss</text>
  <text x="610" y="495" font-size="13" fill="#334155">85367000</text>
  <text x="730" y="495" font-size="13" fill="#334155">4 NOS</text>
  <text x="810" y="495" font-size="13" fill="#334155">12,500.00</text>
  <text x="960" y="495" font-size="13" fill="#334155">50,000.00</text>
  <text x="1150" y="495" font-size="13" fill="#334155">9,000.00</text>
  <text x="1260" y="495" font-size="14" font-weight="bold" fill="#0f172a">59,000.00</text>

  <!-- Line Item 4 -->
  <rect x="50" y="530" width="1300" height="70" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
  <text x="70" y="560" font-size="14" fill="#334155">04</text>
  <text x="130" y="558" font-size="14" font-weight="bold" fill="#0f172a">3-Year 24x7 Mission-Critical SLA Support &amp; Maintenance</text>
  <text x="130" y="580" font-size="12" fill="#64748b">Comprehensive Coverage Period: 2026-03-24 to 2029-03-23 | 4-Hour MTTD</text>
  <text x="610" y="565" font-size="13" fill="#334155">998713</text>
  <text x="730" y="565" font-size="13" fill="#334155">1 PAC</text>
  <text x="810" y="565" font-size="13" fill="#334155">95,000.00</text>
  <text x="960" y="565" font-size="13" fill="#334155">95,000.00</text>
  <text x="1150" y="565" font-size="13" fill="#334155">17,100.00</text>
  <text x="1260" y="565" font-size="14" font-weight="bold" fill="#0f172a">112,100.00</text>

  <!-- Financial Tax Breakdown Table -->
  <rect x="50" y="620" width="700" height="200" fill="#ffffff" stroke="#cbd5e1" stroke-width="1"/>
  <text x="70" y="650" font-size="14" font-weight="bold" fill="#1e293b">TAX BREAKDOWN (INTER-STATE GST)</text>
  <line x1="50" y1="665" x2="750" y2="665" stroke="#cbd5e1"/>
  <text x="70" y="695" font-size="13" fill="#475569">Taxable Amount:</text>
  <text x="400" y="695" font-size="14" font-weight="bold" fill="#0f172a">INR 820,000.00</text>
  <text x="70" y="725" font-size="13" fill="#475569">Integrated GST (IGST @ 18.00%):</text>
  <text x="400" y="725" font-size="14" font-weight="bold" fill="#0f172a">INR 147,600.00</text>
  <text x="70" y="755" font-size="13" fill="#475569">Central GST (CGST @ 0.00%):</text>
  <text x="400" y="755" font-size="13" fill="#64748b">INR 0.00</text>
  <text x="70" y="785" font-size="13" fill="#475569">State GST (SGST @ 0.00%):</text>
  <text x="400" y="785" font-size="13" fill="#64748b">INR 0.00</text>
  <text x="70" y="808" font-size="12" fill="#94a3b8">HSN Codes applicable: 8471, 8418, 8536, 9987</text>

  <!-- Grand Total Summary Box -->
  <rect x="780" y="620" width="570" height="200" fill="#0f172a" rx="4"/>
  <text x="810" y="660" font-size="15" fill="#94a3b8">SUBTOTAL (TAXABLE):</text>
  <text x="1310" y="660" font-size="15" fill="#cbd5e1" text-anchor="end">INR 820,000.00</text>

  <text x="810" y="695" font-size="15" fill="#94a3b8">TOTAL TAX (IGST 18%):</text>
  <text x="1310" y="695" font-size="15" fill="#cbd5e1" text-anchor="end">INR 147,600.00</text>

  <line x1="810" y1="715" x2="1310" y2="715" stroke="#334155" stroke-width="1.5"/>

  <text x="810" y="750" font-size="20" font-weight="bold" fill="#38bdf8">GRAND INVOICE TOTAL:</text>
  <text x="1310" y="750" font-size="24" font-weight="bold" fill="#38bdf8" text-anchor="end">INR 967,600.00</text>

  <text x="810" y="785" font-size="12" fill="#94a3b8">Amount in Words: Nine Lakh Sixty-Seven Thousand Six Hundred Rupees Only</text>

  <!-- Banking & Settlement Particulars -->
  <rect x="50" y="850" width="600" height="240" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" rx="4"/>
  <text x="70" y="880" font-size="15" font-weight="bold" fill="#0f172a">WIRE REMITTANCE &amp; BANKING PARTICULARS</text>
  <line x1="50" y1="895" x2="650" y2="895" stroke="#e2e8f0"/>
  <text x="70" y="925" font-size="13" fill="#475569">Beneficiary Name:</text>
  <text x="230" y="925" font-size="13" font-weight="bold" fill="#0f172a">Apex Industrial Dynamics India Ltd.</text>
  <text x="70" y="955" font-size="13" fill="#475569">Bank Name:</text>
  <text x="230" y="955" font-size="13" fill="#0f172a">ICICI Bank Limited</text>
  <text x="70" y="985" font-size="13" fill="#475569">Branch Address:</text>
  <text x="230" y="985" font-size="13" fill="#0f172a">Nariman Point Branch, Mumbai 400021</text>
  <text x="70" y="1015" font-size="13" fill="#475569">Account Number:</text>
  <text x="230" y="1015" font-size="14" font-weight="bold" fill="#0f172a">000405018942</text>
  <text x="70" y="1045" font-size="13" fill="#475569">IFSC Code:</text>
  <text x="230" y="1045" font-size="14" font-weight="bold" fill="#0f172a">ICIC0000004</text>
  <text x="70" y="1075" font-size="13" fill="#475569">SWIFT Code:</text>
  <text x="230" y="1075" font-size="13" fill="#0f172a">ICICINBBXXX</text>

  <!-- Contractual Expiry, Warranty & Legal Policy Clauses -->
  <rect x="680" y="850" width="670" height="240" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" rx="4"/>
  <text x="700" y="880" font-size="15" font-weight="bold" fill="#0f172a">WARRANTY POLICY &amp; SLA CONTRACTUAL TERMS</text>
  <line x1="680" y1="895" x2="1350" y2="895" stroke="#e2e8f0"/>
  <text x="700" y="925" font-size="12" fill="#334155">1. <tspan font-weight="bold">Warranty Coverage:</tspan> Hardware equipment is backed by 36 months warranty covering parts &amp; labor.</text>
  <text x="700" y="945" font-size="12" fill="#334155">2. <tspan font-weight="bold">Warranty Expiration Date:</tspan> All warranty rights terminate on <tspan font-weight="bold" fill="#b91c1c">2029-03-23</tspan>.</text>
  <text x="700" y="965" font-size="12" fill="#334155">3. <tspan font-weight="bold">SLA Response Window:</tspan> 4-hour on-site response for Severity-1 downtime incidents.</text>
  <text x="700" y="985" font-size="12" fill="#334155">4. <tspan font-weight="bold">Payment Terms:</tspan> Net 30 days from invoice date. Overdue payments accrue 1.5% interest/month.</text>
  <text x="700" y="1005" font-size="12" fill="#334155">5. <tspan font-weight="bold">Inspection &amp; Claims:</tspan> Transit damage or shortages must be reported within 7 business days.</text>
  <text x="700" y="1025" font-size="12" fill="#334155">6. <tspan font-weight="bold">Jurisdiction:</tspan> All disputes governed by laws of India, subject to Mumbai jurisdiction courts.</text>
  <text x="700" y="1055" font-size="11" fill="#64748b">Computer generated invoice. Requires no physical signature under Indian IT Act 2000 provisions.</text>

  <!-- Authorized Signatory & Digital Verification Seal -->
  <line x1="50" y1="1120" x2="1350" y2="1120" stroke="#cbd5e1"/>
  <text x="60" y="1150" font-size="12" fill="#64748b">Declaration: We declare that this invoice shows the actual price of the goods and that all particulars are true and correct.</text>
  <text x="1100" y="1150" font-size="13" font-weight="bold" fill="#0f172a">For APEX INDUSTRIAL DYNAMICS INDIA LTD.</text>
  <text x="1150" y="1210" font-size="14" font-style="italic" fill="#2563eb">Sunil K. Deshmukh</text>
  <text x="1130" y="1230" font-size="12" fill="#64748b">Authorized Signatory / Financial Controller</text>

  <!-- Document Security Stamp -->
  <circle cx="1020" cy="1190" r="35" fill="none" stroke="#15803d" stroke-width="2" stroke-dasharray="4,2"/>
  <text x="1020" y="1185" font-size="10" font-weight="bold" fill="#15803d" text-anchor="middle">VERIFIED</text>
  <text x="1020" y="1200" font-size="8" fill="#15803d" text-anchor="middle">DIGITAL SEAL</text>
</svg>
`;
}

async function runRigorousOcrBenchmark() {
  console.log('\n========================================================================');
  console.log('   DOCVAULT RIGOROUS OCR & COMPLEX DOCUMENT EXTRACTION BENCHMARK        ');
  console.log('========================================================================\n');

  // Step 1: Render high-resolution image from SVG
  console.log('[Step 1] Synthesizing complex multi-column commercial tax invoice...');
  const svg = generateComplexInvoiceSvg();
  const rawPngBuffer = await sharp(Buffer.from(svg))
    .png({ quality: 95 })
    .toBuffer();

  console.log(`[Step 1 OK] Rendered document canvas (1400x1950px, PNG size: ${(rawPngBuffer.length / 1024).toFixed(1)} KB)`);

  // Step 2: Apply realistic scan conditioning (subtle scan noise & gamma)
  console.log('\n[Step 2] Conditioning image for realistic scan simulation...');
  const simulatedScanBuffer = await sharp(rawPngBuffer)
    .modulate({ brightness: 0.98, saturation: 0.95 })
    .toBuffer();

  // Save fixture on disk for inspection
  const fixturePath = path.resolve(__dirname, '../tests/fixtures/rigorous_test_invoice.png');
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, simulatedScanBuffer);
  console.log(`[Step 2 OK] Test scan fixture saved to: ${fixturePath}`);

  // Step 3: Execute Tesseract OCR Engine directly
  console.log('\n[Step 3] Running DocVault OCR Engine (Tesseract.js with Sharp Preprocessing)...');
  const t0 = performance.now();
  const extractedOcrText = await extractTextFromImage(simulatedScanBuffer);
  const t1 = performance.now();
  const ocrDurationSec = ((t1 - t0) / 1000).toFixed(2);

  console.log(`[Step 3 OK] OCR Completed in: ${ocrDurationSec} seconds.`);
  console.log(`[Metrics] Total extracted characters: ${extractedOcrText.length}`);
  console.log(`[Metrics] Total lines detected: ${extractedOcrText.split('\n').filter(Boolean).length}`);

  console.log('\n------------------------------------------------------------------------');
  console.log('                 RAW TESSERACT OCR OUTPUT (EXACT STREAM)                ');
  console.log('------------------------------------------------------------------------');
  console.log(extractedOcrText);
  console.log('------------------------------------------------------------------------\n');

  // Step 4: Run Universal Extraction & Verification Pipeline
  console.log('[Step 4] Feeding OCR output into DocVault Extraction & Verification Pipeline...');
  
  // Ensure DB connection for verification & ledger
  await mongoose.connect(config.mongoUri);

  const pipelineStart = performance.now();
  const pipelineResult = await executeDocumentExtractionPipeline({
    userId: new mongoose.Types.ObjectId(),
    buffer: simulatedScanBuffer,
    mimetype: 'image/png',
    originalname: 'Apex_Industrial_Server_Invoice_INV2026.png',
    userConsent: 'PROCESSABLE',
  });
  const pipelineEnd = performance.now();
  const pipelineDurationSec = ((pipelineEnd - pipelineStart) / 1000).toFixed(2);

  const doc = pipelineResult.document;

  console.log('\n========================================================================');
  console.log('                 FINAL STRUCTURED EXTRACTION REPORT                     ');
  console.log('========================================================================');
  console.log(`Document Title:     ${doc.title}`);
  console.log(`Classification:     ${doc.category}`);
  console.log(`Privacy Mode:       ${doc.privacyMode}`);
  console.log(`AI Policy:          ${doc.aiPolicy}`);
  console.log(`Processing Status:  ${doc.status}`);
  console.log(`Verification State: ${doc.reviewStatus}`);
  console.log(`Executive Summary:  ${doc.summary}`);
  console.log(`Derived Expiry:     ${doc.expiryDate || 'N/A'}`);
  console.log(`Pipeline Tier Used: ${pipelineResult.tierUsed}`);
  console.log(`Total Engine Time:  ${pipelineDurationSec}s (OCR: ${ocrDurationSec}s)`);

  console.log('\n--- EXTRACTED & VERIFIED KEY DETAILS (Structured Output) ---');
  console.log(JSON.stringify(doc.keyDetails, null, 2));

  console.log('\n--- VERIFICATION GATES AUDIT TRAIL ---');
  if (doc.extractedFields && doc.extractedFields.length > 0) {
    doc.extractedFields.forEach((field, i) => {
      console.log(`[Field ${i + 1}] ${field.fieldName.padEnd(20)}: ${String(field.value).padEnd(25)} | Method: ${field.extractionMethod.padEnd(10)} | Conf: ${(field.confidence * 100).toFixed(0)}% | Status: ${field.verificationStatus}`);
    });
  } else {
    console.log('No structured fields extracted.');
  }

  console.log('\n========================================================================');
  console.log('   BENCHMARK COMPLETED SUCCESSFULLY: 100% AUDIT DATA GENERATED          ');
  console.log('========================================================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

runRigorousOcrBenchmark().catch(err => {
  console.error('\n[BENCHMARK FATAL ERROR]:', err);
  process.exit(1);
});

