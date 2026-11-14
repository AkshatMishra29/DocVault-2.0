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
  /(?:total(?:\s*amount)?(?:\s*received|\s*paid|\s*payable|\s*due)?|grand\s*total|net\s*(?:amount|payable)|final\s*payable|amount\s*(?:paid|received|due|payable)|bill\s*amount)[:.\s]*(?:₹|rs\.?|inr|\$|€|£)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{2})?|[0-9]+)/i,
  /(?:sum\s*insured|idv\s*value)[:.\s]*(?:₹|rs\.?|inr|\$|€|£)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{2})?|[0-9]+)/i,
  /(?:total|amount|bill|received|paid)\s*[:=]\s*(?:₹|rs\.?|inr|\$|€|£)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{2})?|[0-9]+)/i,
];

// Date parsing patterns (supports 1950-2050, ordinals, textual months, and separators)
const MONTH_NAMES = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

// Date parsing patterns
export const DATE_PATTERNS = [
  // YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  /\b((?:19|20)\d{2}[-\/.](?:0?[1-9]|1[0-2])[-\/.](?:0?[1-9]|[12]\d|3[01]))\b/g,
  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  /\b((?:0?[1-9]|[12]\d|3[01])[-\/.](?:0?[1-9]|1[0-2])[-\/.](?:19|20)\d{2})\b/g,
  // DD-MMM-YYYY or DD MMM YYYY or DDth MMM YYYY (e.g. 14th September 2022, 15-Aug-2025)
  /\b((?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?[\s,./-]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,./-]+(?:19|20)\d{2})\b/gi,
  // MMM DD, YYYY (e.g. September 14, 2022)
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?[,\s]+(?:19|20)\d{2})\b/gi,
  // Formal Phrasing: "this 14th day of September, 2022"
  /(?:this\s+)?(\d{1,2}(?:st|nd|rd|th)?\s+day\s+of\s+[A-Za-z]+[,\s]+(?:19|20)\d{2})/gi,
];

// Issue / Completion / Certificate Date Anchors
const ISSUE_DATE_ANCHORS = [
  /(?:date\s*of\s*(?:issue|completion|award|passing|examination|birth)|issue\s*date|issued\s*(?:on|at|date)?|awarded\s*(?:on|at|this)?|conferred\s*(?:on|this)?|completion\s*date|dated\b[:.\s-]*|certified\s*(?:on|this)?|given\s*(?:under\s*our\s*hand\s*)?(?:this)?|date\s*of\s*certification)[:.\s-]*([A-Za-z0-9\s,\/.-]{6,35})/i,
  /(?:on\s*this\s*)([0-9]{1,2}(?:st|nd|rd|th)?\s+day\s+of\s+[A-Za-z]+\s*,?\s*[0-9]{4})/i,
  /(?:date[:.\s-]*)([A-Za-z0-9\s,\/.-]{6,30})/i,
];

// Expiry / Renewal Date Anchor Keywords
const EXPIRY_ANCHORS = [
  /(?:valid\s*(?:up\s*to|till|until|through)|expires\s*(?:on|date)?|expiry\s*date|renewal\s*date|due\s*date|warranty\s*(?:until|up\s*to|expiry))[:.\s]*([A-Za-z0-9\s,\/.-]{6,30})/i,
];

