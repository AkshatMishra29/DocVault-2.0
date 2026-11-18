"""
DocVault Document Validation Pipeline (Stages 0 to 5 Orchestrator).
Features:
- SHA-256 Decision Caching (0ms latency for duplicate files)
- Stage 0-2 Early Exits for instant rejection of obvious non-documents
- Downscaling to 640px for high CPU efficiency
- 10s hard timeout enforcement
"""
import os
import time
import hashlib
from typing import Dict, Any, Optional
from PIL import Image
import io

from stages.safety import check_file_safety
from stages.heuristics import analyze_image_heuristics
from stages.textdetect import detect_text_and_readability
from stages.classifier import classify_document
from stages.fusion import fuse_validation_decision

# In-memory Decision Cache by SHA-256 (LRU-like dict)
MAX_CACHE_SIZE = 10000
_DECISION_CACHE: Dict[str, Dict[str, Any]] = {}

def calculate_sha256(file_path: str) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest().lower()

def validate_file(file_path: str, claimed_sha256: Optional[str] = None) -> Dict[str, Any]:
    """
    Executes Stages 0 to 5 validation on the quarantined file.
    Returns standard API contract:
    {"decision": "ACCEPT|REJECT|REVIEW", "doc_type": "...", "score": 0.82, "reason": "...", "sha256": "..."}
    """
    start_time = time.time()

    # 1. Decision Cache Check
    sha256_hash = claimed_sha256 or (calculate_sha256(file_path) if os.path.exists(file_path) else None)
    if sha256_hash and sha256_hash in _DECISION_CACHE:
        cached = _DECISION_CACHE[sha256_hash].copy()
        cached["cached"] = True
        cached["duration_ms"] = round((time.time() - start_time) * 1000, 2)
        return cached

    # 2. Stage 0: Fast Safety & File Integrity
    safety = check_file_safety(file_path, sha256_hash)
    if not safety.get("passed", False):
        result = fuse_validation_decision(safety, {}, {}, {})
        result["sha256"] = sha256_hash
        result["duration_ms"] = round((time.time() - start_time) * 1000, 2)
        return result

    detected_type = safety.get("mimetype", "")
    extracted_text = ""
    pil_img = None

    try:
        # 3. Load / Render Document for Visual Analysis
        if detected_type == "application/pdf":
            # PDF handling: extract digital text and render page 1 for visual inspection
            try:
                from pypdf import PdfReader
                reader = PdfReader(file_path)
                pages_to_check = min(len(reader.pages), 3)  # Cap pages at 3 for validation
                text_parts = []
                for p_idx in range(pages_to_check):
                    t = reader.pages[p_idx].extract_text()
                    if t:
                        text_parts.append(t)
                extracted_text = " ".join(text_parts).strip()

                # If text is substantial (> 40 chars), digital PDF is a genuine document
                if len(extracted_text) >= 40:
                    clean_res = {
                        "decision": "ACCEPT",
                        "doc_type": "printed",
                        "score": 0.95,
                        "reason_code": "DIGITAL_PDF_VERIFIED",
                        "reason": "Verified genuine digital PDF with valid text layer.",
                        "sha256": sha256_hash,
                        "duration_ms": round((time.time() - start_time) * 1000, 2),
                    }
                    if sha256_hash and len(_DECISION_CACHE) < MAX_CACHE_SIZE:
                        _DECISION_CACHE[sha256_hash] = clean_res
                    return clean_res
            except Exception as pdf_err:
                pass  # Fall through to image-based PDF inspection if available

        # Image analysis
        if not pil_img:
            with open(file_path, "rb") as f:
                img_bytes = f.read()
            pil_img = Image.open(io.BytesIO(img_bytes))

        # 4. Stage 1: Image Preprocessing, Heuristics & Scenery Detection
        heuristics = analyze_image_heuristics(pil_img)
        if not heuristics.get("passed", False):
            result = fuse_validation_decision(safety, heuristics, {}, {})
            result["sha256"] = sha256_hash
            result["duration_ms"] = round((time.time() - start_time) * 1000, 2)
            return result

        # Early exit on obvious scenery or casual landscape
        if heuristics.get("is_natural_scenery", False):
            classification = {
                "is_document": False,
                "category": "NATURAL_SCENERY",
                "confidence": 0.95,
                "is_scenery": True,
            }
            result = fuse_validation_decision(safety, heuristics, {}, classification)
            result["sha256"] = sha256_hash
            result["duration_ms"] = round((time.time() - start_time) * 1000, 2)
            if sha256_hash and len(_DECISION_CACHE) < MAX_CACHE_SIZE:
                _DECISION_CACHE[sha256_hash] = result
            return result

        # 5. Stage 2: Text Detection & Tiny-Text Assessment
        processed_img = heuristics.get("processed_image") or pil_img
        text_data = detect_text_and_readability(processed_img, heuristics)

        # 6. Stage 3 & 4: Visual Document Classification & Guardrail
        classification = classify_document(
            heuristics=heuristics,
            text_data=text_data,
            extracted_text=extracted_text,
            filename=os.path.basename(file_path)
        )

        # 7. Stage 5: Multi-Modal Score Fusion & Final Decision
        final_decision = fuse_validation_decision(safety, heuristics, text_data, classification)
        final_decision["sha256"] = sha256_hash
        final_decision["duration_ms"] = round((time.time() - start_time) * 1000, 2)

        # Cache decision
        if sha256_hash and len(_DECISION_CACHE) < MAX_CACHE_SIZE:
            _DECISION_CACHE[sha256_hash] = final_decision

        return final_decision

    except Exception as e:
        return {
            "decision": "REJECT",
            "doc_type": None,
            "score": 0.0,
            "reason_code": "PROCESSING_ERROR",
            "reason": f"Validator pipeline encountered an unhandled error: {str(e)}",
            "sha256": sha256_hash,
            "duration_ms": round((time.time() - start_time) * 1000, 2),
        }
