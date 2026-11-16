import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import { pipeline, RawImage } from '@huggingface/transformers';

/**
 * DocVault Intelligent Multi-Stage Document Detection & OCR Validation Pipeline
 *
 * Architecture:
 *   Stage 1: Secure File Validation (Magic bytes, dimensions, decompression-bomb protection)
 *   Stage 2: Image Quality Assessment (Laplacian blur variance, contrast, brightness, resolution)
 *   Stage 3: Document vs. Non-Document Classification (MobileNetV4 ONNX vision model on CPU)
 *   Stage 4: Document Region & Boundary Coverage Detection
 *   Stage 5: Text Detection & Readability Assessment (Character/line heights, distribution, tiny-text gating)
 *   Stage 6: Document Type Classification (Invoice, Receipt, ID Card, Certificate, Policy, etc.)
 *   Stage 7: Decision Engine (ACCEPT | REJECT | REVIEW)
 */

export class DocumentValidationPipelineError extends Error {
  constructor(message, reasonCode = 'VALIDATION_FAILED', status = 'rejected', suggestion = null, meta = {}) {
    super(message);
    this.name = 'DocumentValidationPipelineError';
    this.reasonCode = reasonCode;
    this.status = status;
    this.suggestion = suggestion;
    this.meta = meta;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton Model and Worker Caches (Zero repeated loading, high CPU efficiency)
// ─────────────────────────────────────────────────────────────────────────────

let cachedClassifier = null;
let cachedClassifierLoading = null;

let cachedWorker = null;
let cachedWorkerLoading = null;

async function getVisionClassifier() {
  if (cachedClassifier) return cachedClassifier;
  if (!cachedClassifierLoading) {
    cachedClassifierLoading = (async () => {
      try {
        console.log('[Vision Classifier] Loading lightweight ONNX MobileNetV4 model on CPU...');
        const { env } = await import('@huggingface/transformers');
        env.allowRemoteModels = false; // Strictly local offline!
        const clf = await pipeline(
          'image-classification',
          'onnx-community/mobilenetv4_conv_small.e2400_r224_in1k',
          { dtype: 'fp32' }
        );
        cachedClassifier = clf;
        console.log('[Vision Classifier] MobileNetV4 model ready on CPU execution provider.');
        return clf;
      } catch (err) {
        console.warn('[Vision Classifier] Model initialization error:', err.message);
        return null;
      } finally {
        cachedClassifierLoading = null;
      }
    })();
  }
  return cachedClassifierLoading;
}

async function getTesseractWorker() {
  if (cachedWorker) return cachedWorker;
  if (!cachedWorkerLoading) {
    cachedWorkerLoading = (async () => {
      try {
        const worker = await Tesseract.createWorker('eng');
        cachedWorker = worker;
        return worker;
      } catch (err) {
        console.warn('[Tesseract Worker] Worker initialization error:', err.message);
        return null;
      } finally {
        cachedWorkerLoading = null;
      }
    })();
  }
  return cachedWorkerLoading;
}

// Semantic ImageNet category mapping
const DOCUMENT_SYNONYMS = new Set([
  'web site', 'website', 'internet site', 'site',
  'envelope', 'menu', 'binder', 'ring-binder',
  'book jacket', 'dust cover', 'dust jacket', 'book cover',
  'packet', 'carton', 'file folder', 'paper'
]);

const SCENERY_SYNONYMS = new Set([
  'alp', 'volcano', 'valley', 'vale', 'promontory', 'headland',
  'lakeside', 'lakeshore', 'seashore', 'coast', 'seacoast',
  'cliff', 'drop', 'geyser', 'mountain', 'sandbar', 'coral reef'
]);

const BUILDING_SYNONYMS = new Set([
  'bakery', 'bakeshop', 'bookshop', 'bookstore', 'butcher shop',
  'confectionery', 'grocery store', 'restaurant', 'cinema', 'church',
  'palace', 'castle', 'monastery', 'barn', 'triumphal arch', 'beacon'
]);

const SIGN_SYNONYMS = new Set([
  'street sign', 'traffic light', 'traffic signal', 'stoplight', 'billboard', 'scoreboard'
]);

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1: Secure File Validation
// ─────────────────────────────────────────────────────────────────────────────

export async function validateSecureFile(buffer, options = {}) {
  if (!buffer || buffer.length < 16) {
    throw new DocumentValidationPipelineError(
      'The uploaded file is empty or corrupted.',
      'FILE_CORRUPTED',
      'rejected',
      'Please check your file and upload a valid document.'
    );
  }

  // Max 25 MB
  if (buffer.length > 25 * 1024 * 1024) {
    throw new DocumentValidationPipelineError(
      'File exceeds maximum allowable size of 25 MB.',
      'FILE_TOO_LARGE',
      'rejected',
      'Please compress or upload a file under 25 MB.'
    );
  }

  let metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (err) {
    throw new DocumentValidationPipelineError(
      'Unable to decode image. The file appears to be corrupted or in an unsupported format.',
      'UNSUPPORTED_FORMAT',
      'rejected',
      'Please upload a standard document scan or photo (PNG, JPG, or PDF).'
    );
  }

  const { width = 0, height = 0 } = metadata;

  // Decompression-bomb check
  if (width > 10000 || height > 10000 || (width * height > 40000000)) {
    throw new DocumentValidationPipelineError(
      'Image dimensions exceed safe processing thresholds (max 40 megapixels).',
      'IMAGE_TOO_LARGE',
      'rejected',
      'Please resize the image before uploading.'
    );
  }

  // Minimum dimensions
  if (width < 120 || height < 120) {
    throw new DocumentValidationPipelineError(
      'Image resolution is too low to be a readable document. Minimum size is 120x120 pixels.',
      'RESOLUTION_TOO_LOW',
      'rejected',
      'Please upload a higher-resolution document photo or scan.'
    );
  }

  return metadata;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2: Image Quality Assessment (IQA)
// ─────────────────────────────────────────────────────────────────────────────

export async function assessImageQuality(buffer, metadata) {
  const stats = await sharp(buffer).stats();
  const ch0 = stats.channels[0];
  const luminanceMean = ch0.mean;

  // Pure solid color (all channels zero variance)
  const isSolid = stats.channels.every(ch => ch.stdev < 1.5 && (ch.max - ch.min < 6));
  if (isSolid) {
    return {
      qualityPassed: false,
      isSolidBlank: true,
      reasonCode: 'BLANK_IMAGE',
      message: 'This image appears blank or contains a solid background with no readable content.',
      suggestion: 'Please capture a clear photo of your document with visible printed text.',
      sharpness: 0,
      contrast: 0,
      brightness: luminanceMean,
    };
  }

  // Extreme luminance
  if ((luminanceMean > 245 && ch0.min > 230) || (luminanceMean < 15 && ch0.max < 40)) {
    return {
      qualityPassed: false,
      isSolidBlank: true,
      reasonCode: 'BLANK_IMAGE',
      message: 'The image is completely washed out or too dark to read.',
      suggestion: 'Please recapture the document in balanced indoor lighting.',
      sharpness: 0,
      contrast: 0,
      brightness: luminanceMean,
    };
  }

  // Laplacian variance for sharpness
  const laplacianKernel = {
    width: 3,
    height: 3,
    kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
  };

  const edgeResult = await sharp(buffer)
    .resize({ width: 400, withoutEnlargement: true })
    .greyscale()
    .convolve(laplacianKernel)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const edgeStats = await sharp(edgeResult.data, {
    raw: { width: edgeResult.info.width, height: edgeResult.info.height, channels: 1 }
  }).stats();

  const sharpness = parseFloat(edgeStats.channels[0].stdev.toFixed(2));
  const contrast = parseFloat((ch0.max - ch0.min).toFixed(2));

  return {
    qualityPassed: true,
    isSolidBlank: false,
    sharpness,
    contrast,
    brightness: parseFloat(luminanceMean.toFixed(1)),
    isBlurry: sharpness < 3.5,
    isSoftFocus: sharpness >= 3.5 && sharpness < 8.0,
    width: metadata.width,
    height: metadata.height,
    aspectRatio: parseFloat((metadata.width / metadata.height).toFixed(2)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 3: Document versus Non-Document Classification
// ─────────────────────────────────────────────────────────────────────────────

export async function classifyDocumentVsNonDocument(buffer, metadata, quality) {
  // A. Color distribution analysis (250x250 fast scan)
  const smallBuffer = await sharp(buffer)
    .resize({ width: 250, height: 250, fit: 'cover' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = smallBuffer;
  const channels = info.channels;
  const totalPixels = info.width * info.height;

  let paperLikePixels = 0;
  let textLikePixels = 0;
  let skinTonePixels = 0;
  let vibrantColorPixels = 0;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const maxVal = Math.max(r, g, b);
    const minVal = Math.min(r, g, b);
    const diff = maxVal - minVal;

    // Paper: low saturation, bright neutral
    if (diff < 50 && minVal > 90) {
      paperLikePixels++;
    } else if (diff < 40 && maxVal < 90) {
      textLikePixels++;
    } else if (r > 95 && g > 40 && b > 20 && diff > 15 && r > g && r > b) {
      skinTonePixels++;
    } else if (diff > 50) {
      vibrantColorPixels++;
    }
  }

  const paperRatio = paperLikePixels / totalPixels;
  const skinRatio = skinTonePixels / totalPixels;
  const vibrantRatio = vibrantColorPixels / totalPixels;
  const textRatio = textLikePixels / totalPixels;

  // B. Hugging Face MobileNetV4 Vision Inference
  let modelLabel = 'unknown';
  let modelConfidence = 0;
  let topPredictions = [];
  let isDocByVisionModel = false;
  let isSceneryByVisionModel = false;
  let isBuildingByVisionModel = false;
  let isSignByVisionModel = false;

  try {
    const classifier = await getVisionClassifier();
    if (classifier) {
      const imgResized = await sharp(buffer)
        .resize({ width: 224, height: 224, fit: 'fill' })
        .png()
        .toBuffer();

      const raw = await RawImage.fromBlob(new Blob([imgResized], { type: 'image/png' }));
      const predictions = await classifier(raw, { topk: 5 });
      topPredictions = predictions || [];

      if (topPredictions.length > 0) {
        modelLabel = topPredictions[0].label;
        modelConfidence = topPredictions[0].score;

        for (const pred of topPredictions) {
          const l = pred.label.toLowerCase();
          for (const s of DOCUMENT_SYNONYMS) {
            if (l.includes(s)) isDocByVisionModel = true;
          }
          for (const s of SCENERY_SYNONYMS) {
            if (l.includes(s)) isSceneryByVisionModel = true;
          }
          for (const s of BUILDING_SYNONYMS) {
            if (l.includes(s)) isBuildingByVisionModel = true;
          }
          for (const s of SIGN_SYNONYMS) {
            if (l.includes(s)) isSignByVisionModel = true;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Vision Classifier] Inference skipped:', err.message);
  }

  // Heuristic synthesis
  let isDocument = false;
  let nonDocCategory = null;

  if (skinRatio > 0.15 && paperRatio < 0.20) {
    isDocument = false;
    nonDocCategory = 'PERSON_PORTRAIT';
  } else if (vibrantRatio > 0.35 && paperRatio < 0.15) {
    isDocument = false;
    nonDocCategory = 'NATURAL_SCENERY';
  } else if (isSceneryByVisionModel && paperRatio < 0.20) {
    isDocument = false;
    nonDocCategory = 'LANDSCAPE_SCENERY';
  } else if (isBuildingByVisionModel && paperRatio < 0.25 && vibrantRatio > 0.20) {
    isDocument = false;
    nonDocCategory = 'BUILDING_OR_STOREFRONT';
  } else if (paperRatio > 0.25 || isDocByVisionModel || (textRatio > 0.03 && textRatio < 0.25 && paperRatio > 0.18)) {
    isDocument = true;
  } else if (paperRatio < 0.12) {
    isDocument = false;
    nonDocCategory = 'CASUAL_PHOTO';
  } else {
    // Borderline case - let text detection decide
    isDocument = true;
  }

  return {
    isDocument,
    nonDocCategory,
    paperRatio: parseFloat(paperRatio.toFixed(3)),
    skinRatio: parseFloat(skinRatio.toFixed(3)),
    vibrantRatio: parseFloat(vibrantRatio.toFixed(3)),
    textRatio: parseFloat(textRatio.toFixed(3)),
    modelLabel,
    modelConfidence: parseFloat(modelConfidence.toFixed(3)),
    topPredictions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 4: Document Region & Boundary Coverage Detection
// ─────────────────────────────────────────────────────────────────────────────

export async function detectDocumentRegion(buffer, metadata) {
  try {
    // Fast edge coverage test on 300px scale
    const laplacianKernel = {
      width: 3, height: 3,
      kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
    };

    const edge = await sharp(buffer)
      .resize({ width: 300, withoutEnlargement: true })
      .greyscale()
      .convolve(laplacianKernel)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const data = edge.data;
    let edgeHits = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > 20) edgeHits++;
    }

    const edgeDensity = edgeHits / data.length;

    return {
      detected: edgeDensity > 0.015,
      edgeDensity: parseFloat(edgeDensity.toFixed(4)),
    };
  } catch (_e) {
    return { detected: true, edgeDensity: 0.05 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 5: Text Detection & Readability Assessment (THE CRITICAL TINY TEXT FIX)
// ─────────────────────────────────────────────────────────────────────────────

export async function assessTextReadability(buffer, metadata, quality) {
  let worker = null;
  try {
    worker = await getTesseractWorker();
    if (!worker) {
      return {
        readable: true,
        wordCount: 0,
        lineCount: 0,
        medianLineHeight: 20,
        relativeLineHeight: 0.02,
        meanConfidence: 70,
        extractedText: '',
      };
    }

    // Preprocess image for OCR
    const preprocessed = await sharp(buffer)
      .greyscale()
      .normalize()
      .sharpen()
      .toBuffer();

    const result = await worker.recognize(preprocessed, {}, { blocks: true });
    const fullText = (result.data.text || '').trim();

    // Extract lines and words with bounding boxes
    const lines = [];
    const words = [];

    if (result.data.blocks && Array.isArray(result.data.blocks)) {
      for (const block of result.data.blocks) {
        if (!block.paragraphs) continue;
        for (const para of block.paragraphs) {
          if (!para.lines) continue;
          for (const line of para.lines) {
            if (line.bbox) {
              const h = Math.abs(line.bbox.y1 - line.bbox.y0);
              const w = Math.abs(line.bbox.x1 - line.bbox.x0);
              if (h > 0 && w > 0) {
                lines.push({
                  text: (line.text || '').trim(),
                  height: h,
                  width: w,
                  confidence: line.confidence || 0,
                  bbox: line.bbox,
                });
              }
            }
            if (line.words) {
              for (const word of line.words) {
                if (word.text && word.text.trim()) {
                  words.push({
                    text: word.text.trim(),
                    confidence: word.confidence || 0,
                    bbox: word.bbox,
                  });
                }
              }
            }
          }
        }
      }
    }

    // Calculate line height metrics
    let medianLineHeight = 0;
    let meanLineHeight = 0;

    if (lines.length > 0) {
      const heights = lines.map(l => l.height).sort((a, b) => a - b);
      medianLineHeight = heights[Math.floor(heights.length / 2)];
      meanLineHeight = heights.reduce((sum, val) => sum + val, 0) / heights.length;
    }

    // Relative height relative to full image height
    const imgHeight = metadata.height || 1000;
    const relativeLineHeight = medianLineHeight / imgHeight;

    // Confidence metric
    const meanConfidence = words.length > 0
      ? words.reduce((acc, w) => acc + w.confidence, 0) / words.length
      : (result.data.confidence || 0);

    // Tiny text check:
    // Case 1: Lines detected with median character height under 8px OR relative height < 0.006 (0.6% of image height)
    // Case 2: High resolution image (height or width >= 1200) with high contrast where lines/words count is 0 because characters are too microscopic for OCR recognition
    const hasDetectedTinyLines = lines.length > 0 && (medianLineHeight < 8 || relativeLineHeight < 0.006);
    const hasUnresolvableDistantText = lines.length === 0 && quality.contrast >= 100 && (metadata.width >= 1200 || metadata.height >= 1200);
    const isTinyText = hasDetectedTinyLines || hasUnresolvableDistantText;

    // Unreadable due to blur + low confidence
    const isUnreadablyBlurry = (quality.isBlurry && quality.contrast < 80) || (quality.isBlurry && meanConfidence < 42 && !isTinyText);

    // Readability decision
    const readable = !isTinyText && !isUnreadablyBlurry && (words.length >= 3 || fullText.length >= 10);

    return {
      readable,
      isTinyText,
      isUnreadablyBlurry,
      wordCount: words.length,
      lineCount: lines.length,
      medianLineHeight: Math.round(medianLineHeight),
      meanLineHeight: parseFloat(meanLineHeight.toFixed(1)),
      relativeLineHeight: parseFloat(relativeLineHeight.toFixed(4)),
      meanConfidence: parseFloat(meanConfidence.toFixed(1)),
      extractedText: fullText,
      lines,
      words,
    };
  } catch (err) {
    console.warn('[Text Readability] Inspection fallback:', err.message);
    return {
      readable: true,
      wordCount: 1,
      lineCount: 1,
      medianLineHeight: 18,
      relativeLineHeight: 0.02,
      meanConfidence: 65,
      extractedText: '',
      lines: [],
      words: [],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 6: Document Type Classification
// ─────────────────────────────────────────────────────────────────────────────

export function classifyDocumentType(text = '', filename = '') {
  const combined = `${filename} ${text}`.toLowerCase();

  if (/invoice|tax\s*invoice|bill\s*to|gstin|subtotal/i.test(combined)) {
    return 'invoice';
  }
  if (/receipt|payment\s*receipt|cash\s*receipt|transaction\s*id|amount\s*paid/i.test(combined)) {
    return 'receipt';
  }
  if (/electric|water\s*bill|utility|telecom|broadband|due\s*date.*bill/i.test(combined)) {
    return 'bill';
  }
  if (/identity|government\s*of|unique\s*identification|aadhaar|passport|election\s*commission|voter\s*id|pan\s*card/i.test(combined)) {
    return 'id_card';
  }
  if (/certificate|certify\s*that|awarded\s*to|completion|degree|diploma/i.test(combined)) {
    return 'certificate';
  }
  if (/insurance|policy\s*number|premium|sum\s*insured|coverage/i.test(combined)) {
    return 'insurance_policy';
  }
  if (/bank\s*statement|account\s*statement|statement\s*of\s*account|ifsc|account\s*balance/i.test(combined)) {
    return 'bank_statement';
  }
  if (/agreement|lease|affidavit|deed|stamp\s*duty|notary|witnesseth/i.test(combined)) {
    return 'legal_document';
  }
  if (/registration\s*certificate|rc\s*book|chassis\s*no|engine\s*no|vehicle\s*reg/i.test(combined)) {
    return 'vehicle_document';
  }

  return 'other_document';
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 7: Decision Engine
// ─────────────────────────────────────────────────────────────────────────────

export async function validateDocumentPipeline(buffer, options = {}) {
  // 1. Stage 1: Secure File Validation
  const metadata = await validateSecureFile(buffer, options);

  // 2. Stage 2: Image Quality Assessment
  const quality = await assessImageQuality(buffer, metadata);
  if (!quality.qualityPassed && quality.isSolidBlank) {
    return {
      status: 'rejected',
      reason_code: quality.reasonCode,
      message: quality.message,
      suggestion: quality.suggestion,
      document_classification: 'NON_DOCUMENT',
      document_type: null,
      image_quality: quality,
      text_readability: null,
      model_version: '2.0.0-hybrid',
    };
  }

  // 3. Stage 3: Document vs. Non-Document Classification
  const docClassification = await classifyDocumentVsNonDocument(buffer, metadata, quality);

  // 4. Stage 4: Document Region Detection
  const region = await detectDocumentRegion(buffer, metadata);

  // 5. Stage 5: Text Detection & Readability Assessment
  const readability = await assessTextReadability(buffer, metadata, quality);

  // ───────────────────────────────────────────────────────────────────────────
  // CRITICAL DECISION RULES
  // ───────────────────────────────────────────────────────────────────────────

  // Rule 1: Non-Document Rejection (Problem A)
  // Even if OCR found isolated letters on a road sign or shop, if the visual
  // classifier determined it is a natural landscape, building, or casual photo, REJECT IT.
  if (!docClassification.isDocument) {
    // If it has isolated text (like a road sign "STOP" or "ROUTE 66"), it is incidental text!
    return {
      status: 'rejected',
      reason_code: 'NON_DOCUMENT_IMAGE',
      message: 'This image does not appear to be a document.',
      suggestion: 'Upload an invoice, bill, certificate, ID card or another supported document.',
      document_classification: docClassification.nonDocCategory || 'NON_DOCUMENT',
      document_type: null,
      image_quality: quality,
      text_readability: readability,
      model_version: '2.0.0-hybrid',
    };
  }

  // Rule 2: Genuine Document with Unreadably Small Text (Problem B)
  // Distinguish document validity from readability:
  // Identify it as a document, mark readability as insufficient, ask for closer photo.
  if (readability.isTinyText) {
    return {
      status: 'review',
      reason_code: 'TEXT_TOO_SMALL',
      message: 'A document appears to be present, but its text is too small to read reliably.',
      suggestion: 'Move closer to the document and capture it in better lighting.',
      document_classification: 'DOCUMENT',
      document_confidence: 0.85,
      document_type: classifyDocumentType(readability.extractedText, options.originalname || ''),
      image_quality: quality,
      text_readability: readability,
      model_version: '2.0.0-hybrid',
    };
  }

  // Rule 3: Genuine Document with Blurry Text (Problem B)
  if (readability.isUnreadablyBlurry) {
    return {
      status: 'review',
      reason_code: 'IMAGE_BLURRY',
      message: 'A document appears to be present, but the image is too blurry to read the text clearly.',
      suggestion: 'Hold your camera steady and ensure good focus on the document.',
      document_classification: 'DOCUMENT',
      document_confidence: 0.80,
      document_type: classifyDocumentType(readability.extractedText, options.originalname || ''),
      image_quality: quality,
      text_readability: readability,
      model_version: '2.0.0-hybrid',
    };
  }

  // Rule 4: Genuine Document with No Readable Text Anywhere
  if (readability.wordCount === 0 && readability.extractedText.length < 5) {
    return {
      status: 'review',
      reason_code: 'NO_READABLE_TEXT',
      message: 'A document sheet was detected, but no readable text could be recognized.',
      suggestion: 'Ensure the document text is clearly visible and not cut off or washed out.',
      document_classification: 'DOCUMENT',
      document_confidence: 0.75,
      document_type: 'other_document',
      image_quality: quality,
      text_readability: readability,
      model_version: '2.0.0-hybrid',
    };
  }

  // Rule 5: ACCEPT — Document is valid and text is readable!
  const docType = classifyDocumentType(readability.extractedText, options.originalname || '');

  return {
    status: 'accepted',
    reason_code: null,
    message: 'Document verified. OCR processing can begin.',
    suggestion: null,
    document_classification: 'DOCUMENT',
    document_confidence: 0.95,
    document_type: docType,
    image_quality: quality,
    text_readability: readability,
    extractedText: readability.extractedText,
    model_version: '2.0.0-hybrid',
  };
}
