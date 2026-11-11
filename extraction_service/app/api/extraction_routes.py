from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.services.document_router import DocumentExtractionEngine
from app.schemas.extraction import DocumentExtractionResponse

router = APIRouter(prefix="/api", tags=["Document Extraction"])


@router.post("/extract", response_model=DocumentExtractionResponse)
async def extract_document(
    file: UploadFile = File(..., description="Document file (PDF, JPG, PNG, WEBP)"),
    userConsent: str = Form("PROCESSABLE", description="Consent state: PROCESSABLE or STORAGE_ONLY")
):
    """
    CPU-optimized multi-stage extraction engine.
    Performs secure validation, page-level routing (PyMuPDF vs Tesseract OCR),
    OpenCV preprocessing, quality validation, and deterministic metadata extraction.
    """
    try:
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(status_code=400, detail="Uploaded file is empty (0 bytes).")

        response = DocumentExtractionEngine.process_document(
            file_bytes=file_bytes,
            filename=file.filename or "uploaded_file",
            user_consent=userConsent
        )
        return response

    except HTTPException:
        raise
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"Internal extraction error: {str(err)}")

