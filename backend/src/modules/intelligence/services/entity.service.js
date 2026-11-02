import mongoose from 'mongoose';
import { Entity, ENTITY_TYPES } from '../models/entity.model.js';
import { Relationship } from '../models/relationship.model.js';

export function normalizeEntityName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Creates an entity with automatic deduplication per user.
 * If an entity with the same type and normalized name already exists,
 * it merges attributes and aliases rather than creating a duplicate.
 */
export async function createOrUpdateEntity({
  userId,
  familyId = null,
  entityType,
  name,
  attributes = {},
  aliases = [],
  linkedDocumentIds = [],
  linkedAssetId = null,
}) {
  if (!userId) throw new Error('userId is required');
  if (!name) throw new Error('Entity name is required');
  if (!entityType || !ENTITY_TYPES[entityType]) {
    throw new Error(`Invalid entityType. Allowed: ${Object.values(ENTITY_TYPES).join(', ')}`);
  }

  const normalizedName = normalizeEntityName(name);

  // Check for existing entity
  let entity = await Entity.findOne({
    userId,
    entityType,
    normalizedName,
    status: { $ne: 'deleted' },
  });

  if (entity) {
    // Merge attributes safely
    entity.attributes = { ...entity.attributes, ...attributes };

    // Merge aliases
    if (Array.isArray(aliases)) {
      const aliasSet = new Set([...(entity.aliases || []), ...aliases]);
      entity.aliases = Array.from(aliasSet);
    }

    // Merge linked documents
    if (Array.isArray(linkedDocumentIds) && linkedDocumentIds.length > 0) {
      const docSet = new Set([
        ...(entity.linkedDocumentIds || []).map(id => id.toString()),
        ...linkedDocumentIds.map(id => id.toString()),
      ]);
      entity.linkedDocumentIds = Array.from(docSet).map(id => new mongoose.Types.ObjectId(id));
    }

    if (linkedAssetId) {
      entity.linkedAssetId = linkedAssetId;
    }

    await entity.save();
    return entity;
  }

  // Create new entity
  entity = await Entity.create({
    userId,
    familyId,
    entityType,
    name: name.trim(),
    normalizedName,
    attributes,
    aliases: Array.isArray(aliases) ? aliases : [],
    linkedDocumentIds: Array.isArray(linkedDocumentIds) ? linkedDocumentIds : [],
    linkedAssetId,
  });

  return entity;
}

/**
 * Get user entities with optional filtering, search, and pagination.
 */
export async function getUserEntities({
  userId,
  entityType = null,
  status = 'active',
  search = null,
  page = 1,
  limit = 50,
}) {
  const query = { userId };

  if (status) query.status = status;
  if (entityType && ENTITY_TYPES[entityType]) query.entityType = entityType;

  if (search && typeof search === 'string' && search.trim()) {
    const term = search.trim();
    query.$or = [
      { name: { $regex: term, $options: 'i' } },
      { aliases: { $regex: term, $options: 'i' } },
    ];
  }

  const skip = (Math.max(1, page) - 1) * limit;
  const [entities, total] = await Promise.all([
    Entity.find(query)
      .populate('linkedDocumentIds', 'title category expiryDate status')
      .populate('linkedAssetId', 'name category status')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Entity.countDocuments(query),
  ]);

  return {
    entities,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Retrieve a single entity by ID enforcing strict tenant isolation.
 */
export async function getEntityById(entityId, userId) {
  if (!mongoose.Types.ObjectId.isValid(entityId)) return null;

  return await Entity.findOne({
    _id: entityId,
    userId,
    status: { $ne: 'deleted' },
  })
    .populate('linkedDocumentIds', 'title originalName category expiryDate status fileSizeFormatted keyDetails')
    .populate('linkedAssetId', 'name category status estimatedValue purchaseDate warrantyExpiry insuranceExpiry');
}

/**
 * Update an entity ensuring ownership check.
 */
export async function updateEntity(entityId, userId, updates = {}) {
  const entity = await Entity.findOne({ _id: entityId, userId, status: { $ne: 'deleted' } });
  if (!entity) return null;

  if (updates.name) {
    entity.name = updates.name.trim();
    entity.normalizedName = normalizeEntityName(updates.name);
  }
  if (updates.attributes) {
    entity.attributes = { ...entity.attributes, ...updates.attributes };
  }
  if (Array.isArray(updates.aliases)) {
    entity.aliases = updates.aliases;
  }
  if (updates.status) {
    entity.status = updates.status;
  }
  if (updates.linkedAssetId !== undefined) {
    entity.linkedAssetId = updates.linkedAssetId;
  }
  if (Array.isArray(updates.linkedDocumentIds)) {
    entity.linkedDocumentIds = updates.linkedDocumentIds;
  }

  await entity.save();
  return entity;
}

/**
 * Soft delete an entity and clean up connected relationships.
 */
export async function deleteEntity(entityId, userId) {
  const entity = await Entity.findOne({ _id: entityId, userId });
  if (!entity) return false;

  entity.status = 'deleted';
  await entity.save();

  // Delete relationships connected to this entity
  await Relationship.deleteMany({
    userId,
    $or: [{ fromEntityId: entityId }, { toEntityId: entityId }],
  });

  return true;
}
