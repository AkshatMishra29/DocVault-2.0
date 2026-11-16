import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { User } from '../src/modules/auth/auth.model.js';
import { Document } from '../src/modules/documents/document.model.js';
import { ConnectionService } from '../src/modules/sharing/connection.service.js';
import { DocumentShareService } from '../src/modules/sharing/documentShare.service.js';
import { DocumentShare, UserConnection, ConnectionRequest } from '../src/modules/sharing/models/index.js';
import { getCurrentUser } from '../src/modules/auth/auth.service.js';
import { generateDocVaultId } from '../src/modules/auth/docVaultId.util.js';
import { config } from '../src/config/index.js';

describe('🧪 DocVault Sharing ID & Mutual Connection Dummy Data Test Suite', () => {
  let dummyAlice, dummyBob;
  let dummyDoc;
  let createdShare;
  const nonce = Date.now();

  it('Setup: Connect to Database and generate dummy users Alice and Bob', async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(config.mongoUri);
    }

    const aliceId = generateDocVaultId();
    const bobId = generateDocVaultId();

    dummyAlice = await User.create({
      name: `Alice Dummy_${nonce}`,
      email: `alice_${nonce}@example.com`,
      phone: `+9191${String(nonce).slice(-8)}`,
      passwordHash: 'dummy_hash',
      pinHash: 'dummy_pin_hash',
      docVaultId: aliceId,
    });

    dummyBob = await User.create({
      name: `Bob Dummy_${nonce}`,
      email: `bob_${nonce}@example.com`,
      phone: `+9192${String(nonce).slice(-8)}`,
      passwordHash: 'dummy_hash',
      pinHash: 'dummy_pin_hash',
      docVaultId: bobId,
    });

    dummyDoc = await Document.create({
      userId: dummyAlice._id,
      title: 'Alice Apartment Lease Agreement 2026',
      originalName: 'dummy_lease.pdf',
      category: 'Property',
      format: 'PDF',
      fileSizeFormatted: '1.4 MB',
      fileUrl: 'https://storage.docvault.internal/dummy_lease.pdf',
      aiPolicy: 'ai_enabled',
      aiConsent: true,
    });

    assert.ok(dummyAlice._id && dummyBob._id && dummyDoc._id);
  });

  it('Test 1: DocVault ID format matches standard DV-XXXX-XXXX specification', () => {
    const idRegex = /^DV-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    assert.match(dummyAlice.docVaultId, idRegex, 'Alice DocVault ID should match DV-XXXX-XXXX format');
    assert.match(dummyBob.docVaultId, idRegex, 'Bob DocVault ID should match DV-XXXX-XXXX format');
    assert.notStrictEqual(dummyAlice.docVaultId, dummyBob.docVaultId, 'Each user should have a distinct DocVault ID');
  });

  it('Test 2: getCurrentUser profile returns populated docVaultId', async () => {
    const profileAlice = await getCurrentUser(dummyAlice._id);
    const profileBob = await getCurrentUser(dummyBob._id);

    assert.strictEqual(profileAlice.docVaultId, dummyAlice.docVaultId);
    assert.strictEqual(profileBob.docVaultId, dummyBob.docVaultId);
    assert.ok(profileAlice.name.includes('Alice'));
    assert.ok(profileBob.name.includes('Bob'));
  });

  it('Test 3: Lookup by DocVault ID resolves user name and ID without exposing sensitive fields', async () => {
    const foundUser = await User.findOne({ docVaultId: dummyBob.docVaultId }).select('name docVaultId createdAt');
    assert.ok(foundUser, 'User should be resolvable by Bob DocVault ID');
    assert.strictEqual(foundUser.name, dummyBob.name);
    assert.strictEqual(foundUser.docVaultId, dummyBob.docVaultId);
    assert.strictEqual(foundUser.passwordHash, undefined);
    assert.strictEqual(foundUser.pinHash, undefined);
  });

  it('Test 4: Alice sends connection request to Bob via Bob DocVault ID', async () => {
    const result = await ConnectionService.sendRequest(dummyAlice._id, dummyBob.docVaultId);
    assert.ok(result.success, 'Connection request should succeed');
    assert.strictEqual(result.recipient.name, dummyBob.name);
    assert.strictEqual(result.recipient.docVaultId, dummyBob.docVaultId);
  });

  it('Test 5: Two-way connection handshake between Alice and Bob establishes mutual sharing', async () => {
    // 5.1 Bob receives request showing Alice DocVault ID and accepts it
    const bobRequests = await ConnectionService.getRequests(dummyBob._id);
    const reqFromAlice = bobRequests.incoming.find(
      (r) => r.requesterId?.docVaultId === dummyAlice.docVaultId
    );
    assert.ok(reqFromAlice, 'Incoming request should show Alice DocVault ID');
    assert.strictEqual(reqFromAlice.requesterId.name, dummyAlice.name);
    assert.strictEqual(reqFromAlice.requesterId.docVaultId, dummyAlice.docVaultId);

    const acceptB = await ConnectionService.acceptRequest(dummyBob._id, reqFromAlice._id);
    assert.ok(acceptB.success, 'Bob accepting connection request should succeed');

    // 5.2 Bob requests access back to Alice via Alice DocVault ID
    const sendBtoA = await ConnectionService.sendRequest(dummyBob._id, dummyAlice.docVaultId);
    assert.ok(sendBtoA.success, 'Bob sending request back should succeed');

    // 5.3 Alice accepts Bob request to make connection full mutual
    const acceptA = await ConnectionService.acceptRequest(dummyAlice._id, sendBtoA.requestId);
    assert.ok(acceptA.success, 'Alice accepting Bob request should succeed');
    assert.strictEqual(acceptA.isMutual, true, 'Connection should now be fully mutual');
  });

  it('Test 6: Mutual connections list exposes valid id, name, and docVaultId (Regression check)', async () => {
    const aliceConns = await ConnectionService.getUserConnections(dummyAlice._id);
    const bobConns = await ConnectionService.getUserConnections(dummyBob._id);

    assert.ok(aliceConns.length > 0, 'Alice should have connections');
    assert.ok(bobConns.length > 0, 'Bob should have connections');

    const bobInAliceList = aliceConns.find((c) => c.docVaultId === dummyBob.docVaultId);
    assert.ok(bobInAliceList, 'Alice connections must contain Bob DocVault ID');
    assert.strictEqual(bobInAliceList.name, dummyBob.name);
    assert.strictEqual(bobInAliceList.docVaultId, dummyBob.docVaultId);
    assert.strictEqual(bobInAliceList.isMutual, true);

    const aliceInBobList = bobConns.find((c) => c.docVaultId === dummyAlice.docVaultId);
    assert.ok(aliceInBobList, 'Bob connections must contain Alice DocVault ID');
    assert.strictEqual(aliceInBobList.name, dummyAlice.name);
    assert.strictEqual(aliceInBobList.docVaultId, dummyAlice.docVaultId);
    assert.strictEqual(aliceInBobList.isMutual, true);

    // Verify UI mapping contract: c.id and c.docVaultId must be defined
    assert.ok(bobInAliceList.id, 'Connection must provide root id for select option value');
    assert.ok(bobInAliceList.docVaultId, 'Connection must provide docVaultId for select option label');
  });

  it('Test 7: Alice creates a secure document share targeted at Bob', async () => {
    const shareResult = await DocumentShareService.createShare(dummyAlice._id, {
      documentIds: [dummyDoc._id],
      purpose: 'Lease Verification for Bank Loan',
      shareType: 'CONNECTION',
      recipientUserId: dummyBob._id,
      expiresInHours: 48,
      permissions: { view: true, download: false },
    });

    assert.ok(shareResult && shareResult.share?._id, 'Share package should be created successfully');
    createdShare = shareResult.share;
    assert.strictEqual(String(createdShare.ownerId), String(dummyAlice._id));
    assert.strictEqual(String(createdShare.recipientUserId), String(dummyBob._id));
  });

  it('Test 8: Alice lists sent shares and verifies Bob name and DocVault ID are populated', async () => {
    const sentShares = await DocumentShareService.listSentShares(dummyAlice._id);
    assert.ok(sentShares.length > 0, 'Alice should have sent shares');

    const matchingShare = sentShares.find((s) => String(s._id) === String(createdShare._id));
    assert.ok(matchingShare, 'Matching share should exist in sent shares list');
    assert.ok(matchingShare.recipientUserId, 'Recipient user must be populated');
    assert.strictEqual(matchingShare.recipientUserId.name, dummyBob.name);
    assert.strictEqual(matchingShare.recipientUserId.docVaultId, dummyBob.docVaultId);
  });

  it('Test 9: Bob lists received shares and verifies Alice name and DocVault ID are populated', async () => {
    const receivedShares = await DocumentShareService.listReceivedShares(dummyBob._id);
    assert.ok(receivedShares.length > 0, 'Bob should have received shares');

    const matchingShare = receivedShares.find((s) => String(s._id) === String(createdShare._id));
    assert.ok(matchingShare, 'Matching share should exist in received shares list');
    assert.ok(matchingShare.ownerId, 'Owner user must be populated');
    assert.strictEqual(matchingShare.ownerId.name, dummyAlice.name);
    assert.strictEqual(matchingShare.ownerId.docVaultId, dummyAlice.docVaultId);
  });

  after(async () => {
    // Clean up dummy data from database
    if (dummyAlice && dummyBob) {
      await Promise.all([
        User.deleteMany({ _id: { $in: [dummyAlice._id, dummyBob._id] } }),
        Document.deleteMany({ userId: { $in: [dummyAlice._id, dummyBob._id] } }),
        UserConnection.deleteMany({ $or: [{ userA: dummyAlice._id }, { userB: dummyAlice._id }] }),
        ConnectionRequest.deleteMany({ $or: [{ requesterId: dummyAlice._id }, { recipientId: dummyAlice._id }] }),
        DocumentShare.deleteMany({ $or: [{ ownerId: dummyAlice._id }, { recipientUserId: dummyBob._id }] }),
      ]);
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  });
});
