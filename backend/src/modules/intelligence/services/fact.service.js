import mongoose from 'mongoose';
import { DocumentFact } from '../models/documentFact.model.js';
import { Document } from '../../documents/document.model.js';
import { normalizeDateToIso } from '../../extraction/ruleExtraction.service.js';

/**
 * Normalizes fact values based on field name and heuristics.
 */
export function normalizeFactValue(fieldName, value) {
  if (value === null || value === undefined) return { normalized: null, type: 'string' };

  const field = (fieldName || '').toLowerCase();

  // 1. Date normalization
  if (field.includes('date') || field.includes('expiry') || field.includes('valid')) {
    const isoDate = normalizeDateToIso(String(value));
    if (isoDate) return { normalized: isoDate, type: 'date' };
  }

  // 2. Amount normalization
  if (field.includes('amount') || field.includes('total') || field.includes('premium') || field.includes('price')) {
    const cleanStr = String(value).replace(/[^0-9.]/g, '');
    const num = parseFloat(cleanStr);
    if (!isNaN(num)) return { normalized: num, type: 'amount' };
  }

  // 3. Alphanumeric Identifier normalization (removes spaces and dashes for clean equality matching)
  if (field.includes('gstin') || field.includes('pan') || field.includes('vin') || field.includes('registration') || field.includes('number') || field.includes('chassis')) {
    const cleanId = String(value).toUpperCase().replace(/[\s-]/g, '');
    return { normalized: cleanId, type: 'identifier' };
  }

  // 4. Default string normalization
  const cleanText = String(value).trim();
  return { normalized: cleanText, type: 'string' };
}

/**
 * Synchronize and store structured extracted fields from a document into DocumentFact records.
 */
export async function syncDocumentFacts({
  userId,
  documentId,
  entityId = null,
  extractedFields = [],
}) {
  if (!userId || !documentId) throw new Error('userId and documentId are required');

  const doc = await Document.findOne({ _id: documentId, userId });
  if (!doc) throw new Error('Document not found or access denied');

  const factsToSave = [];

  // Extract from doc.extractedFields or doc.keyDetails
  const fields = Array.isArray(extractedFields) && extractedFields.length > 0
    ? extractedFields
    : doc.extractedFields || [];

  for (const f of fields) {
    const fieldName = f.fieldName || f.name;
    const rawVal = f.value;
    if (!fieldName || rawVal === null || rawVal === undefined) continue;

    const { normalized, type } = normalizeFactValue(fieldName, rawVal);

    factsToSave.push({
      userId,
      documentId,
      entityId,
      fieldName,
      normalizedValue: normalized,
      originalValue: rawVal,
      valueType: type,
      sourcePage: f.pageNumber || 1,
      sourceTextReference: f.evidence || null,
      extractionMethod: f.extractionMethod || 'rules',
      confidence: f.confidence !== undefined ? f.confidence : 0.9,
      verificationStatus: f.verificationStatus || 'unverified',
    });
  }

  // Also extract expiry date if present on document
  if (doc.expiryDate && !factsToSave.some(f => f.fieldName === 'expiry_date')) {
    const { normalized, type } = normalizeFactValue('expiry_date', doc.expiryDate);
    factsToSave.push({
      userId,
      documentId,
      entityId,
      fieldName: 'expiry_date',
      normalizedValue: normalized,
      originalValue: doc.expiryDate,
      valueType: type,
      sourcePage: 1,
      sourceTextReference: `Document Expiry: ${doc.expiryDate}`,
      extractionMethod: 'rules',
      confidence: 0.95,
      verificationStatus: 'verified',
    });
  }

  // Upsert facts
  const savedFacts = [];
  for (const fact of factsToSave) {
    const existing = await DocumentFact.findOneAndUpdate(
      { userId, documentId, fieldName: fact.fieldName },
      { $set: fact },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    savedFacts.push(existing);
  }

  return savedFacts;
}

/**
 * Get all facts for a document with tenant check.
 */
export async function getDocumentFacts(documentId, userId) {
  return await DocumentFact.find({ documentId, userId }).sort({ fieldName: 1 }).lean();
}

/**
 * Get all facts linked to an entity with tenant check.
 */
export async function getEntityFacts(entityId, userId) {
  return await DocumentFact.find({ entityId, userId })
    .populate('documentId', 'title category expiryDate originalName')
    .sort({ fieldName: 1 })
    .lean();
}

