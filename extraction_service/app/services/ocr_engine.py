import os
import time
import numpy as np
import pytesseract
from typing import Dict, Any, Tuple
from app.config import TESSERACT_CMD, TESSDATA_PREFIX, MIN_WORD_CONFIDENCE

# Point pytesseract to resolved binary
if os.path.isfile(TESSERACT_CMD):
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD


class OCREngine:
    """
    Native C++ Tesseract OCR runner with confidence scoring and adaptive retry.
    """

    @staticmethod
    def run_ocr(
        image: np.ndarray,
        psm: int = 3,
        lang: str = "eng"
    ) -> Dict[str, Any]:
        """
        Executes Tesseract OCR on a numpy image array.
        Returns extracted text, mean confidence, word count, and duration.
        """
        start_time = time.time()
        config = f"--psm {psm}"
        if os.path.isdir(TESSDATA_PREFIX):
            config += f' --tessdata-dir "{TESSDATA_PREFIX}"'

        try:
            # First extract detailed word data for accurate confidence scoring
            data = pytesseract.image_to_data(
                image,
                lang=lang,
                config=config,
                output_type=pytesseract.Output.DICT
            )

            words = []
            confidences = []

            for i in range(len(data.get("text", []))):
                text_piece = data["text"][i].strip()
                conf = float(data["conf"][i])

                if text_piece and conf > 0:
                    words.append(text_piece)
                    confidences.append(conf)

            # Extract full text layer preserving layout
            full_text = pytesseract.image_to_string(image, lang=lang, config=config).strip()
            
            mean_conf = float(np.mean(confidences)) if confidences else 0.0
            duration_ms = (time.time() - start_time) * 1000

            return {
                "success": True,
                "text": full_text,
                "mean_confidence": round(mean_conf, 2),
                "word_count": len(words),
                "char_count": len(full_text),
                "duration_ms": round(duration_ms, 2),
                "error": None
            }

        except Exception as e:
            return {
                "success": False,
                "text": "",
                "mean_confidence": 0.0,
                "word_count": 0,
                "char_count": 0,
                "duration_ms": round((time.time() - start_time) * 1000, 2),
                "error": str(e)
            }

    @classmethod
    def ocr_with_fallback(
        cls,
        enhanced_gray: np.ndarray,
        binarized: np.ndarray,
        lang: str = "eng"
    ) -> Dict[str, Any]:
        """
        Attempts OCR on enhanced grayscale. If confidence is below threshold (< 50%)
        or char count is minimal, retries with the binarized image.
        """
        # Primary Pass: Grayscale + CLAHE + Deskew
        result = cls.run_ocr(enhanced_gray, psm=3, lang=lang)

        # Evaluate if fallback binarization is warranted
        needs_retry = (
            not result["success"] or
            result["mean_confidence"] < MIN_WORD_CONFIDENCE or
            result["char_count"] < 30
        )

        if needs_retry and binarized is not None:
            retry_result = cls.run_ocr(binarized, psm=6, lang=lang)
            # If binarized produced superior confidence or text yield, adopt it
            if retry_result["success"] and (
                retry_result["mean_confidence"] > result["mean_confidence"] or
                retry_result["char_count"] > result["char_count"] + 30
            ):
                return retry_result

        return result

