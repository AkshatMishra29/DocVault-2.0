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

export async function convertPdfToImages(buffer) {
  try {
    const pdfImgConvert = await import('pdf-img-convert');
    const convertFn = pdfImgConvert.convert || pdfImgConvert.default?.convert;
    if (!convertFn) {
      throw new Error('convert function not found on pdf-img-convert module');
    }
    return await convertFn(buffer, {
      width: 1600,
      page_numbers: [1, 2],
    });
  } catch (err) {
    console.warn('[OCR Service] pdf-img-convert unavailable:', err.message);
    return null;
  }
}
