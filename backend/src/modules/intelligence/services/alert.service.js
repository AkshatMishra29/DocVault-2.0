import mongoose from 'mongoose';
import { IntelligenceAlert, ALERT_TYPES, ALERT_SEVERITY, ALERT_STATUS } from '../models/alert.model.js';
import { Document } from '../../documents/document.model.js';
import { Entity } from '../models/entity.model.js';
import { ConflictRecord, CONFLICT_STATUS } from '../models/conflict.model.js';
import { calculateDocumentHealth, HEALTH_STATUS } from './health.service.js';
import { evaluateEntityCompleteness } from './completeness.service.js';

/**
 * Creates or updates an alert with strict deduplication key semantics.
 */
export async function emitAlert({
  userId,
  familyId = null,
  alertType,
  severity = ALERT_SEVERITY.INFO,
  title,
  message,
  relatedDocumentIds = [],
  relatedEntityIds = [],
  evidenceReferences = {},
  deduplicationKey,
  actionLabel = 'Review',
  actionUrl = null,
}) {
  if (!userId || !alertType || !title || !deduplicationKey) {
    throw new Error('Missing required fields for alert creation');
  }

  // Check for existing active alert with same deduplicationKey
  const existing = await IntelligenceAlert.findOne({ userId, deduplicationKey });

  if (existing) {
    // If already active, refresh message and severity
    if (existing.status === ALERT_STATUS.ACTIVE) {
      existing.title = title;
      existing.message = message;
      existing.severity = severity;
      existing.relatedDocumentIds = relatedDocumentIds;
      existing.relatedEntityIds = relatedEntityIds;
      existing.evidenceReferences = evidenceReferences;
      await existing.save();
      return existing;
    }
    // If dismissed or resolved, do not re-open unless specified
    return existing;
  }

  const alert = await IntelligenceAlert.create({
    userId,
    familyId,
    alertType,
    severity,
    title,
    message,
    relatedDocumentIds,
    relatedEntityIds,
    evidenceReferences,
    deduplicationKey,
    actionLabel,
    actionUrl,
    status: ALERT_STATUS.ACTIVE,
  });

  return alert;
}

/**
 * Evaluates the vault for proactive alerts:
 * 1. Expirations and upcoming deadlines
 * 2. Unresolved conflicts
 * 3. Incomplete entity requirements
 * 4. Documents requiring human review
 */
