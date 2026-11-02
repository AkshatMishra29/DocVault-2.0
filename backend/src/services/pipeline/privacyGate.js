/**
 * Centralized Privacy Gatekeeper
 *
 * Implements Rule 2 & Rule 3:
 * - Each document has aiPolicy = storage_only or ai_enabled
 * - One function assertAiAllowed(doc) runs before EVERY use of document content
 *   by a third party (Groq, Gemini, Hugging Face, any embedding or RAG call).
 * - Check policyVersion again right before saving results, so a policy change during processing wins.
 */

import { Document } from '../../modules/documents/document.model.js';

export const AI_POLICIES = {
  STORAGE_ONLY: 'storage_only',
  AI_ENABLED: 'ai_enabled',
};

export class PrivacyPolicyViolationError extends Error {
  constructor(message, documentId = null) {
    super(message);
    this.name = 'PrivacyPolicyViolationError';
    this.statusCode = 403;
    this.isPolicyViolation = true;
    this.documentId = documentId;
  }
}

/**
 * Checks whether a document object permits AI processing
 * @param {Object} doc - Document instance or plain object
 * @returns {boolean}
 */
export function isAiAllowed(doc) {
  if (!doc) return false;
  // If sensitive flag is active, AI is NEVER allowed under any circumstance
  if (doc.sensitiveFlag === true) return false;
  // Must explicitly be 'ai_enabled'
  if (doc.aiPolicy !== AI_POLICIES.AI_ENABLED) return false;
  // Must have a valid recorded user consent timestamp
  if (!doc.aiConsent || !doc.aiConsent.grantedAt) return false;
  return true;
}

/**
 * Enforces privacy boundary before ANY outbound third-party AI call
 * (Groq, Gemini, Hugging Face, embeddings, or RAG)
 * 
 * @param {Object} doc - Document instance or plain object
 * @param {string} [operation='Third-party AI operation'] - Description of operation
 * @throws {PrivacyPolicyViolationError}
 */
export function assertAiAllowed(doc, operation = 'Third-party AI operation') {
  if (!doc) {
    throw new PrivacyPolicyViolationError(`Access denied: Document does not exist for ${operation}`);
  }

  const docId = doc._id ? String(doc._id) : (doc.id || 'unknown');

  if (doc.sensitiveFlag === true) {
    throw new PrivacyPolicyViolationError(
      `Privacy Gate Violation: Document ${docId} is flagged as SENSITIVE (${doc.sensitiveReason || 'Identity Record'}). It can NEVER be sent to third-party services for ${operation}.`,
      docId
    );
  }

  if (doc.aiPolicy !== AI_POLICIES.AI_ENABLED) {
    throw new PrivacyPolicyViolationError(
      `Privacy Gate Violation: Document ${docId} has policy "${doc.aiPolicy || 'storage_only'}". Third-party operation "${operation}" is forbidden.`,
      docId
    );
  }

  if (!doc.aiConsent || !doc.aiConsent.grantedAt) {
    throw new PrivacyPolicyViolationError(
      `Privacy Gate Violation: Document ${docId} has no record of informed consent for ${operation}.`,
      docId
    );
  }
}

/**
 * Re-validates the document policy against MongoDB right before persisting
 * derived text, fields, or embeddings.
 * 
 * If the user switched policy to storage_only while processing was underway,
 * this function throws to prevent stale results from overwriting the user's revocation.
 * 
 * @param {string|mongoose.Types.ObjectId} documentId
 * @param {string} expectedPolicyVersion
 * @returns {Promise<Document>}
 */
export async function assertPolicyUnchangedBeforeSave(documentId, expectedPolicyVersion) {
  const currentDoc = await Document.findById(documentId);
  if (!currentDoc) {
    throw new PrivacyPolicyViolationError(`Document ${documentId} no longer exists`, documentId);
  }

  if (currentDoc.aiPolicy === AI_POLICIES.STORAGE_ONLY) {
    throw new PrivacyPolicyViolationError(
      `Policy change detected: Document ${documentId} was switched to storage_only during processing. All extracted data aborted.`,
      documentId
    );
  }

  if (currentDoc.policyVersion !== expectedPolicyVersion) {
    throw new PrivacyPolicyViolationError(
      `Policy version mismatch on document ${documentId} (expected ${expectedPolicyVersion}, found ${currentDoc.policyVersion}). Aborting save.`,
      documentId
    );
  }

  return currentDoc;
}
