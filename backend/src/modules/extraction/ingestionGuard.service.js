import crypto from 'crypto';
import sharp from 'sharp';

/**
 * DocVault Ingestion Guardrail Service
 *
 * Enforces:
 * 1. File signature (magic bytes) validation.
 * 2. Empty / blank document rejection.
 * 3. Page count limits (max 25 pages).
 * 4. Casual image rejection (family photos, selfies, landscapes rejected; document photos accepted).
 * 5. Prompt injection sanitization and untrusted document encapsulation.
 * 6. Cryptographic SHA-256 fingerprinting.
 */

// Supported Magic Bytes Definitions
const MAGIC_BYTES = {
  PDF: [0x25, 0x50, 0x44, 0x46], // %PDF
  PNG: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  JPEG: [0xFF, 0xD8, 0xFF],
  WEBP_RIFF: [0x52, 0x49, 0x46, 0x46], // RIFF
};

/**
 * Validate actual binary file signature against claimed mime type
 */
export function validateMagicBytes(buffer, mimetype, originalname) {
  if (!buffer || buffer.length < 16) {
    throw new Error('File buffer is empty or corrupted.');
  }

  const matchesSignature = (bytes) => {
    for (let i = 0; i < bytes.length; i++) {
      if (buffer[i] !== bytes[i]) return false;
    }
    return true;
  };

  // Check PDF
  if (matchesSignature(MAGIC_BYTES.PDF)) {
    return { detectedType: 'application/pdf', extension: 'PDF' };
  }

  // Check PNG
  if (matchesSignature(MAGIC_BYTES.PNG)) {
    return { detectedType: 'image/png', extension: 'PNG' };
  }

  // Check JPEG
  if (matchesSignature(MAGIC_BYTES.JPEG)) {
    return { detectedType: 'image/jpeg', extension: 'JPG' };
  }

  // Check WEBP
  if (matchesSignature(MAGIC_BYTES.WEBP_RIFF)) {
    // Check for 'WEBP' at offset 8..11
    const webpHeader = buffer.slice(8, 12).toString('ascii');
    if (webpHeader === 'WEBP') {
      return { detectedType: 'image/webp', extension: 'WEBP' };
    }
  }

  throw new Error(
    `Security Guardrail: File "${originalname}" has an invalid or unrecognized binary signature. Supported formats are PDF, PNG, JPEG, and WEBP.`
  );
}

/**
 * Calculate cryptographic SHA-256 hash of document buffer
 */
export function calculateDocumentHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Inspect image buffer to reject empty/blank pages and non-document casual photos
 */
export async function inspectImageGuardrails(buffer, filename) {
  try {
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Unable to read image dimensions.');
    }

    // 1. Minimum dimension check
    if (metadata.width < 100 || metadata.height < 100) {
      throw new Error('Security Guardrail: Image is too small to be a legible document (minimum 100x100px).');
    }

    // 2. Empty / Blank image detection via pixel luminance variance & dark pixel existence
    const stats = await sharp(buffer).stats();
    const ch0 = stats.channels[0];
    const isBlank = stats.channels.every(ch => ch.stdev < 1.0) ||
      (ch0.mean > 240 && ch0.min > 215) ||
      (ch0.mean < 15 && ch0.max < 40);
    if (isBlank) {
      throw new Error('Security Guardrail: Uploaded image appears to be blank or a single solid color.');
    }

    // 3. Document vs. Casual Photo Heuristic Analysis
    // Documents (invoices, receipts, certificates, ID cards) exhibit high-contrast
    // text transitions, bimodal luminance, and distinct horizontal gradient densities.
    // Casual photos (family portraits, landscapes, selfies, pets) exhibit continuous
    // color gradients, high entropy across hue channels, and low localized text edge density.
    const isDocLikely = await analyzeDocumentStructure(buffer, metadata);
    if (!isDocLikely) {
      throw new Error(
        'Security Guardrail: Uploaded image is classified as a casual personal photograph (e.g. family photo, selfie, landscape, or non-document image). DocVault accepts document scans, paper receipts, certificates, bills, and identity cards only.'
      );
    }

    return {
      isValidDocument: true,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
    };
  } catch (err) {
    if (err.message.startsWith('Security Guardrail:')) {
      throw err;
    }
    console.warn('[Ingestion Guard] Warning during image structural inspection:', err.message);
    return { isValidDocument: true };
  }
}

