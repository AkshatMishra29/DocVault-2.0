import time
import pymupdf
from typing import List, Dict, Any
from app.config import (
    MAX_PAGES,
    DEFAULT_OCR_DPI,
    MIN_TEXT_CHARS_FOR_DIGITAL,
    MIN_WORD_CONFIDENCE
)
from app.services.image_preprocessor import ImagePreprocessor
from app.services.ocr_engine import OCREngine


class PDFExtractor:
    """
    Intelligent page-level PDF extractor using PyMuPDF and native Tesseract OCR.
    Evaluates each page independently to handle digital, scanned, and mixed PDFs.
    """

    @classmethod
    def process_pdf(cls, pdf_bytes: bytes) -> List[Dict[str, Any]]:
        doc = None
        results = []

        try:
            doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")

            if doc.is_encrypted:
                raise ValueError("PDF is encrypted and cannot be parsed without the decryption password.")

            total_pages = doc.page_count
            if total_pages == 0:
                raise ValueError("PDF document contains 0 pages.")

            pages_to_process = min(total_pages, MAX_PAGES)

            for page_idx in range(pages_to_process):
                page_start = time.time()
                page_num = page_idx + 1
                page = doc.load_page(page_idx)

                # 1. Attempt digital text extraction first
                digital_text = page.get_text("text").strip()
                printable_chars = len([c for c in digital_text if not c.isspace()])

                # Check if page has a rich digital text layer
                if printable_chars >= MIN_TEXT_CHARS_FOR_DIGITAL:
                    word_count = len(digital_text.split())
                    results.append({
                        "pageNumber": page_num,
                        "method": "digital_text",
                        "status": "TEXT_EXTRACTED",
                        "text": digital_text,
                        "confidence": 0.95,
                        "charCount": len(digital_text),
                        "wordCount": word_count,
                        "error": None,
                        "durationMs": round((time.time() - page_start) * 1000, 2)
                    })
                    continue

                # 2. Scanned / Image page routing: Render to 300 DPI image
                try:
                    pix = page.get_pixmap(dpi=DEFAULT_OCR_DPI)
                    png_bytes = pix.tobytes("png")
                    # Explicit memory cleanup
                    del pix

                    # Image preprocessing
                    enhanced_gray, binarized = ImagePreprocessor.preprocess_image_buffer(png_bytes)

                    # Tesseract OCR execution
                    ocr_res = OCREngine.ocr_with_fallback(enhanced_gray, binarized)

                    ocr_text = ocr_res["text"].strip()
                    conf = ocr_res["mean_confidence"] / 100.0  # Normalize to 0.0 - 1.0

                    if not ocr_text:
                        status = "EMPTY_PAGE"
                    elif ocr_res["mean_confidence"] < MIN_WORD_CONFIDENCE:
                        status = "LOW_CONFIDENCE"
                    else:
                        status = "OCR_EXTRACTED"

                    results.append({
                        "pageNumber": page_num,
                        "method": "tesseract_ocr",
                        "status": status,
                        "text": ocr_text,
                        "confidence": round(conf, 2),
                        "charCount": len(ocr_text),
                        "wordCount": ocr_res["word_count"],
                        "error": ocr_res["error"],
                        "durationMs": round((time.time() - page_start) * 1000, 2)
                    })

                except Exception as page_err:
                    results.append({
                        "pageNumber": page_num,
                        "method": "tesseract_ocr",
                        "status": "FAILED",
                        "text": "",
                        "confidence": 0.0,
                        "charCount": 0,
                        "wordCount": 0,
                        "error": str(page_err),
                        "durationMs": round((time.time() - page_start) * 1000, 2)
                    })

        finally:
            if doc:
                doc.close()

        return results

