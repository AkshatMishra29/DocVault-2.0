import os
import re
from typing import Tuple
from app.config import MAX_FILE_SIZE_BYTES, SUPPORTED_MIME_TYPES


class FileValidationError(Exception):
    pass


def validate_file_buffer(buffer: bytes, client_filename: str = "") -> Tuple[str, str]:
    """
    Validates file size, magic bytes signature, and detects malformed files.
    Returns (detected_mime, safe_filename).
    """
    if not buffer or len(buffer) == 0:
        raise FileValidationError("Uploaded file is empty (0 bytes).")

    if len(buffer) > MAX_FILE_SIZE_BYTES:
        max_mb = MAX_FILE_SIZE_BYTES / (1024 * 1024)
        raise FileValidationError(f"File size exceeds maximum allowable limit of {max_mb:.0f} MB.")

    # Magic bytes check
    detected_mime = None
    for mime, signatures in SUPPORTED_MIME_TYPES.items():
        for sig in signatures:
            if buffer.startswith(sig):
                # Extra check for WEBP: RIFF + 4 bytes + WEBP
                if sig == b"RIFF":
                    if len(buffer) >= 12 and buffer[8:12] == b"WEBP":
                        detected_mime = mime
                        break
                else:
                    detected_mime = mime
                    break
        if detected_mime:
            break

    if not detected_mime:
        raise FileValidationError(
            "Unsupported or corrupted file format. Supported formats: PDF, JPEG, PNG, WEBP."
        )

    # Sanitize client filename against path traversal
    safe_name = os.path.basename(client_filename or "document")
    safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', safe_name)
    if not safe_name:
        safe_name = "document"

    return detected_mime, safe_name

