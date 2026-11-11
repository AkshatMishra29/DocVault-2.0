import { PDFParse } from 'pdf-parse';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';

/**
 * OCR Service for multi-format text extraction (PDFs, JPGs, PNGs)
 * Implements privacy-first local OCR with preprocessing via Sharp.
 */

export async function extractTextFromPDF(buffer) {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
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

export async function convertPdfToImages(buffer, maxPages = 2, scale = 1.5) {
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas } = await import('canvas');

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      disableFontFace: true,
      useSystemFonts: true,
    });
    const doc = await loadingTask.promise;
    const numPages = Math.min(doc.numPages, maxPages);
    const buffers = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');

      // White solid background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, viewport.width, viewport.height);

      await page.render({ canvasContext: ctx, viewport }).promise;
      buffers.push(canvas.toBuffer('image/png'));
    }
    return buffers;
  } catch (err) {
    console.warn('[OCR Service] PDF to image conversion error:', err.message);
    return null;
  }
}
