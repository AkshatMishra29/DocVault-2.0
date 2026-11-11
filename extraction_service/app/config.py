import os
import shutil
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent

# Server Config
HOST = os.getenv("EXTRACTION_SERVICE_HOST", "0.0.0.0")
PORT = int(os.getenv("EXTRACTION_SERVICE_PORT", "8000"))

# Tesseract Configuration
# Priority: ENV > which tesseract > common system paths
def resolve_tesseract_cmd() -> str:
    env_cmd = os.getenv("TESSERACT_CMD")
    if env_cmd and os.path.isfile(env_cmd):
        return env_cmd
    which_cmd = shutil.which("tesseract")
    if which_cmd:
        return which_cmd
    candidates = [
        "/opt/homebrew/bin/tesseract",
        "/usr/local/bin/tesseract",
        "/usr/bin/tesseract"
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    return "tesseract"

TESSERACT_CMD = resolve_tesseract_cmd()
TESSDATA_PREFIX = os.getenv("TESSDATA_PREFIX", "/opt/homebrew/share/tessdata/")

# Limits & Quotas (CPU-Optimized)
MAX_FILE_SIZE_BYTES = int(os.getenv("MAX_FILE_SIZE_BYTES", str(25 * 1024 * 1024))) # 25 MB
MAX_PAGES = int(os.getenv("MAX_PAGES", "25"))
DEFAULT_OCR_DPI = int(os.getenv("DEFAULT_OCR_DPI", "300"))
PAGE_TIMEOUT_SECONDS = int(os.getenv("PAGE_TIMEOUT_SECONDS", "15"))

# Quality Thresholds
MIN_TEXT_CHARS_FOR_DIGITAL = 50
MIN_WORD_CONFIDENCE = 50.0  # Tesseract scale 0-100
MAX_IMAGE_DIMENSION = 4000  # Cap image dimension to prevent memory explosion

# Allowed MIME Types & Signatures
SUPPORTED_MIME_TYPES = {
    "application/pdf": [b"%PDF-"],
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png": [b"\x89PNG\r\n\x1a\n"],
    "image/webp": [b"RIFF"]  # RIFF....WEBP
}

