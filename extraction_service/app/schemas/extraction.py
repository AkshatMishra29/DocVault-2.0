from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class ExtractedEntity(BaseModel):
    fieldName: str
    value: Any = None
    evidence: Optional[str] = None
    pageNumber: int = 1
    confidence: float = 0.0
    extractionMethod: str = "rules"
    verificationStatus: str = "accepted"
    rejectionReason: Optional[str] = None


class PageExtractionResult(BaseModel):
    pageNumber: int
    method: str = Field(
        ...,
        description="Method used: digital_text, tesseract_ocr, skipped_by_privacy, empty, failed"
    )
    status: str = Field(
        ...,
        description="Status: TEXT_EXTRACTED, OCR_EXTRACTED, LOW_CONFIDENCE, EMPTY_PAGE, FAILED, SKIPPED_BY_PRIVACY_POLICY"
    )
    text: str = ""
    confidence: float = 0.0
    charCount: int = 0
    wordCount: int = 0
    error: Optional[str] = None
    durationMs: float = 0.0


class QualityValidationReport(BaseModel):
    overallScore: float = 0.0
    isAcceptable: bool = True
    emptyPages: List[int] = []
    failedPages: List[int] = []
    lowConfidencePages: List[int] = []
    warnings: List[str] = []


class DocumentExtractionResponse(BaseModel):
    success: bool
    documentStatus: str = Field(
        ...,
        description="COMPLETED, PARTIALLY_PROCESSED, FAILED, STORAGE_ONLY, NEEDS_REVIEW"
    )
    privacyState: str = Field(
        ...,
        description="STORAGE_ONLY, LOCAL_TEXT_EXTRACTION_ALLOWED, LOCAL_OCR_ALLOWED, EMBEDDING_ALLOWED, EXTERNAL_AI_ALLOWED"
    )
    fileType: str
    totalPages: int = 0
    processedPages: int = 0
    failedPages: int = 0
    fullText: str = ""
    summary: str = ""
    category: str = "Other"
    documentDate: Optional[str] = None
    expiryDate: Optional[str] = None
    keyDetails: Dict[str, Any] = {}
    entities: List[ExtractedEntity] = []
    pages: List[PageExtractionResult] = []
    quality: QualityValidationReport = Field(default_factory=QualityValidationReport)
    processingTimeMs: float = 0.0
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    service: str = "DocVault CPU Extraction Engine"
    version: str = "2.0.0"
    cpuCores: int
    memoryUsedMb: float
    memoryTotalMb: float
    tesseract: Dict[str, Any]
    pymupdfVersion: str
    opencvVersion: str

