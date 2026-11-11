import { evaluatePrivacyPolicy, assertProcessingAllowed, PRIVACY_MODES } from './privacyPolicy.service.js';
import { validateMagicBytes, inspectImageGuardrails, calculateDocumentHash, estimatePdfPageCount, wrapUntrustedDocumentContent } from './ingestionGuard.service.js';
import { validateExtractionAgainstSourceEvidence, sanitizeUntrustedDocumentText } from './documentExtractionGuardrail.service.js';
import { extractTextFromPDF, extractTextFromImage, convertPdfToImages } from '../../services/ocr/ocrService.js';
import { classifyDocumentByRules, extractTier1Fields } from './ruleExtraction.service.js';
import { verifyAllExtractedFields } from './verification.service.js';
import { recordTokenUsage, checkTokenBudget } from './tokenLedger.service.js';
import { extractDocumentMetadata } from '../../services/ai/groqService.js';
import { generateEmbedding } from '../../services/ai/huggingFaceService.js';
import { Document } from '../documents/document.model.js';
import { Deadline } from '../deadlines/deadline.model.js';
import { detectSensitiveDocument } from '../../services/pipeline/sensitiveDetector.js';
import { assertAiAllowed, isAiAllowed, assertPolicyUnchangedBeforeSave, AI_POLICIES } from '../../services/pipeline/privacyGate.js';
import { extractViaPythonService } from './extractionServiceClient.js';

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
  expectedPolicyVersion = '1.0.0',
}) {
  console.log(`[Extraction Pipeline] Starting pipeline v${PIPELINE_VERSION} for: "${originalname}"`);

  // 1. Ingestion Guardrails: Binary Magic Bytes & Page Count
  const signature = validateMagicBytes(buffer, mimetype, originalname);
  const fileHash = calculateDocumentHash(buffer);

  let pageCount = 1;
  if (signature.detectedType === 'application/pdf') {
    pageCount = estimatePdfPageCount(buffer); // Enforces max 25 pages
  } else if (signature.detectedType.startsWith('image/')) {
    // Inspect for casual images (family photos, selfies, landscapes)
    await inspectImageGuardrails(buffer, originalname);
  }

  // 2. Local Sensitive Detector (Aadhaar Verhoeff, PAN, Passport MRZ, Voter ID, DL, Card Luhn)
  const sensitiveCheck = detectSensitiveDocument({
    filename: originalname,
    buffer,
  });

  const isExplicitStorageOnly = userConsent === 'STORAGE_ONLY' || userConsent === AI_POLICIES.STORAGE_ONLY;
  const shouldIsolate = sensitiveCheck.isSensitive || isExplicitStorageOnly;

  // STORAGE_ONLY Invariant: NEVER enter OCR, AI, LLM, or Embeddings!
  if (shouldIsolate) {
    const reason = sensitiveCheck.isSensitive
      ? sensitiveCheck.reason
      : 'User explicitly marked document for Storage-Only vault protection.';

    let initialTitle = originalname.replace(/\.[^/.]+$/, '');
    if (existingDocumentId) {
      const existingDoc = await Document.findById(existingDocumentId).select('title');
      if (existingDoc && existingDoc.title) {
        initialTitle = existingDoc.title;
      }
    }

    const docData = {
      userId,
      title: initialTitle,
      originalName: originalname,
      category: sensitiveCheck.isSensitive ? 'Identity' : 'Other',
      format: signature.extension,
      mimetype: signature.detectedType,
      fileData: buffer.toString('base64'),
      sizeBytes: buffer.length,
      fileSizeFormatted: `${(buffer.length / 1024).toFixed(1)} KB`,
      storagePath: 'mongodb-embedded',
      extractedText: '[REDACTED - STORAGE ONLY DOCUMENT]',
      summary: `Cryptographically protected Storage-Only document (${reason}). Content extraction disallowed by Privacy Policy.`,
      keyDetails: { 'Privacy Policy': 'Storage-Only Isolated (Zero AI Processing)' },
      tags: sensitiveCheck.isSensitive ? ['Identity', 'Storage-Only', 'Protected'] : ['Document', 'Storage-Only'],
      privacyMode: PRIVACY_MODES.STORAGE_ONLY,
      aiPolicy: AI_POLICIES.STORAGE_ONLY,
      processingStatus: 'storage_only',
      status: 'storage_only',
      policyVersion: expectedPolicyVersion || '1.0.0',
      sensitiveFlag: sensitiveCheck.isSensitive,
      sensitiveReason: sensitiveCheck.reason,
      aiConsent: { grantedAt: null, noticeVersion: null },
      fileHash,
      sha256: fileHash,
      pageCount,
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
      aiPolicy: AI_POLICIES.STORAGE_ONLY,
      processingStatus: 'storage_only',
      extractedFields: [],
      tierUsed: 'None (Storage-Only)',
    };
  }

  // Assertion: Ensure document is processable
  assertProcessingAllowed(PRIVACY_MODES.PROCESSABLE, 'Text Extraction');

  // 3. Document Normalization & Text Extraction
  let extractedText = '';
  let visualBase64 = null;
  let visualMimeType = null;
  let pageResults = [];
  let processedPagesCount = 0;
  let failedPagesCount = 0;
  let serviceCategory = null;
  let serviceDocDate = null;
  let serviceExpDate = null;
  let serviceKeyDetails = {};
  let serviceEntities = [];

  // Try Python CPU Extraction Service first (PyMuPDF + native C++ Tesseract + OpenCV)
  const pythonResult = await extractViaPythonService({
    buffer,
    filename: originalname,
    mimetype: signature.detectedType,
    userConsent: userConsent || 'PROCESSABLE',
  });

  if (pythonResult && pythonResult.success) {
    console.log(`[Extraction Pipeline] Python CPU Extraction Service succeeded. Total pages: ${pythonResult.totalPages}, Status: ${pythonResult.documentStatus}`);
    extractedText = pythonResult.fullText || '';
    pageResults = pythonResult.pages || [];
    processedPagesCount = pythonResult.processedPages || 0;
    failedPagesCount = pythonResult.failedPages || 0;
    serviceCategory = pythonResult.category;
    serviceDocDate = pythonResult.documentDate;
    serviceExpDate = pythonResult.expiryDate;
    serviceKeyDetails = pythonResult.keyDetails || {};
    serviceEntities = pythonResult.entities || [];
  } else {
    // Graceful fallback to in-process Node extraction
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
  }

  // Re-verify Privacy Gate with extracted text content (Verhoeff checksum, PAN regex, MRZ, etc.)
  const contentSensitiveCheck = detectSensitiveDocument({
    filename: originalname,
    buffer,
    text: extractedText,
  });

  if (contentSensitiveCheck.isSensitive) {
    console.warn(`[Privacy Gate] Content analysis detected sensitive pattern (${contentSensitiveCheck.reason})! Immediately pivoting to STORAGE_ONLY.`);
    return executeDocumentExtractionPipeline({
      userId,
      buffer,
      mimetype,
      originalname,
      userConsent: 'STORAGE_ONLY',
      existingDocumentId,
      expectedPolicyVersion,
    });
  }

  // 4. Tier 1: Deterministic Rules & Keyword Classification
  const ruleClassification = classifyDocumentByRules(extractedText, originalname);
  let finalCategory = serviceCategory || ruleClassification.category;
  let tierUsed = pythonResult ? 'CPU Multi-Stage Engine (PyMuPDF + Tesseract)' : 'Tier 1 (Regex & Rules)';

  // Run Tier 1 Field Extraction
  let extractedFields = extractTier1Fields(extractedText, 1);
  if (serviceEntities && serviceEntities.length > 0) {
    for (const se of serviceEntities) {
      if (!extractedFields.some(ef => ef.fieldName === se.fieldName)) {
        extractedFields.push({
          fieldName: se.fieldName,
          value: se.value,
          evidence: se.evidence || '',
          pageNumber: se.pageNumber || 1,
          extractionMethod: se.extractionMethod || 'rules',
          confidence: se.confidence || 0.90,
          verificationStatus: se.verificationStatus || 'accepted',
          pipelineVersion: '1.0.0',
        });
      }
    }
  }
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
  let groqDocumentDate = null;

  if (!isTier1Sufficient && (extractedText.length > 10 || visualBase64)) {
    const budget = await checkTokenBudget(userId);
    if (budget.allowed) {
      try {
        console.log('[Tier 3 Fallback] Invoking Groq LLM with evidence-window truncation...');
        tierUsed = visualBase64 ? 'Tier 3 (Groq Multimodal Vision)' : 'Tier 3 (Groq Fallback)';

        // Wrap untrusted document text with security delimiters and sanitize prompt injection triggers
        const { sanitizedText } = sanitizeUntrustedDocumentText((extractedText || '').slice(0, 3000));
        const safeWrappedText = wrapUntrustedDocumentContent(sanitizedText);

        const aiResultRaw = await extractDocumentMetadata(safeWrappedText, originalname, visualBase64);

        // If local OCR text was sparse but Groq Vision extracted the transcription, adopt it
        if ((!extractedText || extractedText.length < 15) && aiResultRaw?.extractedText) {
          extractedText = aiResultRaw.extractedText;
        }
        const effectiveSourceText = (extractedText && extractedText.length > 10)
          ? extractedText
          : (aiResultRaw?.extractedText || extractedText || '');

        // Grounding & Anti-Hallucination Guardrail: Validate all extracted metadata against source text
        const aiResult = validateExtractionAgainstSourceEvidence(aiResultRaw, effectiveSourceText);

        if (aiResult) {
          if (aiResult.title) groqTitle = aiResult.title;
          if (aiResult.category && aiResult.category !== 'Other') finalCategory = aiResult.category;
          if (aiResult.summary) groqSummary = aiResult.summary;
          if (aiResult.tags) groqTags = aiResult.tags;
          if (aiResult.expiryDate) groqExpiryDate = aiResult.expiryDate;
          if (aiResult.documentDate) groqDocumentDate = aiResult.documentDate;

          // Merge document date as field if found
          if (groqDocumentDate && !extractedFields.some(f => f.fieldName === 'document_date' || f.fieldName === 'issue_date')) {
            extractedFields.push({
              fieldName: 'document_date',
              value: groqDocumentDate,
              evidence: `Document Date: ${groqDocumentDate}`,
              pageNumber: 1,
              extractionMethod: 'groq_llm',
              confidence: 0.90,
              verificationStatus: 'accepted',
              pipelineVersion: PIPELINE_VERSION,
            });
          }

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
                  confidence: 0.88,
                  verificationStatus: 'accepted',
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

  // Extract verified dates
  const expiryField = verifiedFields.find(f => f.fieldName === 'expiry_date' && f.verificationStatus === 'accepted');
  const finalExpiryDate = expiryField ? String(expiryField.value) : groqExpiryDate;

  const docDateField = verifiedFields.find(f => ['document_date', 'issue_date', 'completion_date', 'award_date', 'certificate_date'].includes(f.fieldName) && (f.verificationStatus === 'accepted' || f.verificationStatus === 'needs_review'));
  const finalDocumentDate = docDateField ? String(docDateField.value) : groqDocumentDate;

  // 7. Hugging Face Semantic Vector Embedding
  let embedding = [];
  try {
    const textToEmbed = `${groqTitle} ${finalCategory} ${finalDocumentDate ? 'Date: ' + finalDocumentDate : ''} ${finalExpiryDate ? 'Expiry: ' + finalExpiryDate : ''} ${groqSummary} ${groqTags.join(' ')} ${extractedText ? extractedText.slice(0, 1000) : ''}`;
    embedding = await generateEmbedding(textToEmbed);
  } catch (embErr) {
    console.warn('[Embedding] Embedding generation skipped:', embErr.message);
  }

  // Prepare keyDetails backward-compatible dictionary for existing frontend views
  const keyDetailsDict = {};
  for (const f of verifiedFields) {
    keyDetailsDict[f.fieldName.replace(/_/g, ' ').toUpperCase()] = f.value;
  }
  if (finalDocumentDate && !keyDetailsDict['DOCUMENT DATE'] && !keyDetailsDict['ISSUE DATE']) {
    keyDetailsDict['DOCUMENT DATE'] = finalDocumentDate;
  }

  // Check policyVersion again right before saving results, so a policy change during processing wins
  if (existingDocumentId) {
    await assertPolicyUnchangedBeforeSave(existingDocumentId, expectedPolicyVersion);
  }

  // Preserve custom title if user renamed the document on upload
  let finalTitle = groqTitle;
  if (existingDocumentId) {
    const existingDoc = await Document.findById(existingDocumentId).select('title originalName');
    if (existingDoc && existingDoc.title) {
      const defaultOriginal = (existingDoc.originalName || originalname).replace(/\.[^/.]+$/, '');
      if (existingDoc.title !== defaultOriginal) {
        finalTitle = existingDoc.title;
      }
    }
  }

  const averageConfidence = verifiedFields.length > 0
    ? parseFloat((verifiedFields.reduce((acc, f) => acc + (f.confidence || 0), 0) / verifiedFields.length).toFixed(2))
    : 0.90;

  const docPayload = {
    userId,
    title: finalTitle,
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
    documentDate: finalDocumentDate,
    expiryDate: finalExpiryDate,
    isExpiringSoon: Boolean(finalExpiryDate),
    tierUsed: tierUsed || (extractedFields.some(f => f.extractionMethod === 'groq_llm') ? 'Tier 3 (Groq LLM / Vision)' : 'Tier 1 (Regex & Rules)'),
    confidenceScore: averageConfidence,
    embedding,
    privacyMode: PRIVACY_MODES.PROCESSABLE,
    aiPolicy: AI_POLICIES.AI_ENABLED,
    processingStatus,
    status: processingStatus,
    policyVersion: expectedPolicyVersion || PIPELINE_VERSION,
    fileHash,
    sha256: fileHash,
    pageCount,
    pipelineVersion: PIPELINE_VERSION,
    extractedFields: verifiedFields,
    pages: pageResults,
    processedPages: processedPagesCount || pageCount,
    failedPages: failedPagesCount,
    extractionMethod: pythonResult ? 'cpu_multistage_pipeline' : 'node_fallback_pipeline',
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
