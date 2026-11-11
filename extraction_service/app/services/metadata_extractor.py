import re
import datetime
from typing import Dict, Any, List, Optional, Tuple

MONTH_NAMES = {
    'jan': 1, 'january': 1,
    'feb': 2, 'february': 2,
    'mar': 3, 'march': 3,
    'apr': 4, 'april': 4,
    'may': 5,
    'jun': 6, 'june': 6,
    'jul': 7, 'july': 7,
    'aug': 8, 'august': 8,
    'sep': 9, 'september': 9, 'sept': 9,
    'oct': 10, 'october': 10,
    'nov': 11, 'november': 11,
    'dec': 12, 'december': 12
}


def normalize_to_iso_date(raw_str: str) -> Optional[str]:
    """
    Normalizes arbitrary date strings to ISO 'YYYY-MM-DD'.
    Handles ordinals ('14th of September 2022', '14th September 2022', '2023-05-12', '12/05/2023').
    Restricts years to valid document range: 1950 - 2050.
    """
    if not raw_str:
        return None

    cleaned = raw_str.strip().lower()
    cleaned = re.sub(r'(\d+)(st|nd|rd|th)\b', r'\1', cleaned)
    cleaned = re.sub(r'\b(day\s+of|of)\b', ' ', cleaned)
    cleaned = re.sub(r'[,/.-]', ' ', cleaned)
    parts = [p for p in cleaned.split() if p]

    # Pattern: YYYY MM DD
    if len(parts) == 3 and len(parts[0]) == 4 and parts[0].isdigit():
        try:
            year = int(parts[0])
            month = int(parts[1]) if parts[1].isdigit() else MONTH_NAMES.get(parts[1], 0)
            day = int(parts[2])
            if 1950 <= year <= 2050 and 1 <= month <= 12 and 1 <= day <= 31:
                return f"{year:04d}-{month:02d}-{day:02d}"
        except Exception:
            pass

    # Pattern: DD Month YYYY or DD MM YYYY
    if len(parts) == 3 and parts[0].isdigit() and len(parts[2]) == 4 and parts[2].isdigit():
        try:
            day = int(parts[0])
            month = int(parts[1]) if parts[1].isdigit() else MONTH_NAMES.get(parts[1], 0)
            year = int(parts[2])
            if 1950 <= year <= 2050 and 1 <= month <= 12 and 1 <= day <= 31:
                return f"{year:04d}-{month:02d}-{day:02d}"
        except Exception:
            pass

    # Pattern: Month DD YYYY
    if len(parts) == 3 and parts[0] in MONTH_NAMES and parts[1].isdigit() and len(parts[2]) == 4:
        try:
            month = MONTH_NAMES[parts[0]]
            day = int(parts[1])
            year = int(parts[2])
            if 1950 <= year <= 2050 and 1 <= month <= 12 and 1 <= day <= 31:
                return f"{year:04d}-{month:02d}-{day:02d}"
        except Exception:
            pass

    return None


