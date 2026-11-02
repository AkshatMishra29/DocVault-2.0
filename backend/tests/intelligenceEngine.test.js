import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  Entity,
  Relationship,
  DocumentFact,
  ConflictRecord,
  DocumentVersionGroup,
  IntelligenceAlert,
  VerificationRecord,
  User,
  Document,
  Asset,
  ENTITY_TYPES,
  RELATIONSHIP_TYPES,
  ALERT_TYPES,
  ALERT_SEVERITY,
  ALERT_STATUS,
  CONFLICT_STATUS,
  VERIFICATION_RESULTS,
} from '../src/models/index.js';
import {
  createOrUpdateEntity,
  getUserEntities,
  getEntityById,
  deleteEntity,
} from '../src/modules/intelligence/services/entity.service.js';
import {
  createOrUpdateRelationship,
  getEntityRelationships,
  traverseGraph,
} from '../src/modules/intelligence/services/relationship.service.js';
import {
  syncDocumentFacts,
  getDocumentFacts,
  normalizeFactValue,
} from '../src/modules/intelligence/services/fact.service.js';
import {
  calculateDocumentHealth,
  HEALTH_STATUS,
} from '../src/modules/intelligence/services/health.service.js';
import {
  evaluateEntityCompleteness,
  DEFAULT_REQUIREMENTS,
} from '../src/modules/intelligence/services/completeness.service.js';
import {
  detectEntityFactConflicts,
  resolveConflict,
} from '../src/modules/intelligence/services/conflict.service.js';
import {
  compareDocumentVersions,
  addDocumentVersion,
} from '../src/modules/intelligence/services/version.service.js';
import {
  emitAlert,
  getUserAlerts,
  dismissAlert,
  resolveAlert,
} from '../src/modules/intelligence/services/alert.service.js';
import {
  inspectPdfDigitalSignature,
  verifyDocumentAuthenticity,
} from '../src/modules/intelligence/services/authenticity.service.js';
import {
  assertFamilyAccessPermission,
  resolvePersonEntity,
  executeFamilyAwareRetrieval,
} from '../src/modules/intelligence/services/familyAccess.service.js';
import { assertAiAllowed, PrivacyPolicyViolationError } from '../src/services/pipeline/privacyGate.js';

let passedCount = 0;
let failedCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    └─ ${err.message}`);
    failedCount++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    └─ ${err.message}`);
    failedCount++;
  }
}

