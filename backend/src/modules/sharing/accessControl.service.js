import {
  DocumentAccessPolicy,
  AUDIENCE_MODE,
  DocumentShareGrant,
  GRANT_STATUS,
  GRANT_SOURCE,
  SharingRule,
  RULE_SCOPE,
  ShareAccessLog,
  SHARE_ACTION,
  ShareNotification,
  NOTIFICATION_TYPE,
} from './models/index.js';
import { ConnectionService } from './connection.service.js';
import { Document } from '../documents/document.model.js';

export class DocumentAccessControlService {
  /**
   * Determine whether a user can access a document for a specific action ('view' or 'download')
   * Central evaluation:
   * 1. If owner => full access
   * 2. If document explicitly marked ONLY_ME / PRIVATE => deny
   * 3. Must be MUTUAL connection with owner
   * 4. Check active, non-expired DocumentShareGrant
   * 5. Check action permission (view vs download)
   */
  static async canAccessDocument(userId, documentId, action = 'view') {
    if (!userId || !documentId) return { allowed: false, reason: 'Missing credentials or document' };

    const doc = await Document.findById(documentId).select('userId title sensitiveFlag aiPolicy category');
    if (!doc) return { allowed: false, reason: 'Document not found' };

    // 1. Owner always has full access
    if (doc.userId.toString() === userId.toString()) {
      return { allowed: true, isOwner: true, doc };
    }

    // 2. Check document policy: if explicitly ONLY_ME, deny immediately
    const policy = await DocumentAccessPolicy.findOne({ documentId });
    if (policy && policy.audienceMode === AUDIENCE_MODE.ONLY_ME) {
      return { allowed: false, reason: 'Document is private' };
    }

    // 3. Must be connection authorized to receive from doc owner
    const canReceive = await ConnectionService.canReceiveFromOwner(userId, doc.userId);
    if (!canReceive) {
      return { allowed: false, reason: 'Recipient not authorized by document owner' };
    }

    // 4. Query active grant for this specific user
    const grant = await DocumentShareGrant.findOne({
      documentId,
      recipientId: userId,
      status: GRANT_STATUS.ACTIVE,
    });

    if (!grant) {
      return { allowed: false, reason: 'No active sharing grant found' };
    }

    // 5. Expiry verification (at request-time, deterministic without Redis)
    if (grant.expiresAt && new Date(grant.expiresAt) <= new Date()) {
      // Mark expired lazily
      grant.status = GRANT_STATUS.EXPIRED;
      await grant.save().catch(() => {});
      return { allowed: false, reason: 'Document share grant has expired' };
    }

    // 6. Action permission check (view vs download)
    if (action === 'download' && !grant.permissions.download) {
      return { allowed: false, reason: 'Download permission not granted' };
    }

    if (action === 'view' && !grant.permissions.view) {
      return { allowed: false, reason: 'View permission not granted' };
    }

    return { allowed: true, isOwner: false, grant, doc };
  }

  /**
   * Helper shorthand for viewing
   */
  static async canViewDocument(userId, documentId) {
    return this.canAccessDocument(userId, documentId, 'view');
  }

  /**
   * Helper shorthand for downloading
   */
  static async canDownloadDocument(userId, documentId) {
    return this.canAccessDocument(userId, documentId, 'download');
  }

  /**
   * Get all accessible document IDs for a user (Owned + Shared via active grant)
   */
  static async getAccessibleDocumentIds(userId, action = 'view') {
    const ownedDocs = await Document.find({ userId }).select('_id');
    const ownedIds = ownedDocs.map((d) => d._id);

    const now = new Date();
    const grantQuery = {
      recipientId: userId,
      status: GRANT_STATUS.ACTIVE,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    };

    if (action === 'download') {
      grantQuery['permissions.download'] = true;
    } else {
      grantQuery['permissions.view'] = true;
    }

    const grants = await DocumentShareGrant.find(grantQuery).select('documentId');
    const sharedIds = grants.map((g) => g.documentId);

    return Array.from(new Set([...ownedIds.map(String), ...sharedIds.map(String)]));
  }

