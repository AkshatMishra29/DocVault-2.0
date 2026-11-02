import { evaluatePrivacyPolicy, assertProcessingAllowed, PRIVACY_MODES } from './privacyPolicy.service.js';
import { validateMagicBytes, inspectImageGuardrails, calculateDocumentHash, estimatePdfPageCount, wrapUntrustedDocumentContent } from './ingestionGuard.service.js';
import { extractTextFromPDF, extractTextFromImage, convertPdfToImages } from '../../services/ocr/ocrService.js';
import { classifyDocumentByRules, extractTier1Fields } from './ruleExtraction.service.js';
import { verifyAllExtractedFields } from './verification.service.js';
import { recordTokenUsage, checkTokenBudget } from './tokenLedger.service.js';
import { extractDocumentMetadata } from '../../services/ai/groqService.js';
import { generateEmbedding } from '../../services/ai/huggingFaceService.js';
import { Document } from '../documents/document.model.js';
import { Deadline } from '../deadlines/deadline.model.js';

export const PIPELINE_VERSION = '1.0.0';

/**
 * Master Document Extraction & Verification Pipeline
 *
 * Implements:
 * 1. File Validation & Casual Image Guardrail
 * 2. Privacy Policy Gate (PROCESSABLE vs STORAGE_ONLY)
 * 3. Document Normalization & Hybrid Local Text Extraction
 * 4. Tier 1 Rule-Based Classification & Regex Extraction
 * 5. Tier 3 Groq Fallback with Evidence Windows (only if required)
 * 6. Verification Engine (Grounding, Format, Logic gates)
 * 7. Trusted Reminder Creation
 */
