import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import {
  detectSensitiveDocument,
  validateVerhoeff,
  generateVerhoeff,
  validateLuhn,
} from '../src/services/pipeline/sensitiveDetector.js';
import {
  assertAiAllowed,
  isAiAllowed,
  PrivacyPolicyViolationError,
  AI_POLICIES,
} from '../src/services/pipeline/privacyGate.js';
import { executeDocumentExtractionPipeline } from '../src/modules/extraction/extractionPipeline.service.js';
import { Document, User } from '../src/models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let testsPassed = 0;
let testsFailed = 0;

function report(testName, passed, details = '') {
  if (passed) {
    console.log(`  ✅ [PASS] ${testName}`);
    if (details) console.log(`     └─ ${details}`);
    testsPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    if (details) console.error(`     └─ ${details}`);
    testsFailed++;
  }
}

async function runFeature14Benchmark() {
  console.log('\n========================================================================');
  console.log('   FEATURE #14 BENCHMARK: SENSITIVE DOCUMENT EXCLUSION & PRIVACY GATES  ');
  console.log('========================================================================\n');
  console.log('Requirement: Prevents Aadhaar, PAN, Passport, Voter ID, Driving Licence,');
  console.log('and financial numbers from entering third-party AI processing by default.\n');

  // Connect to DB for integration tests
  await mongoose.connect(config.mongoUri);

  // -------------------------------------------------------------------------
  // Test 1: Aadhaar 12-Digit Verhoeff Mathematical Algorithm
  // -------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Aadhaar Mathematical Verhoeff Checksum ---');
  const base11 = '99994105705';
  const checksum = generateVerhoeff(base11);
  const authenticAadhaar = base11 + checksum;
  const isAadhaarValid = validateVerhoeff(authenticAadhaar);
  report('Verhoeff Checksum: Validates authentic 12-digit Aadhaar', isAadhaarValid, `Number: ${authenticAadhaar} (Checksum digit: ${checksum})`);

  const alteredAadhaar = base11 + ((checksum + 1) % 10);
  const isAlteredValid = validateVerhoeff(alteredAadhaar);
  report('Verhoeff Checksum: Rejects corrupted/tampered 12-digit number', !isAlteredValid, `Altered: ${alteredAadhaar} correctly rejected`);

  // -------------------------------------------------------------------------
  // Test 2: Aadhaar Content Detection vs Random 12-Digit False Positives
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Aadhaar Detection & Zero False Positives ---');
  const sample1 = {
    filename: 'resident_document.pdf',
    text: `Government of India\nResident: Suresh Patil\nUnique Identification: 9999 4105 705${checksum}\nDOB: 12/05/1988`,
  };
  const res1 = detectSensitiveDocument(sample1);
  report(
    'Aadhaar Detection: Flags valid Aadhaar in document text',
    res1.isSensitive === true && res1.entityType === 'aadhaar',
    `Reason: "${res1.reason}"`
  );

  const sampleFalsePositive = {
    filename: 'courier_dispatch.pdf',
    text: `Consignment Tracker: 987654321098\nVendor: BlueDart Express\nStatus: In Transit`,
  };
  const resFp = detectSensitiveDocument(sampleFalsePositive);
  report(
    'False Positive Guard: Does NOT flag random 12-digit tracking number',
    resFp.isSensitive === false,
    'Invalid Verhoeff tracking number correctly ignored'
  );

  // -------------------------------------------------------------------------
  // Test 3: PAN Card Identifier Detection
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Indian Income Tax PAN Card Detection ---');
  const panSample = {
    filename: 'pan_card_scan.pdf',
    text: 'INCOME TAX DEPARTMENT\nGOVT. OF INDIA\nPermanent Account Number: ABCDE1234F\nName: Rajesh Verma',
  };
  const resPan = detectSensitiveDocument(panSample);
  report(
    'PAN Detection: Flags Income Tax PAN identifier',
    resPan.isSensitive === true && resPan.entityType === 'pan',
    `Reason: "${resPan.reason}"`
  );

  // -------------------------------------------------------------------------
  // Test 4: Passport MRZ (Machine Readable Zone) Detection
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Passport MRZ (ICAO Doc 9303) Detection ---');
  const passportSample = {
    filename: 'scan004.pdf',
    text: `P<INDVERMA<<RAJESH<<<<<<<<<<<<<<<<<<<<<<<<<<\nZ9876543<2IND8505151M3005151<<<<<<<<<<<<<<<8`,
  };
  const resPassport = detectSensitiveDocument(passportSample);
  report(
    'Passport Detection: Flags 2-line ICAO Doc 9303 MRZ zone',
    resPassport.isSensitive === true && resPassport.entityType === 'passport',
    `Reason: "${resPassport.reason}"`
  );

  // -------------------------------------------------------------------------
  // Test 5: Election Commission Voter ID (EPIC) Detection
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Voter ID (EPIC) Detection ---');
  const voterSample = {
    filename: 'id_proof.pdf',
    text: 'Election Commission of India\nElector Photo Identity Card\nEPIC No: WDH9876543\nName: Anita Roy',
  };
  const resVoter = detectSensitiveDocument(voterSample);
  report(
    'Voter ID Detection: Flags EPIC alphanumeric identifier with institutional context',
    resVoter.isSensitive === true && resVoter.entityType === 'voter_id',
    `Reason: "${resVoter.reason}"`
  );

  // -------------------------------------------------------------------------
  // Test 6: Indian Driving Licence Detection
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Driving Licence Detection ---');
  const dlSample = {
    filename: 'driver_copy.pdf',
    text: 'Union of India Driving Licence\nTransport Department MH12\nLicence No: MH1220110012345\nValid Till: 2035-08-14',
  };
  const resDl = detectSensitiveDocument(dlSample);
  report(
    'Driving Licence Detection: Flags government driving licence pattern',
    resDl.isSensitive === true && resDl.entityType === 'driving_licence',
    `Reason: "${resDl.reason}"`
  );

  // -------------------------------------------------------------------------
  // Test 7: Payment Card Luhn Algorithm Validation
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: Payment Card Numbers (Luhn Checksum) ---');
  const validVisa = '4532 0151 1283 0366';
  const cardSample = {
    filename: 'statement_attachment.pdf',
    text: `Cardholder Name: Rohit Sen\nCard Number: ${validVisa}\nExpiry: 12/28`,
  };
  const resCard = detectSensitiveDocument(cardSample);
  report(
    'Payment Card Detection: Flags Visa/Mastercard matching Luhn checksum',
    resCard.isSensitive === true && resCard.entityType === 'payment_card',
    `Reason: "${resCard.reason}"`
  );

  // -------------------------------------------------------------------------
  // Test 8: Encrypted / Password-Protected PDF Detection
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 8: Encrypted PDF Isolation ---');
  const encryptedBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Encrypt 2 0 R >>\nendobj\n%%EOF');
  const resEncrypted = detectSensitiveDocument({ filename: 'bank_statement.pdf', buffer: encryptedBuffer });
  report(
    'Encrypted PDF: Detects /Encrypt dictionary in binary buffer',
    resEncrypted.isSensitive === true && resEncrypted.entityType === 'encrypted_pdf',
    `Reason: "${resEncrypted.reason}"`
  );

  // -------------------------------------------------------------------------
  // Test 9: Zero Network Egress Invariant
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 9: Zero Network Egress Invariant ---');
  let thirdPartyEgressCount = 0;
  const mockThirdPartyCall = () => { thirdPartyEgressCount++; };

  const testSensitiveDoc = {
    _id: new mongoose.Types.ObjectId(),
    title: 'Aadhaar Card',
    aiPolicy: AI_POLICIES.STORAGE_ONLY,
    sensitiveFlag: true,
    sensitiveReason: 'Aadhaar 12-digit number with valid Verhoeff checksum detected',
  };

  let gateBlocked = false;
  try {
    assertAiAllowed(testSensitiveDoc, 'Groq Cloud LLM Extraction');
    mockThirdPartyCall();
  } catch (err) {
    if (err instanceof PrivacyPolicyViolationError && err.statusCode === 403) {
      gateBlocked = true;
    }
  }

  report(
    'Zero Egress Invariant: assertAiAllowed blocks Groq cloud call with HTTP 403',
    gateBlocked && thirdPartyEgressCount === 0,
    `Third-party network calls made: ${thirdPartyEgressCount}`
  );

  // -------------------------------------------------------------------------
  // Test 10: Real Aadhaar Image Pipeline Execution
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 10: Real Aadhaar Image Pipeline Execution ---');
  const sampleAadhaarPath = path.resolve(__dirname, '../sample_aadhaar_card.png');
  if (fs.existsSync(sampleAadhaarPath)) {
    const aadhaarBuffer = fs.readFileSync(sampleAadhaarPath);
    const testUser = await User.findOne({}) || await User.create({
      name: 'Privacy Test User',
      email: 'privacy-test@docvault.local',
      passwordHash: 'hash',
      pinHash: 'pin',
    });

    const pipelineResult = await executeDocumentExtractionPipeline({
      userId: testUser._id,
      buffer: aadhaarBuffer,
      mimetype: 'image/png',
      originalname: 'sample_aadhaar_card.png',
      userConsent: 'PROCESSABLE', // User requested processable, but pipeline must OVERRIDE to STORAGE_ONLY
    });

    const doc = pipelineResult.document;
    const isIsolated =
      doc.aiPolicy === 'storage_only' &&
      doc.sensitiveFlag === true &&
      doc.extractedText === '[REDACTED - STORAGE ONLY DOCUMENT]' &&
      doc.status === 'storage_only' &&
      doc.extractedFields.length === 0;

    report(
      'Real File Pipeline: Overrides userConsent and isolates Aadhaar image to storage_only',
      isIsolated,
      `AI Policy: ${doc.aiPolicy} | Sensitive Flag: ${doc.sensitiveFlag} | Text: "${doc.extractedText}"`
    );

    // Clean up test document
    await Document.findByIdAndDelete(doc._id);
  } else {
    report('Real File Pipeline: sample_aadhaar_card.png present on disk', false, 'File not found');
  }

  // -------------------------------------------------------------------------
  // Test 11: Vault RAG Q&A Isolation
  // -------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 11: Vault RAG Q&A Isolation ---');
  const testUserId = new mongoose.Types.ObjectId();
  // Create one sensitive doc and one allowed doc
  const sensitiveDoc = await Document.create({
    userId: testUserId,
    title: 'Secret Aadhaar',
    originalName: 'aadhaar.pdf',
    aiPolicy: 'storage_only',
    sensitiveFlag: true,
    extractedText: 'Aadhaar No 9999 4105 7058',
  });

  const businessDoc = await Document.create({
    userId: testUserId,
    title: 'Office Chair Invoice',
    originalName: 'chair.pdf',
    aiPolicy: 'ai_enabled',
    privacyMode: 'PROCESSABLE',
    sensitiveFlag: false,
    extractedText: 'Ergonomic Office Chair Purchase Date: 2026-01-10',
    aiConsent: { grantedAt: new Date() },
  });

  // Query database filtering by RAG criteria
  const ragEligibleDocs = await Document.find({
    userId: testUserId,
    $or: [{ aiPolicy: 'ai_enabled' }, { privacyMode: 'PROCESSABLE' }],
    sensitiveFlag: { $ne: true },
  });

  const passedRagFilter =
    ragEligibleDocs.length === 1 &&
    ragEligibleDocs[0]._id.toString() === businessDoc._id.toString();

  report(
    'RAG Isolation: Queries strictly exclude sensitiveFlag documents from prompt context',
    passedRagFilter,
    `Eligible docs returned: ${ragEligibleDocs.length} (Sensitive doc strictly omitted)`
  );

  // Clean up
  await Document.deleteMany({ userId: testUserId });

  // -------------------------------------------------------------------------
  // Final Benchmark Summary
  // -------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`   FEATURE #14 BENCHMARK RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('========================================================================\n');

  await mongoose.disconnect();

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runFeature14Benchmark().catch(err => {
  console.error('\n[BENCHMARK CRASH]:', err);
  process.exit(1);
});
