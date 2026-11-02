/**
 * Local In-Process Sensitive Document Detector
 *
 * Implements Rule 3:
 * Sensitive documents (Aadhaar, PAN, passport, voter ID, driving licence, bank or card numbers)
 * default to storage_only. Detect locally in-process (Aadhaar 12 digits with Verhoeff checksum,
 * PAN pattern, MRZ lines, keyword hints). If flagged: force storage_only, discard the text,
 * send nothing to any network service.
 */

// Verhoeff multiplication table d
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

// Verhoeff permutation table p
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

// Verhoeff inverse table
const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Validates a number string using the Verhoeff checksum algorithm (used by Aadhaar)
 */
export function validateVerhoeff(numStr) {
  const digits = String(numStr).replace(/\D/g, '');
  if (!digits || digits.length < 2) return false;
  let c = 0;
  const reversed = digits.split('').reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][reversed[i]]];
  }
  return c === 0;
}

/**
 * Generates the Verhoeff checksum digit for a number string
 */
export function generateVerhoeff(numStr) {
  const digits = String(numStr).replace(/\D/g, '');
  let c = 0;
  const reversed = digits.split('').reverse().map(Number);
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[(i + 1) % 8][reversed[i]]];
  }
  return VERHOEFF_INV[c];
}

/**
 * Validates a credit/debit card number using Luhn Algorithm
 */
