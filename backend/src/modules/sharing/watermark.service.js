import sharp from 'sharp';

/**
 * DocVault Watermarking Service
 * 
 * Applies dynamic visual security deterrent watermarks to documents:
 * - Recipient name / identifier
 * - Date & Timestamp
 * - Share reference ID
 * - DocVault Confidential branding
 *
 * Designed to work on image documents and rendered PDF pages (via sharp).
 */
export class WatermarkService {
  /**
   * Apply dynamic SVG text watermark overlay across an image buffer
   */
  static async applyWatermarkToImage(imageBuffer, { recipientLabel, shareRef, timestamp = new Date() }) {
    try {
      const metadata = await sharp(imageBuffer).metadata();
      const width = metadata.width || 1200;
      const height = metadata.height || 1600;

      const dateStr = timestamp.toISOString().split('T')[0];
      const timeStr = timestamp.toISOString().split('T')[1].slice(0, 5) + ' UTC';
      const cleanRecipient = (recipientLabel || 'Authorized Viewer').replace(/[<>&"']/g, '');
      const cleanRef = (shareRef || '').slice(-8).toUpperCase();

      // Create diagonal repeated watermark pattern using SVG
      const watermarkText = `DOCVAULT CONFIDENTIAL • ${cleanRecipient} • ${dateStr} ${timeStr} • REF:${cleanRef}`;

      const svgOverlay = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <style>
            .watermark-text {
              fill: rgba(220, 38, 38, 0.18);
              font-size: ${Math.max(16, Math.floor(width / 32))}px;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              font-weight: 700;
              letter-spacing: 2px;
            }
            .watermark-banner {
              fill: rgba(0, 112, 242, 0.85);
              font-size: 14px;
              font-family: sans-serif;
              font-weight: 600;
            }
          </style>

          <!-- Top Security Banner -->
          <rect x="0" y="0" width="${width}" height="28" fill="rgba(15, 23, 42, 0.9)" />
          <text x="${width / 2}" y="19" text-anchor="middle" fill="#ffffff" class="watermark-banner">
            RESTRICTED ACCESS FOR: ${cleanRecipient} (DOCVAULT SECURE SHARE #${cleanRef})
          </text>

          <!-- Diagonal Watermark Repeats -->
          <g transform="rotate(-35 ${width / 2} ${height / 2})">
            <text x="${width / 2 - 400}" y="${height / 2 - 250}" class="watermark-text">${watermarkText}</text>
            <text x="${width / 2 - 300}" y="${height / 2}" class="watermark-text">${watermarkText}</text>
            <text x="${width / 2 - 200}" y="${height / 2 + 250}" class="watermark-text">${watermarkText}</text>
          </g>
        </svg>
      `;

      const watermarked = await sharp(imageBuffer)
        .composite([{ input: Buffer.from(svgOverlay), top: 0, left: 0 }])
        .png()
        .toBuffer();

      return watermarked;
    } catch (err) {
      console.warn('[WatermarkService] Failed to composite watermark, returning original buffer:', err.message);
      return imageBuffer;
    }
  }

  /**
   * Generates a recipient-watermarked viewable buffer
   */
  static async renderWatermarkedDocument(documentDoc, { recipientLabel, shareRef }) {
    if (!documentDoc || !documentDoc.fileData) return null;

    const rawBuffer = Buffer.from(documentDoc.fileData, 'base64');
    const isImage = (documentDoc.mimetype || '').startsWith('image/');

    if (isImage) {
      return await this.applyWatermarkToImage(rawBuffer, { recipientLabel, shareRef });
    }

    // For PDF files, render first page to high-res image and apply dynamic watermark for the secure viewer
    if (documentDoc.mimetype === 'application/pdf') {
      try {
        const { convertPdfToImages } = await import('../../services/ocr/ocrService.js');
        const images = await convertPdfToImages(rawBuffer);
        if (images && images.length > 0) {
          return await this.applyWatermarkToImage(images[0], { recipientLabel, shareRef });
        }
      } catch (pdfErr) {
        console.warn('[WatermarkService] PDF page rasterization failed, returning raw PDF:', pdfErr.message);
      }
    }

    return rawBuffer;
  }
}

