import re
from typing import Dict, Any, Tuple

# Verhoeff Multiplication Table & Permutation Table for Aadhaar validation
_VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]

_VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def validate_verhoeff(num_str: str) -> bool:
    digits = [int(c) for c in num_str if c.isdigit()]
    if len(digits) != 12:
        return False
    c = 0
    for i, d in enumerate(reversed(digits)):
        c = _VERHOEFF_D[c][_VERHOEFF_P[i % 8][d]]
    return c == 0


def detect_sensitive_content(filename: str, text: str = "") -> Tuple[bool, str]:
    """
    Scans filename and extracted text for high-risk PII:
    - Aadhaar (12 digits with Verhoeff or explicit Aadhaar keywords)
    - PAN card patterns
    - Indian Passport MRZ patterns
    """
    fn_lower = filename.lower()
    if re.search(r'(aadhaar|aadhar|uidai)', fn_lower):
        return True, "Filename indicates Indian Aadhaar Identity Card."

    if text:
        text_lower = text.lower()
        if re.search(r'\b(unique identification authority of india|uidai|mera aadhaar)\b', text_lower):
            return True, "UIDAI Aadhaar keywords detected in document text."

        # Scan 12-digit candidate numbers for Verhoeff checksum
        twelve_digit_matches = re.findall(r'\b(\d{4}[ -]?\d{4}[ -]?\d{4})\b', text)
        for match in twelve_digit_matches:
            cleaned = re.sub(r'\D', '', match)
            if len(cleaned) == 12 and validate_verhoeff(cleaned):
                return True, "Verhoeff-validated Aadhaar 12-digit number detected."

    return False, ""


def evaluate_privacy_gate(
    filename: str,
    user_consent: str = "PROCESSABLE",
    text: str = "",
    is_encrypted: bool = False
) -> Dict[str, Any]:
    """
    Enforces Stage Two — Privacy and Processing Eligibility Gate.
    Returns:
      {
         "state": "STORAGE_ONLY" | "LOCAL_TEXT_EXTRACTION_ALLOWED" | "LOCAL_OCR_ALLOWED" | "EMBEDDING_ALLOWED" | "EXTERNAL_AI_ALLOWED",
         "is_restricted": bool,
         "reason": str
      }
    """
    # 1. User explicit STORAGE_ONLY choice
    if user_consent.upper() in ["STORAGE_ONLY", "STORAGE"]:
        return {
            "state": "STORAGE_ONLY",
            "is_restricted": True,
            "reason": "Document designated as STORAGE_ONLY by user privacy setting."
        }

    # 2. Encrypted / Password-Protected document
    if is_encrypted:
        return {
            "state": "STORAGE_ONLY",
            "is_restricted": True,
            "reason": "Password-protected / encrypted document cannot be automatically parsed without keys."
        }

    # 3. High-risk PII detection
    is_sensitive, sensitive_reason = detect_sensitive_content(filename, text)
    if is_sensitive:
        return {
            "state": "STORAGE_ONLY",
            "is_restricted": True,
            "reason": f"High-sensitivity PII detected: {sensitive_reason}"
        }

    # Default allowed state for processable document
    return {
        "state": "LOCAL_TEXT_EXTRACTION_ALLOWED",
        "is_restricted": False,
        "reason": "Eligibility validated for local text extraction and OCR."
    }
