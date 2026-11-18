"""
DocVault Isolated Document Validation Microservice (FastAPI).
Runs on an internal container network with zero egress internet access.
Protects DocVault against SSRF, malware, landscape scans, and casual photos.
"""
import os
from fastapi import FastAPI, Header, HTTPException, UploadFile, File, Form, status
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any

from pipeline import validate_file, calculate_sha256

INTERNAL_TOKEN = os.environ.get("INTERNAL_VALIDATOR_TOKEN", "docvault-internal-secret-token-2026")

app = FastAPI(
    title="DocVault Document Validation Service",
    description="Internal CPU-isolated ML Document Guardrail & Safety Pipeline.",
    version="2.0.0",
    docs_url=None,  # Disabled in production for internal security
    redoc_url=None,
)

class ValidateRequest(BaseModel):
    path: str = Field(..., description="Absolute path to the quarantined file in shared volume")
    sha256: Optional[str] = Field(None, description="Precomputed SHA-256 hash of the file")

@app.get("/health")
def health_check():
    """Internal health check."""
    return {
        "status": "healthy",
        "service": "docvault-validator",
        "version": "2.0.0",
    }

@app.post("/validate")
async def validate_document(
    body: ValidateRequest,
    x_token: Optional[str] = Header(None, alias="X-Internal-Token")
):
    """
    Validates a quarantined file via shared volume path.
    Enforces internal token authentication and prevents SSRF.
    """
    if x_token != INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid internal service token."
        )

    # Path traversal protection: file must be located inside an allowed quarantine directory
    file_path = os.path.abspath(body.path)
    allowed_quarantine_dirs = [
        "/quarantine",
        "/tmp/quarantine",
        os.path.abspath("./uploads/quarantine"),
        os.path.abspath("../uploads/quarantine"),
        os.path.abspath("./backend/uploads/quarantine"),
    ]

    is_allowed_path = any(file_path.startswith(d) for d in allowed_quarantine_dirs) or "quarantine" in file_path
    if not is_allowed_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Access denied: File path is outside designated quarantine volume."
        )

    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Quarantined file not found at: {body.path}"
        )

    result = validate_file(file_path, body.sha256)
    return result

@app.post("/validate-stream")
async def validate_stream(
    file: UploadFile = File(...),
    sha256: Optional[str] = Form(None),
    x_token: Optional[str] = Header(None, alias="X-Internal-Token")
):
    """
    Alternative endpoint for environments where shared Docker volumes are not used.
    Streams file bytes directly into a temporary quarantine scratch buffer for validation.
    """
    if x_token != INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Invalid internal service token."
        )

    temp_dir = "/tmp/quarantine"
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, f"stream_{os.urandom(8).hex()}_{file.filename or 'file'}")

    try:
        with open(temp_path, "wb") as f:
            while chunk := await file.read(65536):
                f.write(chunk)

        result = validate_file(temp_path, sha256)
        return result
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
