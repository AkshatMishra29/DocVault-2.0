import {
  DocumentShare,
  SHARE_STATUS,
  SHARE_TYPE,
  RedactedDocument,
  ShareAccessLog,
  SHARE_ACTION,
  ShareNotification,
  NOTIFICATION_TYPE,
} from './models/index.js';
import { ShareVerificationService } from './shareVerification.service.js';
import { WatermarkService } from './watermark.service.js';
import { SharePrivacyService } from './sharePrivacy.service.js';
import { ConnectionService } from './connection.service.js';
import { Document } from '../documents/document.model.js';
import { User } from '../auth/auth.model.js';

export class CentralShareAccessService {
  /**
   * Authorizes an access attempt to a shared document (VIEW or DOWNLOAD).
   *
   * @param {Object} options
   * @param {string} options.shareId - ID of DocumentShare record
   * @param {string} options.documentId - Requested document ID
   * @param {string} [options.action='view'] - 'view' or 'download'
   * @param {string} [options.userId=null] - Authenticated user ID (if logged in)
   * @param {string} [options.token=null] - Cryptographic raw share token (if accessing via link)
   * @param {string} [options.password=null] - Entered share password (if required)
   * @param {string} [options.clientIp=''] - Client IP for audit logging
   * @param {string} [options.userAgent=''] - User-Agent for audit logging
   */
  static async authorizeShareAccess({
    shareId,
    documentId,
    action = 'view',
    userId = null,
    token = null,
    password = null,
    clientIp = '',
    userAgent = '',
  }) {
    // 1. Locate Share Record
    let share = null;
    if (shareId) {
      share = await DocumentShare.findById(shareId);
    } else if (token) {
      const tokenHash = ShareVerificationService.hashToken(token);
      share = await DocumentShare.findOne({ tokenHash });
    }

    if (!share) {
      return { allowed: false, status: 404, reason: 'Share not found or link is invalid.' };
    }

    // 2. Check Share Active Status
    if (share.status === SHARE_STATUS.REVOKED) {
      return { allowed: false, status: 403, reason: 'Access to this share has been revoked by the owner.' };
    }

    // 3. Request-Time Expiry Verification (Strictly enforced on every call)
    if (share.expiresAt && new Date(share.expiresAt) <= new Date()) {
      if (share.status !== SHARE_STATUS.EXPIRED) {
        share.status = SHARE_STATUS.EXPIRED;
        await share.save().catch(() => {});
      }
      return { allowed: false, status: 410, reason: 'This share link has expired.' };
    }

    // 4. Verify Document is part of this share
    const isDocLinked = share.documentIds.some((id) => id.toString() === documentId.toString());
    if (!isDocLinked) {
      return { allowed: false, status: 403, reason: 'Document is not authorized under this share.' };
    }

    // 5. Verify Recipient Identity or Connection
    if (share.shareType === SHARE_TYPE.CONNECTION && share.recipientUserId) {
      if (!userId || userId.toString() !== share.recipientUserId.toString()) {
        return { allowed: false, status: 403, reason: 'You are not the designated recipient for this share.' };
      }
      // Check mutual connection
      const canReceive = await ConnectionService.canReceiveFromOwner(userId, share.ownerId);
      if (!canReceive) {
        return { allowed: false, status: 403, reason: 'Mutual connection with document owner is required.' };
      }
    }

    // 6. Verify Password (if password protection enabled)
    if (share.passwordRequired && share.passwordHash) {
      if (!password) {
        return { allowed: false, status: 401, requiresPassword: true, reason: 'This share is protected with a password.' };
      }
      const isPasswordValid = await ShareVerificationService.verifyPassword(password, share.passwordHash);
      if (!isPasswordValid) {
        return { allowed: false, status: 401, requiresPassword: true, reason: 'Incorrect share password.' };
      }
    }

    // 7. Verify OTP (if OTP verification enabled)
    if (share.otpRequired) {
      if (!share.otpChallenge?.verifiedAt) {
        return { allowed: false, status: 401, requiresOtp: true, reason: 'OTP recipient verification required.' };
      }
    }

    // 8. Check Permissions (VIEW vs DOWNLOAD)
    if (action === 'download' && !share.permissions?.download) {
      return { allowed: false, status: 403, reason: 'Download permission not granted for this document.' };
    }

    if (action === 'view' && !share.permissions?.view) {
      return { allowed: false, status: 403, reason: 'View permission not granted for this document.' };
    }

    // 9. Retrieve Document (Check if redacted copy exists for this document)
    let deliveryDoc = null;
    let isRedacted = false;

    if (share.redactedDocMap && share.redactedDocMap.get(documentId.toString())) {
      const redactedId = share.redactedDocMap.get(documentId.toString());
      deliveryDoc = await RedactedDocument.findById(redactedId);
      if (deliveryDoc) isRedacted = true;
    }

    if (!deliveryDoc) {
      deliveryDoc = await Document.findById(documentId);
    }

    if (!deliveryDoc) {
      return { allowed: false, status: 404, reason: 'Document file not found.' };
    }

    // 10. Audit Logging
    await ShareAccessLog.create({
      ownerId: share.ownerId,
      recipientId: userId || share.recipientUserId,
      documentId,
      action: action === 'download' ? SHARE_ACTION.DOWNLOADED : SHARE_ACTION.VIEWED,
      metadata: {
        shareId: share._id,
        clientIp,
        client: userAgent,
        isRedacted,
      },
    }).catch(() => {});

    return {
      allowed: true,
      share,
      document: deliveryDoc,
      isRedacted,
    };
  }

  /**
   * Deliver document payload with dynamic watermarking and minimum necessary field filtering
   */
  static async deliverDocumentPayload({ share, document, isRedacted, recipientLabel, action }) {
    let responseBuffer = Buffer.from(document.fileData, 'base64');
    let mimetype = document.mimetype || 'application/pdf';

    // Apply Dynamic Watermarking if enabled
    if (share.watermarkEnabled) {
      responseBuffer = await WatermarkService.renderWatermarkedDocument(document, {
        recipientLabel: share.watermarkCustomText || recipientLabel || 'Authorized Viewer',
        shareRef: share._id.toString(),
      });
      // If watermarking rasterized the view output to an image
      if (responseBuffer && responseBuffer.length > 0 && responseBuffer[0] === 0x89 && responseBuffer[1] === 0x50) {
        mimetype = 'image/png';
      }
    }

    // Apply Minimum Necessary Sharing to metadata
    const filteredKeyDetails = SharePrivacyService.filterAllowedMetadata(
      document.keyDetails,
      share.minimumNecessaryConfig?.[document._id.toString()]?.allowedFields || []
    );

    return {
      buffer: responseBuffer,
      mimetype,
      filename: `${document.title}.${document.format || 'pdf'}`,
      metadata: {
        title: document.title,
        category: document.category,
        keyDetails: filteredKeyDetails,
        isRedacted,
        watermarkApplied: share.watermarkEnabled,
      },
    };
  }
}

