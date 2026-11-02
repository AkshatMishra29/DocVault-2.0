import mongoose from 'mongoose';
import { Entity, ENTITY_TYPES } from '../models/entity.model.js';
import { Relationship, RELATIONSHIP_TYPES } from '../models/relationship.model.js';
import { Document } from '../../documents/document.model.js';
import { calculateDocumentHealth } from './health.service.js';

/**
 * Family Access & Membership Abstraction Service
 *
 * Provides a security-first integration boundary for multi-tenant and family-vault access.
 * Enforces backend authorization checks before document and fact disclosure.
 */

/**
 * Checks whether the requesting user has permission to view a family entity's documents.
 * For single-user vaults, verifies entity ownership.
 * For shared family vaults (when familyId is configured), checks membership access.
 */
export async function assertFamilyAccessPermission(userId, targetEntityId, familyId = null) {
  if (!userId || !targetEntityId) {
    throw new Error('Access denied: Missing authorization credentials');
  }

  const entity = await Entity.findOne({
    _id: targetEntityId,
    $or: [
      { userId }, // Personal vault access
      ...(familyId ? [{ familyId }] : []), // Shared family vault access
    ],
    status: { $ne: 'deleted' },
  });

  if (!entity) {
    const error = new Error('Access denied: Unauthorized family entity or permission denied');
    error.statusCode = 403;
    throw error;
  }

  return entity;
}

/**
 * Resolves a natural-language person reference (e.g. "Dad", "Mom", "Self", "Wife")
 * to a verified PERSON Entity in the user's vault.
 */
export async function resolvePersonEntity(userId, relationTerm) {
  if (!relationTerm || typeof relationTerm !== 'string') return null;

  const cleanTerm = relationTerm.trim().toLowerCase();

  // Search by exact normalized name or case-insensitive aliases or role
  const entity = await Entity.findOne({
    userId,
    entityType: ENTITY_TYPES.PERSON,
    status: { $ne: 'deleted' },
    $or: [
      { normalizedName: cleanTerm },
      { name: { $regex: new RegExp(`^${cleanTerm}$`, 'i') } },
      { aliases: { $regex: new RegExp(`^${cleanTerm}$`, 'i') } },
      { 'attributes.role': { $regex: new RegExp(cleanTerm, 'i') } },
    ],
  });

  return entity;
}

/**
 * Executes a family-aware document retrieval query.
 *
 * Example:
 *   resolveFamilyQuery({ userId: '...', personQuery: 'Dad', documentQuery: 'car insurance' })
 */
export async function executeFamilyAwareRetrieval({
  userId,
  personQuery = null,
  assetQuery = null,
  categoryFilter = null,
}) {
  // 1. Resolve Target Person if specified
  let personEntity = null;
  if (personQuery) {
    personEntity = await resolvePersonEntity(userId, personQuery);
    if (!personEntity) {
      return {
        success: true,
        resolved: false,
        message: `No family member matching "${personQuery}" was found in your vault.`,
        entities: [],
        documents: [],
      };
    }
  }

  // 2. Resolve connected Assets through Graph relationships
  let targetEntityIds = personEntity ? [personEntity._id] : [];

  if (personEntity) {
    // Find assets owned by or belonging to this person
    const ownedRels = await Relationship.find({
      userId,
      fromEntityId: personEntity._id,
      relationshipType: { $in: [RELATIONSHIP_TYPES.OWNS, RELATIONSHIP_TYPES.RELATED_TO] },
    }).lean();

    const assetIds = ownedRels.map(r => r.toEntityId);
    targetEntityIds = [...targetEntityIds, ...assetIds];
  }

  // 3. If assetQuery is provided, filter by asset name
  if (assetQuery) {
    const matchingEntities = await Entity.find({
      userId,
      _id: { $in: targetEntityIds },
      name: { $regex: assetQuery, $options: 'i' },
      status: { $ne: 'deleted' },
    }).lean();

    if (matchingEntities.length > 0) {
      targetEntityIds = matchingEntities.map(e => e._id);
    }
  }

  // 4. Retrieve connected documents for these entities
  const entities = await Entity.find({
    _id: { $in: targetEntityIds },
    userId,
    status: { $ne: 'deleted' },
  }).lean();

  const allDocIds = new Set();
  entities.forEach(e => {
    (e.linkedDocumentIds || []).forEach(id => allDocIds.add(id.toString()));
  });

  // Query documents with tenant isolation and category filter
  const docQuery = {
    userId,
    _id: { $in: Array.from(allDocIds).map(id => new mongoose.Types.ObjectId(id)) },
  };

  if (categoryFilter) {
    docQuery.category = { $regex: categoryFilter, $options: 'i' };
  }

  const documents = await Document.find(docQuery)
    .select('title category expiryDate status originalName keyDetails')
    .lean();

  // 5. Enrich with health status
  const enrichedDocs = documents.map(d => ({
    ...d,
    health: calculateDocumentHealth(d),
  }));

  return {
    success: true,
    resolved: true,
    person: personEntity ? { id: personEntity._id, name: personEntity.name } : null,
    entitiesCount: entities.length,
    documents: enrichedDocs,
    summary: `Found ${enrichedDocs.length} authorized document(s) matching your request.`,
  };
}