export async function executeDocumentExtractionPipeline({
  userId,
  buffer,
  mimetype,
  originalname,
  userConsent = 'PROCESSABLE',
  existingDocumentId = null,
}) {
  console.log(`[Extraction Pipeline] Starting pipeline v${PIPELINE_VERSION} for: "${originalname}"`);

  // 1. Ingestion Guardrails: Binary Magic Bytes & Page Count
  const signature = validateMagicBytes(buffer, mimetype, originalname);
  const fileHash = calculateDocumentHash(buffer);

  if (signature.detectedType === 'application/pdf') {
    estimatePdfPageCount(buffer); // Enforces max 25 pages
  } else if (signature.detectedType.startsWith('image/')) {
    // Inspect for casual images (family photos, selfies, landscapes)
    await inspectImageGuardrails(buffer, originalname);
  }

  // 2. Privacy Policy Gate
  const privacyEval = evaluatePrivacyPolicy({
    filename: originalname,
    buffer,
    userConsent,
  });

  console.log(`[Privacy Gate] Document classified as: ${privacyEval.mode} (${privacyEval.reason})`);

  // STORAGE_ONLY Invariant: NEVER enter OCR, AI, LLM, or Embeddings!
  if (privacyEval.mode === PRIVACY_MODES.STORAGE_ONLY) {
    const docData = {
      userId,
      title: originalname.replace(/\.[^/.]+$/, ''),
      originalName: originalname,
      category: 'Identity',
      format: signature.extension,
      mimetype: signature.detectedType,
      fileData: buffer.toString('base64'),
      sizeBytes: buffer.length,
      fileSizeFormatted: `${(buffer.length / 1024).toFixed(1)} KB`,
      storagePath: 'mongodb-embedded',
      extractedText: '[REDACTED - STORAGE ONLY DOCUMENT]',
      summary: 'Cryptographically protected Storage-Only document. Content extraction disallowed by Privacy Policy.',
      keyDetails: { 'Privacy Policy': 'Storage-Only Isolated (Zero AI Processing)' },
      tags: ['Identity', 'Storage-Only', 'Encrypted'],
      privacyMode: PRIVACY_MODES.STORAGE_ONLY,
      processingStatus: 'storage_only',
      policyVersion: privacyEval.policyVersion,
      fileHash,
      pipelineVersion: PIPELINE_VERSION,
      extractedFields: [],
      reviewStatus: 'not_required',
    };

    let savedDoc;
    if (existingDocumentId) {
      savedDoc = await Document.findByIdAndUpdate(existingDocumentId, docData, { returnDocument: 'after' });
    } else {
      savedDoc = await Document.create(docData);
      savedDoc.downloadUrl = `/api/documents/${savedDoc._id}/download`;
      await savedDoc.save();
    }

    return {
      document: savedDoc,
      privacyMode: PRIVACY_MODES.STORAGE_ONLY,
      processingStatus: 'storage_only',
      extractedFields: [],
      tierUsed: 'None (Storage-Only)',
    };
  }

  // Assertion: Ensure document is processable
  assertProcessingAllowed(privacyEval.mode, 'Text Extraction');

  // 3. Document Normalization & Text Extraction
  let extractedText = '';
  let visualBase64 = null;
  let visualMimeType = null;

  if (signature.detectedType === 'application/pdf') {
    extractedText = await extractTextFromPDF(buffer);

    // If PDF text layer is minimal (< 50 chars), fallback to image OCR
    if (!extractedText || extractedText.length < 50) {
      console.log('[OCR] Scanned PDF detected. Rendering page buffer for local OCR...');
      const imagePages = await convertPdfToImages(buffer);
      if (imagePages && imagePages.length > 0) {
        const firstPage = imagePages[0];
        extractedText = await extractTextFromImage(firstPage);
        visualBase64 = firstPage.toString('base64');
        visualMimeType = 'image/png';
      }
    }
  } else if (signature.detectedType.startsWith('image/')) {
    extractedText = await extractTextFromImage(buffer);
    visualBase64 = buffer.toString('base64');
    visualMimeType = signature.detectedType;
  }

  // Re-verify Privacy Gate with extracted text content
  const contentPrivacyCheck = evaluatePrivacyPolicy({
    filename: originalname,
    buffer,
    textSample: extractedText,
    userConsent,
  });

  if (contentPrivacyCheck.mode === PRIVACY_MODES.STORAGE_ONLY) {
    console.warn('[Privacy Gate] Content analysis detected sensitive identity pattern! Immediately pivoting to STORAGE_ONLY.');
    return executeDocumentExtractionPipeline({
      userId,
      buffer,
      mimetype,
      originalname,
      userConsent: PRIVACY_MODES.STORAGE_ONLY,
      existingDocumentId,
    });
  }

  // 4. Tier 1: Deterministic Rules & Keyword Classification
  const ruleClassification = classifyDocumentByRules(extractedText, originalname);
  let finalCategory = ruleClassification.category;
  let tierUsed = 'Tier 1 (Regex & Rules)';

  // Run Tier 1 Field Extraction
  let extractedFields = extractTier1Fields(extractedText, 1);
  console.log(`[Tier 1 Rules] Extracted ${extractedFields.length} deterministic fields. Category: ${finalCategory} (conf: ${ruleClassification.confidence})`);

  // Check if critical fields were found via deterministic rules
  const hasInvoiceOrPolicy = extractedFields.some(f => ['invoice_number', 'policy_number', 'roll_number'].includes(f.fieldName));
  const hasDate = extractedFields.some(f => f.fieldName.includes('date'));
  const hasAmount = extractedFields.some(f => f.fieldName.includes('amount'));

  const isTier1Sufficient = ruleClassification.isHighConfidence && (hasInvoiceOrPolicy || hasDate || hasAmount);

  // 5. Tier 3: Groq LLM Fallback (Only if Tier 1 is insufficient and token budget permits)
  let groqSummary = '';
  let groqTitle = originalname.replace(/\.[^/.]+$/, '');
  let groqTags = ['Document', finalCategory];
  let groqExpiryDate = null;

  if (!isTier1Sufficient && extractedText.length > 20) {
    const budget = await checkTokenBudget(userId);
    if (budget.allowed) {
      try {
        console.log('[Tier 3 Fallback] Invoking Groq LLM with evidence-window truncation...');
        tierUsed = 'Tier 3 (Groq Fallback)';

        // Wrap untrusted document text with security delimiters
        const safeWrappedText = wrapUntrustedDocumentContent(extractedText.slice(0, 3000));

        const aiResult = await extractDocumentMetadata(safeWrappedText, originalname, visualBase64);

        if (aiResult) {
          if (aiResult.title) groqTitle = aiResult.title;
          if (aiResult.category && aiResult.category !== 'Other') finalCategory = aiResult.category;
          if (aiResult.summary) groqSummary = aiResult.summary;
          if (aiResult.tags) groqTags = aiResult.tags;
          if (aiResult.expiryDate) groqExpiryDate = aiResult.expiryDate;

          // Merge keyDetails as structured fields if not already extracted by Tier 1
          if (aiResult.keyDetails && typeof aiResult.keyDetails === 'object') {
            for (const [k, v] of Object.entries(aiResult.keyDetails)) {
              const cleanKey = k.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
              const alreadyExists = extractedFields.some(f => f.fieldName === cleanKey);
              if (!alreadyExists && v) {
                extractedFields.push({
                  fieldName: cleanKey,
                  value: v,
                  evidence: `${k}: ${v}`,
                  pageNumber: 1,
                  extractionMethod: 'groq_llm',
                  confidence: 0.82,
                  verificationStatus: 'needs_review',
                  pipelineVersion: PIPELINE_VERSION,
                });
              }
            }
          }

          // Record token consumption
          await recordTokenUsage({
            userId,
            provider: 'groq',
            model: 'llama-3.3-70b-versatile',
            inputTokens: Math.ceil(safeWrappedText.length / 4),
            outputTokens: 180,
            processingStage: 'extraction_fallback',
          });
        }
      } catch (llmErr) {
        console.warn('[Groq Fallback] LLM extraction error, proceeding with deterministic rules:', llmErr.message);
      }
    } else {
      console.warn('[Token Budget] Token limit exceeded, skipping Tier 3 LLM fallback.');
    }
  }

  // 6. Master Verification Engine
  const verifiedFields = verifyAllExtractedFields(extractedFields, extractedText);

  // Check if any critical field requires user review
  const hasUncertainFields = verifiedFields.some(f => f.verificationStatus === 'needs_review');
  const processingStatus = hasUncertainFields ? 'needs_review' : 'completed';
  const reviewStatus = hasUncertainFields ? 'pending_review' : 'not_required';

  // Extract verified expiry date for reminder
  const expiryField = verifiedFields.find(f => f.fieldName === 'expiry_date' && f.verificationStatus === 'accepted');
  const finalExpiryDate = expiryField ? String(expiryField.value) : groqExpiryDate;

  // 7. Hugging Face Semantic Vector Embedding
  let embedding = [];
  try {
    const textToEmbed = `${groqTitle} ${finalCategory} ${groqSummary} ${groqTags.join(' ')}`;
    embedding = await generateEmbedding(textToEmbed);
  } catch (embErr) {
    console.warn('[Embedding] Embedding generation skipped:', embErr.message);
  }

  // Prepare keyDetails backward-compatible dictionary for existing frontend views
  const keyDetailsDict = {};
  for (const f of verifiedFields) {
    keyDetailsDict[f.fieldName.replace(/_/g, ' ').toUpperCase()] = f.value;
  }

  const docPayload = {
    userId,
    title: groqTitle,
    originalName: originalname,
    category: finalCategory,
    format: signature.extension,
    mimetype: signature.detectedType,
    fileData: buffer.toString('base64'),
    sizeBytes: buffer.length,
    fileSizeFormatted: `${(buffer.length / 1024).toFixed(1)} KB`,
    storagePath: 'mongodb-embedded',
    extractedText,
    summary: groqSummary || `Verified ${finalCategory} document stored in DocVault.`,
    keyDetails: keyDetailsDict,
    tags: groqTags,
    expiryDate: finalExpiryDate,
    isExpiringSoon: Boolean(finalExpiryDate),
    embedding,
    privacyMode: PRIVACY_MODES.PROCESSABLE,
    processingStatus,
    policyVersion: PIPELINE_VERSION,
    fileHash,
    pipelineVersion: PIPELINE_VERSION,
    extractedFields: verifiedFields,
    reviewStatus,
  };

  let savedDoc;
  if (existingDocumentId) {
    savedDoc = await Document.findByIdAndUpdate(existingDocumentId, docPayload, { returnDocument: 'after' });
  } else {
    savedDoc = await Document.create(docPayload);
    savedDoc.downloadUrl = `/api/documents/${savedDoc._id}/download`;
    await savedDoc.save();
  }

  // 8. Reminder Integration (Core Rule: ONLY from accepted / verified dates)
  if (finalExpiryDate && expiryField?.verificationStatus === 'accepted') {
    try {
      const expiry = new Date(finalExpiryDate);
      const today = new Date();
      const diffTime = expiry - today;
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let severity = 'normal';
      if (daysLeft <= 15) severity = 'urgent';
      else if (daysLeft <= 45) severity = 'upcoming';

      // Idempotent reminder creation: delete existing deadline for this document if any
      await Deadline.deleteMany({ linkedDocId: savedDoc._id });
      await Deadline.create({
        userId,
        title: `${savedDoc.title} Renewal`,
        date: finalExpiryDate,
        daysLeft,
        severity,
        linkedDocId: savedDoc._id,
        action: `Renew ${finalCategory} document`,
      });
      console.log(`[Trusted Reminder] Idempotently scheduled verified reminder for: ${finalExpiryDate}`);
    } catch (dlErr) {
      console.warn('[Trusted Reminder] Failed to create deadline:', dlErr.message);
    }
  }

  return {
    document: savedDoc,
    privacyMode: PRIVACY_MODES.PROCESSABLE,
    processingStatus,
    extractedFields: verifiedFields,
    tierUsed,
  };
}
