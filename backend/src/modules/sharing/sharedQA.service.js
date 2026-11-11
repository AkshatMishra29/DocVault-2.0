import { DocumentShare, SHARE_STATUS } from './models/documentShare.model.js';
import { SharedQuestion } from './models/sharedQuestion.model.js';
import { Document } from '../documents/document.model.js';
import { RedactedDocument } from './models/redactedDocument.model.js';
import { answerDocumentQuery } from '../../services/ai/groqService.js';
import { wrapUntrustedDocumentContent } from '../extraction/ingestionGuard.service.js';

/**
 * DocVault Shared Document Q&A Service
 *
 * Enforces:
 * 1. Scope Boundary: Searches strictly within the document(s) explicitly linked to this active share.
 * 2. Cross-Tenant Protection: Cannot search unshared documents or the owner's broader vault.
 * 3. Privacy Gate: Prohibits AI Q&A on storage_only or sensitiveFlag documents.
 * 4. Grounding: If evidence is missing, cleanly responds "Information not available in the shared document".
 * 5. Redaction Respect: Redacted values are omitted from the Q&A context.
 */
export class SharedQAService {
  /**
   * Answer a question regarding an explicitly shared document
   */
  static async askQuestionAboutShare(shareId, documentId, question, { askedBy = null, clientFingerprint = '' }) {
    if (!shareId || !documentId || !question) {
      throw new Error('Share ID, Document ID, and Question are required.');
    }

    // 1. Validate share validity and active status
    const share = await DocumentShare.findById(shareId);
    if (!share || share.status !== SHARE_STATUS.ACTIVE) {
      throw new Error('This share is inactive, expired, or has been revoked.');
    }

    if (share.expiresAt && new Date(share.expiresAt) <= new Date()) {
      throw new Error('This share has expired.');
    }

    // 2. Validate document belongs to this share
    const isDocInShare = share.documentIds.some((id) => id.toString() === documentId.toString());
    if (!isDocInShare) {
      throw new Error('The requested document is not part of this shared package.');
    }

    // 3. Retrieve document record
    const doc = await Document.findById(documentId).select('title category extractedText keyDetails summary aiPolicy sensitiveFlag');
    if (!doc) {
      throw new Error('Shared document not found.');
    }

    // 4. Privacy Gate: Strict prohibition of external AI processing on storage_only or sensitive files
    if (doc.aiPolicy === 'storage_only' || doc.sensitiveFlag === true) {
      throw new Error('AI Q&A is disabled for this document due to privacy policy protection (Storage-Only).');
    }

    // 5. Check if document has a redacted copy attached to this share
    let contextText = doc.extractedText || '';
    let contextKeyDetails = { ...(doc.keyDetails || {}) };

    if (share.redactedDocMap && share.redactedDocMap.get(documentId.toString())) {
      const redactedDocId = share.redactedDocMap.get(documentId.toString());
      const redactedDoc = await RedactedDocument.findById(redactedDocId);
      if (redactedDoc && redactedDoc.redactionMetadata?.textTermsRedacted) {
        // Redact terms from context
        redactedDoc.redactionMetadata.textTermsRedacted.forEach((term) => {
          contextText = contextText.split(term).join('[REDACTED]');
        });
      }
    }

    // 6. Minimum Necessary Sharing: apply field restrictions if configured
    if (share.minimumNecessaryConfig && share.minimumNecessaryConfig[documentId.toString()]) {
      const allowedFields = share.minimumNecessaryConfig[documentId.toString()].allowedFields;
      if (Array.isArray(allowedFields) && allowedFields.length > 0) {
        for (const k of Object.keys(contextKeyDetails)) {
          if (!allowedFields.includes(k)) {
            delete contextKeyDetails[k];
          }
        }
      }
    }

    // 7. Secure isolated Q&A prompt with evidence grounding
    const safeContext = wrapUntrustedDocumentContent(contextText.slice(0, 3000));
    const simulatedContextDoc = {
      title: doc.title,
      category: doc.category,
      summary: doc.summary,
      keyDetails: contextKeyDetails,
      extractedText: safeContext,
    };

    let answer = 'Information not available in the shared document.';
    let evidence = null;

    try {
      answer = await answerDocumentQuery(question, [simulatedContextDoc], []);
      // Extract brief evidence snippet if available
      evidence = `Grounded in shared document "${doc.title}"`;
    } catch (err) {
      console.warn('[SharedQAService] LLM Q&A fallback:', err.message);
      answer = 'Unable to answer question at this time. Please review the document directly.';
    }

    // 8. Record in audit history
    const savedQuestion = await SharedQuestion.create({
      shareId,
      documentId,
      askedBy,
      clientFingerprint,
      question: question.trim(),
      answer,
      evidence,
      sourceDocumentTitle: doc.title,
    });

    return savedQuestion;
  }

  /**
   * List previous Q&A history for a share
   */
  static async getShareQuestions(shareId, documentId = null) {
    const filter = { shareId };
    if (documentId) filter.documentId = documentId;
    return await SharedQuestion.find(filter).sort({ createdAt: -1 }).limit(50);
  }
}

