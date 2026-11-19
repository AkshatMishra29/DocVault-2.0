import { PDFParse } from 'pdf-parse';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';

/**
 * OCR Service for multi-format text extraction (PDFs, JPGs, PNGs)
 * Implements privacy-first local OCR with preprocessing via Sharp and multi-page preservation.
 */

/**
 * Extracts text from all pages of a digital PDF, annotating page boundaries
 * (e.g. --- Page 1 ---, --- Page 2 ---) to preserve structured grounding for AI Copilot.
 */
export async function extractTextFromPDF(buffer) {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();

    if (result && Array.isArray(result.pages) && result.pages.length > 1) {
      const pageSections = result.pages
        .map(p => {
          const pageNum = p.num || 1;
          const text = (p.text || '').trim();
          return text ? `--- Page ${pageNum} ---\n${text}` : '';
        })
        .filter(Boolean);

      if (pageSections.length > 0) {
        return pageSections.join('\n\n');
      }
    }

    if (result && typeof result.text === 'string') {
      return result.text.trim();
    }
    return '';
  } catch (err) {
    console.warn('[OCR Service] PDF Parse error:', err.message);
    return '';
  }
}

export async function extractTextFromImage(buffer) {
  try {
    // Preprocess image with Sharp for optimal Tesseract OCR accuracy
    const preprocessedBuffer = await sharp(buffer)
      .greyscale()
      .normalize()
      .sharpen()
      .toBuffer();

    const { data: { text } } = await Tesseract.recognize(preprocessedBuffer, 'eng');
    return text ? text.trim() : '';
  } catch (err) {
    console.warn('[OCR Service] Tesseract image OCR error:', err.message);
    return '';
  }
}

/**
 * Rasterize PDF pages into PNG image buffers using PDFParse.getScreenshot.
 * Supports multi-page document inspection and OCR fallback.
 */
export async function convertPdfToImages(buffer, maxPages = 5, scale = 2.0) {
  try {
    const parser = new PDFParse({ data: buffer });
    const screenshot = await parser.getScreenshot({ scale, imageBuffer: true });
    if (screenshot && Array.isArray(screenshot.pages) && screenshot.pages.length > 0) {
      return screenshot.pages
        .slice(0, maxPages)
        .map(page => Buffer.from(page.data));
    }
    return null;
  } catch (err) {
    console.warn('[OCR Service] PDF to image conversion error:', err.message);
    return null;
  }
}
