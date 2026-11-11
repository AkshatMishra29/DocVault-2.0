import os
import psutil
import pymupdf
import cv2
import pytesseract
from fastapi import APIRouter
from app.config import TESSERACT_CMD, TESSDATA_PREFIX
from app.schemas.extraction import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
@router.get("/api/health", response_model=HealthResponse)
def get_health_status():
    mem = psutil.virtual_memory()

    # Query Tesseract installation details
    tess_available = os.path.isfile(TESSERACT_CMD)
    tess_version = "unknown"
    languages = []
    if tess_available:
        try:
            tess_version = pytesseract.get_tesseract_version().version
            languages = pytesseract.get_languages(config=f'--tessdata-dir "{TESSDATA_PREFIX}"' if os.path.isdir(TESSDATA_PREFIX) else "")
        except Exception:
            pass

    return HealthResponse(
        status="ok",
        service="DocVault CPU Extraction Engine",
        version="2.0.0",
        cpuCores=psutil.cpu_count(logical=True) or 1,
        memoryUsedMb=round((mem.total - mem.available) / (1024 * 1024), 2),
        memoryTotalMb=round(mem.total / (1024 * 1024), 2),
        tesseract={
            "installed": tess_available,
            "binaryPath": TESSERACT_CMD,
            "version": tess_version,
            "languages": languages
        },
        pymupdfVersion=pymupdf.__version__,
        opencvVersion=cv2.__version__
    )