export function validateLuhn(numStr) {
  const clean = String(numStr).replace(/\D/g, '');
  if (clean.length < 13 || clean.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let digit = parseInt(clean.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/**
 * Checks if a PDF buffer has encryption dictionary
 */
export function isPdfEncrypted(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return false;
  try {
    const head = buffer.slice(0, Math.min(buffer.length, 8192)).toString('latin1');
    return head.includes('/Encrypt');
  } catch {
    return false;
  }
}

// Sensitive filename regex triggers
const SENSITIVE_FILENAME_REGEX = [
  { type: 'aadhaar', regex: /(aadhaar|aadhar|uidai|mera.?aadhaar)/i },
  { type: 'pan', regex: /(?:^|[_\W])pan(?:card|[_\W].*card)?(?:$|[_\W])/i },
  { type: 'passport', regex: /passport/i },
  { type: 'voter_id', regex: /(voter.?id|epic.?no|election.?card)/i },
  { type: 'driving_licence', regex: /(driving.?licen[cs]e|dl[_\-\s]copy)/i },
  { type: 'financial', regex: /(bank.?statement|credit.?card|salary.?slip|payslip|tax.?return.?personal)/i },
  { type: 'confidential', regex: /(confidential|secret|sensitive.?id)/i },
];

// Sensitive text keywords & patterns
const SENSITIVE_KEYWORD_PATTERNS = [
  { type: 'aadhaar', regex: /(unique\s+identification\s+authority\s+of\s+india|government\s+of\s+india.*मेरा\s+आधार|uidai|enrolment\s+no.*aadhaar)/i },
  { type: 'pan', regex: /(income\s+tax\s+department.*govt\s+of\s+india|permanent\s+account\s+number\s+card|form\s+no\.\s*49a)/i },
  { type: 'passport', regex: /(republic\s+of\s+india.*passport|passport\s+no|given\s+names.*nationality.*republic\s+of\s+india)/i },
  { type: 'voter_id', regex: /(election\s+commission\s+of\s+india|elector.*photo\s+identity\s+card|e\.p\.i\.c\s+no)/i },
  { type: 'driving_licence', regex: /(driving\s+licen[cs]e.*union\s+of\s+india|motor\s+vehicles\s+act.*driving\s+licen[cs]e)/i },
];

// Strict PAN Card Pattern (5 uppercase letters, 4 digits, 1 uppercase letter)
const PAN_REGEX = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;

// Passport MRZ Line pattern (ICAO Document 9303 Type 3)
const PASSPORT_MRZ_LINE_1 = /P<[A-Z]{3}[A-Z<]{39}/;
const PASSPORT_MRZ_LINE_2 = /[A-Z0-9<]{9}[0-9][A-Z]{3}[0-9]{6}[0-9][MF<][0-9]{6}[0-9]/;

// Voter ID / EPIC Pattern (3 uppercase letters followed by 7 digits)
const VOTER_EPIC_REGEX = /\b[A-Z]{3}[0-9]{7}\b/g;

// Indian Driving Licence Pattern (e.g., DL-0420110149646, MH12 20110012345)
const DRIVING_LICENCE_REGEX = /\b([A-Z]{2}[0-9]{2}[-\s]?[0-9]{4}[-\s]?[0-9]{7}|[A-Z]{2}[0-9]{13,15})\b/g;

// 12-digit Aadhaar pattern candidate (isolated or space/hyphen delimited)
const AADHAAR_CANDIDATE_REGEX = /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g;

// 13-19 digit Payment Card candidate
const CARD_CANDIDATE_REGEX = /\b(?:\d{4}[ -]?){3,4}\d{1,4}\b/g;

/**
 * Master local sensitive document detector.
 * Evaluates filename, binary headers, and extracted text strictly in-process.
 * 
 * @param {Object} params
 * @param {string} params.filename - Original uploaded filename
 * @param {string} [params.text] - Extracted text (if available)
 * @param {Buffer} [params.buffer] - Raw file buffer (to check encryption)
 * @returns {Object} { isSensitive: boolean, reason: string|null, entityType: string|null }
 */
export function detectSensitiveDocument({ filename = '', text = '', buffer = null }) {
  // 1. Check if PDF is encrypted/password-protected
  if (buffer && isPdfEncrypted(buffer)) {
    return {
      isSensitive: true,
      reason: 'Encrypted or password-protected PDF detected',
      entityType: 'encrypted_pdf',
    };
  }

  // 2. Filename Heuristic Check
  const cleanFilename = String(filename).trim();
  for (const item of SENSITIVE_FILENAME_REGEX) {
    if (item.regex.test(cleanFilename)) {
      return {
        isSensitive: true,
        reason: `Filename matches sensitive identity heuristic (${item.type})`,
        entityType: item.type,
      };
    }
  }

  const content = String(text || '').trim();
  if (!content || content.length < 8) {
    return { isSensitive: false, reason: null, entityType: null };
  }

  // 3. Aadhaar Detection with Verhoeff Checksum Algorithm
  const aadhaarMatches = content.match(AADHAAR_CANDIDATE_REGEX);
  if (aadhaarMatches) {
    for (const match of aadhaarMatches) {
      const cleanDigits = match.replace(/\D/g, '');
      if (cleanDigits.length === 12) {
        // Aadhaar numbers do not start with 0 or 1
        const firstDigit = cleanDigits.charAt(0);
        if (firstDigit !== '0' && firstDigit !== '1') {
          if (validateVerhoeff(cleanDigits)) {
            return {
              isSensitive: true,
              reason: 'Aadhaar 12-digit number with valid Verhoeff checksum detected',
              entityType: 'aadhaar',
            };
          }
        }
      }
    }
  }

  // 4. PAN Pattern Check (5 letters, 4 digits, 1 letter)
  const panMatches = content.match(PAN_REGEX);
  if (panMatches && panMatches.length > 0) {
    // Distinguish between a personal/sensitive PAN Card and a business Tax Invoice containing corporate registration numbers
    const isCommercialInvoice = /(tax\s+invoice|bill\s+of\s+supply|commercial\s+invoice|proforma\s+invoice|description\s+of\s+goods)/i.test(content);
    const hasPanCardContext = /(income\s+tax\s+department|permanent\s+account\s+number\s+card|father['’]?s\s+name|govt\s+of\s+india.*pan|form\s+no\.\s*49a)/i.test(content);

    if (hasPanCardContext || !isCommercialInvoice) {
      return {
        isSensitive: true,
        reason: 'Indian Income Tax PAN identifier pattern detected',
        entityType: 'pan',
      };
    }
  }

  // 5. Passport Detection (MRZ lines or Indian passport format)
  if (PASSPORT_MRZ_LINE_1.test(content) && PASSPORT_MRZ_LINE_2.test(content)) {
    return {
      isSensitive: true,
      reason: 'Machine Readable Zone (MRZ) passport data detected',
      entityType: 'passport',
    };
  }

  // 6. Voter ID (EPIC) Detection
  const epicMatches = content.match(VOTER_EPIC_REGEX);
  if (epicMatches && epicMatches.length > 0) {
    const hasVoterContext = /election|voter|elector|eci|constituency/i.test(content);
    if (hasVoterContext) {
      return {
        isSensitive: true,
        reason: 'Election Commission of India Voter ID (EPIC) detected',
        entityType: 'voter_id',
      };
    }
  }

  // 7. Driving Licence Detection
  const dlMatches = content.match(DRIVING_LICENCE_REGEX);
  if (dlMatches && dlMatches.length > 0) {
    const hasDlContext = /driving\s+licen[cs]e|transport\s+department|rto|motor\s+vehicles/i.test(content);
    if (hasDlContext) {
      return {
        isSensitive: true,
        reason: 'Government Driving Licence detected',
        entityType: 'driving_licence',
      };
    }
  }

  // 8. Payment Card Check with Luhn Algorithm
  const cardMatches = content.match(CARD_CANDIDATE_REGEX);
  if (cardMatches) {
    for (const match of cardMatches) {
      const cleanDigits = match.replace(/\D/g, '');
      if (cleanDigits.length >= 13 && cleanDigits.length <= 19) {
        if (validateLuhn(cleanDigits)) {
          return {
            isSensitive: true,
            reason: 'Payment card number with valid Luhn checksum detected',
            entityType: 'payment_card',
          };
        }
      }
    }
  }

  // 9. Institutional Keyword Indicators
  for (const item of SENSITIVE_KEYWORD_PATTERNS) {
    if (item.regex.test(content)) {
      return {
        isSensitive: true,
        reason: `National identity document content markers detected (${item.type})`,
        entityType: item.type,
      };
    }
  }

  return { isSensitive: false, reason: null, entityType: null };
}
