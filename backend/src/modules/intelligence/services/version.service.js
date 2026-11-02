import mongoose from 'mongoose';
import { DocumentVersionGroup } from '../models/documentVersion.model.js';
import { Document } from '../../documents/document.model.js';
import { DocumentFact } from '../models/documentFact.model.js';

/**
 * Compares two documents and computes field-level differences.
 */
export async function compareDocumentVersions({ documentAId, documentBId, userId }) {
  const [docA, docB, factsA, factsB] = await Promise.all([
    Document.findOne({ _id: documentAId, userId }).lean(),
    Document.findOne({ _id: documentBId, userId }).lean(),
    DocumentFact.find({ documentId: documentAId, userId }).lean(),
    DocumentFact.find({ documentId: documentBId, userId }).lean(),
  ]);

  if (!docA || !docB) {
    throw new Error('One or both documents not found or access denied');
  }

  // Build fact maps
  const mapA = {};
  factsA.forEach(f => { mapA[f.fieldName.toLowerCase()] = f; });
  const mapB = {};
  factsB.forEach(f => { mapB[f.fieldName.toLowerCase()] = f; });

  const allFieldKeys = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);
  const differences = [];
  const unchanged = [];

  for (const field of allFieldKeys) {
    const valA = mapA[field]?.normalizedValue ?? null;
    const valB = mapB[field]?.normalizedValue ?? null;

    if (String(valA) !== String(valB)) {
      differences.push({
        fieldName: field,
        oldValue: valA,
        newValue: valB,
        oldEvidence: mapA[field]?.sourceTextReference || null,
        newEvidence: mapB[field]?.sourceTextReference || null,
      });
    } else {
      unchanged.push({
        fieldName: field,
        value: valA,
      });
    }
  }

  // Also compare document metadata
  if (docA.expiryDate !== docB.expiryDate) {
    differences.push({
      fieldName: 'expiry_date',
      oldValue: docA.expiryDate,
      newValue: docB.expiryDate,
      oldEvidence: `Doc A Expiry: ${docA.expiryDate}`,
      newEvidence: `Doc B Expiry: ${docB.expiryDate}`,
    });
  }

  return {
    documentA: { id: docA._id, title: docA.title, category: docA.category, createdAt: docA.createdAt },
    documentB: { id: docB._id, title: docB.title, category: docB.category, createdAt: docB.createdAt },
    differencesCount: differences.length,
    differences,
    unchangedCount: unchanged.length,
    unchanged,
  };
}

/**
 * Link a document as a new version in a document group.
 */
export async function addDocumentVersion({
  userId,
  documentGroupId,
  documentId,
  previousVersionId = null,
  changeSummary = null,
  entityId = null,
}) {
  const doc = await Document.findOne({ _id: documentId, userId });
  if (!doc) throw new Error('Document not found or access denied');

  let group = await DocumentVersionGroup.findOne({ userId, documentGroupId });

  if (!group) {
    // Create new group
    group = await DocumentVersionGroup.create({
      userId,
      documentGroupId,
      entityId,
      documentType: doc.category || 'Other',
      title: `${doc.title} History`,
      versions: [
        {
          documentId: doc._id,
          versionNumber: 1,
          previousVersionId: null,
          uploadedAt: doc.createdAt || new Date(),
          changeSummary: 'Initial document upload',
          isCurrentVersion: true,
        },
      ],
    });
    return group;
  }

  // Compute differences if previousVersionId is provided
  let changedFields = [];
  if (previousVersionId) {
    try {
      const diffResult = await compareDocumentVersions({
        documentAId: previousVersionId,
        documentBId: documentId,
        userId,
      });
      changedFields = diffResult.differences;
    } catch (err) {
      console.warn('[Version Service] Diff computation failed:', err.message);
    }
  }

  // Set previous versions' isCurrentVersion to false
  group.versions.forEach(v => { v.isCurrentVersion = false; });

  const nextVersionNumber = group.versions.length + 1;
  group.versions.push({
    documentId: doc._id,
    versionNumber: nextVersionNumber,
    previousVersionId,
    uploadedAt: new Date(),
    changeSummary: changeSummary || `Version ${nextVersionNumber} uploaded`,
    changedFields,
    isCurrentVersion: true,
  });

  await group.save();
  return group;
}

/**
 * Get version history for a document.
 */
export async function getDocumentVersionHistory(documentId, userId) {
  const group = await DocumentVersionGroup.findOne({
    userId,
    'versions.documentId': documentId,
  })
    .populate('versions.documentId', 'title originalName category expiryDate status fileSizeFormatted')
    .lean();

  if (!group) {
    return {
      hasVersionHistory: false,
      versions: [],
    };
  }

  return {
    hasVersionHistory: true,
    documentGroupId: group.documentGroupId,
    title: group.title,
    versions: group.versions,
  };
}
