import time
import numpy as np
import cv2
from typing import Dict, Any
from app.services.image_preprocessor import ImagePreprocessor
from app.services.ocr_engine import OCREngine
from app.config import MIN_WORD_CONFIDENCE


class ImageExtractor:
    """
    Extractor for standalone image documents (JPG, JPEG, PNG, WEBP).
    """

    @classmethod
    def is_blank_image(cls, image_bytes: bytes) -> bool:
        """
        Detects if an image is completely or nearly blank by analyzing pixel variance.
        """
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
            if img is None:
                return True
            # If standard deviation is very low (< 3.0), image is flat/blank
            std_dev = float(np.std(img))
            return std_dev < 3.0
        except Exception:
            return False

    @classmethod
    def process_image(cls, image_bytes: bytes) -> Dict[str, Any]:
        start_time = time.time()

        if cls.is_blank_image(image_bytes):
            return {
                "pageNumber": 1,
                "method": "tesseract_ocr",
                "status": "EMPTY_PAGE",
                "text": "",
                "confidence": 0.0,
                "charCount": 0,
                "wordCount": 0,
                "error": "Image is blank or devoid of visible contrast.",
                "durationMs": round((time.time() - start_time) * 1000, 2)
            }

        try:
            enhanced_gray, binarized = ImagePreprocessor.preprocess_image_buffer(image_bytes)
            ocr_res = OCREngine.ocr_with_fallback(enhanced_gray, binarized)

            ocr_text = ocr_res["text"].strip()
            conf = ocr_res["mean_confidence"] / 100.0

            if not ocr_text:
                status = "EMPTY_PAGE"
            elif ocr_res["mean_confidence"] < MIN_WORD_CONFIDENCE:
                status = "LOW_CONFIDENCE"
            else:
                status = "OCR_EXTRACTED"

            return {
                "pageNumber": 1,
                "method": "tesseract_ocr",
                "status": status,
                "text": ocr_text,
                "confidence": round(conf, 2),
                "charCount": len(ocr_text),
                "wordCount": ocr_res["word_count"],
                "error": ocr_res["error"],
                "durationMs": round((time.time() - start_time) * 1000, 2)
            }

        except Exception as err:
            return {
                "pageNumber": 1,
                "method": "tesseract_ocr",
                "status": "FAILED",
                "text": "",
                "confidence": 0.0,
                "charCount": 0,
                "wordCount": 0,
                "error": str(err),
                "durationMs": round((time.time() - start_time) * 1000, 2)
            }