  /**
   * Apply WhatsApp-style Audience Policy to a document
   */
  static async setDocumentPolicy(ownerId, documentId, policyData) {
    const {
      audienceMode = AUDIENCE_MODE.ONLY_ME,
      selectedUserIds = [],
      excludedUserIds = [],
      permissions = { view: true, download: false },
      expiresAt = null,
    } = policyData;

    // Validate ownership
    const doc = await Document.findOne({ _id: documentId, userId: ownerId });
    if (!doc) {
      const err = new Error('Document not found or you are not the owner.');
      err.status = 404;
      throw err;
    }

    // Validate expiry date if provided
    let parsedExpiry = null;
    if (expiresAt) {
      parsedExpiry = new Date(expiresAt);
      if (isNaN(parsedExpiry.getTime()) || parsedExpiry <= new Date()) {
        const err = new Error('Expiration date must be a valid future date.');
        err.status = 400;
        throw err;
      }
    }

    // Get all users eligible to receive shares from this owner
    const eligibleRecipients = await ConnectionService.getEligibleShareRecipients(ownerId);
    const eligibleIds = eligibleRecipients.map((c) => c.id.toString());

    // Compute effective recipient IDs based on audience mode
    let recipientIds = [];

    if (audienceMode === AUDIENCE_MODE.ONLY_ME) {
      recipientIds = [];
    } else if (audienceMode === AUDIENCE_MODE.ALL_CONNECTIONS) {
      recipientIds = eligibleIds;
    } else if (audienceMode === AUDIENCE_MODE.SELECTED) {
      // Must be a subset of eligible connections
      recipientIds = selectedUserIds.filter((id) => eligibleIds.includes(id.toString()));
    } else if (audienceMode === AUDIENCE_MODE.ALL_EXCEPT) {
      const excludedSet = new Set(excludedUserIds.map((id) => id.toString()));
      recipientIds = eligibleIds.filter((id) => !excludedSet.has(id));
    }

    // Upsert DocumentAccessPolicy
    const policy = await DocumentAccessPolicy.findOneAndUpdate(
      { documentId },
      {
        documentId,
        ownerId,
        audienceMode,
        selectedUserIds: audienceMode === AUDIENCE_MODE.SELECTED ? recipientIds : [],
        excludedUserIds: audienceMode === AUDIENCE_MODE.ALL_EXCEPT ? excludedUserIds : [],
        permissions: {
          view: Boolean(permissions.view !== false),
          download: Boolean(permissions.download),
        },
        expiresAt: parsedExpiry,
      },
      { upsert: true, new: true }
    );

    // Sync individual DocumentShareGrant records
    // Revoke any previous active grants not in the new recipient list
    await DocumentShareGrant.updateMany(
      {
        documentId,
        ownerId,
        recipientId: { $nin: recipientIds },
        status: GRANT_STATUS.ACTIVE,
      },
      { status: GRANT_STATUS.REVOKED }
    );

    // Create or update grants for all eligible recipients
    for (const recipientId of recipientIds) {
      await DocumentShareGrant.findOneAndUpdate(
        { documentId, recipientId },
        {
          ownerId,
          permissions: {
            view: Boolean(permissions.view !== false),
            download: Boolean(permissions.download),
          },
          status: GRANT_STATUS.ACTIVE,
          source: GRANT_SOURCE.DOCUMENT_POLICY,
          expiresAt: parsedExpiry,
        },
        { upsert: true, new: true }
      );
    }

    // Audit log policy update
    await ShareAccessLog.create({
      ownerId,
      documentId,
      action: SHARE_ACTION.POLICY_UPDATED,
      metadata: { audienceMode, recipientCount: recipientIds.length, permissions },
    }).catch(() => {});

    return {
      success: true,
      policy,
      recipientCount: recipientIds.length,
    };
  }

  /**
   * Bulk Share multiple documents
   */
  static async bulkShare(ownerId, { documentIds, audienceMode, selectedUserIds, excludedUserIds, permissions, expiresAt }) {
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      throw new Error('Please select at least one document to share.');
    }

    // Verify ownership of every single document
    const docs = await Document.find({ _id: { $in: documentIds }, userId: ownerId }).select('_id title');
    if (docs.length !== documentIds.length) {
      const err = new Error('One or more selected documents do not belong to you.');
      err.status = 403;
      throw err;
    }

    const results = [];
    for (const doc of docs) {
      const res = await this.setDocumentPolicy(ownerId, doc._id, {
        audienceMode,
        selectedUserIds,
        excludedUserIds,
        permissions,
        expiresAt,
      });
      results.push({ documentId: doc._id, title: doc.title, success: res.success });
    }

    return { success: true, count: results.length, results };
  }

  /**
   * Apply category sharing rule (supports existing and future documents with private override)
   */
  static async createCategoryRule(ownerId, ruleData) {
    const { category, audienceMode, selectedUserIds, excludedUserIds, permissions, scope, expiresAt } = ruleData;
    if (!category) throw new Error('Category is required.');

    const rule = await SharingRule.create({
      ownerId,
      category,
      audienceMode,
      selectedUserIds,
      excludedUserIds,
      permissions,
      scope: scope || RULE_SCOPE.EXISTING_ONLY,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    // Apply immediately to matching existing documents of the owner that are not explicitly ONLY_ME
    const docs = await Document.find({ userId: ownerId, category });
    let appliedCount = 0;

    for (const doc of docs) {
      const existingPolicy = await DocumentAccessPolicy.findOne({ documentId: doc._id });
      // Private override: do not overwrite explicit ONLY_ME policy
      if (existingPolicy && existingPolicy.audienceMode === AUDIENCE_MODE.ONLY_ME) {
        continue;
      }
      await this.setDocumentPolicy(ownerId, doc._id, {
        audienceMode,
        selectedUserIds,
        excludedUserIds,
        permissions,
        expiresAt,
      });
      appliedCount++;
    }

    return { success: true, rule, appliedToExistingDocs: appliedCount };
  }

  /**
   * Check and apply category rule to a newly uploaded document if scope is EXISTING_AND_FUTURE
   */
  static async applyFutureCategoryRule(doc) {
    try {
      const rule = await SharingRule.findOne({
        ownerId: doc.userId,
        category: doc.category,
        scope: RULE_SCOPE.EXISTING_AND_FUTURE,
        status: 'ACTIVE',
      });

      if (rule) {
        await this.setDocumentPolicy(doc.userId, doc._id, {
          audienceMode: rule.audienceMode,
          selectedUserIds: rule.selectedUserIds,
          excludedUserIds: rule.excludedUserIds,
          permissions: rule.permissions,
          expiresAt: rule.expiresAt,
        });
      }
    } catch (err) {
      console.warn('[Category Rule Auto-Apply Error]:', err.message);
    }
  }
}

