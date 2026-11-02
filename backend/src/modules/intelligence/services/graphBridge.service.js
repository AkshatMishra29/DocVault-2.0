import mongoose from 'mongoose';
import { Asset } from '../../assets/asset.model.js';
import { Document } from '../../documents/document.model.js';
import { User } from '../../auth/auth.model.js';
import { createOrUpdateEntity } from './entity.service.js';
import { createOrUpdateRelationship } from './relationship.service.js';
import { ENTITY_TYPES } from '../models/entity.model.js';
import { RELATIONSHIP_TYPES } from '../models/relationship.model.js';

/**
 * Synchronizes existing user Assets and Documents into the Knowledge Graph.
 * Automatically seeds Person, Vehicle, Property, and Product entities,
 * and builds OWNS, PROTECTED_BY, and BELONGS_TO relationships.
 */
export async function syncUserVaultToKnowledgeGraph(userId) {
  if (!userId) return { success: false, error: 'userId required' };

  const [user, assets, documents] = await Promise.all([
    User.findById(userId).lean(),
    Asset.find({ userId }).lean(),
    Document.find({ userId }).lean(),
  ]);

  if (!user) return { success: false, error: 'User not found' };

  // 1. Ensure a primary PERSON entity exists for the account owner
  const ownerEntity = await createOrUpdateEntity({
    userId,
    entityType: ENTITY_TYPES.PERSON,
    name: user.name || 'Account Holder',
    aliases: ['Me', 'Self', 'Owner'],
    attributes: {
      email: user.email,
      role: 'Vault Owner',
    },
  });

  const createdEntities = [ownerEntity];
  const createdRelationships = [];

  // 2. Map Assets to Entities and establish OWNS relationships
  for (const asset of assets) {
    let entityType = ENTITY_TYPES.OTHER;
    const cat = (asset.category || '').toLowerCase();

    if (cat.includes('vehicle') || cat.includes('car') || cat.includes('bike')) {
      entityType = ENTITY_TYPES.VEHICLE;
    } else if (cat.includes('real estate') || cat.includes('property') || cat.includes('home') || cat.includes('apartment')) {
      entityType = ENTITY_TYPES.PROPERTY;
    } else if (cat.includes('appliance') || cat.includes('electronics') || cat.includes('product')) {
      entityType = ENTITY_TYPES.PRODUCT;
    }

    const assetEntity = await createOrUpdateEntity({
      userId,
      entityType,
      name: asset.name,
      attributes: {
        category: asset.category,
        estimatedValue: asset.estimatedValue,
        purchaseDate: asset.purchaseDate,
        warrantyExpiry: asset.warrantyExpiry,
        insuranceExpiry: asset.insuranceExpiry,
      },
      linkedAssetId: asset._id,
      linkedDocumentIds: asset.linkedDocumentIds || [],
    });
    createdEntities.push(assetEntity);

    // Person OWNS Asset
    const ownsRel = await createOrUpdateRelationship({
      userId,
      fromEntityId: ownerEntity._id,
      relationshipType: RELATIONSHIP_TYPES.OWNS,
      toEntityId: assetEntity._id,
      confidence: 1.0,
      verificationStatus: 'confirmed',
    });
    createdRelationships.push(ownsRel);

    // 3. Connect linked documents to the asset entity
    if (Array.isArray(asset.linkedDocumentIds)) {
      for (const docId of asset.linkedDocumentIds) {
        const doc = documents.find(d => d._id.toString() === docId.toString());
        if (!doc) continue;

        // If doc is an Insurance Policy, create an INSURANCE_POLICY entity and PROTECTED_BY relationship
        if ((doc.category || '').toLowerCase().includes('insurance')) {
          const policyEntity = await createOrUpdateEntity({
            userId,
            entityType: ENTITY_TYPES.INSURANCE_POLICY,
            name: doc.title,
            attributes: {
              category: doc.category,
              expiryDate: doc.expiryDate,
              policyNumber: doc.keyDetails?.['Policy Number'] || doc.keyDetails?.policyNumber,
            },
            linkedDocumentIds: [doc._id],
          });
          createdEntities.push(policyEntity);

          // Asset PROTECTED_BY InsurancePolicy
          const protRel = await createOrUpdateRelationship({
            userId,
            fromEntityId: assetEntity._id,
            relationshipType: RELATIONSHIP_TYPES.PROTECTED_BY,
            toEntityId: policyEntity._id,
            sourceDocumentId: doc._id,
            confidence: 0.95,
            verificationStatus: 'confirmed',
          });
          createdRelationships.push(protRel);
        }
      }
    }
  }

  // 4. Connect standalone insurance or identity documents to Person
  for (const doc of documents) {
    const titleLower = (doc.title || '').toLowerCase();
    const catLower = (doc.category || '').toLowerCase();

    if (catLower.includes('insurance') && !doc.assetId) {
      const policyEntity = await createOrUpdateEntity({
        userId,
        entityType: ENTITY_TYPES.INSURANCE_POLICY,
        name: doc.title,
        attributes: {
          category: doc.category,
          expiryDate: doc.expiryDate,
        },
        linkedDocumentIds: [doc._id],
      });

      // Person BELONGS_TO or OWNS policy
      const rel = await createOrUpdateRelationship({
        userId,
        fromEntityId: ownerEntity._id,
        relationshipType: RELATIONSHIP_TYPES.OWNS,
        toEntityId: policyEntity._id,
        sourceDocumentId: doc._id,
        confidence: 0.9,
      });
      createdRelationships.push(rel);
    }
  }

  return {
    success: true,
    entitiesSynced: createdEntities.length,
    relationshipsCreated: createdRelationships.length,
  };
}

