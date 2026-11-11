import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { User } from '../src/modules/auth/auth.model.js';
import { Document } from '../src/modules/documents/document.model.js';
import { Asset } from '../src/modules/assets/asset.model.js';
import { Expense } from '../src/modules/assets/expense.model.js';
import { Deadline } from '../src/modules/deadlines/deadline.model.js';
import { ConnectionService } from '../src/modules/sharing/connection.service.js';
import { DocumentAccessControlService } from '../src/modules/sharing/accessControl.service.js';
import { DocumentShareService } from '../src/modules/sharing/documentShare.service.js';
import { CentralShareAccessService } from '../src/modules/sharing/centralShareAccess.service.js';
import { DocumentShare } from '../src/modules/sharing/models/index.js';
import { config } from '../src/config/index.js';

describe('DocVault Master Integration Test Suite (Modules 5, 6 & 7)', () => {
  let userA, userB, userC;
  let carAsset, carInsuranceDoc, privateTaxDoc;
  let activeShare;

  it('Setup: Connect to Atlas DB and initialize 3 distinct test users (A, B, C)', async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(config.mongoUri);
    }

    const nonce = Date.now();
    userA = await User.create({
      name: `User Father A_${nonce}`,
      email: `father_${nonce}@example.com`,
      phone: `+9198${String(nonce).slice(-8)}`,
      passwordHash: 'hash',
      pinHash: 'dummy_pin_hash',
      docVaultId: `DV-FA${String(nonce).slice(-4)}`
    });

    userB = await User.create({
      name: `User Son B_${nonce}`,
      email: `son_${nonce}@example.com`,
      phone: `+9197${String(nonce).slice(-8)}`,
      passwordHash: 'hash',
      pinHash: 'dummy_pin_hash',
      docVaultId: `DV-SB${String(nonce).slice(-4)}`
    });

    userC = await User.create({
      name: `User Stranger C_${nonce}`,
      email: `stranger_${nonce}@example.com`,
      phone: `+9196${String(nonce).slice(-8)}`,
      passwordHash: 'hash',
      pinHash: 'dummy_pin_hash',
      docVaultId: `DV-SC${String(nonce).slice(-4)}`
    });

    assert.ok(userA._id && userB._id && userC._id);
    assert.notStrictEqual(userA.docVaultId, userB.docVaultId);
  });

  it('Module 5: Create Vehicle Asset and link Insurance document with Expiry Deadline', async () => {
    carInsuranceDoc = await Document.create({
      userId: userA._id,
      title: 'HDFC ERGO Motor Policy',
      originalName: 'motor_policy.pdf',
      category: 'Insurance Policy',
      format: 'PDF',
      mimetype: 'application/pdf',
      fileData: Buffer.from('%PDF-1.4 Mock Car Insurance Content').toString('base64'),
      sizeBytes: 1024,
      fileSizeFormatted: '1.0 KB',
      expiryDate: '2026-11-20',
      keyDetails: { 'POLICY NUMBER': 'POL-99214', 'SUM INSURED': '1500000' }
    });

    privateTaxDoc = await Document.create({
      userId: userA._id,
      title: 'Private Bank Tax Certificate',
      originalName: 'tax_cert.pdf',
      category: 'Financial',
      format: 'PDF',
      mimetype: 'application/pdf',
      fileData: Buffer.from('%PDF-1.4 Mock Tax Content').toString('base64'),
      sizeBytes: 2048,
      fileSizeFormatted: '2.0 KB'
    });

    carAsset = await Asset.create({
      userId: userA._id,
      name: 'Toyota Fortuner 4x4',
      category: 'Vehicle',
      purchasePrice: 4200000,
      purchaseDate: '2024-05-10',
      insuranceExpiry: '2026-11-20',
      linkedDocumentIds: [carInsuranceDoc._id]
    });

    const serviceExpense = await Expense.create({
      userId: userA._id,
      assetId: carAsset._id,
      vendor: 'Toyota Official Plaza',
      amount: 14500,
      date: '2025-01-15',
      category: 'Maintenance'
    });

    assert.strictEqual(carAsset.name, 'Toyota Fortuner 4x4');
    assert.strictEqual(carAsset.linkedDocumentIds.length, 1);
    assert.strictEqual(serviceExpense.amount, 14500);
  });

  it('Module 6: Mutual Connection flow between User A and User B (Two-way acceptance)', async () => {
    const sendAtoB = await ConnectionService.sendRequest(userA._id, userB.docVaultId);
    assert.strictEqual(sendAtoB.success, true);

    const canReceiveBefore = await ConnectionService.canReceiveFromOwner(userB._id, userA._id);
    assert.strictEqual(canReceiveBefore, false);

    const acceptB = await ConnectionService.acceptRequest(userB._id, sendAtoB.requestId);
    assert.strictEqual(acceptB.success, true);

    const sendBtoA = await ConnectionService.sendRequest(userB._id, userA.docVaultId);
    assert.strictEqual(sendBtoA.success, true);
    const acceptA = await ConnectionService.acceptRequest(userA._id, sendBtoA.requestId);
    assert.strictEqual(acceptA.success, true);
    assert.strictEqual(acceptA.isMutual, true);

    const canReceiveAfter = await ConnectionService.canReceiveFromOwner(userB._id, userA._id);
    assert.strictEqual(canReceiveAfter, true);

    const canReceiveStranger = await ConnectionService.canReceiveFromOwner(userC._id, userA._id);
    assert.strictEqual(canReceiveStranger, false);
  });

  it('Module 7: Secure Document Sharing & Central Access Control', async () => {
    const shareRes = await DocumentShareService.createShare(userA._id, {
      documentIds: [carInsuranceDoc._id],
      purpose: 'Vehicle Insurance Access for Son',
      shareType: 'CONNECTION',
      recipientUserId: userB._id,
      permissions: { view: true, download: false },
      expiresInHours: 24,
      watermarkEnabled: true,
      watermarkCustomText: 'SON B PRIVATE VIEW'
    });

    activeShare = shareRes.share;
    assert.ok(activeShare._id);
    assert.strictEqual(activeShare.status, 'ACTIVE');

    const authViewB = await CentralShareAccessService.authorizeShareAccess({
      shareId: activeShare._id,
      documentId: carInsuranceDoc._id,
      action: 'view',
      userId: userB._id
    });
    assert.strictEqual(authViewB.allowed, true);

    const authDownloadB = await CentralShareAccessService.authorizeShareAccess({
      shareId: activeShare._id,
      documentId: carInsuranceDoc._id,
      action: 'download',
      userId: userB._id
    });
    assert.strictEqual(authDownloadB.allowed, false);
    assert.strictEqual(authDownloadB.status, 403);

    const authViewC = await CentralShareAccessService.authorizeShareAccess({
      shareId: activeShare._id,
      documentId: carInsuranceDoc._id,
      action: 'view',
      userId: userC._id
    });
    assert.strictEqual(authViewC.allowed, false);
    assert.strictEqual(authViewC.status, 403);

    const authUnsharedDoc = await CentralShareAccessService.authorizeShareAccess({
      shareId: activeShare._id,
      documentId: privateTaxDoc._id,
      action: 'view',
      userId: userB._id
    });
    assert.strictEqual(authUnsharedDoc.allowed, false);
    assert.strictEqual(authUnsharedDoc.status, 403);
  });

  it('Module 7: Immediate Revocation Enforcement', async () => {
    const revokeRes = await DocumentShareService.revokeShare(userA._id, activeShare._id);
    assert.strictEqual(revokeRes.success, true);

    const authPostRevoke = await CentralShareAccessService.authorizeShareAccess({
      shareId: activeShare._id,
      documentId: carInsuranceDoc._id,
      action: 'view',
      userId: userB._id
    });
    assert.strictEqual(authPostRevoke.allowed, false);
    assert.strictEqual(authPostRevoke.status, 403);
    assert.ok(authPostRevoke.reason.includes('revoked'));
  });

  after(async () => {
    try {
      if (userA && userB && userC) {
        await User.deleteMany({ _id: { $in: [userA._id, userB._id, userC._id] } });
        await Document.deleteMany({ userId: userA._id });
        await Asset.deleteMany({ userId: userA._id });
        await Expense.deleteMany({ userId: userA._id });
        if (activeShare) {
          await DocumentShare.deleteOne({ _id: activeShare._id });
        }
      }
    } catch (e) {
      console.warn('Cleanup warning:', e.message);
    }
  });
});
