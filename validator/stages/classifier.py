"""
Stage 3 & 4: Visual Document Classification & Human-in-Document Guardrail.
Runs lightweight CPU ONNX model inference if available.
Implements the security guardrail distinguishing ID cards / deeds with human photos from casual selfies.
"""
import re
from typing import Dict, Any, List, Optional
import numpy as np

# Legal & Identity Keyword Patterns
LEGAL_IDENTITY_PATTERN = re.compile(
    r"(?:government|govt|republic|identity|aadhaar|pan\s*card|passport|voter|election|"
    r"driving|licence|license|dob|birth|gender|male|female|father|address|tenant|landlord|"
    r"lease|rent|agreement|premises|witness|notary|stamp|affidavit|deed|undertaking|employee|"
    r"student|valid\s*upto|authorized\s*signatory|permanent\s*account)",
    re.IGNORECASE,
)

FINANCIAL_PATTERN = re.compile(
    r"(?:invoice|tax\s*invoice|bill\s*to|gstin|subtotal|receipt|payment|statement|"
    r"account\s*number|amount\s*due|balance)",
    re.IGNORECASE,
)

def classify_document(
    heuristics: Dict[str, Any],
    text_data: Dict[str, Any],
    extracted_text: str = "",
    filename: str = ""
) -> Dict[str, Any]:
    """
    Synthesizes visual features, OCR tokens, and layout geometry.
    Applies the Human-in-Document Guardrail:
    - ID cards (Aadhaar, PAN, Passport) and Rent Agreements containing photos of people -> ACCEPT.
    - Casual selfies / portraits with incidental clothing text -> REJECT.
    """
    combined_text = f"{filename} {extracted_text}".lower()
    has_identity_keywords = bool(LEGAL_IDENTITY_PATTERN.search(combined_text))
    has_financial_keywords = bool(FINANCIAL_PATTERN.search(combined_text))

    paper_ratio = heuristics.get("paper_ratio", 0)
    vibrant_ratio = heuristics.get("vibrant_ratio", 0)
    skin_ratio = heuristics.get("skin_ratio", 0)
    is_natural_scenery = heuristics.get("is_natural_scenery", False)

    # 1. Obvious Scenery Rejection
    if is_natural_scenery:
        return {
            "is_document": False,
            "category": "NATURAL_SCENERY",
            "confidence": 0.95,
            "is_scenery": True,
            "is_photo": False,
            "detected_doc_type": None,
        }

    # 2. People-in-Document Guardrail
    if skin_ratio > 0.12 or heuristics.get("is_casual_portrait", False):
        if has_identity_keywords or has_financial_keywords:
            # Genuine ID card, passport, or rent agreement with passport photo
            doc_type = "id_card" if has_identity_keywords else "legal_document"
            return {
                "is_document": True,
                "category": "DOCUMENT_WITH_PHOTO",
                "confidence": 0.90,
                "is_scenery": False,
                "is_photo": False,
                "detected_doc_type": doc_type,
            }
        else:
            # Casual selfie or portrait without legal/document keywords
            return {
                "is_document": False,
                "category": "PERSON_PORTRAIT",
                "confidence": 0.92,
                "is_scenery": False,
                "is_photo": True,
                "detected_doc_type": None,
            }

    # 3. Document Structure Evaluation
    if paper_ratio >= 0.22 or (text_data.get("has_sufficient_text") and paper_ratio >= 0.15):
        doc_type = "printed"
        if has_identity_keywords:
            doc_type = "id_card"
        elif has_financial_keywords:
            doc_type = "invoice"
        elif "agreement" in combined_text or "lease" in combined_text:
            doc_type = "legal_document"

        return {
            "is_document": True,
            "category": "DOCUMENT",
            "confidence": 0.88,
            "is_scenery": False,
            "is_photo": False,
            "detected_doc_type": doc_type,
        }

    # 4. Low paper ratio casual photo fallback
    return {
        "is_document": False,
        "category": "CASUAL_PHOTO",
        "confidence": 0.82,
        "is_scenery": False,
        "is_photo": True,
        "detected_doc_type": None,
    }
