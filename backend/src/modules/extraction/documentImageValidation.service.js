import sharp from 'sharp';

/**
 * DocVault Document Image Validation Service (Layer 2) — Production Architecture v2
 *
 * Multi-signal ensemble validation pipeline:
 *
 * A. Blank / Near-Blank Detection
 *    — Pure solid color (stdev < 3)
 *    — Near-white / near-black empty page (luminance extremes + low stdev)
 *    — High luminance + low edge variance (nearly-blank with faint watermark or noise)
 *
 * B. Blur / Low-Quality Detection
 *    — Laplacian high-frequency edge variance
 *
 * C. Casual Photo / Wallpaper Rejection (3-signal ensemble)
 *    Signal 1 — paperRatio   : fraction of paper-like (white/cream, low-saturation, bright) pixels
 *    Signal 2 — edgeLineDensity : fraction of edge pixels in greyscale Laplacian (text-heavy docs score high)
 *    Signal 3 — skinRatio / vibrantRatio : heuristic skin-tone and vivid-color coverage
 *    Decision rules are AND-based for precision over recall; ID cards with photo are allowed.
 *
 * D. Multi-Document Collage Detection
 *    — Full-frame horizontal + vertical dark divider detection
 */

export class DocumentImageValidationError extends Error {
  constructor(message, reasonCode = 'INVALID_DOCUMENT_IMAGE') {
    super(message);
    this.name = 'DocumentImageValidationError';
    this.reasonCode = reasonCode;
  }
}

/**
 * Comprehensive Image Document Guardrail Pipeline
 */
export async function validateDocumentImage(buffer, metadata = {}) {
  // ── Step 0: Decode metadata ──────────────────────────────────────────────
  const meta = metadata.width ? metadata : await sharp(buffer).metadata();

  if (meta.width < 120 || meta.height < 120) {
    throw new DocumentImageValidationError(
      'Image resolution is too low to be a readable document. Minimum size is 120x120 pixels.',
      'RESOLUTION_TOO_LOW'
    );
  }

  // ── Step 1: Global statistics ────────────────────────────────────────────
  const stats = await sharp(buffer).stats();
  const ch0 = stats.channels[0];

  // A-1: Pure solid color (all channels near-zero stdev)
  const isSolidColor = stats.channels.every(ch => ch.stdev < 1.5 && (ch.max - ch.min < 5));
  if (isSolidColor) {
    throw new DocumentImageValidationError(
      'This image appears blank or contains a solid background without readable document content.',
      'BLANK_IMAGE'
    );
  }

  // A-2: Near-white or near-black empty page (no contrasting text content anywhere)
  const luminanceMean = ch0.mean;
  if (
    (luminanceMean > 230 && ch0.min > 215) ||
    (luminanceMean < 15  && ch0.max < 40)
  ) {
    throw new DocumentImageValidationError(
      'This image appears blank. Please upload a clear document image with visible text.',
      'BLANK_IMAGE'
    );
  }

  // ── Step 2: Laplacian edge variance (blur + near-blank ensemble signal) ──
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
  const edgeVariance = edgeStats.channels[0].stdev;

  // A-3: Near-blank (high luminance, no dark ink text anywhere in the document)
  if (luminanceMean > 230 && ch0.min > 200 && edgeVariance < 2.0) {
    throw new DocumentImageValidationError(
      'This image appears nearly blank with insufficient readable content. Please upload a clear document scan.',
      'BLANK_IMAGE'
    );
  }

  // ── Step 3: Document vs. Casual Photo / Wallpaper — 3-Signal Ensemble ───
  const ensembleResult = await evaluateDocumentEnsemble(buffer, meta, stats, edgeVariance);
  if (!ensembleResult.accepted) {
    throw new DocumentImageValidationError(
      ensembleResult.message || 'Please upload a document image instead of a personal photograph.',
      ensembleResult.reasonCode || 'CASUAL_PHOTO_REJECTED'
    );
  }

  // ── Step 4: Multi-document collage ───────────────────────────────────────
  const collageCheck = await detectDocumentCollage(buffer, meta);
  if (collageCheck.isCollage) {
    throw new DocumentImageValidationError(
      'Multiple documents or a collage were detected. Please upload each document separately.',
      'MULTIPLE_DOCUMENTS_DETECTED'
    );
  }

  return {
    valid: true,
    width: meta.width,
    height: meta.height,
    format: meta.format,
    edgeVariance: parseFloat(edgeVariance.toFixed(2)),
  };
}

/**
 * 3-Signal Ensemble: distinguishes document images from casual photos / wallpapers.
 *
 * Signal 1 — paperRatio        : paper-like (white/cream, low saturation, high brightness)
 * Signal 2 — edgeLineDensity   : proportion of "edge" pixels after Laplacian (text -> high density)
 * Signal 3 — skinRatio / vibrantRatio  : skin-tone and vivid-color dominance
 *
 * Decision rules (AND-based for precision):
 *   Rule A: virtually no paper AND virtually no text edges -> wallpaper / photo (not a doc)
 *   Rule B: very high vibrant color AND low paper -> outdoor photo / wallpaper
 *   Rule C: skin dominates AND low paper -> selfie / portrait
 *   Rule D: high brightness but zero structure AND no paper -> gradient or decorative image
 *
 * ID cards (Aadhaar, DL, Passport): moderate skin (8-25%), substantial paper (>22%) -> ACCEPTED.
 */