class MetadataExtractor:
    """
    Deterministic rule-based and regex extraction engine for DocVault documents.
    Extracts dates, financial figures, policy numbers, certificate details, and categories.
    """

    @classmethod
    def classify_category(cls, text: str, filename: str = "") -> str:
        combined = f"{filename} {text}".lower()

        if re.search(r'\b(certificate|certifies that|hereby certify|completion|diploma|degree|awarded to)\b', combined):
            return "Certificates"
        if re.search(r'\b(invoice|tax invoice|bill to|subtotal|amount due|gstin|gst no|total amount)\b', combined):
            return "Invoices"
        if re.search(r'\b(policy|insurance|premium|sum assured|insurer|insured)\b', combined):
            return "Insurance"
        if re.search(r'\b(prescription|hospital|clinic|doctor|patient|diagnosis|rx)\b', combined):
            return "Medical"
        if re.search(r'\b(bank|account statement|balance|withdrawal|deposit|ifsc)\b', combined):
            return "Financial"
        if re.search(r'\b(receipt|pos|cashier|retail receipt)\b', combined):
            return "Receipts"
        return "Other"

    @classmethod
    def extract_dates(cls, text: str) -> Tuple[Optional[str], Optional[str], List[Dict[str, Any]]]:
        """
        Extracts all dates and classifies into documentDate (issue/event) and expiryDate.
        """
        date_regexes = [
            # ISO: 2023-04-15
            r'\b(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b',
            # Slash/Dash: 15/04/2023 or 15-04-2023
            r'\b(\d{1,2}[-/]\d{1,2}[-/]\d{4})\b',
            # Textual month: 14th of September 2022, 14th day of September 2022, September 14, 2022
            r'\b(\d{1,2}(?:st|nd|rd|th)?(?:\s+day)?\s+(?:of\s+)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[,]?\s+\d{4})\b',
            r'\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4})\b'
        ]

        found_dates = []
        for reg in date_regexes:
            for match in re.finditer(reg, text, re.IGNORECASE):
                raw = match.group(1)
                iso = normalize_to_iso_date(raw)
                if iso:
                    # Find preceding context
                    start_pos = max(0, match.start() - 40)
                    context = text[start_pos:match.end()].lower()
                    found_dates.append({
                        "raw": raw,
                        "iso": iso,
                        "context": context
                    })

        doc_date = None
        exp_date = None

        # Expiry indicators
        for item in found_dates:
            ctx = item["context"]
            if re.search(r'\b(valid (?:until|to|through)|expiry|expires|due date|expiration|validity)\b', ctx):
                if not exp_date:
                    exp_date = item["iso"]
            elif re.search(r'\b(issue(?:d)?|date of issue|dated|on this|awarded|purchase date|invoice date|effective)\b', ctx):
                if not doc_date:
                    doc_date = item["iso"]

        # If documentDate not found by keyword, fallback to first chronological or valid date
        if not doc_date and found_dates:
            doc_date = found_dates[0]["iso"]

        return doc_date, exp_date, found_dates

    @classmethod
    def extract_metadata(cls, text: str, filename: str = "") -> Dict[str, Any]:
        category = cls.classify_category(text, filename)
        doc_date, exp_date, all_dates = cls.extract_dates(text)
        key_details = {}
        entities = []

        if doc_date:
            key_details["Document Date"] = doc_date
            entities.append({
                "fieldName": "document_date",
                "value": doc_date,
                "evidence": f"Normalized document date {doc_date}",
                "confidence": 0.90,
                "extractionMethod": "regex"
            })

        if exp_date:
            key_details["Expiry Date"] = exp_date
            entities.append({
                "fieldName": "expiry_date",
                "value": exp_date,
                "evidence": f"Normalized expiry date {exp_date}",
                "confidence": 0.90,
                "extractionMethod": "regex"
            })

        # Category-Specific Extractions
        if category == "Invoices" or category == "Receipts":
            # Invoice Number
            inv_match = re.search(r'\b(?:Invoice|Bill|Inv)[\s#:]*([A-Za-z0-9\/-]{3,25})\b', text, re.IGNORECASE)
            if inv_match:
                inv_no = inv_match.group(1).strip()
                key_details["Invoice Number"] = inv_no
                entities.append({
                    "fieldName": "invoice_number",
                    "value": inv_no,
                    "evidence": inv_match.group(0),
                    "confidence": 0.92,
                    "extractionMethod": "regex"
                })

            # Total Amount
            amt_match = re.search(r'\b(?:Total|Grand Total|Amount Due|Net Amount)[\s:]*[$₹€£]?\s*([0-9,]+\.\d{2})\b', text, re.IGNORECASE)
            if amt_match:
                amt = amt_match.group(1).replace(',', '')
                key_details["Total Amount"] = amt
                entities.append({
                    "fieldName": "total_amount",
                    "value": float(amt) if amt.replace('.', '').isdigit() else amt,
                    "evidence": amt_match.group(0),
                    "confidence": 0.90,
                    "extractionMethod": "regex"
                })

        elif category == "Insurance":
            # Policy Number
            pol_match = re.search(r'\b(?:Policy\s*(?:No|Number|#)?)[\s:]*([A-Za-z0-9\/-]{5,30})\b', text, re.IGNORECASE)
            if pol_match:
                pol_no = pol_match.group(1).strip()
                key_details["Policy Number"] = pol_no
                entities.append({
                    "fieldName": "policy_number",
                    "value": pol_no,
                    "evidence": pol_match.group(0),
                    "confidence": 0.92,
                    "extractionMethod": "regex"
                })

        elif category == "Certificates":
            # Recipient Name: "awarded to <Name>", "certifies that <Name>", "presented to <Name>"
            recip_match = re.search(
                r'\b(?:awarded to|certifies that|presented to|conferred upon|certify that)\s+([A-Z][a-zA-Z\s.]{2,40})',
                text, re.IGNORECASE
            )
            if recip_match:
                raw_recip = recip_match.group(1).split('\n')[0].strip()
                # Clean trailing connector verbs: 'has', 'of', 'successfully', etc.
                cleaned_recip = re.sub(r'\s+(?:has|of|bearing|son|daughter|successfully).*$', '', raw_recip, flags=re.IGNORECASE).strip(' ,;:')
                if len(cleaned_recip) >= 2:
                    key_details["Recipient Name"] = cleaned_recip
                    entities.append({
                        "fieldName": "recipient_name",
                        "value": cleaned_recip,
                        "evidence": recip_match.group(0),
                        "confidence": 0.92,
                        "extractionMethod": "rules"
                    })

            # Certificate ID / Number
            cert_id_match = re.search(r'\b(?:Certificate\s*(?:No|Number|ID)|Cert\s*#)[\s:]*([A-Za-z0-9\/-]{4,30})\b', text, re.IGNORECASE)
            if cert_id_match:
                cert_id = cert_id_match.group(1).strip()
                key_details["Certificate Number"] = cert_id
                entities.append({
                    "fieldName": "certificate_number",
                    "value": cert_id,
                    "evidence": cert_id_match.group(0),
                    "confidence": 0.92,
                    "extractionMethod": "regex"
                })

            # Course / Subject: "for completing <Course>", "in recognition of <Topic>"
            course_match = re.search(
                r'\b(?:for completing|completion of|for successfully completing|in recognition of)\s+([A-Za-z0-9\s,&:-]{3,60})',
                text, re.IGNORECASE
            )
            if course_match:
                course = course_match.group(1).split('\n')[0].strip()
                key_details["Course/Title"] = course
                entities.append({
                    "fieldName": "course_title",
                    "value": course,
                    "evidence": course_match.group(0),
                    "confidence": 0.88,
                    "extractionMethod": "rules"
                })

        return {
            "category": category,
            "documentDate": doc_date,
            "expiryDate": exp_date,
            "keyDetails": key_details,
            "entities": entities
        }
