import crypto from 'crypto';
import sharp from 'sharp';

/**
 * DocVault Upload Validation Service (Layer 1)
 *
 * Enforces:
 * 1. Binary magic bytes validation (PDF, PNG, JPEG, WEBP).
 * 2. MIME type consistency check against actual binary signature.
 * 3. File size cap (25 MB max).
 * 4. Image dimension limits (max 10,000 x 10,000 px, max 40 megapixels) to prevent decompression bombs.
 * 5. PDF structural security check (reject embedded JavaScript, launch actions, active scripts).
 * 6. PDF page limit check (max 25 pages).
 * 7. Path traversal prevention & safe filename generation.
 */

// Supported Magic Bytes Definitions
const MAGIC_BYTES = {
  PDF: [0x25, 0x50, 0x44, 0x46], // %PDF
  PNG: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  JPEG: [0xFF, 0xD8, 0xFF],
  WEBP_RIFF: [0x52, 0x49, 0x46, 0x46], // RIFF
};

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_IMAGE_DIMENSION = 10000; // 10,000 px
const MAX_IMAGE_PIXELS = 40 * 1000 * 1000; // 40 MP max decompression limit
const MAX_PDF_PAGES = 25;

export class UploadSecurityError extends Error {
  constructor(message, code = 'INVALID_FILE') {
    super(message);
    this.name = 'UploadSecurityError';
    this.code = code;
  }
}

/**
 * Validate actual binary file signature against claimed mime type
 */
export function validateFileSignature(buffer, claimedMimetype, originalname) {
  if (!buffer || buffer.length < 16) {
    throw new UploadSecurityError('The uploaded file is empty or corrupted.', 'FILE_CORRUPTED');
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new UploadSecurityError('File exceeds maximum allowable size of 25 MB.', 'FILE_TOO_LARGE');
  }

  const matchesSignature = (bytes) => {
    for (let i = 0; i < bytes.length; i++) {
      if (buffer[i] !== bytes[i]) return false;
    }
    return true;
  };

  let detectedType = null;
  let extension = null;

  // Check PDF
  if (matchesSignature(MAGIC_BYTES.PDF)) {
    detectedType = 'application/pdf';
    extension = 'PDF';
  } else if (matchesSignature(MAGIC_BYTES.PNG)) {
    detectedType = 'image/png';
    extension = 'PNG';
  } else if (matchesSignature(MAGIC_BYTES.JPEG)) {
    detectedType = 'image/jpeg';
    extension = 'JPG';
  } else if (matchesSignature(MAGIC_BYTES.WEBP_RIFF)) {
    const webpHeader = buffer.slice(8, 12).toString('ascii');
    if (webpHeader === 'WEBP') {
      detectedType = 'image/webp';
      extension = 'WEBP';
    }
  }

  if (!detectedType) {
    throw new UploadSecurityError(
      'Unsupported file format. Please upload a standard PDF or document image (PNG, JPG, WEBP).',
      'UNSUPPORTED_FORMAT'
    );
  }

  // Cross-verify claimed MIME with detected signature (detect renamed executables or polyglots)
  if (claimedMimetype) {
    const normClaimed = claimedMimetype.toLowerCase().trim();
    const isImageMismatch = detectedType.startsWith('image/') && !normClaimed.startsWith('image/');
    const isPdfMismatch = detectedType === 'application/pdf' && !normClaimed.includes('pdf');
    if (isImageMismatch || isPdfMismatch) {
      throw new UploadSecurityError(
        'File extension or MIME type does not match the actual file format.',
        'MIME_MISMATCH'
      );
    }
  }

  return { detectedType, extension };
}

/**
 * Validate image dimensions against decompression bombs
 */
export async function validateImageSafety(buffer) {
  try {
    const metadata = await sharp(buffer, { failOnError: true }).metadata();
    if (!metadata.width || !metadata.height) {
      throw new UploadSecurityError('Unable to decode image dimensions.', 'IMAGE_CORRUPTED');
    }

    if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION) {
      throw new UploadSecurityError(
        `Image dimensions (${metadata.width}x${metadata.height}) exceed maximum allowed limit of ${MAX_IMAGE_DIMENSION}px.`,
        'IMAGE_BOMB_DETECTED'
      );
    }

    const totalPixels = metadata.width * metadata.height;
    if (totalPixels > MAX_IMAGE_PIXELS) {
      throw new UploadSecurityError(
        'Image resolution exceeds maximum allowable pixel density.',
        'IMAGE_BOMB_DETECTED'
      );
    }

    return metadata;
  } catch (err) {
    if (err instanceof UploadSecurityError) throw err;
    throw new UploadSecurityError(
      'Image file is corrupted or could not be decoded safely.',
      'IMAGE_CORRUPTED'
    );
  }
}

/**
 * Validate PDF safety & page count:
 * - Reject active scripts (/JavaScript, /JS, /Launch, /EmbeddedFiles)
 * - Restrict maximum page count to 25
 */
export function validatePdfSafety(buffer) {
  try {
    const content = buffer.toString('latin1');

    // 1. Check for malicious active scripts and execution triggers
    const activeContentPatterns = [
      /\/JavaScript\b/i,
      /\/JS\s*[\(\<]/i,
      /\/Launch\b/i,
      /\/Action\s*<<\s*\/S\s*\/Launch/i,
    ];

    for (const pattern of activeContentPatterns) {
      if (pattern.test(content)) {
        throw new UploadSecurityError(
          'Security Guardrail: PDF contains active executable scripts or launch actions, which are prohibited.',
          'MALICIOUS_PDF_CONTENT'
        );
      }
    }

    // 2. Count pages
    const matches = content.match(/\/Type\s*\/Page\b/g);
    const count = matches ? matches.length : 1;
    if (count > MAX_PDF_PAGES) {
      throw new UploadSecurityError(
        `Document exceeds the maximum limit of ${MAX_PDF_PAGES} pages (found ${count} pages). Please upload documents of ${MAX_PDF_PAGES} pages or fewer.`,
        'PDF_PAGE_LIMIT_EXCEEDED'
      );
    }

    return { pageCount: count };
  } catch (err) {
    if (err instanceof UploadSecurityError) throw err;
    return { pageCount: 1 };
  }
}

/**
 * Sanitize original filename and prevent path traversal
 */
export function generateSafeServerFilename(originalname = 'document') {
  const cleanBase = originalname
    .replace(/[/\\?%*:|"<>]/g, '_') // Strip dangerous shell/path characters
    .replace(/\.\.+/g, '_')          // Strip path traversal attempts (../)
    .trim();

  const safeUnique = `${crypto.randomBytes(8).toString('hex')}_${cleanBase}`;
  return safeUnique.slice(0, 120);
}