async function evaluateDocumentEnsemble(buffer, metadata, fullStats, globalEdgeVariance) {
  try {
    // --- Pixel-level color analysis (250x250 fast scan) ---------------------
    const smallBuffer = await sharp(buffer)
      .resize({ width: 250, height: 250, fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = smallBuffer;
    const channels = info.channels;
    const totalPixels = info.width * info.height;

    let paperLikePixels = 0;    // Bright neutral — paper/card background
    let textLikePixels = 0;     // Dark ink — text content
    let skinTonePixels = 0;     // Human skin tones
    let vibrantColorPixels = 0; // Vivid colors — outdoor, wallpaper, clothing

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const maxVal = Math.max(r, g, b);
      const minVal = Math.min(r, g, b);
      const diff = maxVal - minVal;

      // Paper: low saturation (diff < 65), moderate-to-high brightness (minVal > 75)
      if (diff < 65 && minVal > 75) {
        paperLikePixels++;
      }
      // Text: low saturation, low brightness or dark ink strokes
      else if (diff < 50 && maxVal < 110) {
        textLikePixels++;
      }
      // Skin tone: R > G > B with specific magnitude relationships
      else if (
        r > 95 && g > 40 && b > 20 &&
        diff > 15 &&
        Math.abs(r - g) > 15 &&
        r > g && r > b
      ) {
        skinTonePixels++;
      }
      // Vibrant: high saturation (diff > 50)
      else if (diff > 50) {
        vibrantColorPixels++;
      }
    }

    const paperRatio   = paperLikePixels   / totalPixels;
    const skinRatio    = skinTonePixels    / totalPixels;
    const vibrantRatio = vibrantColorPixels / totalPixels;
    const textRatio    = textLikePixels    / totalPixels;

    // --- Signal 2: Edge-line density (greyscale Laplacian at 300px wide) ---
    // Count edge pixels (abs edge value > threshold) relative to total
    const laplacianKernel = {
      width: 3, height: 3,
      kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
    };
    const edgeDensityResult = await sharp(buffer)
      .resize({ width: 300, withoutEnlargement: true })
      .greyscale()
      .convolve(laplacianKernel)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const edgeData = edgeDensityResult.data;
    const edgeTotal = edgeData.length;
    let edgePixelCount = 0;
    for (let j = 0; j < edgeTotal; j++) {
      // Edge response > 15 counts as a "real edge" (text stroke, border, etc.)
      if (edgeData[j] > 15) edgePixelCount++;
    }
    const edgeLineDensity = edgePixelCount / edgeTotal;

    // ── Decision rules ──────────────────────────────────────────────────────

    // Rule A: No paper background AND no text structure AND low edge density
    // -> Wallpaper, outdoor photo, abstract image (not a document scan)
    if (paperRatio < 0.05 && textRatio < 0.03 && edgeLineDensity < 0.08) {
      return {
        accepted: false,
        message: 'No document structure detected. Please upload an invoice, certificate, identity document, or policy image.',
        reasonCode: 'CASUAL_PHOTO_REJECTED'
      };
    }

    // Rule A2: Near-blank white/cream sheet — extremely high paper ratio but zero dark text strokes anywhere across the image
    // Only fires if the darkest pixel across the entire image is brighter than 200 (virtually 100% white/cream with no ink)
    const darkestPixel = fullStats?.channels?.[0]?.min ?? 0;
    if (paperRatio > 0.95 && darkestPixel > 200 && edgeLineDensity < 0.002) {
      return {
        accepted: false,
        message: 'This image appears to be a blank or empty page with no readable content.',
        reasonCode: 'BLANK_IMAGE'
      };
    }

    // Rule B: Vibrant color dominance with almost no paper background
    // -> Landscape, wallpaper, vivid outdoor photo
    if (vibrantRatio > 0.40 && paperRatio < 0.10) {
      return {
        accepted: false,
        message: 'Please upload a document image (invoice, certificate, policy, ID) instead of a general photograph.',
        reasonCode: 'CASUAL_PHOTO_REJECTED'
      };
    }

    // Rule C: Skin-tone dominance with minimal paper
    // -> Selfie or group portrait
    if (skinRatio > 0.38 && paperRatio < 0.20) {
      return {
        accepted: false,
        message: 'Please upload a document image instead of a personal portrait or selfie.',
        reasonCode: 'CASUAL_PHOTO_REJECTED'
      };
    }

    // Rule D: High brightness image but structurally empty
    // -> Gradient wallpaper, solid pastel background, decorative image
    const luminanceMean = fullStats.channels[0].mean;
    if (
      luminanceMean > 190 &&
      paperRatio < 0.08 &&
      textRatio < 0.02 &&
      edgeLineDensity < 0.06
    ) {
      return {
        accepted: false,
        message: 'No document structure detected. Please upload a clear scan or photo of a physical document.',
        reasonCode: 'CASUAL_PHOTO_REJECTED'
      };
    }

    // ID cards with moderate skin (8-25%) + substantial paper (>22%) -> ACCEPTED
    // All other images that passed the above filters are accepted
    return { accepted: true };
  } catch (_err) {
    // Fail open to text-based inspection if pixel analysis hits an unexpected error
    return { accepted: true };
  }
}

/**
 * Detects multiple separate documents or photo-grid collages.
 * Full-frame horizontal + vertical dark divider lines indicate a collage.
 */
async function detectDocumentCollage(buffer, metadata) {
  try {
    const resized = await sharp(buffer)
      .resize({ width: 200, height: 200, fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer();

    const midX = 100;
    const midY = 100;
    let horizontalDividerHits = 0;
    let verticalDividerHits = 0;

    for (let x = 10; x < 190; x++) {
      if (resized[midY * 200 + x] < 35) horizontalDividerHits++;
    }
    for (let y = 10; y < 190; y++) {
      if (resized[y * 200 + midX] < 35) verticalDividerHits++;
    }

    if (horizontalDividerHits > 150 && verticalDividerHits > 150) {
      return { isCollage: true };
    }

    return { isCollage: false };
  } catch (_e) {
    return { isCollage: false };
  }
}