export async function evaluateProactiveAlerts(userId) {
  const [documents, entities, conflicts] = await Promise.all([
    Document.find({ userId }).lean(),
    Entity.find({ userId, status: { $ne: 'deleted' } }).lean(),
    ConflictRecord.find({ userId, status: CONFLICT_STATUS.OPEN }).lean(),
  ]);

  const generatedAlerts = [];

  // 1. Evaluate Document Expirations
  for (const doc of documents) {
    const health = calculateDocumentHealth(doc);

    if (health.status === HEALTH_STATUS.EXPIRED) {
      const dedupKey = `alert_expired_${doc._id}_${doc.expiryDate}`;
      const alert = await emitAlert({
        userId,
        alertType: ALERT_TYPES.DOCUMENT_EXPIRED,
        severity: ALERT_SEVERITY.CRITICAL,
        title: `Expired: ${doc.title}`,
        message: `This document expired on ${doc.expiryDate} (${Math.abs(health.daysLeft)} days ago). Please renew or upload an updated copy.`,
        relatedDocumentIds: [doc._id],
        deduplicationKey: dedupKey,
        actionLabel: 'View Document',
        actionUrl: `/documents/${doc._id}`,
      });
      generatedAlerts.push(alert);
    } else if (health.status === HEALTH_STATUS.EXPIRING_SOON) {
      const dedupKey = `alert_expiring_${doc._id}_${doc.expiryDate}`;
      const alert = await emitAlert({
        userId,
        alertType: ALERT_TYPES.DOCUMENT_EXPIRY,
        severity: health.daysLeft <= 15 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING,
        title: `Expiring Soon: ${doc.title}`,
        message: `This document will expire in ${health.daysLeft} days (on ${doc.expiryDate}). Action may be needed.`,
        relatedDocumentIds: [doc._id],
        deduplicationKey: dedupKey,
        actionLabel: 'Plan Renewal',
        actionUrl: `/documents/${doc._id}`,
      });
      generatedAlerts.push(alert);
    } else if (health.status === HEALTH_STATUS.NEEDS_REVIEW) {
      const dedupKey = `alert_review_${doc._id}`;
      const alert = await emitAlert({
        userId,
        alertType: ALERT_TYPES.DOCUMENT_REVIEW_REQUIRED,
        severity: ALERT_SEVERITY.WARNING,
        title: `Verification Needed: ${doc.title}`,
        message: health.reason || 'Document extracted data requires manual confirmation.',
        relatedDocumentIds: [doc._id],
        deduplicationKey: dedupKey,
        actionLabel: 'Review Fields',
        actionUrl: `/documents/${doc._id}`,
      });
      generatedAlerts.push(alert);
    }
  }

  // 2. Evaluate Open Conflicts
  for (const conflict of conflicts) {
    const dedupKey = `alert_conflict_${conflict._id}`;
    const alert = await emitAlert({
      userId,
      alertType: ALERT_TYPES.INFORMATION_CONFLICT,
      severity: ALERT_SEVERITY.WARNING,
      title: `Information Conflict on ${conflict.fieldName}`,
      message: `Discrepancy detected: Document A reports "${conflict.factAValue}" while Document B reports "${conflict.factBValue}".`,
      relatedDocumentIds: [conflict.documentAId, conflict.documentBId],
      relatedEntityIds: [conflict.entityId],
      deduplicationKey: dedupKey,
      actionLabel: 'Resolve Conflict',
      actionUrl: `/intelligence/conflicts`,
    });
    generatedAlerts.push(alert);
  }

  // 3. Evaluate Missing Entity Requirements
  for (const entity of entities) {
    try {
      const completeness = await evaluateEntityCompleteness(entity._id, userId);
      if (completeness.hasTemplate) {
        for (const item of completeness.items) {
          if (item.status === 'POTENTIALLY_MISSING' && item.isRequired) {
            const dedupKey = `alert_missing_${entity._id}_${item.requirementKey}`;
            const alert = await emitAlert({
              userId,
              alertType: ALERT_TYPES.MISSING_DOCUMENT,
              severity: ALERT_SEVERITY.INFO,
              title: `Missing ${item.title}`,
              message: `${item.title} for ${entity.name} was not found in your DocVault.`,
              relatedEntityIds: [entity._id],
              deduplicationKey: dedupKey,
              actionLabel: 'Upload Document',
              actionUrl: `/upload`,
            });
            generatedAlerts.push(alert);
          }
        }
      }
    } catch (e) {
      console.warn(`[Alerts] Error checking completeness for entity ${entity._id}:`, e.message);
    }
  }

  return generatedAlerts;
}

/**
 * Retrieve active alerts with severity and type filtering.
 */
export async function getUserAlerts({
  userId,
  status = ALERT_STATUS.ACTIVE,
  severity = null,
  limit = 50,
}) {
  const query = { userId };
  if (status) query.status = status;
  if (severity) query.severity = severity;

  return await IntelligenceAlert.find(query)
    .populate('relatedDocumentIds', 'title category expiryDate')
    .populate('relatedEntityIds', 'name entityType')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * Dismiss an alert.
 */
export async function dismissAlert(alertId, userId) {
  const alert = await IntelligenceAlert.findOne({ _id: alertId, userId });
  if (!alert) throw new Error('Alert not found or access denied');

  alert.status = ALERT_STATUS.DISMISSED;
  alert.dismissedAt = new Date();
  await alert.save();
  return alert;
}

/**
 * Mark an alert resolved.
 */
export async function resolveAlert(alertId, userId) {
  const alert = await IntelligenceAlert.findOne({ _id: alertId, userId });
  if (!alert) throw new Error('Alert not found or access denied');

  alert.status = ALERT_STATUS.RESOLVED;
  alert.resolvedAt = new Date();
  await alert.save();
  return alert;
}

