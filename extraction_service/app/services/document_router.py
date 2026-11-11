import time
from typing import Dict, Any, List
from app.utils.file_validation import validate_file_buffer
from app.services.privacy_gate import evaluate_privacy_gate
from app.services.pdf_extractor import PDFExtractor
from app.services.image_extractor import ImageExtractor
from app.services.quality_validator import QualityValidator
from app.services.metadata_extractor import MetadataExtractor
from app.schemas.extraction import DocumentExtractionResponse, ExtractedEntity, PageExtractionResult, QualityValidationReport


class DocumentExtractionEngine:
    """
    Central orchestrator for DocVault CPU-Optimized Document Extraction Engine.
    Implements all Stages 1 through 6.
    """

    @classmethod
    def process_document(
        cls,
        file_bytes: bytes,
        filename: str = "document",
        user_consent: str = "PROCESSABLE"
    ) -> DocumentExtractionResponse:
        overall_start = time.time()

        # STAGE 1: Secure Upload Validation
        mime_type, safe_name = validate_file_buffer(file_bytes, filename)

        # STAGE 2: Privacy and Processing Eligibility Gate (Initial check)
        gate_result = evaluate_privacy_gate(filename=safe_name, user_consent=user_consent)

        if gate_result["state"] == "STORAGE_ONLY":
            duration_ms = (time.time() - overall_start) * 1000
            return DocumentExtractionResponse(
                success=True,
                documentStatus="STORAGE_ONLY",
                privacyState="STORAGE_ONLY",
                fileType=mime_type,
                totalPages=1,
                processedPages=0,
                failedPages=0,
                fullText="[REDACTED - STORAGE ONLY DOCUMENT]",
                summary=f"Cryptographically isolated Storage-Only document ({gate_result['reason']}). Zero OCR/AI permitted.",
                category="Identity" if "Aadhaar" in gate_result["reason"] else "Other",
                documentDate=None,
                expiryDate=None,
                keyDetails={"Privacy Policy": "Storage-Only Isolated"},
                entities=[],
                pages=[
                    PageExtractionResult(
                        pageNumber=1,
                        method="skipped_by_privacy",
                        status="SKIPPED_BY_PRIVACY_POLICY",
                        text="[REDACTED]",
                        confidence=1.0,
                        charCount=0,
                        wordCount=0,
                        error=gate_result["reason"],
                        durationMs=0.0
                    )
                ],
                quality=QualityValidationReport(
                    overallScore=1.0,
                    isAcceptable=True,
                    emptyPages=[],
                    failedPages=[],
                    lowConfidencePages=[],
                    warnings=[gate_result["reason"]]
                ),
                processingTimeMs=round(duration_ms, 2),
                error=None
            )

        # STAGE 3: Intelligent Page-Level Routing & Extraction
        pages_raw: List[Dict[str, Any]] = []

        if mime_type == "application/pdf":
            pages_raw = PDFExtractor.process_pdf(file_bytes)
        else:
            # Standalone image (JPEG, PNG, WEBP)
            img_result = ImageExtractor.process_image(file_bytes)
            pages_raw = [img_result]

        # Combine text in page order
        full_text_pieces = []
        for p in pages_raw:
            p_text = p.get("text", "").strip()
            if p_text:
                full_text_pieces.append(f"--- Page {p['pageNumber']} ---\n{p_text}")

        combined_text = "\n\n".join(full_text_pieces)

        # STAGE 2 (Post-Extraction Privacy Gate): Inspect extracted content for PII
        post_gate = evaluate_privacy_gate(filename=safe_name, user_consent=user_consent, text=combined_text)
        if post_gate["state"] == "STORAGE_ONLY":
            duration_ms = (time.time() - overall_start) * 1000
            return DocumentExtractionResponse(
                success=True,
                documentStatus="STORAGE_ONLY",
                privacyState="STORAGE_ONLY",
                fileType=mime_type,
                totalPages=len(pages_raw),
                processedPages=0,
                failedPages=0,
                fullText="[REDACTED - STORAGE ONLY SENSITIVE CONTENT DETECTED]",
                summary=f"Pivoted to Storage-Only: {post_gate['reason']}.",
                category="Identity",
                documentDate=None,
                expiryDate=None,
                keyDetails={"Privacy Policy": "Pivoted to Storage-Only due to PII Detection"},
                entities=[],
                pages=[
                    PageExtractionResult(
                        pageNumber=p["pageNumber"],
                        method="skipped_by_privacy",
                        status="SKIPPED_BY_PRIVACY_POLICY",
                        text="[REDACTED]",
                        confidence=1.0,
                        charCount=0,
                        wordCount=0,
                        error=post_gate["reason"],
                        durationMs=p.get("durationMs", 0.0)
                    )
                    for p in pages_raw
                ],
                quality=QualityValidationReport(
                    overallScore=1.0,
                    isAcceptable=True,
                    emptyPages=[],
                    failedPages=[],
                    lowConfidencePages=[],
                    warnings=[post_gate["reason"]]
                ),
                processingTimeMs=round(duration_ms, 2),
                error=None
            )

        # STAGE 5: Extraction Quality Validation
        quality_dict, doc_status = QualityValidator.evaluate_quality(pages_raw)

        # STAGE 6: Structured Metadata Extraction
        metadata = MetadataExtractor.extract_metadata(combined_text, safe_name)

        # Convert page dicts to Pydantic objects
        pages_schema = [
            PageExtractionResult(
                pageNumber=p["pageNumber"],
                method=p["method"],
                status=p["status"],
                text=p["text"],
                confidence=p["confidence"],
                charCount=p["charCount"],
                wordCount=p["wordCount"],
                error=p.get("error"),
                durationMs=p.get("durationMs", 0.0)
            )
            for p in pages_raw
        ]

        entities_schema = [
            ExtractedEntity(
                fieldName=e["fieldName"],
                value=e["value"],
                evidence=e.get("evidence"),
                confidence=e.get("confidence", 0.8),
                extractionMethod=e.get("extractionMethod", "rules"),
                verificationStatus="accepted"
            )
            for e in metadata.get("entities", [])
        ]

        # Generate concise summary
        total_chars = len(combined_text)
        summary = (
            f"{metadata['category']} document ({len(pages_raw)} page{'s' if len(pages_raw) > 1 else ''}, {total_chars} chars extracted). "
            f"Extraction status: {doc_status}."
        )

        duration_ms = (time.time() - overall_start) * 1000

        return DocumentExtractionResponse(
            success=(doc_status in ["COMPLETED", "PARTIALLY_PROCESSED", "NEEDS_REVIEW"]),
            documentStatus=doc_status,
            privacyState="LOCAL_TEXT_EXTRACTION_ALLOWED",
            fileType=mime_type,
            totalPages=len(pages_raw),
            processedPages=len(pages_raw) - len(quality_dict["failedPages"]) - len(quality_dict["emptyPages"]),
            failedPages=len(quality_dict["failedPages"]),
            fullText=combined_text,
            summary=summary,
            category=metadata["category"],
            documentDate=metadata.get("documentDate"),
            expiryDate=metadata.get("expiryDate"),
            keyDetails=metadata.get("keyDetails", {}),
            entities=entities_schema,
            pages=pages_schema,
            quality=QualityValidationReport(**quality_dict),
            processingTimeMs=round(duration_ms, 2),
            error=None if doc_status != "FAILED" else "Document extraction failed across all pages."
        )

