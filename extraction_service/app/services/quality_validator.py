from typing import List, Dict, Any, Tuple


class QualityValidator:
    """
    Evaluates extraction results across all pages.
    Detects unreadable text, high whitespace ratio, empty pages, and failures.
    """

    @classmethod
    def evaluate_quality(
        cls,
        pages: List[Dict[str, Any]]
    ) -> Tuple[Dict[str, Any], str]:
        """
        Returns (QualityValidationReport_dict, document_status)
        """
        if not pages:
            return {
                "overallScore": 0.0,
                "isAcceptable": False,
                "emptyPages": [],
                "failedPages": [],
                "lowConfidencePages": [],
                "warnings": ["No pages were processed."]
            }, "FAILED"

        total_pages = len(pages)
        empty_pages = []
        failed_pages = []
        low_confidence_pages = []
        warnings = []

        total_conf = 0.0
        successful_pages = 0

        for p in pages:
            page_num = p["pageNumber"]
            status = p["status"]
            text = p.get("text", "")
            conf = p.get("confidence", 0.0)

            if status == "FAILED":
                failed_pages.append(page_num)
                warnings.append(f"Page {page_num} failed processing: {p.get('error') or 'Unknown error'}")
            elif status == "EMPTY_PAGE" or not text.strip():
                empty_pages.append(page_num)
                warnings.append(f"Page {page_num} contains no extractable text.")
            elif status == "LOW_CONFIDENCE" or conf < 0.50:
                low_confidence_pages.append(page_num)
                warnings.append(f"Page {page_num} has low OCR confidence ({int(conf * 100)}%).")
                successful_pages += 1
                total_conf += conf
            else:
                successful_pages += 1
                total_conf += conf

            # Check for excessive unreadable/replacement characters or gibberish
            if text:
                replacement_chars = text.count('\ufffd') + text.count('?')
                if len(text) > 20 and (replacement_chars / len(text)) > 0.15:
                    warnings.append(f"Page {page_num} contains suspicious proportion of unreadable characters.")

        overall_score = round(total_conf / total_pages, 2) if total_pages > 0 else 0.0
        is_acceptable = successful_pages > 0 and len(failed_pages) == 0

        # Determine Document-Level Status
        if successful_pages == 0:
            doc_status = "FAILED"
        elif len(failed_pages) > 0 or len(empty_pages) > 0:
            doc_status = "PARTIALLY_PROCESSED"
        elif len(low_confidence_pages) > 0:
            doc_status = "NEEDS_REVIEW"
        else:
            doc_status = "COMPLETED"

        report = {
            "overallScore": overall_score,
            "isAcceptable": is_acceptable,
            "emptyPages": empty_pages,
            "failedPages": failed_pages,
            "lowConfidencePages": low_confidence_pages,
            "warnings": warnings
        }

        return report, doc_status

