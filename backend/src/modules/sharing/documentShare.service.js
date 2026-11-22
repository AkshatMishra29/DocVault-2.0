import {
  DocumentShare,
  SHARE_STATUS,
  SHARE_TYPE,
  DocumentShareGrant,
  GRANT_STATUS,
  GRANT_SOURCE,
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
      recipientDocVaultId = null,
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

    // 2. Resolve recipient identity by DocVault ID, Email, or User ID
    let resolvedRecipientUserId = recipientUserId || null;
    let resolvedRecipientEmail = recipientEmail ? recipientEmail.toLowerCase().trim() : null;

    if (recipientDocVaultId && !resolvedRecipientUserId) {
      const cleanDocVaultId = recipientDocVaultId.trim().toUpperCase();
      const userByDocVaultId = await User.findOne({ docVaultId: cleanDocVaultId }).select('_id email name');
      if (userByDocVaultId) {
        resolvedRecipientUserId = userByDocVaultId._id;
        if (!resolvedRecipientEmail) resolvedRecipientEmail = userByDocVaultId.email;
      } else {
        throw new Error(`No user found with DocVault ID "${cleanDocVaultId}". Please check the ID.`);
      }
    }

    if (resolvedRecipientEmail && !resolvedRecipientUserId) {
      const userByEmail = await User.findOne({ email: resolvedRecipientEmail }).select('_id email name');
      if (userByEmail) {
        resolvedRecipientUserId = userByEmail._id;
      }
    }

    // 3. Auto-establish connection authorization if sharing directly with identified user
    if (resolvedRecipientUserId) {
      if (resolvedRecipientUserId.toString() === ownerId.toString()) {
        throw new Error('You cannot share documents with yourself.');
      }
      await ConnectionService.ensureOwnerApproved(ownerId, resolvedRecipientUserId).catch(() => {});
    }

    // 4. Compute Expiry Date
    let expiresAt = null;
    if (customExpiryDate) {
      expiresAt = new Date(customExpiryDate);
    } else if (expiresInHours && expiresInHours > 0) {
      expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    }

    // 5. Generate Expiring Token (if link share or direct email/phone share)
    let tokenHash = null;
    let rawToken = null;
    if (shareType === SHARE_TYPE.LINK || resolvedRecipientEmail || recipientPhone || !resolvedRecipientUserId) {
      const generated = ShareVerificationService.generateShareToken();
      rawToken = generated.rawToken;
      tokenHash = generated.hash;
    }

    // 6. Hash Password (if provided)
    let passwordHash = null;
    let passwordRequired = false;
    if (password && password.trim().length > 0) {
      passwordHash = await ShareVerificationService.hashPassword(password.trim());
      passwordRequired = true;
    }

    // 7. Genuine PDF & Image Redaction Processing (if requested)
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

    // 8. Persist DocumentShare Record
    const share = await DocumentShare.create({
      ownerId,
      documentIds,
      purpose,
      shareType: resolvedRecipientUserId ? SHARE_TYPE.CONNECTION : SHARE_TYPE.LINK,
      recipientUserId: resolvedRecipientUserId,
      recipientEmail: resolvedRecipientEmail,
      recipientPhone,
      tokenHash,
      permissions: {
        view: permissions.view !== false,
        download: Boolean(permissions.download),
      },
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

    // 9. Synchronize DocumentShareGrant records for seamless access across vault & Ask AI
    if (resolvedRecipientUserId) {
      for (const docId of documentIds) {
        await DocumentShareGrant.findOneAndUpdate(
          { documentId: docId, recipientId: resolvedRecipientUserId },
          {
            ownerId,
            permissions: {
              view: permissions.view !== false,
              download: Boolean(permissions.download),
            },
            status: GRANT_STATUS.ACTIVE,
            source: GRANT_SOURCE.BULK_SHARE,
            expiresAt,
          },
          { upsert: true, new: true }
        ).catch(() => {});
      }
    }

    // 10. Record in audit log
    await ShareAccessLog.create({
      ownerId,
      recipientId: resolvedRecipientUserId,
      documentId: documentIds[0],
      action: SHARE_ACTION.CREATED,
      metadata: {
        shareId: share._id,
        purpose,
        docCount: documentIds.length,
        expiresAt,
      },
    }).catch(() => {});

    // 11. Send In-App Notification if recipient is a DocVault user
    if (resolvedRecipientUserId) {
      const ownerUser = await User.findById(ownerId).select('name docVaultId');
      await ShareNotification.create({
        userId: resolvedRecipientUserId,
        senderId: ownerId,
        type: NOTIFICATION_TYPE.SHARED,
        title: 'New Documents Shared With You',
        message: `${ownerUser?.name || 'A user'} shared ${documentIds.length} document(s) for "${purpose}".`,
        data: { shareId: share._id },
      }).catch(() => {});
    }

    const recipientUser = resolvedRecipientUserId
      ? await User.findById(resolvedRecipientUserId).select('name docVaultId email')
      : null;

    return {
      share,
      recipient: recipientUser ? {
        id: recipientUser._id,
        name: recipientUser.name,
        docVaultId: recipientUser.docVaultId,
        email: recipientUser.email,
      } : {
        email: resolvedRecipientEmail,
      },
      rawToken, // Only returned at creation time so owner can copy the link
      shareUrl: rawToken ? `/shares/access/${rawToken}` : `/shares/${share._id}/view`,
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

    // Revoke any corresponding DocumentShareGrants
    if (share.recipientUserId && share.documentIds?.length > 0) {
      await DocumentShareGrant.updateMany(
        {
          ownerId,
          recipientId: share.recipientUserId,
          documentId: { $in: share.documentIds },
        },
        { status: GRANT_STATUS.REVOKED }
      ).catch(() => {});
    }

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
   * List sent shares created by this user with last accessed metadata
   */
  static async listSentShares(ownerId) {
    const shares = await DocumentShare.find({ ownerId })
      .populate('documentIds', 'title category format fileSizeFormatted createdAt')
      .populate('recipientUserId', 'name docVaultId email')
      .sort({ createdAt: -1 })
      .lean();

    const shareIds = shares.map((s) => s._id);
    const accessLogs = await ShareAccessLog.aggregate([
      {
        $match: {
          'metadata.shareId': { $in: shareIds },
          action: { $in: [SHARE_ACTION.VIEWED, SHARE_ACTION.DOWNLOADED] },
        },
      },
      {
        $group: {
          _id: '$metadata.shareId',
          lastAccessedAt: { $max: '$createdAt' },
          accessCount: { $sum: 1 },
        },
      },
    ]).catch(() => []);

    const accessMap = new Map(accessLogs.map((l) => [l._id.toString(), l]));

    return shares.map((s) => ({
      ...s,
      lastAccessedAt: accessMap.get(s._id.toString())?.lastAccessedAt || null,
      accessCount: accessMap.get(s._id.toString())?.accessCount || 0,
    }));
  }

  /**
   * List active shares received by this user
   */
  static async listReceivedShares(recipientUserId) {
    const now = new Date();
    const userDoc = await User.findById(recipientUserId).select('email');
    const userEmail = userDoc?.email ? userDoc.email.toLowerCase().trim() : null;

    const shares = await DocumentShare.find({
      $or: [
        { recipientUserId },
        ...(userEmail ? [{ recipientEmail: userEmail }] : []),
      ],
      status: SHARE_STATUS.ACTIVE,
      $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }],
    })
      .populate('documentIds', 'title category format fileSizeFormatted createdAt summary')
      .populate('ownerId', 'name docVaultId')
      .sort({ createdAt: -1 });

    return shares;
  }

  /**
   * Update existing share permissions or expiry
   */
  static async updateShare(ownerId, shareId, updateData) {
    const share = await DocumentShare.findOne({ _id: shareId, ownerId });
    if (!share) {
      throw new Error('Share not found or unauthorized.');
    }
    if (share.status === SHARE_STATUS.REVOKED) {
      throw new Error('Cannot modify a revoked share. Please create a new share.');
    }

    const { permissions, expiresInHours, customExpiryDate } = updateData;

    let permissionsChanged = false;
    if (permissions) {
      if (permissions.view !== undefined) share.permissions.view = Boolean(permissions.view);
      if (permissions.download !== undefined) share.permissions.download = Boolean(permissions.download);
      permissionsChanged = true;
    }

    let expiryChanged = false;
    if (customExpiryDate) {
      share.expiresAt = new Date(customExpiryDate);
      expiryChanged = true;
    } else if (expiresInHours !== undefined) {
      const hours = Number(expiresInHours);
      if (hours > 0) {
        share.expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      } else {
        share.expiresAt = null; // No expiry (continuous)
      }
      expiryChanged = true;
    }

    if (share.status === SHARE_STATUS.EXPIRED && (share.expiresAt === null || new Date(share.expiresAt) > new Date())) {
      share.status = SHARE_STATUS.ACTIVE;
    }

    await share.save();

    // Synchronize DocumentShareGrants
    if (share.recipientUserId && share.documentIds?.length > 0) {
      await DocumentShareGrant.updateMany(
        {
          ownerId,
          recipientId: share.recipientUserId,
          documentId: { $in: share.documentIds },
        },
        {
          permissions: share.permissions,
          status: share.status === SHARE_STATUS.ACTIVE ? GRANT_STATUS.ACTIVE : GRANT_STATUS.EXPIRED,
          expiresAt: share.expiresAt,
        }
      ).catch(() => {});
    }

    // Audit logs
    if (permissionsChanged) {
      await ShareAccessLog.create({
        ownerId,
        recipientId: share.recipientUserId,
        documentId: share.documentIds[0],
        action: SHARE_ACTION.PERMISSION_CHANGED,
        metadata: { shareId: share._id, permissions: share.permissions },
      }).catch(() => {});
    }
    if (expiryChanged) {
      await ShareAccessLog.create({
        ownerId,
        recipientId: share.recipientUserId,
        documentId: share.documentIds[0],
        action: SHARE_ACTION.EXPIRY_EXTENDED,
        metadata: { shareId: share._id, expiresAt: share.expiresAt },
      }).catch(() => {});
    }

    return share;
  }
}

