import mongoose from 'mongoose';
import { RequirementTemplate } from '../models/requirement.model.js';
import { Entity, ENTITY_TYPES } from '../models/entity.model.js';
import { Document } from '../../documents/document.model.js';
import { calculateDocumentHealth, HEALTH_STATUS } from './health.service.js';

export const DEFAULT_REQUIREMENTS = {
  [ENTITY_TYPES.VEHICLE]: {
    templateName: 'Standard Motor Vehicle Compliance',
    description: 'Statutory and operational documents for registered motor vehicles',
    items: [
      {
        requirementKey: 'registration_certificate',
        title: 'Registration Certificate (RC)',
        description: 'Official motor vehicle registration card issued by transport authority',
        documentTypes: ['Registration Certificate', 'RC', 'Vehicle Document'],
        isRequired: true,
        warningPeriodDays: 60,
      },
      {
        requirementKey: 'motor_insurance',
        title: 'Comprehensive Motor Insurance',
        description: 'Active motor vehicle insurance policy covering third-party and own damage',
        documentTypes: ['Insurance Policy', 'Motor Insurance', 'Comprehensive Policy'],
        isRequired: true,
        warningPeriodDays: 30,
      },
      {
        requirementKey: 'pollution_certificate',
        title: 'Pollution Under Control (PUC)',
        description: 'Mandatory emission compliance certificate',
        documentTypes: ['Pollution Certificate', 'PUC', 'Emission Certificate'],
        isRequired: true,
        warningPeriodDays: 15,
      },
    ],
  },
  [ENTITY_TYPES.PRODUCT]: {
    templateName: 'Standard Appliance & Asset Protection',
    description: 'Proof of purchase and manufacturer warranty coverage',
    items: [
      {
        requirementKey: 'purchase_invoice',
        title: 'Purchase Invoice / Tax Bill',
        description: 'Retail or tax invoice proving ownership and purchase date',
        documentTypes: ['Tax Invoice', 'Purchase Receipt', 'Bill', 'Invoice'],
        isRequired: true,
        warningPeriodDays: 30,
      },
      {
        requirementKey: 'warranty_certificate',
        title: 'Manufacturer Warranty Card',
        description: 'Official warranty coverage terms and serial number record',
        documentTypes: ['Warranty Document', 'Warranty Card', 'Extended Warranty'],
        isRequired: false,
        warningPeriodDays: 30,
      },
    ],
  },
  [ENTITY_TYPES.PERSON]: {
    templateName: 'Personal Identity & Residence Profile',
    description: 'Essential personal records and residence proofs',
    items: [
      {
        requirementKey: 'identity_proof',
        title: 'Government Identity Document',
        description: 'Official government photo identification',
        documentTypes: ['Identity Document', 'Passport', 'Voter ID', 'Driving Licence', 'PAN Card'],
        isRequired: true,
        warningPeriodDays: 90,
      },
      {
        requirementKey: 'address_proof',
        title: 'Proof of Address / Residence',
        description: 'Verified proof of current residential address',
        documentTypes: ['Address Proof', 'Utility Bill', 'Bank Statement', 'Passport'],
        isRequired: false,
        warningPeriodDays: 60,
      },
    ],
  },
  [ENTITY_TYPES.PROPERTY]: {
    templateName: 'Real Estate Ownership & Tax Records',
    description: 'Title deeds and municipal tax compliance documents',
    items: [
      {
        requirementKey: 'title_deed',
        title: 'Sale Deed / Conveyance Deed',
        description: 'Registered title document establishing legal ownership',
        documentTypes: ['Sale Deed', 'Conveyance Deed', 'Property Title'],
        isRequired: true,
        warningPeriodDays: 0,
      },
      {
        requirementKey: 'property_tax',
        title: 'Property Tax Receipt',
        description: 'Latest municipal property tax payment receipt',
        documentTypes: ['Property Tax', 'Municipal Tax', 'Tax Receipt'],
        isRequired: true,
        warningPeriodDays: 30,
      },
    ],
  },
};

