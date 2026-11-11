import io
import sys
from pathlib import Path
_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

import numpy as np
import cv2
import pymupdf
from fastapi.testclient import TestClient

from main import app
from app.services.privacy_gate import validate_verhoeff, evaluate_privacy_gate
from app.services.metadata_extractor import normalize_to_iso_date, MetadataExtractor
from app.services.image_preprocessor import ImagePreprocessor
from app.services.document_router import DocumentExtractionEngine
from app.services.quality_validator import QualityValidator

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "DocVault CPU Extraction Engine"
    assert data["cpuCores"] > 0
    assert "pymupdfVersion" in data
    assert "opencvVersion" in data
    assert data["tesseract"]["installed"] is True


def test_verhoeff_and_privacy_gate():
    # Valid Aadhaar 12-digit numbers satisfy Verhoeff
    valid_aadhaar = "999941057058"  # Verified authentic Verhoeff checksum
    assert validate_verhoeff(valid_aadhaar) is True
    assert validate_verhoeff("123456789012") is False

    # Storage-Only user choice
    res = evaluate_privacy_gate(filename="test.pdf", user_consent="STORAGE_ONLY")
    assert res["state"] == "STORAGE_ONLY"
    assert res["is_restricted"] is True

    # High-risk Aadhaar filename
    res_fn = evaluate_privacy_gate(filename="my_aadhaar_card.pdf", user_consent="PROCESSABLE")
    assert res_fn["state"] == "STORAGE_ONLY"


def test_universal_date_normalizer():
    # Ordinals and phrasing
    assert normalize_to_iso_date("14th day of September 2022") == "2022-09-14"
    assert normalize_to_iso_date("14th September, 2022") == "2022-09-14"
    assert normalize_to_iso_date("September 14, 2022") == "2022-09-14"
    assert normalize_to_iso_date("2023-05-12") == "2023-05-12"
    assert normalize_to_iso_date("12/05/2023") == "2023-05-12"
    # Year outside valid range should be rejected
    assert normalize_to_iso_date("12/05/1890") is None
    assert normalize_to_iso_date("12/05/2150") is None


def test_digital_pdf_extraction():
    # Create an in-memory digital PDF with PyMuPDF
    doc = pymupdf.open()
    page = doc.new_page()
    sample_text = (
        "Certificate of Achievement\n"
        "This is to certify that Rahul Sharma has successfully completed the course on Machine Learning.\n"
        "Certificate Number: CERT-ML-2022-9981\n"
        "Issued on this 14th day of September 2022.\n"
        "Valid through: 2025-09-14"
    )
    page.insert_text((50, 72), sample_text, fontsize=12)
    pdf_bytes = doc.tobytes()
    doc.close()

    result = DocumentExtractionEngine.process_document(
        file_bytes=pdf_bytes,
        filename="Machine_Learning_Certificate.pdf",
        user_consent="PROCESSABLE"
    )

    assert result.success is True
    assert result.documentStatus in ["COMPLETED", "PARTIALLY_PROCESSED"]
    assert result.category == "Certificates"
    assert result.documentDate == "2022-09-14"
    assert result.expiryDate == "2025-09-14"
    assert len(result.pages) == 1
    assert result.pages[0].method == "digital_text"
    assert result.pages[0].status == "TEXT_EXTRACTED"
    assert "Rahul Sharma" in result.fullText
    assert result.keyDetails.get("Certificate Number") == "CERT-ML-2022-9981"
    assert result.keyDetails.get("Recipient Name") == "Rahul Sharma"


def test_mixed_pdf_extraction():
    # Create a 2-page PDF: Page 1 Digital, Page 2 Scanned (Rendered image with text)
    doc = pymupdf.open()

    # Page 1: Digital text
    page1 = doc.new_page()
    page1.insert_text((50, 72), "Invoice #INV-2024-8841\nDate: 2024-03-10\nTotal Amount: $1,250.00\nBill to: Acme Corp", fontsize=12)

    # Page 2: Scanned image page (we create an image with text using cv2 and insert it as an image)
    img = np.ones((600, 800, 3), dtype=np.uint8) * 255
    cv2.putText(img, "Warranty Terms Page Two", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)
    cv2.putText(img, "Policy Number: POL-9921-X", (50, 200), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)
    is_success, buffer = cv2.imencode(".png", img)
    img_bytes = buffer.tobytes()

    page2 = doc.new_page()
    page2.insert_image(page2.rect, stream=img_bytes)

    pdf_bytes = doc.tobytes()
    doc.close()

    result = DocumentExtractionEngine.process_document(
        file_bytes=pdf_bytes,
        filename="invoice_with_warranty.pdf",
        user_consent="PROCESSABLE"
    )

    assert result.success is True
    assert len(result.pages) == 2
    # Page 1 must be digital_text
    assert result.pages[0].method == "digital_text"
    assert result.pages[0].status == "TEXT_EXTRACTED"
    assert "INV-2024-8841" in result.pages[0].text

    # Page 2 must be routed to tesseract_ocr
    assert result.pages[1].method == "tesseract_ocr"
    assert result.pages[1].status in ["OCR_EXTRACTED", "LOW_CONFIDENCE"]


def test_api_extract_endpoint():
    # Test POST /api/extract with multipart upload
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 72), "Medical Lab Report\nDoctor: Dr. Smith\nDate: 2024-01-15\nDiagnosis: Normal", fontsize=12)
    pdf_bytes = doc.tobytes()
    doc.close()

    response = client.post(
        "/api/extract",
        files={"file": ("lab_report.pdf", pdf_bytes, "application/pdf")},
        data={"userConsent": "PROCESSABLE"}
    )

    assert response.status_code == 200
    res_json = response.json()
    assert res_json["success"] is True
    assert res_json["documentStatus"] == "COMPLETED"
    assert res_json["category"] == "Medical"
    assert res_json["documentDate"] == "2024-01-15"


def test_standalone_image_extraction():
    # Create an image document with cv2 and test OCR extraction
    img = np.ones((400, 600, 3), dtype=np.uint8) * 255
    cv2.putText(img, "INVOICE #9942", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)
    cv2.putText(img, "Date: 2023-11-20", (50, 160), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)
    cv2.putText(img, "Total: $350.00", (50, 220), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 2)
    is_success, buffer = cv2.imencode(".png", img)
    img_bytes = buffer.tobytes()

    response = client.post(
        "/api/extract",
        files={"file": ("invoice_scan.png", img_bytes, "image/png")},
        data={"userConsent": "PROCESSABLE"}
    )
    assert response.status_code == 200
    res_json = response.json()
    assert res_json["success"] is True
    assert res_json["fileType"] == "image/png"
    assert len(res_json["pages"]) == 1
    assert res_json["pages"][0]["method"] == "tesseract_ocr"
    assert res_json["documentDate"] == "2023-11-20"

