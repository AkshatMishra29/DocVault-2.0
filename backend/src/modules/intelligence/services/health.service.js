import mongoose from 'mongoose';
import { Document } from '../../documents/document.model.js';

export const HEALTH_STATUS = {
  VALID: 'VALID',
  EXPIRING_SOON: 'EXPIRING_SOON',
  EXPIRED: 'EXPIRED',
  UNKNOWN: 'UNKNOWN',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
};

// Configurable warning periods in days based on document category
export const WARNING_PERIODS_DAYS = {
  'Insurance Policy': 30,
  'Motor Insurance': 30,
  'Health Insurance': 45,
  'Passport': 180,
  'Visa': 90,
  'Driving Licence': 60,
  'Pollution Certificate': 15,
  'Warranty Document': 30,
  'Other': 30,
};

/**
 * Get warning period in days for a document type.
 */
export function getWarningPeriodDays(category = 'Other') {
  if (!category) return WARNING_PERIODS_DAYS['Other'];

  for (const [key, days] of Object.entries(WARNING_PERIODS_DAYS)) {
    if (category.toLowerCase().includes(key.toLowerCase())) {
      return days;
    }
  }
  return WARNING_PERIODS_DAYS['Other'];
}

/**
 * Calculates document health deterministically using standard date arithmetic.
 */
export function calculateDocumentHealth(doc, customWarningDays = null) {
  if (!doc) {
    return {
      status: HEALTH_STATUS.UNKNOWN,
      daysLeft: null,
      warningPeriodDays: 30,
      reason: 'No document provided',
    };
  }

  // 1. Check if document status requires human review
  if (doc.status === 'needs_review' || doc.reviewStatus === 'pending_review') {
    return {
      status: HEALTH_STATUS.NEEDS_REVIEW,
      daysLeft: null,
      warningPeriodDays: 30,
      reason: 'Document has ambiguous or conflicting extracted fields requiring review',
    };
  }

  // 2. Check for missing expiry date
  if (!doc.expiryDate || typeof doc.expiryDate !== 'string') {
    return {
      status: HEALTH_STATUS.UNKNOWN,
      daysLeft: null,
      warningPeriodDays: getWarningPeriodDays(doc.category),
      reason: 'No expiration date recorded for this document',
    };
  }

  // 3. Parse date safely
  const expiry = new Date(doc.expiryDate);
  if (isNaN(expiry.getTime())) {
    return {
      status: HEALTH_STATUS.NEEDS_REVIEW,
      daysLeft: null,
      warningPeriodDays: 30,
      reason: `Unparseable date format: "${doc.expiryDate}"`,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - today.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const warningDays = customWarningDays !== null ? customWarningDays : getWarningPeriodDays(doc.category);

  // 4. Evaluate status
  if (daysLeft < 0) {
    return {
      status: HEALTH_STATUS.EXPIRED,
      daysLeft,
      warningPeriodDays: warningDays,
      reason: `Document expired ${Math.abs(daysLeft)} days ago on ${doc.expiryDate}`,
    };
  }

  if (daysLeft <= warningDays) {
    return {
      status: HEALTH_STATUS.EXPIRING_SOON,
      daysLeft,
      warningPeriodDays: warningDays,
      reason: `Document expires in ${daysLeft} days (within ${warningDays}-day warning threshold)`,
    };
  }

  return {
    status: HEALTH_STATUS.VALID,
    daysLeft,
    warningPeriodDays: warningDays,
    reason: `Document is active and valid for ${daysLeft} more days`,
  };
}

/**
 * Calculate comprehensive vault-wide health summary for a user.
 */
export async function getVaultHealthSummary(userId) {
  const documents = await Document.find({ userId }).select('title originalName category expiryDate status reviewStatus').lean();

  const summary = {
    totalDocuments: documents.length,
    counts: {
      [HEALTH_STATUS.VALID]: 0,
      [HEALTH_STATUS.EXPIRING_SOON]: 0,
      [HEALTH_STATUS.EXPIRED]: 0,
      [HEALTH_STATUS.UNKNOWN]: 0,
      [HEALTH_STATUS.NEEDS_REVIEW]: 0,
    },
    expiringSoon: [],
    expired: [],
    needsReview: [],
  };

  for (const doc of documents) {
    const health = calculateDocumentHealth(doc);
    summary.counts[health.status] = (summary.counts[health.status] || 0) + 1;

    const enrichedDoc = {
      ...doc,
      health,
    };

    if (health.status === HEALTH_STATUS.EXPIRING_SOON) {
      summary.expiringSoon.push(enrichedDoc);
    } else if (health.status === HEALTH_STATUS.EXPIRED) {
      summary.expired.push(enrichedDoc);
    } else if (health.status === HEALTH_STATUS.NEEDS_REVIEW) {
      summary.needsReview.push(enrichedDoc);
    }
  }

  // Sort expiring soon by nearest expiry
  summary.expiringSoon.sort((a, b) => (a.health.daysLeft || 0) - (b.health.daysLeft || 0));

  return summary;
}

/**
 * Get health detail for a single document with user verification.
 */
export async function getDocumentHealthDetail(documentId, userId) {
  const doc = await Document.findOne({ _id: documentId, userId }).lean();
  if (!doc) return null;

  const health = calculateDocumentHealth(doc);
  return {
    documentId: doc._id,
    title: doc.title,
    category: doc.category,
    expiryDate: doc.expiryDate,
    ...health,
  };
}

