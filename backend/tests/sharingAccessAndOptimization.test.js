import { describe, it } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import { User } from '../src/modules/auth/auth.model.js';
import { Document } from '../src/modules/documents/document.model.js';
import { ConnectionService } from '../src/modules/sharing/connection.service.js';
import { DocumentShareService } from '../src/modules/sharing/documentShare.service.js';
import { DocumentAccessControlService } from '../src/modules/sharing/accessControl.service.js';
import { CentralShareAccessService } from '../src/modules/sharing/centralShareAccess.service.js';
import {
  DocumentShare,
  DocumentShareGrant,
  UserConnection,
  DocumentAccessPolicy,
  ShareAccessLog,
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

  it('11. View vs Download: canViewDocument allows preview while canDownloadDocument strictly blocks downloading when permission is VIEW ONLY', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const recipientId = new mongoose.Types.ObjectId();
    const documentId = new mongoose.Types.ObjectId();

    const fakeDoc = {
      _id: documentId,
      userId: ownerId,
      title: 'Vehicle Insurance.pdf',
      category: 'Insurance Policy',
      fileData: Buffer.from('test-pdf-binary').toString('base64'),
    };

    const origFindById = Document.findById;
    const origGrantFindOne = DocumentShareGrant.findOne;
    const origShareFindOne = DocumentShare.findOne;
    const origPolicyFindOne = DocumentAccessPolicy.findOne;
    const origConnFindOne = UserConnection.findOne;
    const origLogCreate = ShareAccessLog.create;

    Document.findById = (id) => ({
      select: async () => fakeDoc,
    });

    // Grant has view: true, download: false
    DocumentShareGrant.findOne = async () => ({
      status: GRANT_STATUS.ACTIVE,
      expiresAt: null,
      permissions: { view: true, download: false },
    });
    DocumentShare.findOne = async () => null;
    DocumentAccessPolicy.findOne = async () => null;
    UserConnection.findOne = async () => null;
    ShareAccessLog.create = async () => ({});

    const viewAccess = await DocumentAccessControlService.canViewDocument(recipientId, documentId);
    assert.strictEqual(viewAccess.allowed, true, 'Recipient should be allowed to view document');

    const downloadAccess = await DocumentAccessControlService.canDownloadDocument(recipientId, documentId);
    assert.strictEqual(downloadAccess.allowed, false, 'Recipient must NOT be allowed to download when permission is VIEW ONLY');
    assert.match(downloadAccess.reason, /download/i);

    Document.findById = origFindById;
    DocumentShareGrant.findOne = origGrantFindOne;
    DocumentShare.findOne = origShareFindOne;
    DocumentAccessPolicy.findOne = origPolicyFindOne;
    UserConnection.findOne = origConnFindOne;
    ShareAccessLog.create = origLogCreate;
  });

  it('12. DocumentShareService.updateShare: modifies permissions and extends expiry, synchronizing grants', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const recipientId = new mongoose.Types.ObjectId();
    const shareId = new mongoose.Types.ObjectId();
    const docId = new mongoose.Types.ObjectId();

    let savedShare = null;
    let updatedGrants = null;

    const mockShare = {
      _id: shareId,
      ownerId,
      recipientUserId: recipientId,
      documentIds: [docId],
      status: SHARE_STATUS.ACTIVE,
      permissions: { view: true, download: false },
      expiresAt: new Date(Date.now() + 3600000),
      save: async function () {
        savedShare = this;
        return this;
      },
    };

    const origFindOne = DocumentShare.findOne;
    const origGrantUpdate = DocumentShareGrant.updateMany;
    const origLogCreate = ShareAccessLog.create;

    DocumentShare.findOne = async () => mockShare;
    DocumentShareGrant.updateMany = async (filter, update) => {
      updatedGrants = { filter, update };
      return { modifiedCount: 1 };
    };
    ShareAccessLog.create = async () => ({});

    const result = await DocumentShareService.updateShare(ownerId, shareId, {
      permissions: { view: true, download: true },
      expiresInHours: 168, // 7 days
    });

    assert.ok(savedShare, 'Share should be saved');
    assert.strictEqual(savedShare.permissions.download, true, 'Download permission should be granted');
    assert.ok(savedShare.expiresAt > new Date(Date.now() + 86400000), 'Expiry should be extended to ~7 days');
    assert.ok(updatedGrants, 'Grants should be synchronized');
    assert.strictEqual(updatedGrants.update.permissions.download, true);

    DocumentShare.findOne = origFindOne;
    DocumentShareGrant.updateMany = origGrantUpdate;
    ShareAccessLog.create = origLogCreate;
  });

  it('13. CentralShareAccessService: allows document owner to view and preview their own share', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const recipientId = new mongoose.Types.ObjectId();
    const docId = new mongoose.Types.ObjectId();
    const shareId = new mongoose.Types.ObjectId();

    const mockShare = {
      _id: shareId,
      ownerId,
      recipientUserId: recipientId,
      documentIds: [docId],
      status: SHARE_STATUS.ACTIVE,
      permissions: { view: true, download: false },
      expiresAt: null,
    };

    const origShareFind = DocumentShare.findById;
    const origDocFind = Document.findById;
    const origLogCreate = ShareAccessLog.create;

    DocumentShare.findById = async () => mockShare;
    Document.findById = async () => ({
      _id: docId,
      userId: ownerId,
      title: 'Aadhaar Card.pdf',
      fileData: Buffer.from('mock-bytes').toString('base64'),
    });
    ShareAccessLog.create = async () => ({});

    const authResult = await CentralShareAccessService.authorizeShareAccess({
      shareId,
      documentId: docId,
      userId: ownerId,
      action: 'view',
    });

    assert.strictEqual(authResult.allowed, true, 'Owner should always be authorized to view their own shared package');

    DocumentShare.findById = origShareFind;
    Document.findById = origDocFind;
    ShareAccessLog.create = origLogCreate;
  });

  it('14. WatermarkService: preserves raw multi-page PDF bytes for fast vector streaming without corrupting mimetype', async () => {
    const { WatermarkService } = await import('../src/modules/sharing/watermark.service.js');
    const pdfBytes = Buffer.from('%PDF-1.4 sample multi-page high-fidelity document');
    const fakePdfDoc = {
      title: 'Policy Agreement.pdf',
      mimetype: 'application/pdf',
      fileData: pdfBytes.toString('base64'),
    };

    const rendered = await WatermarkService.renderWatermarkedDocument(fakePdfDoc, {
      recipientLabel: 'Alice Viewer',
      shareRef: 'SHARE-999',
    });

    assert.ok(Buffer.isBuffer(rendered), 'Should return a Buffer');
    assert.strictEqual(rendered.toString(), pdfBytes.toString(), 'Should preserve pristine PDF binary intact');
  });

  it('15. deliverDocumentPayload: delivers PDF with correct application/pdf mimetype and metadata', async () => {
    const fakeDoc = {
      _id: new mongoose.Types.ObjectId(),
      title: 'Vehicle Insurance.pdf',
      mimetype: 'application/pdf',
      format: 'pdf',
      fileData: Buffer.from('%PDF-1.4 vehicle insurance test').toString('base64'),
      keyDetails: { policyNo: 'POL-12345' },
    };

    const fakeShare = {
      _id: new mongoose.Types.ObjectId(),
      watermarkEnabled: true,
      minimumNecessaryConfig: {},
    };

    const result = await CentralShareAccessService.deliverDocumentPayload({
      share: fakeShare,
      document: fakeDoc,
      isRedacted: false,
      recipientLabel: 'Test Recipient',
      action: 'view',
    });

    assert.strictEqual(result.mimetype, 'application/pdf');
    assert.ok(result.buffer.length > 0);
    assert.strictEqual(result.filename, 'Vehicle Insurance.pdf.pdf');
  });
});