// Certificate and Credential ID Anchors
const CERTIFICATE_ID_ANCHORS = [
  /(?:certificate\s*(?:number|num|no|#|id)\b[:.\s-]*)([A-Z0-9\/-]{3,35})/i,
  /(?:credential\s*(?:id|number|no|#)\b[:.\s-]*)([A-Z0-9\/-]{3,35})/i,
  /(?:serial\s*(?:number|num|no|#)\b[:.\s-]*)([A-Z0-9\/-]{3,35})/i,
  /(?:license\s*(?:number|num|no|#)\b[:.\s-]*)([A-Z0-9\/-]{3,35})/i,
];

// Certificate Recipient Name Anchors
const RECIPIENT_NAME_ANCHORS = [
  /(?:this\s*is\s*to\s*certify\s*that\s*)([A-Z][a-zA-Z\s.']{2,40}?)(?:\n|\r|\s+has|\s+of|\s+bearing|\s+son|\s+daughter|\s+successfully|,)/i,
  /(?:awarded\s*to\s*)([A-Z][a-zA-Z\s.']{2,40}?)(?:\n|\r|\s+for|\s+in|\s+on|,)/i,
  /(?:presented\s*to\s*)([A-Z][a-zA-Z\s.']{2,40}?)(?:\n|\r|\s+for|\s+in|\s+on|,)/i,
  /(?:certifies\s*that\s*)([A-Z][a-zA-Z\s.']{2,40}?)(?:\n|\r|\s+has|\s+successfully|,)/i,
];

// Certificate Issuing Body Anchors
const ISSUING_ORG_ANCHORS = [
  /(?:issued\s*by\b[:.\s-]*)([A-Z0-9\s.,&'-]{3,60})/i,
  /((?:University|Institute|Academy|College|Board|Department|Council|Association)\s+of\s+[A-Za-z\s.,&'-]{3,50})/i,
];

// Course / Degree / Certification Title Anchors
const COURSE_NAME_ANCHORS = [
  /(?:(?:for|has)?\s*successfully\s*completed\s*(?:the\s+(?:graduate\s+program|course|degree|training|program)\s+(?:in|on)\s+)?)(["']?[A-Za-z0-9\s.,&'-]{4,60}["']?)/i,
  /(?:degree\s*of\s*)([A-Za-z0-9\s.,&'-]{4,50})/i,
  /(?:in\s+recognition\s+of\s+)(["']?[A-Za-z0-9\s.,&'-]{4,50}["']?)/i,
];

/**
 * Standardize various date formats to ISO YYYY-MM-DD
 * Handles ordinals (14th), textual months (September), phrasing, numeric (dots, slashes), 1950-2050
 */
export function normalizeDateToIso(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  let clean = dateStr.trim().replace(/^[:.\s-]+|[:.\s-]+$/g, '');

  // 1. Direct ISO YYYY-MM-DD
  const isoMatch = clean.match(/\b(19\d{2}|20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // 2. YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = clean.match(/\b(19\d{2}|20\d{2})[\/.](0?[1-9]|1[0-2])[\/.](0?[1-9]|[12]\d|3[01])\b/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  }

  // 3. Phrasing: "this 14th day of September, 2022" or "14th day of September 2022"
  const phrasingMatch = clean.match(/(?:this\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+day\s+of\s+([A-Za-z]+)[,\s]+(19\d{2}|20\d{2})/i);
  if (phrasingMatch) {
    const day = phrasingMatch[1].padStart(2, '0');
    const monthKey = phrasingMatch[2].toLowerCase();
    const month = MONTH_NAMES[monthKey] || MONTH_NAMES[monthKey.slice(0, 3)];
    const year = phrasingMatch[3];
    if (month) return `${year}-${month}-${day}`;
  }

  // 4. DD Month YYYY (e.g. "14th September 2022", "14 September 2022", "14-Sep-2022", "14.Sep.2022", "14/Oct/2023")
  const dmyTextMatch = clean.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s,./-]+([A-Za-z]{3,10})[\s,./-]+(19\d{2}|20\d{2})\b/i);
  if (dmyTextMatch) {
    const day = dmyTextMatch[1].padStart(2, '0');
    const monthKey = dmyTextMatch[2].toLowerCase();
    const month = MONTH_NAMES[monthKey] || MONTH_NAMES[monthKey.slice(0, 3)];
    const year = dmyTextMatch[3];
    if (month) return `${year}-${month}-${day}`;
  }

  // 5. Month DD, YYYY (e.g. "September 14, 2022", "September 14th 2022", "Sep 14, 2022")
  const mdyTextMatch = clean.match(/\b([A-Za-z]{3,10})\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)(19\d{2}|20\d{2})\b/i);
  if (mdyTextMatch) {
    const monthKey = mdyTextMatch[1].toLowerCase();
    const month = MONTH_NAMES[monthKey] || MONTH_NAMES[monthKey.slice(0, 3)];
    const day = mdyTextMatch[2].padStart(2, '0');
    const year = mdyTextMatch[3];
    if (month) return `${year}-${month}-${day}`;
  }

  // 6. Numeric DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const numMatch = clean.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](19\d{2}|20\d{2})\b/);
  if (numMatch) {
    let p1 = parseInt(numMatch[1], 10);
    let p2 = parseInt(numMatch[2], 10);
    const year = numMatch[3];
    let day = p1;
    let month = p2;
    // If p1 <= 12 and p2 > 12 -> MM/DD/YYYY format
    if (p1 <= 12 && p2 > 12) {
      month = p1;
      day = p2;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 7. Month YYYY (e.g. "October 2023", "Oct 2023")
  const myTextMatch = clean.match(/\b([A-Za-z]{3,10})[,\s]+(19\d{2}|20\d{2})\b/i);
  if (myTextMatch) {
    const monthKey = myTextMatch[1].toLowerCase();
    const month = MONTH_NAMES[monthKey] || MONTH_NAMES[monthKey.slice(0, 3)];
    const year = myTextMatch[2];
    if (month) return `${year}-${month}-01`;
  }

  // 8. Fallback to native Date parser (bounded 1950 - 2050)
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 1950 && parsed.getFullYear() <= 2050) {
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
  if (/degree|marksheet|diploma|university|board\s*of\s*education|passed\s*with|semester|certif(?:icate|ication|y|ied)|completion|awarded\s*to|presented\s*to|conferred|accreditation|achievement|course\s*of|program\s*of/.test(lower)) {
    scores['Academic Certificate'] += 40;
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

  // 4b. Certificate & Credential ID Extraction
  for (const anchor of CERTIFICATE_ID_ANCHORS) {
    const match = text.match(anchor);
    if (match && match[1]) {
      const certId = match[1].trim().replace(/[,;:]+$/, '');
      if (certId.length >= 3 && !certId.toLowerCase().includes('date')) {
        fields.push({
          fieldName: 'certificate_number',
          value: certId,
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

  // 4c. Certificate Recipient Name Extraction
  for (const anchor of RECIPIENT_NAME_ANCHORS) {
    const match = text.match(anchor);
    if (match && match[1]) {
      const recipient = match[1].replace(/[\n\r]+/g, ' ').replace(/\s+(?:has|of|bearing|son|daughter|successfully).*/i, '').trim().replace(/[,;:]+$/, '');
      if (recipient.length >= 3) {
        fields.push({
          fieldName: 'recipient_name',
          value: recipient,
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

  // 4d. Certificate Issuing Organization Extraction
  for (const anchor of ISSUING_ORG_ANCHORS) {
    const match = text.match(anchor);
    if (match && match[1]) {
      const org = match[1].trim().replace(/[,;:]+$/, '');
      if (org.length >= 4) {
        fields.push({
          fieldName: 'issuing_organization',
          value: org,
          evidence: match[0].trim(),
          pageNumber,
          extractionMethod: 'regex',
          confidence: 0.90,
          verificationStatus: 'accepted',
          pipelineVersion: '1.0.0',
        });
        break;
      }
    }
  }

  // 4e. Certificate Course / Degree Title Extraction
  for (const anchor of COURSE_NAME_ANCHORS) {
    const match = text.match(anchor);
    if (match && match[1]) {
      const course = match[1].split(/[\n\r]/)[0].trim().replace(/['",;:]+$/g, '').replace(/^['"]/, '');
      if (course.length >= 3) {
        fields.push({
          fieldName: 'course_name',
          value: course,
          evidence: match[0].trim(),
          pageNumber,
          extractionMethod: 'regex',
          confidence: 0.90,
          verificationStatus: 'accepted',
          pipelineVersion: '1.0.0',
        });
        break;
      }
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

  // 5b. Consumer / Recipient Name Extraction
  const consumerMatch = text.match(/(?:consumer\s*name|customer\s*name|billed\s*to|recipient(?:\s*name)?|patient(?:\s*name)?|student(?:\s*name)?)[:.\s]+([A-Z][A-Za-z\s\/\.]{2,45})/i);
  if (consumerMatch && consumerMatch[1]) {
    const rawName = consumerMatch[1].trim().split('\n')[0].trim();
    if (rawName.length >= 3) {
      fields.push({
        fieldName: 'consumer_name',
        value: rawName,
        evidence: consumerMatch[0].trim(),
        pageNumber,
        extractionMethod: 'regex',
        confidence: 0.90,
        verificationStatus: 'accepted',
        pipelineVersion: '1.0.0',
      });
    }
  }

  // 5c. Account / Identifier Number Extraction
  const accountMatch = text.match(/(?:account\s*no\.?|consumer\s*no\.?|ca\s*no\.?|transaction\s*id\.?|receipt\s*no\.?)[:.\s]*([A-Za-z0-9\-_]{5,30})/i);
  if (accountMatch && accountMatch[1]) {
    fields.push({
      fieldName: 'account_number',
      value: accountMatch[1].trim(),
      evidence: accountMatch[0].trim(),
      pageNumber,
      extractionMethod: 'regex',
      confidence: 0.92,
      verificationStatus: 'accepted',
      pipelineVersion: '1.0.0',
    });
  }

  // 6a. Explicit Issue / Completion / Award Date Extraction
  let explicitIssueFound = false;
  for (const anchor of ISSUE_DATE_ANCHORS) {
    const match = text.match(anchor);
    if (match && match[1]) {
      const rawDate = match[1].trim();
      const isoDate = normalizeDateToIso(rawDate);
      if (isoDate) {
        fields.push({
          fieldName: 'issue_date',
          value: isoDate,
          evidence: match[0].trim(),
          pageNumber,
          extractionMethod: 'regex',
          confidence: 0.95,
          verificationStatus: 'accepted',
          pipelineVersion: '1.0.0',
        });
        explicitIssueFound = true;
        break;
      }
    }
  }

  // 6b. Expiry / Renewal Date Extraction
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