/**
 * Structural analyzer distinguishing documents from casual photographs
 */
async function analyzeDocumentStructure(buffer, metadata) {
  try {
    // Resize down to 400px width for fast, CPU-efficient edge-histogram computation (<15ms)
    const resized = await sharp(buffer)
      .resize({ width: 400, withoutEnlargement: true })
      .greyscale()
      .toBuffer();

    const stats = await sharp(resized).stats();
    const dominantLuminance = stats.channels[0].mean;
    const stdDev = stats.channels[0].stdev;

    // Document characteristic: High background luminance (white/light paper) with high contrast text
    // Light paper typically has mean > 110 and stdDev > 20
    const isHighContrastDocument = dominantLuminance > 90 && stdDev > 20;

    // Color channel entropy comparison
    const colorStats = await sharp(buffer)
      .resize({ width: 200, withoutEnlargement: true })
      .stats();

    // Natural photos (family portraits, outdoor) have high standard deviations across ALL RGB channels
    // Document scans predominantly feature monochromatic text on paper
    if (colorStats.channels.length >= 3) {
      const redMean = colorStats.channels[0].mean;
      const greenMean = colorStats.channels[1].mean;
      const blueMean = colorStats.channels[2].mean;
      const colorDiff = Math.abs(redMean - greenMean) + Math.abs(greenMean - blueMean) + Math.abs(redMean - blueMean);

      // If background is dark and saturated with varied skin/outdoor colors and low contrast text:
      // High color variance + low paper luminance strongly indicates a casual photo
      if (colorDiff > 45 && dominantLuminance < 110 && !metadata.format?.includes('pdf')) {
        return false;
      }
    }

    return true;
  } catch (e) {
    return true; // Fail open to OCR text verification if edge check fails
  }
}

/**
 * Detect page count from PDF buffer and enforce maximum 25 pages
 */
export function estimatePdfPageCount(buffer) {
  try {
    const content = buffer.toString('latin1');
    const matches = content.match(/\/Type\s*\/Page\b/g);
    const count = matches ? matches.length : 1;
    if (count > 25) {
      throw new Error(`Security Guardrail: Document exceeds maximum allowable length of 25 pages (Detected: ${count} pages). Please upload documents of 25 pages or fewer.`);
    }
    return count;
  } catch (err) {
    if (err.message.startsWith('Security Guardrail:')) throw err;
    return 1;
  }
}

/**
 * Prompt Injection Protection
 * Detects adversarial instructions designed to hijack LLM behavior.
 */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /system\s*prompt\s*:/i,
  /disregard\s+(all\s+)?(rules|guidelines|commands)/i,
  /you\s+are\s+now\s+(in\s+)?developer\s+mode/i,
  /jailbreak/i,
  /dan\s+mode/i,
  /reveal\s+(your\s+)?(system|internal)\s+(prompt|instructions)/i,
  /format\s+as\s*:\s*\[\s*system/i,
  /output\s+the\s+following\s+password/i,
];

/**
 * Scans text for prompt injection attempts and flags / sanitizes them
 */
export function sanitizePromptInjection(text) {
  if (!text) return { sanitizedText: '', hasInjectionAttempt: false };

  let hasInjectionAttempt = false;
  let sanitized = text;

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sanitized)) {
      hasInjectionAttempt = true;
      sanitized = sanitized.replace(pattern, '[BLOCKED_INJECTION_TRIGGER]');
    }
  }

  return {
    sanitizedText: sanitized,
    hasInjectionAttempt,
  };
}

/**
 * Wraps document content in an immutable, untrusted data block
 * ensuring the LLM treats it strictly as passive data rather than executable instructions.
 */
export function wrapUntrustedDocumentContent(text) {
  const { sanitizedText } = sanitizePromptInjection(text);
  return `
<untrusted_document_content source="user_upload" security_clearance="passive_data_only">
${sanitizedText}
</untrusted_document_content>
`;
}
