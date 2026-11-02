import mongoose from 'mongoose';
import { Relationship, RELATIONSHIP_TYPES } from '../models/relationship.model.js';
import { Entity } from '../models/entity.model.js';

/**
 * Creates or updates a verified relationship between two entities.
 * Enforces that both entities belong to the same authenticated user.
 */
export async function createOrUpdateRelationship({
  userId,
  familyId = null,
  fromEntityId,
  relationshipType,
  toEntityId,
  sourceDocumentId = null,
  evidenceId = null,
  confidence = 1.0,
  verificationStatus = 'unverified',
  metadata = {},
}) {
  if (!userId) throw new Error('userId is required');
  if (!fromEntityId || !toEntityId) throw new Error('fromEntityId and toEntityId are required');
  if (fromEntityId.toString() === toEntityId.toString()) {
    throw new Error('Self-referencing relationships are not permitted');
  }
  if (!relationshipType || !RELATIONSHIP_TYPES[relationshipType]) {
    throw new Error(`Invalid relationshipType. Allowed: ${Object.values(RELATIONSHIP_TYPES).join(', ')}`);
  }

  // Verify ownership of both entities
  const [fromEntity, toEntity] = await Promise.all([
    Entity.findOne({ _id: fromEntityId, userId, status: { $ne: 'deleted' } }),
    Entity.findOne({ _id: toEntityId, userId, status: { $ne: 'deleted' } }),
  ]);

  if (!fromEntity) throw new Error(`Source entity not found or not owned by user: ${fromEntityId}`);
  if (!toEntity) throw new Error(`Target entity not found or not owned by user: ${toEntityId}`);

  // Find or create relationship
  let rel = await Relationship.findOne({
    userId,
    fromEntityId,
    toEntityId,
    relationshipType,
  });

  if (rel) {
    if (sourceDocumentId) rel.sourceDocumentId = sourceDocumentId;
    if (evidenceId) rel.evidenceId = evidenceId;
    rel.confidence = Math.max(rel.confidence, confidence);
    if (verificationStatus === 'confirmed') rel.verificationStatus = 'confirmed';
    rel.metadata = { ...rel.metadata, ...metadata };
    await rel.save();
    return rel;
  }

  rel = await Relationship.create({
    userId,
    familyId,
    fromEntityId,
    relationshipType,
    toEntityId,
    sourceDocumentId,
    evidenceId,
    confidence,
    verificationStatus,
    metadata,
  });

  return rel;
}

/**
 * Retrieve all relationships connected to a specific entity.
 */
export async function getEntityRelationships(entityId, userId, direction = 'both') {
  if (!mongoose.Types.ObjectId.isValid(entityId)) return [];

  const query = { userId };
  if (direction === 'outgoing') {
    query.fromEntityId = entityId;
  } else if (direction === 'incoming') {
    query.toEntityId = entityId;
  } else {
    query.$or = [{ fromEntityId: entityId }, { toEntityId: entityId }];
  }

  return await Relationship.find(query)
    .populate('fromEntityId', 'name entityType normalizedName status')
    .populate('toEntityId', 'name entityType normalizedName status')
    .populate('sourceDocumentId', 'title category status expiryDate')
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Traverses the knowledge graph starting from an entity up to maxDepth hops.
 * Stays strictly within the tenant boundary (userId).
 */
export async function traverseGraph({ startEntityId, userId, maxDepth = 2 }) {
  if (!mongoose.Types.ObjectId.isValid(startEntityId)) {
    return { entities: [], relationships: [] };
  }

  const visitedEntityIds = new Set([startEntityId.toString()]);
  const collectedRelationships = [];
  let currentLayer = [startEntityId.toString()];

  for (let depth = 0; depth < maxDepth; depth++) {
    if (currentLayer.length === 0) break;

    const layerObjectIds = currentLayer.map(id => new mongoose.Types.ObjectId(id));
    const edges = await Relationship.find({
      userId,
      $or: [{ fromEntityId: { $in: layerObjectIds } }, { toEntityId: { $in: layerObjectIds } }],
    })
      .populate('fromEntityId', 'name entityType status')
      .populate('toEntityId', 'name entityType status')
      .populate('sourceDocumentId', 'title category status expiryDate')
      .lean();

    const nextLayer = [];

    for (const edge of edges) {
      collectedRelationships.push(edge);

      const fromId = edge.fromEntityId?._id?.toString() || edge.fromEntityId?.toString();
      const toId = edge.toEntityId?._id?.toString() || edge.toEntityId?.toString();

      if (fromId && !visitedEntityIds.has(fromId)) {
        visitedEntityIds.add(fromId);
        nextLayer.push(fromId);
      }
      if (toId && !visitedEntityIds.has(toId)) {
        visitedEntityIds.add(toId);
        nextLayer.push(toId);
      }
    }

    currentLayer = nextLayer;
  }

  // Fetch full entity details for all visited nodes
  const entityObjectIds = Array.from(visitedEntityIds).map(id => new mongoose.Types.ObjectId(id));
  const entities = await Entity.find({
    _id: { $in: entityObjectIds },
    userId,
    status: { $ne: 'deleted' },
  })
    .populate('linkedDocumentIds', 'title category expiryDate')
    .lean();

  return {
    entities,
    relationships: collectedRelationships,
  };
}

/**
 * Delete a relationship edge ensuring tenant ownership.
 */
export async function deleteRelationship(relationshipId, userId) {
  const result = await Relationship.deleteOne({ _id: relationshipId, userId });
  return result.deletedCount > 0;
}