async function runIntelligenceTests() {
  console.log('\n======================================================');
  console.log('   DOCUMENT INTELLIGENCE & HEALTH ENGINE (DIHE) TESTS ');
  console.log('======================================================\n');

  const userAId = new mongoose.Types.ObjectId();
  const userBId = new mongoose.Types.ObjectId();

  // -------------------------------------------------------------------------
  // 1 & 3: Creating Entities & Preventing Duplicates
  // -------------------------------------------------------------------------
  console.log('--- 1. Entity Creation & Deduplication ---');
  let entityCarA;
  let entityCarADup;

  await asyncTest('Entity: Creates new VEHICLE entity', async () => {
    entityCarA = await createOrUpdateEntity({
      userId: userAId,
      entityType: ENTITY_TYPES.VEHICLE,
      name: 'Honda City ZX',
      attributes: { registrationNumber: 'DL01AB1234', color: 'White' },
      aliases: ['My Honda', 'City'],
    });

    assert.equal(entityCarA.name, 'Honda City ZX');
    assert.equal(entityCarA.normalizedName, 'honda city zx');
    assert.equal(entityCarA.entityType, ENTITY_TYPES.VEHICLE);
    assert.equal(entityCarA.userId.toString(), userAId.toString());
  });

  await asyncTest('Deduplication: Merges attributes on identical normalized name instead of creating duplicate', async () => {
    entityCarADup = await createOrUpdateEntity({
      userId: userAId,
      entityType: ENTITY_TYPES.VEHICLE,
      name: '  Honda   City ZX  ', // different spacing
      attributes: { fuel: 'Petrol' },
      aliases: ['Family Car'],
    });

    assert.equal(entityCarADup._id.toString(), entityCarA._id.toString());
    assert.equal(entityCarADup.attributes.fuel, 'Petrol');
    assert.equal(entityCarADup.attributes.color, 'White');
    assert.ok(entityCarADup.aliases.includes('Family Car'));
  });

  // -------------------------------------------------------------------------
  // 2: Creating Relationships
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Relationship Management ---');
  let entityPersonA;
  let relOwns;

  await asyncTest('Relationship: Creates verified OWNS relationship between Person and Vehicle', async () => {
    entityPersonA = await createOrUpdateEntity({
      userId: userAId,
      entityType: ENTITY_TYPES.PERSON,
      name: 'Rahul Sharma',
      aliases: ['Dad', 'Me'],
      attributes: { role: 'Father' },
    });

    relOwns = await createOrUpdateRelationship({
      userId: userAId,
      fromEntityId: entityPersonA._id,
      relationshipType: RELATIONSHIP_TYPES.OWNS,
      toEntityId: entityCarA._id,
      confidence: 1.0,
      verificationStatus: 'confirmed',
    });

    assert.equal(relOwns.relationshipType, RELATIONSHIP_TYPES.OWNS);
    assert.equal(relOwns.fromEntityId.toString(), entityPersonA._id.toString());
    assert.equal(relOwns.toEntityId.toString(), entityCarA._id.toString());
  });

  // -------------------------------------------------------------------------
  // 4: Preventing Cross-User Graph Access
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Tenant Isolation & Cross-User Security ---');
  await asyncTest('Security: User B cannot access User A entity (Returns null)', async () => {
    const crossAccess = await getEntityById(entityCarA._id, userBId);
    assert.equal(crossAccess, null, 'User B must not be able to retrieve User A entity');
  });

  await asyncTest('Security: User B cannot create relationship to User A entity', async () => {
    const entityUserB = await createOrUpdateEntity({
      userId: userBId,
      entityType: ENTITY_TYPES.VEHICLE,
      name: 'User B Car',
    });

    let prevented = false;
    try {
      await createOrUpdateRelationship({
        userId: userBId,
        fromEntityId: entityUserB._id,
        relationshipType: RELATIONSHIP_TYPES.OWNS,
        toEntityId: entityCarA._id, // User A's car!
      });
    } catch (err) {
      prevented = true;
    }

    assert.ok(prevented, 'Cross-user entity connection must be blocked');
  });

  // -------------------------------------------------------------------------
  // 5: Family Access Permission Gate
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Family Access Authorization Gate ---');
  await asyncTest('Family Gate: Denies access when entity does not match user or family', async () => {
    let denied = false;
    try {
      await assertFamilyAccessPermission(userBId, entityPersonA._id);
    } catch (err) {
      if (err.statusCode === 403 || err.message.includes('denied')) {
        denied = true;
      }
    }
    assert.ok(denied, 'Family gate must reject unauthorized user access');
  });

  await asyncTest('Family Gate: Resolves relation term "Dad" to verified Person entity', async () => {
    const resolved = await resolvePersonEntity(userAId, 'Dad');
    assert.ok(resolved);
    assert.equal(resolved._id.toString(), entityPersonA._id.toString());
  });

  // -------------------------------------------------------------------------
  // 6: Extracting Facts with Source References
  // -------------------------------------------------------------------------
  console.log('\n--- 5. Document Facts & Normalization ---');
  test('Fact Normalizer: Formats dates, amounts, and identifiers', () => {
    const normDate = normalizeFactValue('invoice_date', '15/08/2026');
    assert.equal(normDate.normalized, '2026-08-15');
    assert.equal(normDate.type, 'date');

    const normAmt = normalizeFactValue('total_amount', '₹ 45,999.50');
    assert.equal(normAmt.normalized, 45999.5);
    assert.equal(normAmt.type, 'amount');

    const normReg = normalizeFactValue('registration_number', 'dl 01 ab-1234');
    assert.equal(normReg.normalized, 'DL01AB1234');
    assert.equal(normReg.type, 'identifier');
  });

  // -------------------------------------------------------------------------
  // 7 & 8: Calculating Document Health (Valid, Expiring Soon, Expired, Unknown)
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Deterministic Document Health Engine ---');
  test('Health Engine: Marks future date outside warning threshold as VALID', () => {
    const futureDoc = {
      category: 'Insurance Policy',
      expiryDate: '2028-12-31',
      status: 'completed',
    };
    const health = calculateDocumentHealth(futureDoc);
    assert.equal(health.status, HEALTH_STATUS.VALID);
    assert.ok(health.daysLeft > 30);
  });

  test('Health Engine: Marks date within 30-day warning threshold as EXPIRING_SOON', () => {
    const today = new Date();
    const nearFuture = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days ahead
    const isoDate = nearFuture.toISOString().slice(0, 10);

    const expiringDoc = {
      category: 'Motor Insurance',
      expiryDate: isoDate,
      status: 'completed',
    };
    const health = calculateDocumentHealth(expiringDoc);
    assert.equal(health.status, HEALTH_STATUS.EXPIRING_SOON);
    assert.equal(health.daysLeft, 10);
  });

  test('Health Engine: Marks past date as EXPIRED', () => {
    const expiredDoc = {
      category: 'Pollution Certificate',
      expiryDate: '2024-01-01',
      status: 'completed',
    };
    const health = calculateDocumentHealth(expiredDoc);
    assert.equal(health.status, HEALTH_STATUS.EXPIRED);
    assert.ok(health.daysLeft < 0);
  });

  test('Health Engine: Missing expiry date returns UNKNOWN', () => {
    const noExpiryDoc = {
      category: 'Purchase Receipt',
      expiryDate: null,
      status: 'completed',
    };
    const health = calculateDocumentHealth(noExpiryDoc);
    assert.equal(health.status, HEALTH_STATUS.UNKNOWN);
  });

  test('Health Engine: Unparseable date returns NEEDS_REVIEW', () => {
    const invalidDoc = {
      category: 'Warranty Document',
      expiryDate: 'Not a real date',
      status: 'completed',
    };
    const health = calculateDocumentHealth(invalidDoc);
    assert.equal(health.status, HEALTH_STATUS.NEEDS_REVIEW);
  });

  // -------------------------------------------------------------------------
  // 9 & 10: Detecting Conflicting Values Across Documents & Non-Destructive Resolution
  // -------------------------------------------------------------------------
  console.log('\n--- 7. Information Conflict Detection & Resolution ---');
  let conflictRecord;

  await asyncTest('Conflict Engine: Detects mismatched registration number on same entity', async () => {
    const docA = await Document.create({
      userId: userAId,
      title: 'Registration Certificate',
      originalName: 'rc.pdf',
    });
    const docB = await Document.create({
      userId: userAId,
      title: 'Motor Insurance Policy',
      originalName: 'insurance.pdf',
    });

    // Create 2 conflicting facts
    await DocumentFact.create([
      {
        userId: userAId,
        documentId: docA._id,
        entityId: entityCarA._id,
        fieldName: 'registration_number',
        normalizedValue: 'DL01AB1234',
        originalValue: 'DL 01 AB 1234',
        valueType: 'identifier',
      },
      {
        userId: userAId,
        documentId: docB._id,
        entityId: entityCarA._id,
        fieldName: 'registration_number',
        normalizedValue: 'DL01AB9999', // Discrepancy!
        originalValue: 'DL-01-AB-9999',
        valueType: 'identifier',
      },
    ]);

    const conflicts = await detectEntityFactConflicts(entityCarA._id, userAId);
    assert.ok(conflicts.length >= 1);
    conflictRecord = conflicts[0];
    assert.equal(conflictRecord.fieldName, 'registration_number');
    assert.equal(conflictRecord.status, CONFLICT_STATUS.OPEN);
  });

  await asyncTest('Conflict Resolution: Resolves conflict as KEEP_A preserving original evidence', async () => {
    const resolved = await resolveConflict({
      conflictId: conflictRecord._id,
      userId: userAId,
      resolution: 'KEEP_A',
      notes: 'Verified against official RC physical card',
    });

    assert.equal(resolved.status, CONFLICT_STATUS.RESOLVED);
    assert.equal(resolved.resolution, 'KEEP_A');
    assert.equal(resolved.resolvedValue, conflictRecord.factAValue);
    assert.equal(resolved.factAValue, conflictRecord.factAValue);
    assert.equal(resolved.factBValue, conflictRecord.factBValue); // both preserved!
  });

  // -------------------------------------------------------------------------
  // 11 & 12: Matching Document Versions & Field Diffs
  // -------------------------------------------------------------------------
  console.log('\n--- 8. Document Version Intelligence ---');
  await asyncTest('Version Intelligence: Compares versions and identifies changed fields', async () => {
    const fakeDocA = await Document.create({
      userId: userAId,
      title: 'Motor Policy 2025',
      originalName: 'policy2025.pdf',
      category: 'Insurance Policy',
      expiryDate: '2025-10-15',
    });

    const fakeDocB = await Document.create({
      userId: userAId,
      title: 'Motor Policy 2026',
      originalName: 'policy2026.pdf',
      category: 'Insurance Policy',
      expiryDate: '2026-10-15',
    });

    await DocumentFact.create([
      {
        userId: userAId,
        documentId: fakeDocA._id,
        fieldName: 'premium_amount',
        normalizedValue: 12500,
        valueType: 'amount',
      },
      {
        userId: userAId,
        documentId: fakeDocB._id,
        fieldName: 'premium_amount',
        normalizedValue: 13800,
        valueType: 'amount',
      },
    ]);

    const diff = await compareDocumentVersions({
      documentAId: fakeDocA._id,
      documentBId: fakeDocB._id,
      userId: userAId,
    });

    assert.ok(diff.differencesCount >= 1);
    const premiumDiff = diff.differences.find(d => d.fieldName === 'premium_amount');
    assert.ok(premiumDiff);
    assert.equal(premiumDiff.oldValue, 12500);
    assert.equal(premiumDiff.newValue, 13800);

    // Clean up test documents
    await Document.deleteMany({ _id: { $in: [fakeDocA._id, fakeDocB._id] } });
  });

  // -------------------------------------------------------------------------
  // 13: Detecting Missing Checklist Items
  // -------------------------------------------------------------------------
  console.log('\n--- 9. Document Completeness & Missing Detection ---');
  await asyncTest('Completeness: Identifies potentially missing vehicle documents without claiming non-existence', async () => {
    const vehicleEntity = await createOrUpdateEntity({
      userId: userAId,
      entityType: ENTITY_TYPES.VEHICLE,
      name: 'Hyundai Creta',
      linkedDocumentIds: [], // Empty! No docs linked yet
    });

    const completeness = await evaluateEntityCompleteness(vehicleEntity._id, userAId);
    assert.equal(completeness.hasTemplate, true);
    assert.ok(completeness.items.length >= 2);

    const rcItem = completeness.items.find(i => i.requirementKey === 'registration_certificate');
    assert.ok(rcItem);
    assert.equal(rcItem.status, 'POTENTIALLY_MISSING');
    assert.equal(rcItem.stateLabel, 'Not found in DocVault'); // Crucial phrasing invariant
  });

  // -------------------------------------------------------------------------
  // 14: Avoiding Duplicate Alerts
  // -------------------------------------------------------------------------
  console.log('\n--- 10. Proactive Alerts & Deduplication ---');
  await asyncTest('Alerts: Enforces deduplicationKey and prevents duplicate alert spam', async () => {
    const dedupKey = 'test_alert_dedup_001';

    const a1 = await emitAlert({
      userId: userAId,
      alertType: ALERT_TYPES.DOCUMENT_EXPIRY,
      severity: ALERT_SEVERITY.CRITICAL,
      title: 'Policy Expiring Soon',
      message: 'Initial notice',
      deduplicationKey: dedupKey,
    });

    const a2 = await emitAlert({
      userId: userAId,
      alertType: ALERT_TYPES.DOCUMENT_EXPIRY,
      severity: ALERT_SEVERITY.CRITICAL,
      title: 'Policy Expiring Soon Updated',
      message: 'Updated notice',
      deduplicationKey: dedupKey, // same key
    });

    assert.equal(a1._id.toString(), a2._id.toString(), 'Must return existing alert record, not insert duplicate');
    assert.equal(a2.message, 'Updated notice');

    // Dismiss alert
    const dismissed = await dismissAlert(a1._id, userAId);
    assert.equal(dismissed.status, ALERT_STATUS.DISMISSED);
  });

  // -------------------------------------------------------------------------
  // 15: Document Deletion and Relationship Cleanup
  // -------------------------------------------------------------------------
  console.log('\n--- 11. Relationship Cleanup on Entity Deletion ---');
  await asyncTest('Cleanup: Deleting entity cascades and cleans up connected relationship edges', async () => {
    const tempEntity = await createOrUpdateEntity({
      userId: userAId,
      entityType: ENTITY_TYPES.PRODUCT,
      name: 'Temp AC',
    });

    const tempRel = await createOrUpdateRelationship({
      userId: userAId,
      fromEntityId: entityPersonA._id,
      relationshipType: RELATIONSHIP_TYPES.OWNS,
      toEntityId: tempEntity._id,
    });

    await deleteEntity(tempEntity._id, userAId);

    const relCheck = await Relationship.findById(tempRel._id);
    assert.equal(relCheck, null, 'Connected relationship must be deleted when entity is deleted');
  });

  // -------------------------------------------------------------------------
  // 16: Preventing Sensitive Documents From Prohibited AI Pipelines
  // -------------------------------------------------------------------------
  console.log('\n--- 12. Privacy Gate: Sensitive Document Invariant ---');
  test('Privacy Invariant: assertAiAllowed strictly blocks storage_only and sensitiveFlag docs', () => {
    const sensitiveDoc = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Aadhaar Card',
      aiPolicy: 'storage_only',
      sensitiveFlag: true,
      sensitiveReason: 'Aadhaar 12-digit number with valid Verhoeff detected',
    };

    let blocked = false;
    try {
      assertAiAllowed(sensitiveDoc, 'HuggingFace Embedding Call');
    } catch (err) {
      if (err instanceof PrivacyPolicyViolationError && err.statusCode === 403) {
        blocked = true;
      }
    }

    assert.ok(blocked, 'assertAiAllowed must throw 403 PrivacyPolicyViolationError');
  });

  // -------------------------------------------------------------------------
  // 17 & 18: Authenticity Verification & Malformed Buffer Handling
  // -------------------------------------------------------------------------
  console.log('\n--- 13. Authenticity Verification Framework ---');
  test('Authenticity: Detects PKCS#7 / ByteRange in signed PDF buffer', () => {
    const fakeSignedPdf = Buffer.from('%PDF-1.4\n/ByteRange [0 100 200 300]\n/Contents <30820...>\n/Sig\n/SubFilter /adbe.pkcs7.detached\n%%EOF');
    const check = inspectPdfDigitalSignature(fakeSignedPdf);

    assert.equal(check.hasSignature, true);
    assert.equal(check.provider, 'PKCS#7_X509_STANDARD');
  });

  test('Authenticity: Correctly marks unsigned plain PDF as VERIFICATION_UNAVAILABLE', () => {
    const plainPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
    const check = inspectPdfDigitalSignature(plainPdf);

    assert.equal(check.hasSignature, false);
    assert.ok(check.reason.includes('No cryptographic digital signature'));
  });

  test('Authenticity: Handles corrupt / malformed buffer gracefully without crashing', () => {
    const corruptBuffer = Buffer.from([0x00, 0x11, 0x22, 0xff]);
    const check = inspectPdfDigitalSignature(corruptBuffer);
    assert.equal(check.hasSignature, false);
  });

  // Clean up test data created in this test run
  await Promise.all([
    Entity.deleteMany({ userId: { $in: [userAId, userBId] } }),
    Relationship.deleteMany({ userId: { $in: [userAId, userBId] } }),
    DocumentFact.deleteMany({ userId: { $in: [userAId, userBId] } }),
    ConflictRecord.deleteMany({ userId: { $in: [userAId, userBId] } }),
    IntelligenceAlert.deleteMany({ userId: { $in: [userAId, userBId] } }),
  ]);

  console.log('\n======================================================');
  console.log(`   DIHE TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (Total: ${passedCount + failedCount})`);
  console.log('======================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

// Connect to MongoDB Atlas and run tests
import { config } from '../src/config/index.js';

mongoose.connect(config.mongoUri)
  .then(() => runIntelligenceTests())
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
