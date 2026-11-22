import { describe, it } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { User } from '../src/modules/auth/auth.model.js';
import { Document } from '../src/modules/documents/document.model.js';
import { ConnectionService } from '../src/modules/sharing/connection.service.js';
import { DocumentShareService } from '../src/modules/sharing/documentShare.service.js';
import { DocumentAccessControlService } from '../src/modules/sharing/accessControl.service.js';
import {
  DocumentShare,
  DocumentShareGrant,
  UserConnection,
  USER_CONNECTION_STATUS,
  GRANT_STATUS,
  SHARE_STATUS,
} from '../src/modules/sharing/models/index.js';
import { claimPendingSharesForUser } from '../src/modules/auth/auth.service.js';

describe('🚀 DocVault Sharing Authorization & Optimization Suite', () => {
  // In-memory dummy object IDs
  const ownerId = new mongoose.Types.ObjectId();
  const recipientId = new mongoose.Types.ObjectId();
  const strangerId = new mongoose.Types.ObjectId();
  const docId1 = new mongoose.Types.ObjectId();
  const docId2 = new mongoose.Types.ObjectId();

  it('1. ConnectionService: ensureOwnerApproved sets up valid non-blocked connection', async () => {
    // Stub UserConnection
    const origFindOne = UserConnection.findOne;
    const origCreate = UserConnection.create;

    let savedConn = null;
    UserConnection.findOne = async () => null;
    UserConnection.create = async (data) => {
      savedConn = { ...data, save: async () => {} };
      return savedConn;
    };

    const conn = await ConnectionService.ensureOwnerApproved(ownerId, recipientId);
    assert.ok(conn, 'Connection should be created');
    assert.strictEqual(conn.status, USER_CONNECTION_STATUS.ONE_WAY);

    UserConnection.findOne = origFindOne;
    UserConnection.create = origCreate;
  });

  it('2. ConnectionService: canReceiveFromOwner returns true when owner approved recipient', async () => {
    const origFindOne = UserConnection.findOne;

    UserConnection.findOne = async () => ({
      userA: ownerId.toString() < recipientId.toString() ? ownerId : recipientId,
      userB: ownerId.toString() < recipientId.toString() ? recipientId : ownerId,
      userAApprovedB: true,
      userBApprovedA: true,
      status: USER_CONNECTION_STATUS.MUTUAL,
    });

    const canRecv = await ConnectionService.canReceiveFromOwner(recipientId, ownerId);
    assert.strictEqual(canRecv, true, 'Mutual connection should be authorized to receive');

    UserConnection.findOne = origFindOne;
  });

  it('3. DocumentAccessControlService: canAccessDocument allows owner full access', async () => {
    const origDocFind = Document.findById;
    Document.findById = () => ({
      select: () => ({
        _id: docId1,
        userId: ownerId,
        title: 'Master Passport Scan',
      }),
    });

    const access = await DocumentAccessControlService.canAccessDocument(ownerId, docId1, 'view');
    assert.strictEqual(access.allowed, true);
    assert.strictEqual(access.isOwner, true);

    Document.findById = origDocFind;
  });

  it('4. DocumentAccessControlService: authorizes recipient via active DocumentShare without requiring mutual handshake', async () => {
    const origDocFind = Document.findById;
    const origUserFind = User.findById;
    const origShareGrantFind = DocumentShareGrant.findOne;
    const origDocShareFind = DocumentShare.findOne;
    const origIsBlocked = ConnectionService.isBlocked;

    Document.findById = () => ({
      select: () => ({
        _id: docId1,
        userId: ownerId,
        title: 'Q3 Tax Return',
      }),
    });

    User.findById = () => ({
      select: () => ({ email: 'recipient@example.com' }),
    });

    ConnectionService.isBlocked = async () => false;
    DocumentShareGrant.findOne = async () => null;

    // Simulate active direct DocumentShare from owner to recipient
    DocumentShare.findOne = async () => ({
      _id: new mongoose.Types.ObjectId(),
      documentIds: [docId1],
      recipientUserId: recipientId,
      status: SHARE_STATUS.ACTIVE,
      expiresAt: null,
      permissions: { view: true, download: false },
    });

    // View check: Should be ALLOWED
    const viewAccess = await DocumentAccessControlService.canAccessDocument(recipientId, docId1, 'view');
    assert.strictEqual(viewAccess.allowed, true, 'Direct share recipient should be authorized to view');
    assert.strictEqual(viewAccess.isOwner, false);

    // Download check: Should be DENIED because download is false
    const downloadAccess = await DocumentAccessControlService.canAccessDocument(recipientId, docId1, 'download');
    assert.strictEqual(downloadAccess.allowed, false, 'Download should be denied when not granted');
    assert.strictEqual(downloadAccess.reason, 'Download permission not granted');

    Document.findById = origDocFind;
    User.findById = origUserFind;
    DocumentShareGrant.findOne = origShareGrantFind;
    DocumentShare.findOne = origDocShareFind;
    ConnectionService.isBlocked = origIsBlocked;
  });

  it('5. DocumentAccessControlService: strictly denies unauthorized stranger', async () => {
    const origDocFind = Document.findById;
    const origUserFind = User.findById;
    const origShareGrantFind = DocumentShareGrant.findOne;
    const origDocShareFind = DocumentShare.findOne;
    const origPolicyFind = (await import('../src/modules/sharing/models/index.js')).DocumentAccessPolicy.findOne;
    const origIsBlocked = ConnectionService.isBlocked;

    const { DocumentAccessPolicy } = await import('../src/modules/sharing/models/index.js');

    Document.findById = () => ({
      select: () => ({
        _id: docId1,
        userId: ownerId,
        title: 'Confidential Medical Record',
      }),
    });

    User.findById = () => ({
      select: () => ({ email: 'stranger@example.com' }),
    });

    ConnectionService.isBlocked = async () => false;
    DocumentShareGrant.findOne = async () => null;
    DocumentShare.findOne = async () => null;
    DocumentAccessPolicy.findOne = async () => null;

    const access = await DocumentAccessControlService.canAccessDocument(strangerId, docId1, 'view');
    assert.strictEqual(access.allowed, false);
    assert.ok(access.reason.includes('No active sharing authorization'));

    Document.findById = origDocFind;
    User.findById = origUserFind;
    DocumentShareGrant.findOne = origShareGrantFind;
    DocumentShare.findOne = origDocShareFind;
    DocumentAccessPolicy.findOne = origPolicyFind;
    ConnectionService.isBlocked = origIsBlocked;
  });

  it('6. DocumentAccessControlService: getAccessibleDocumentIds aggregates owned + grant + direct share IDs', async () => {
    const origDocFind = Document.find;
    const origGrantFind = DocumentShareGrant.find;
    const origShareFind = DocumentShare.find;
    const origUserFind = User.findById;

    Document.find = () => ({
      select: () => [{ _id: docId1 }],
    });

    User.findById = () => ({
      select: () => ({ email: 'recipient@example.com' }),
    });

    DocumentShareGrant.find = () => ({
      select: () => [{ documentId: docId2 }],
    });

    DocumentShare.find = () => ({
      select: () => [{ documentIds: [docId2] }],
    });

    const accessible = await DocumentAccessControlService.getAccessibleDocumentIds(recipientId, 'view');
    assert.ok(accessible.includes(docId1.toString()));
    assert.ok(accessible.includes(docId2.toString()));
    assert.strictEqual(accessible.length, 2, 'Should deduplicate IDs');

    Document.find = origDocFind;
    DocumentShareGrant.find = origGrantFind;
    DocumentShare.find = origShareFind;
    User.findById = origUserFind;
  });

  it('7. DocumentShareService: createShare validates self-share prevention', async () => {
    const origDocFind = Document.find;
    const origUserFind = User.findOne;

    Document.find = async () => [{ _id: docId1, userId: ownerId }];
    User.findOne = async () => ({ _id: ownerId, email: 'owner@example.com' });

    await assert.rejects(
      async () => {
        await DocumentShareService.createShare(ownerId, {
          documentIds: [docId1],
          recipientUserId: ownerId, // Same as owner
        });
      },
      /cannot share documents with yourself/i
    );

    Document.find = origDocFind;
    User.findOne = origUserFind;
  });

  it('8. Claim pending shares: retroactively links shares sent to an email before user signup', async () => {
    let claimedShare = null;
    let createdGrant = null;

    const fakeShare = {
      _id: new mongoose.Types.ObjectId(),
      ownerId,
      documentIds: [docId1],
      permissions: { view: true, download: true },
      expiresAt: null,
      save: async function() { claimedShare = this; },
    };

    const origShareFind = DocumentShare.find;
    const origGrantUpsert = DocumentShareGrant.findOneAndUpdate;
    const origEnsure = ConnectionService.ensureOwnerApproved;

    DocumentShare.find = async () => [fakeShare];
    DocumentShareGrant.findOneAndUpdate = async (filter, update) => {
      createdGrant = { filter, update };
      return createdGrant;
    };
    ConnectionService.ensureOwnerApproved = async () => {};

    const dummyUser = {
      _id: recipientId,
      email: 'newuser@example.com',
    };

    await claimPendingSharesForUser(dummyUser);

    assert.ok(claimedShare, 'Share should be claimed');
    assert.strictEqual(claimedShare.recipientUserId.toString(), recipientId.toString());
    assert.ok(createdGrant, 'Grant should be upserted for user');
    assert.strictEqual(createdGrant.filter.recipientId.toString(), recipientId.toString());

    DocumentShare.find = origShareFind;
    DocumentShareGrant.findOneAndUpdate = origGrantUpsert;
    ConnectionService.ensureOwnerApproved = origEnsure;
  });

  it('9. DocumentAccessControlService: safely rejects invalid ObjectId string without Mongoose CastError', async () => {
    const userId = new mongoose.Types.ObjectId();
    const result = await DocumentAccessControlService.canAccessDocument(userId, 'lookup-recipient');
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.reason, 'Invalid document ID format');
  });

  it('10. lookupRecipientHandler: safely verifies recipient by DocVault ID and Email', async () => {
    const { lookupRecipientHandler } = await import('../src/modules/sharing/sharing.routes.js');
    const { User } = await import('../src/modules/auth/auth.model.js');

    const origFindOne = User.findOne;
    const callerId = new mongoose.Types.ObjectId();
    const targetId = new mongoose.Types.ObjectId();

    User.findOne = (query) => ({
      select: async () => {
        if (query.docVaultId === 'DV-RECIPIENT-99') {
          return { _id: targetId, name: 'Alice Recipient', docVaultId: 'DV-RECIPIENT-99', email: 'alice@example.com' };
        }
        return null;
      },
    });

    let statusCode = 200;
    let jsonBody = null;
    const req = {
      user: { userId: callerId },
      query: { q: 'DV-RECIPIENT-99' },
    };
    const res = {
      status(code) { statusCode = code; return this; },
      json(body) { jsonBody = body; return this; },
    };

    await lookupRecipientHandler(req, res);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(jsonBody.success, true);
    assert.strictEqual(jsonBody.data.docVaultId, 'DV-RECIPIENT-99');
    assert.strictEqual(jsonBody.data.name, 'Alice Recipient');

    User.findOne = origFindOne;
  });
});
