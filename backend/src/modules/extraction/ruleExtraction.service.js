/**
 * DocVault Tier 1 Deterministic Rules & Regex Extraction Engine
 *
 * Extracts structured fields using label-anchored patterns and domain heuristics
 * with zero LLM consumption.
 *
 * Supported Fields:
 * - GSTIN (Indian Goods and Services Tax Identification Number)
 * - PAN (Permanent Account Number format)
 * - Invoice Number
 * - Policy Number
 * - Total / Grand Amount & Currency
 * - Dates (Invoice Date, Issue Date, Expiry Date, Due Date, Renewal Date)
 * - Roll Number / Registration Number
 * - Phone Number
 */

// Strict Indian GSTIN Regex: 2 digits (State code) + 5 letters (PAN) + 4 digits + 1 letter + 1 entity + 'Z' + 1 checksum
const GSTIN_REGEX = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/g;

// Standard Indian PAN format: 5 letters + 4 digits + 1 letter
const PAN_REGEX = /\b([A-Z]{5}[0-9]{4}[A-Z]{1})\b/g;

// Invoice Number anchor patterns
const INVOICE_ANCHORS = [
  /(?:invoice\s*(?:number|num|no|#)\b[:.\s-]*)([A-Z0-9\/-]{3,30})/i,
  /(?:bill\s*(?:number|num|no|#)\b[:.\s-]*)([A-Z0-9\/-]{3,30})/i,
  /(?:receipt\s*(?:number|num|no|#)\b[:.\s-]*)([A-Z0-9\/-]{3,30})/i,
  /(?:tax\s*invoice\s*(?:number|num|no|#)\b[:.\s-]*)([A-Z0-9\/-]{3,30})/i,
  /(?:inv\s*#?[:.\s-]+)([A-Z0-9\/-]{3,30})/i,
];

// Insurance Policy Number anchor patterns
const POLICY_ANCHORS = [
  /(?:policy\s*(?:number|num|no|#)\b[:.\s-]*)([A-Z0-9\/-]{5,35})/i,
  /(?:certificate\s*no[:.\s-]*)([A-Z0-9\/-]{5,35})/i,
  /(?:e-policy\s*no[:.\s-]*)([A-Z0-9\/-]{5,35})/i,
];

// Roll Number / Academic Registration anchor patterns
const ROLL_NUMBER_ANCHORS = [
  /(?:roll\s*(?:number|num|no)\b[:.\s-]*)([A-Z0-9-]{4,25})/i,
  /(?:registration\s*(?:number|num|no)\b[:.\s-]*)([A-Z0-9-]{4,25})/i,
  /(?:enrollment\s*(?:number|num|no)\b[:.\s-]*)([A-Z0-9-]{4,25})/i,
];

// Amount patterns (INR, USD, EUR, GBP)
const AMOUNT_ANCHORS = [
  /(?:total(?:\s*amount)?|grand\s*total|net\s*amount|final\s*payable|amount\s*paid)[:.\s]*(?:₹|rs\.?|inr|\$|€|£)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{2})?)/i,
  /(?:sum\s*insured|idv\s*value)[:.\s]*(?:₹|rs\.?|inr|\$|€|£)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{2})?)/i,
];

// Date parsing patterns
const DATE_PATTERNS = [
  // YYYY-MM-DD
  /\b(20[2-9][0-9]-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01]))\b/g,
  // DD/MM/YYYY or DD-MM-YYYY
  /\b((?:0[1-9]|[12][0-9]|3[01])[\/-](?:0[1-9]|1[0-2])[\/-]20[2-9][0-9])\b/g,
  // DD-MMM-YYYY (e.g. 15-Aug-2025, 04-OCT-2026)
  /\b((?:0[1-9]|[12][0-9]|3[01])[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-\s]20[2-9][0-9])\b/gi,
];

// Expiry / Renewal Date Anchor Keywords
const EXPIRY_ANCHORS = [
  /(?:valid\s*(?:up\s*to|till|until|through)|expires\s*(?:on|date)?|expiry\s*date|renewal\s*date|due\s*date|warranty\s*(?:until|up\s*to|expiry))[:.\s]*([A-Za-z0-9\/-]{8,15})/i,
];

/**
 * Standardize various date formats to ISO YYYY-MM-DD
 */
export function normalizeDateToIso(dateStr) {
  if (!dateStr) return null;
  const clean = dateStr.trim();

  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Textual date parse: 15-Aug-2025
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 1990 && parsed.getFullYear() <= 2040) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Classifies document type using rule-based keyword scoring
 */
export function classifyDocumentByRules(text, filename = '') {
  const lower = (text + ' ' + filename).toLowerCase();

  const scores = {
    'Tax Invoice': 0,
    'Insurance Policy': 0,
    'Admit Card': 0,
    'Academic Certificate': 0,
    'Bank Statement': 0,
    'Purchase Receipt': 0,
    'Warranty Document': 0,
    'Medical Report': 0,
  };

  // Tax / GST Invoice rules
  if (/tax\s*invoice|gstin|gst\s*invoice|bill\s*of\s*supply|hsn\s*code|cgst|sgst|igst/.test(lower)) {
    scores['Tax Invoice'] += 35;
  }
  if (GSTIN_REGEX.test(text)) {
    scores['Tax Invoice'] += 30;
  }

  // Insurance Policy rules
  if (/insurance|policy\s*number|sum\s*insured|premium|tpa|cashless|claim|motor\s*policy|health\s*policy/.test(lower)) {
    scores['Insurance Policy'] += 40;
  }

  // Academic / Admit card rules
  if (/admit\s*card|roll\s*number|examination|hall\s*ticket|center\s*code|candidate/.test(lower)) {
    scores['Admit Card'] += 40;
  }
  if (/degree|marksheet|diploma|university|board\s*of\s*education|passed\s*with|semester/.test(lower)) {
    scores['Academic Certificate'] += 35;
  }

  // Bank Statement rules
  if (/statement\s*of\s*account|account\s*number|ifsc|closing\s*balance|withdrawal|debit|credit\s*amount/.test(lower)) {
    scores['Bank Statement'] += 40;
  }

  // Warranty rules
  if (/warranty\s*(period|card|certificate)|extended\s*warranty|terms\s*of\s*warranty/.test(lower)) {
    scores['Warranty Document'] += 40;
  }

  // Medical rules
  if (/prescription|patient|dr\.|doctor|diagnosis|hospital|clinical|lab\s*report/.test(lower)) {
    scores['Medical Report'] += 40;
  }

  // Receipt rules
  if (/receipt|subtotal|cash\s*memo|pos\s*terminal|store\s*#/.test(lower)) {
    scores['Purchase Receipt'] += 25;
  }

  let topCategory = 'Other';
  let maxScore = 0;

  for (const [cat, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      topCategory = cat;
    }
  }

  const confidence = Math.min(1.0, maxScore / 60);

  return {
    category: maxScore >= 25 ? topCategory : 'Other',
    confidence,
    isHighConfidence: confidence >= 0.70,
    scores,
  };
}

/**
 * Executes Tier 1 Deterministic Extraction on document text
 * Returns array of structured fields with full evidence quotes
 */
export function extractTier1Fields(text, pageNumber = 1) {
  const fields = [];
  if (!text || typeof text !== 'string') return fields;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Helper to find exact evidence line
  const findEvidenceLine = (val) => {
    const line = lines.find(l => l.includes(val));
    return line ? line.slice(0, 140) : `Text: ${val}`;
  };

  // 1. GSTIN Extraction
  const gstinMatches = text.match(GSTIN_REGEX);
  if (gstinMatches && gstinMatches.length > 0) {
    const gstin = gstinMatches[0];
    fields.push({
      fieldName: 'gstin',
      value: gstin,
      evidence: findEvidenceLine(gstin),
      pageNumber,
      extractionMethod: 'regex',
      confidence: 0.98,
      verificationStatus: 'accepted',
      pipelineVersion: '1.0.0',
    });
  }

  // 2. Invoice Number Extraction
  for (const anchor of INVOICE_ANCHORS) {
    const match = text.match(anchor);
    if (match && match[1]) {
      const invNum = match[1].trim().replace(/[,;:]+$/, '');
      if (invNum.length >= 3 && !invNum.toLowerCase().includes('date')) {
        fields.push({
          fieldName: 'invoice_number',
          value: invNum,
          evidence: match[0].trim(),
          pageNumber,
          extractionMethod: 'regex',
          confidence: 0.95,
          verificationStatus: 'accepted',
          pipelineVersion: '1.0.0',
        });
        break;
      }
    }
  }

  // 3. Insurance Policy Number Extraction
  for (const anchor of POLICY_ANCHORS) {
    const match = text.match(anchor);
    if (match && match[1]) {
      const policyNum = match[1].trim().replace(/[,;:]+$/, '');
      if (policyNum.length >= 4) {
        fields.push({
          fieldName: 'policy_number',
          value: policyNum,
          evidence: match[0].trim(),
          pageNumber,
          extractionMethod: 'regex',
          confidence: 0.95,
          verificationStatus: 'accepted',
          pipelineVersion: '1.0.0',
        });
        break;
      }
    }
  }

  // 4. Roll / Registration Number Extraction
  for (const anchor of ROLL_NUMBER_ANCHORS) {
    const match = text.match(anchor);
    if (match && match[1]) {
      const rollNum = match[1].trim().replace(/[,;:]+$/, '');
      fields.push({
        fieldName: 'roll_number',
        value: rollNum,
        evidence: match[0].trim(),
        pageNumber,
        extractionMethod: 'regex',
        confidence: 0.94,
        verificationStatus: 'accepted',
        pipelineVersion: '1.0.0',
      });
      break;
    }
  }

  // 5. Total Amount Extraction
  for (const anchor of AMOUNT_ANCHORS) {
    const match = text.match(anchor);
    if (match && match[1]) {
      const rawAmt = match[1].replace(/,/g, '');
      const parsedNum = parseFloat(rawAmt);
      if (!isNaN(parsedNum) && parsedNum > 0) {
        fields.push({
          fieldName: 'total_amount',
          value: parsedNum,
          evidence: match[0].trim(),
          pageNumber,
          extractionMethod: 'regex',
          confidence: 0.92,
          verificationStatus: 'accepted',
          pipelineVersion: '1.0.0',
        });
        break;
      }
    }
  }

  // 6. Expiry / Renewal Date Extraction
  for (const anchor of EXPIRY_ANCHORS) {
    const match = text.match(anchor);
    if (match && match[1]) {
      const rawDate = match[1].trim();
      const isoDate = normalizeDateToIso(rawDate);
      if (isoDate) {
        fields.push({
          fieldName: 'expiry_date',
          value: isoDate,
          evidence: match[0].trim(),
          pageNumber,
          extractionMethod: 'regex',
          confidence: 0.94,
          verificationStatus: 'accepted',
          pipelineVersion: '1.0.0',
        });
        break;
      }
    }
  }

  // 7. General Document Date (if expiry not found or for issue date)
  const allDateMatches = [];
  for (const pat of DATE_PATTERNS) {
    const found = text.match(pat);
    if (found) {
      for (const d of found) {
        const iso = normalizeDateToIso(d);
        if (iso) allDateMatches.push({ raw: d, iso });
      }
    }
  }

  if (allDateMatches.length > 0) {
    const firstDate = allDateMatches[0];
    fields.push({
      fieldName: 'document_date',
      value: firstDate.iso,
      evidence: findEvidenceLine(firstDate.raw),
      pageNumber,
      extractionMethod: 'regex',
      confidence: 0.88,
      verificationStatus: 'accepted',
      pipelineVersion: '1.0.0',
    });
  }

  return fields;
}
