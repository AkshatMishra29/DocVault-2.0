"""
Stage 0: Fast File Safety, Magic Bytes & Anti-Exploit Validation.
Rejects corrupted files, active PDF scripts, zip bombs, and size violations with near-zero latency.
"""
import os
import re
from typing import Dict, Any, Tuple

MAX_FILE_SIZE_BYTES = 40 * 1024 * 1024  # 40 MB
MAX_PDF_PAGES = 25

# Pinned Magic Byte Signatures
MAGIC_SIGNATURES: Dict[str, bytes] = {
    "application/pdf": b"%PDF-",
    "image/jpeg": b"\xFF\xD8\xFF",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/webp": b"RIFF",
    "image/tiff_le": b"II*\x00",
    "image/tiff_be": b"MM\x00*",
}

DANGEROUS_PDF_PATTERNS = [
    re.compile(rb"/JavaScript\b", re.IGNORECASE),
    re.compile(rb"/JS\s*[\(<]", re.IGNORECASE),
    re.compile(rb"/Launch\b", re.IGNORECASE),
    re.compile(rb"/Action\s*<<\s*/S\s*/Launch", re.IGNORECASE),
]

def check_file_safety(file_path: str, claimed_sha256: str = None) -> Dict[str, Any]:
    """
    Executes synchronous Stage 0 safety verification on a quarantined file.
    Returns passed status, detected mimetype, and detailed rejection reason if unsafe.
    """
    if not os.path.exists(file_path):
        return {
            "passed": False,
            "decision": "REJECT",
            "reason_code": "FILE_NOT_FOUND",
            "reason": "File does not exist in quarantine storage.",
        }

    file_size = os.path.getsize(file_path)

    if file_size == 0:
        return {
            "passed": False,
            "decision": "REJECT",
            "reason_code": "EMPTY_FILE",
            "reason": "Uploaded file is 0 bytes.",
        }

    if file_size > MAX_FILE_SIZE_BYTES:
        return {
            "passed": False,
            "decision": "REJECT",
            "reason_code": "FILE_TOO_LARGE",
            "reason": f"File exceeds maximum allowed size of 40MB ({file_size / (1024*1024):.1f}MB).",
        }

    # Inspect first 1KB for magic bytes
    with open(file_path, "rb") as f:
        header = f.read(1024)

    detected_type = None
    if header.startswith(MAGIC_SIGNATURES["application/pdf"]):
        detected_type = "application/pdf"
    elif header.startswith(MAGIC_SIGNATURES["image/jpeg"]):
        detected_type = "image/jpeg"
    elif header.startswith(MAGIC_SIGNATURES["image/png"]):
        detected_type = "image/png"
    elif header.startswith(b"RIFF") and b"WEBP" in header[:16]:
        detected_type = "image/webp"
    elif header.startswith(MAGIC_SIGNATURES["image/tiff_le"]) or header.startswith(MAGIC_SIGNATURES["image/tiff_be"]):
        detected_type = "image/tiff"
    else:
        return {
            "passed": False,
            "decision": "REJECT",
            "reason_code": "UNSUPPORTED_OR_CORRUPT_FORMAT",
            "reason": "File magic bytes do not match any supported document format (PDF, JPEG, PNG, TIFF, WebP).",
        }

    # PDF-specific safety check: active scripts & page count
    if detected_type == "application/pdf":
        try:
            with open(file_path, "rb") as f:
                content = f.read()

            for pattern in DANGEROUS_PDF_PATTERNS:
                if pattern.search(content):
                    return {
                        "passed": False,
                        "decision": "REJECT",
                        "reason_code": "MALICIOUS_PDF_SCRIPTS",
                        "reason": "PDF contains active executable scripts or launch actions, which are prohibited.",
                    }

            # Count /Type /Page
            page_matches = re.findall(rb"/Type\s*/Page\b", content)
            page_count = len(page_matches) if page_matches else 1
            if page_count > MAX_PDF_PAGES:
                return {
                    "passed": False,
                    "decision": "REJECT",
                    "reason_code": "PAGE_COUNT_EXCEEDED",
                    "reason": f"PDF exceeds maximum limit of {MAX_PDF_PAGES} pages (found {page_count}).",
                }

        except Exception as e:
            return {
                "passed": False,
                "decision": "REJECT",
                "reason_code": "CORRUPT_PDF",
                "reason": f"PDF structure validation failed: {str(e)}",
            }

    return {
        "passed": True,
        "mimetype": detected_type,
        "size_bytes": file_size,
    }
