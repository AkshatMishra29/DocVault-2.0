import mongoose from 'mongoose';
import { ConflictRecord, CONFLICT_STATUS } from '../models/conflict.model.js';
import { DocumentFact } from '../models/documentFact.model.js';
import { Entity } from '../models/entity.model.js';
import { normalizeFactValue } from './fact.service.js';

/**
 * Normalizes values for strict equality comparison.
 */
function areFactValuesEqual(valA, valB, fieldName = '') {
  if (valA === valB) return true;
  if (valA === null || valB === null || valA === undefined || valB === undefined) return false;

  const { normalized: normA } = normalizeFactValue(fieldName, valA);
  const { normalized: normB } = normalizeFactValue(fieldName, valB);

  return String(normA).toLowerCase().trim() === String(normB).toLowerCase().trim();
}

/**
 * Scans facts across all documents linked to an entity and detects conflicting values.
 */
export async function detectEntityFactConflicts(entityId, userId) {
  const entity = await Entity.findOne({ _id: entityId, userId }).lean();
  if (!entity) throw new Error('Entity not found or access denied');

  // Fetch all facts linked to this entity or linked to entity's documents
  const linkedDocIds = (entity.linkedDocumentIds || []).map(id => id.toString());

  const facts = await DocumentFact.find({
    userId,
    $or: [{ entityId }, { documentId: { $in: linkedDocIds } }],
  })
    .populate('documentId', 'title category')
    .lean();

  // Group facts by fieldName
  const factsByField = {};
  for (const f of facts) {
    const key = f.fieldName.toLowerCase();
    if (!factsByField[key]) factsByField[key] = [];
    factsByField[key].push(f);
  }

  const detectedConflicts = [];

  for (const [fieldName, fieldFacts] of Object.entries(factsByField)) {
    if (fieldFacts.length < 2) continue;

    // Compare each pair across DIFFERENT documents
    for (let i = 0; i < fieldFacts.length; i++) {
      for (let j = i + 1; j < fieldFacts.length; j++) {
        const factA = fieldFacts[i];
        const factB = fieldFacts[j];

        const docAId = factA.documentId?._id || factA.documentId;
        const docBId = factB.documentId?._id || factB.documentId;

        // Skip comparison within the same document or if IDs are missing
        if (!docAId || !docBId || docAId.toString() === docBId.toString()) continue;

        const isEqual = areFactValuesEqual(factA.normalizedValue, factB.normalizedValue, fieldName);

        if (!isEqual) {
          // Check if an existing open or resolved conflict record exists
          const existing = await ConflictRecord.findOne({
            userId,
            entityId,
            fieldName,
            $or: [
              { documentAId: docAId, documentBId: docBId },
              { documentAId: docBId, documentBId: docAId },
            ],
          });

          if (!existing) {
            const conflict = await ConflictRecord.create({
              userId,
              entityId,
              fieldName,
              documentAId: docAId,
              factAValue: factA.normalizedValue,
              factAOriginal: factA.originalValue,
              documentBId: docBId,
              factBValue: factB.normalizedValue,
              factBOriginal: factB.originalValue,
              status: CONFLICT_STATUS.OPEN,
            });
            detectedConflicts.push(conflict);
          } else if (existing.status === CONFLICT_STATUS.OPEN) {
            detectedConflicts.push(existing);
          }
        }
      }
    }
  }

  return detectedConflicts;
}

/**
 * List all conflicts for a user with status filtering.
 */
export async function getUserConflicts({ userId, status = CONFLICT_STATUS.OPEN, page = 1, limit = 50 }) {
  const query = { userId };
  if (status) query.status = status;

  const skip = (Math.max(1, page) - 1) * limit;

  const [conflicts, total] = await Promise.all([
    ConflictRecord.find(query)
      .populate('entityId', 'name entityType')
      .populate('documentAId', 'title category originalName')
      .populate('documentBId', 'title category originalName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ConflictRecord.countDocuments(query),
  ]);

  return {
    conflicts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Resolves a conflict with user decision (KEEP_A, KEEP_B, or MANUAL_OVERRIDE).
 * Non-destructive: preserves original historical facts.
 */
export async function resolveConflict({
  conflictId,
  userId,
  resolution,
  manualValue = null,
  notes = null,
}) {
  const conflict = await ConflictRecord.findOne({ _id: conflictId, userId });
  if (!conflict) throw new Error('Conflict record not found or access denied');

  if (!['KEEP_A', 'KEEP_B', 'MANUAL_OVERRIDE'].includes(resolution)) {
    throw new Error('Invalid resolution. Must be KEEP_A, KEEP_B, or MANUAL_OVERRIDE');
  }

  let resolvedValue = null;
  if (resolution === 'KEEP_A') {
    resolvedValue = conflict.factAValue;
  } else if (resolution === 'KEEP_B') {
    resolvedValue = conflict.factBValue;
  } else if (resolution === 'MANUAL_OVERRIDE') {
    if (manualValue === null || manualValue === undefined) {
      throw new Error('manualValue is required when resolution is MANUAL_OVERRIDE');
    }
    resolvedValue = manualValue;
  }

  conflict.status = CONFLICT_STATUS.RESOLVED;
  conflict.resolution = resolution;
  conflict.resolvedValue = resolvedValue;
  conflict.resolvedBy = userId;
  conflict.resolvedAt = new Date();
  if (notes) conflict.notes = notes;

  await conflict.save();

  return conflict;
}