/**
 * Get or seed requirement template for an entity type.
 */
export async function getRequirementTemplate(entityType, userId = null) {
  // First check if user has custom template
  if (userId) {
    const userCustom = await RequirementTemplate.findOne({ userId, entityType }).lean();
    if (userCustom) return userCustom;
  }

  // Fallback to system default template
  const defaultTemplate = DEFAULT_REQUIREMENTS[entityType];
  if (!defaultTemplate) return null;

  return {
    entityType,
    templateName: defaultTemplate.templateName,
    description: defaultTemplate.description,
    isSystemDefault: true,
    items: defaultTemplate.items,
  };
}

/**
 * Evaluates document completeness for a specific entity.
 * Explicitly displays "Not found in DocVault" rather than claiming it doesn't exist outside DocVault.
 */
export async function evaluateEntityCompleteness(entityId, userId) {
  const entity = await Entity.findOne({ _id: entityId, userId }).lean();
  if (!entity) throw new Error('Entity not found or access denied');

  const template = await getRequirementTemplate(entity.entityType, userId);
  if (!template) {
    return {
      entityId,
      entityName: entity.name,
      entityType: entity.entityType,
      hasTemplate: false,
      completenessScore: 100,
      items: [],
    };
  }

  // Fetch all linked documents
  const linkedDocIds = (entity.linkedDocumentIds || []).map(id => id.toString());
  const linkedDocuments = await Document.find({
    _id: { $in: linkedDocIds },
    userId,
  }).lean();

  let presentCount = 0;
  let totalRequired = 0;

  const evaluatedItems = template.items.map((req) => {
    if (req.isRequired) totalRequired++;

    // Find if any linked document matches requirement types or title
    const matchingDoc = linkedDocuments.find((doc) => {
      const docCat = (doc.category || '').toLowerCase();
      const docTitle = (doc.title || '').toLowerCase();

      return req.documentTypes.some((type) => {
        const tLower = type.toLowerCase();
        return docCat.includes(tLower) || docTitle.includes(tLower);
      });
    });

    if (matchingDoc) {
      const health = calculateDocumentHealth(matchingDoc, req.warningPeriodDays);
      let status = 'PRESENT';
      if (health.status === HEALTH_STATUS.EXPIRED) {
        status = 'EXPIRED';
      } else if (health.status === HEALTH_STATUS.NEEDS_REVIEW) {
        status = 'NEEDS_REVIEW';
      } else if (health.status === HEALTH_STATUS.EXPIRING_SOON) {
        status = 'EXPIRING_SOON';
      }

      presentCount++;

      return {
        requirementKey: req.requirementKey,
        title: req.title,
        description: req.description,
        isRequired: req.isRequired,
        status,
        stateLabel: status === 'PRESENT' ? 'Verified in DocVault' : status.replace('_', ' '),
        matchedDocument: {
          documentId: matchingDoc._id,
          title: matchingDoc.title,
          category: matchingDoc.category,
          expiryDate: matchingDoc.expiryDate,
          healthStatus: health.status,
          daysLeft: health.daysLeft,
        },
      };
    }

    return {
      requirementKey: req.requirementKey,
      title: req.title,
      description: req.description,
      isRequired: req.isRequired,
      status: 'POTENTIALLY_MISSING',
      stateLabel: 'Not found in DocVault',
      matchedDocument: null,
      recommendation: `Upload your ${req.title} to complete your ${entity.entityType.toLowerCase()} profile.`,
    };
  });

  const completenessScore = totalRequired > 0 ? Math.round((presentCount / totalRequired) * 100) : 100;

  return {
    entityId: entity._id,
    entityName: entity.name,
    entityType: entity.entityType,
    hasTemplate: true,
    templateName: template.templateName,
    completenessScore,
    totalRequired,
    presentCount,
    items: evaluatedItems,
  };
}
