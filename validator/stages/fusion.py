"""
Stage 5: Multi-Modal Score Fusion & Final Decision Engine.
Fuses visual classification, paper heuristics, text readability, and guardrail decisions.
Outputs API contract: {"decision": "ACCEPT|REJECT|REVIEW", "doc_type": "...", "score": 0.82, "reason": "..."}
"""
from typing import Dict, Any

def fuse_validation_decision(
    safety: Dict[str, Any],
    heuristics: Dict[str, Any],
    text_data: Dict[str, Any],
    classification: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Computes calibrated fusion score and generates final decision.
    """
    # 1. Immediate Safety or Integrity Rejections
    if not safety.get("passed", False):
        return {
            "decision": "REJECT",
            "doc_type": None,
            "score": 0.0,
            "reason_code": safety.get("reason_code", "SAFETY_VIOLATION"),
            "reason": safety.get("reason", "File failed security safety checks."),
        }

    # 2. Blank Image Rejection
    if not heuristics.get("passed", False):
        return {
            "decision": "REJECT",
            "doc_type": None,
            "score": 0.05,
            "reason_code": heuristics.get("reason_code", "BLANK_IMAGE"),
            "reason": heuristics.get("reason", "Image is blank or contains a solid background."),
        }

    # 3. Non-Document Rejections (Scenery, Casual Selfies)
    if not classification.get("is_document", False):
        cat = classification.get("category", "NON_DOCUMENT")
        if cat == "NATURAL_SCENERY":
            return {
                "decision": "REJECT",
                "doc_type": None,
                "score": 0.12,
                "reason_code": "NATURAL_SCENERY",
                "reason": "Image is outdoor landscape scenery or photography, not a document.",
            }
        elif cat == "PERSON_PORTRAIT":
            return {
                "decision": "REJECT",
                "doc_type": None,
                "score": 0.18,
                "reason_code": "PERSON_PORTRAIT",
                "reason": "Casual photograph or portrait detected without legal document structure.",
            }
        else:
            return {
                "decision": "REJECT",
                "doc_type": None,
                "score": 0.20,
                "reason_code": "NON_DOCUMENT_IMAGE",
                "reason": "This image does not appear to be a document.",
            }

    # 4. Genuine Document with Unreadably Small Text (Problem B -> REVIEW)
    if text_data.get("is_tiny_text", False):
        return {
            "decision": "REVIEW",
            "doc_type": classification.get("detected_doc_type") or "printed",
            "score": 0.58,
            "reason_code": "TEXT_TOO_SMALL",
            "reason": "A document appears to be present, but its text is too small to read reliably. Please capture closer.",
        }

    # 5. Genuine Document with Blurry Text (Problem B -> REVIEW)
    if text_data.get("is_unreadably_blurry", False):
        return {
            "decision": "REVIEW",
            "doc_type": classification.get("detected_doc_type") or "printed",
            "score": 0.52,
            "reason_code": "IMAGE_BLURRY",
            "reason": "A document was detected, but the image is too blurry to extract text reliably.",
        }

    # 6. Genuine Document with Zero Detectable Text (REVIEW)
    if not text_data.get("has_sufficient_text", False) and heuristics.get("paper_ratio", 0) > 0.30:
        return {
            "decision": "REVIEW",
            "doc_type": classification.get("detected_doc_type") or "scanned",
            "score": 0.62,
            "reason_code": "LOW_TEXT_DENSITY",
            "reason": "Document sheet detected, but printed text density is minimal. Review recommended.",
        }

    # 7. High-Confidence Genuine Document Acceptance (ACCEPT)
    paper_score = min(heuristics.get("paper_ratio", 0) / 0.40, 1.0) * 0.30
    sharpness_score = min(heuristics.get("sharpness", 0) / 15.0, 1.0) * 0.20
    text_score = min(text_data.get("edge_density", 0) / 0.05, 1.0) * 0.30
    classifier_score = classification.get("confidence", 0.85) * 0.20

    final_score = round(paper_score + sharpness_score + text_score + classifier_score, 2)
    final_score = min(max(final_score, 0.72), 0.98)

    doc_type = classification.get("detected_doc_type") or "printed"

    return {
        "decision": "ACCEPT",
        "doc_type": doc_type,
        "score": final_score,
        "reason_code": "DOCUMENT_VERIFIED",
        "reason": f"Verified genuine {doc_type.replace('_', ' ')} with readable content.",
    }
