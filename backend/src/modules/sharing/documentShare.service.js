import {
  DocumentShare,
  SHARE_STATUS,
  SHARE_TYPE,
  RedactedDocument,
  ShareNotification,
  NOTIFICATION_TYPE,
  ShareAccessLog,
  SHARE_ACTION,
} from './models/index.js';
import { ShareVerificationService } from './shareVerification.service.js';
import { SharePrivacyService } from './sharePrivacy.service.js';
import { ConnectionService } from './connection.service.js';
import { Document } from '../documents/document.model.js';
import { User } from '../auth/auth.model.js';

export class DocumentShareService {
  /**
   * Create a new document share record with all security configurations
   */
  static async createShare(ownerId, data) {
    const {
      documentIds,
      purpose = 'Document Access',
      shareType = SHARE_TYPE.CONNECTION,
      recipientUserId = null,
      recipientEmail = null,
      recipientPhone = null,
      expiresInHours = null, // e.g. 1, 24, 168 (7d), 720 (30d), or custom
      customExpiryDate = null,
      permissions = { view: true, download: false },
      password = null,
      otpRequired = false,
      watermarkEnabled = true,
      watermarkCustomText = null,
      minimumNecessaryConfig = {}, // { [docId]: { allowedFields: [], maskedFields: [] } }
      redactionInstructions = {},  // { [docId]: { termsToRedact: [], fieldsToMask: [] } }
    } = data;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      throw new Error('At least one document must be selected to share.');
    }

    // 1. Cross-Tenant Document Ownership Check
    // Verify that ALL shared documents belong strictly to the owner
    const verifiedDocs = await Document.find({
      _id: { $in: documentIds },
      userId: ownerId,
    });

    if (verifiedDocs.length !== documentIds.length) {
      throw new Error('One or more selected documents do not belong to you or do not exist.');
    }

    // 2. Connection verification if sharing directly with connection
    if (shareType === SHARE_TYPE.CONNECTION && recipientUserId) {
      const isConnection = await ConnectionService.canReceiveFromOwner(recipientUserId, ownerId);
      if (!isConnection) {
        throw new Error('Selected recipient is not an authorized mutual connection.');
      }
    }

    // 3. Compute Expiry Date
    let expiresAt = null;
    if (customExpiryDate) {
      expiresAt = new Date(customExpiryDate);
    } else if (expiresInHours && expiresInHours > 0) {
      expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    }

    // 4. Generate Expiring Token (if link share or direct email/phone share)
    let tokenHash = null;
    let rawToken = null;
    if (shareType === SHARE_TYPE.LINK || recipientEmail || recipientPhone) {
      const generated = ShareVerificationService.generateShareToken();
      rawToken = generated.rawToken;
      tokenHash = generated.hash;
    }

    // 5. Hash Password (if provided)
    let passwordHash = null;
    let passwordRequired = false;
    if (password && password.trim().length > 0) {
      passwordHash = await ShareVerificationService.hashPassword(password.trim());
      passwordRequired = true;
    }

    // 6. Genuine PDF & Image Redaction Processing (if requested)
    const redactedDocMap = new Map();
    for (const doc of verifiedDocs) {
      const docIdStr = doc._id.toString();
      const instructions = redactionInstructions[docIdStr];
      if (instructions && ((instructions.termsToRedact && instructions.termsToRedact.length > 0) || (instructions.fieldsToMask && instructions.fieldsToMask.length > 0))) {
        const redactedCopy = await SharePrivacyService.createRedactedCopy(doc, {
          termsToRedact: instructions.termsToRedact || [],
          fieldsToMask: instructions.fieldsToMask || [],
          ownerId,
        });
        redactedDocMap.set(docIdStr, redactedCopy._id);
      }
    }

    // 7. Persist DocumentShare Record
    const share = await DocumentShare.create({
      ownerId,
      documentIds,
      purpose,
      shareType,
      recipientUserId,
      recipientEmail,
      recipientPhone,
      tokenHash,
      permissions,
      status: SHARE_STATUS.ACTIVE,
      expiresAt,
      passwordHash,
      passwordRequired,
      otpRequired,
      watermarkEnabled,
      watermarkCustomText,
      minimumNecessaryConfig,
      redactedDocMap,
    });

    // 8. Record in audit log
    await ShareAccessLog.create({
      ownerId,
      recipientId: recipientUserId,
      documentId: documentIds[0],
      action: SHARE_ACTION.CREATED,
      metadata: {
        shareId: share._id,
        purpose,
        docCount: documentIds.length,
        expiresAt,
      },
    }).catch(() => {});

    // 9. Send In-App Notification if recipient is a DocVault user
    if (recipientUserId) {
      const ownerUser = await User.findById(ownerId).select('name docVaultId');
      await ShareNotification.create({
        userId: recipientUserId,
        senderId: ownerId,
        type: NOTIFICATION_TYPE.SHARED,
        title: 'New Documents Shared With You',
        message: `${ownerUser?.name || 'A user'} shared ${documentIds.length} document(s) for "${purpose}".`,
        data: { shareId: share._id },
      }).catch(() => {});
    }

    return {
      share,
      rawToken, // Only returned at creation time so owner can copy the link
      shareUrl: rawToken ? `/shares/access/${rawToken}` : null,
    };
  }

  /**
   * Revoke an active document share immediately
   */
  static async revokeShare(ownerId, shareId) {
    const share = await DocumentShare.findOne({ _id: shareId, ownerId });
    if (!share) {
      throw new Error('Share not found or unauthorized.');
    }

    share.status = SHARE_STATUS.REVOKED;
    share.revokedAt = new Date();
    await share.save();

    await ShareAccessLog.create({
      ownerId,
      recipientId: share.recipientUserId,
      documentId: share.documentIds[0],
      action: SHARE_ACTION.ACCESS_REVOKED,
      metadata: { shareId: share._id },
    }).catch(() => {});

    return { success: true, message: 'Share revoked immediately. All future access denied.' };
  }

  /**
   * List sent shares created by this user
   */
  static async listSentShares(ownerId) {
    const shares = await DocumentShare.find({ ownerId })
      .populate('documentIds', 'title category format fileSizeFormatted')
      .populate('recipientUserId', 'name docVaultId')
      .sort({ createdAt: -1 });

    return shares;
  }

  /**
   * List active shares received by this user
   */
  static async listReceivedShares(recipientUserId) {
    const now = new Date();
    const shares = await DocumentShare.find({
      recipientUserId,
      status: SHARE_STATUS.ACTIVE,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    })
      .populate('documentIds', 'title category format fileSizeFormatted')
      .populate('ownerId', 'name docVaultId')
      .sort({ createdAt: -1 });

    return shares;
  }
}

