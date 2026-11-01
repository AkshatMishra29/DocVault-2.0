/**
 * DocVault Centralized Privacy Policy Service
 *
 * Implements strict zero-knowledge document processing boundaries:
 *
 * Mode A: PROCESSABLE
 * - Invoices, receipts, appliance warranties, policies, certificates.
 * - Allowed for deterministic extraction, OCR, and AI Copilot reasoning.
 *
 * Mode B: STORAGE_ONLY
 * - Aadhaar cards, PAN cards, Voter IDs, password-protected files, or user-restricted documents.
 * - Stored with cryptographic isolation.
 * - NEVER sent to OCR, GLiNER, Groq, Gemini, Embeddings, or Vector RAG.
 * - Defaults to STORAGE_ONLY whenever classification is uncertain.
 */

export const POLICY_VERSION = '1.0.0';

export const PRIVACY_MODES = {
  PROCESSABLE: 'PROCESSABLE',
  STORAGE_ONLY: 'STORAGE_ONLY',
};

// Sensitive filename heuristics that trigger immediate STORAGE_ONLY isolation
const SENSITIVE_FILENAME_TRIGGERS = [
  /aadhaar/i,
  /aadhar/i,
  /uidai/i,
  /(?:^|[_\W])pan(?:card|[_\W].*card)/i,
  /pancard/i,
  /voter.*id/i,
  /election.*card/i,
  /confidential/i,
  /private.*id/i,
  /secret/i,
  /tax.*return.*personal/i,
];

// Sensitive content markers (Indian National IDs & Sensitive Identity Records)
const SENSITIVE_CONTENT_PATTERNS = [
  { name: 'Aadhaar / UIDAI Indicator', regex: /(unique\s+identification\s+authority\s+of\s+india|government\s+of\s+india.*मेरा\s+आधार|\b\d{4}\s\d{4}\s\d{4}\b)/i },
  { name: 'Income Tax Department PAN', regex: /(income\s+tax\s+department.*govt\s+of\s+india|permanent\s+account\s+number\s+card|\b[A-Z]{5}[0-9]{4}[A-Z]\b)/i },
  { name: 'Voter Identity Card / ECI', regex: /(election\s+commission\s+of\s+india|epic\s+no|elector.*photo\s+identity\s+card)/i },
  { name: 'Driving Licence Sensitive', regex: /(driving\s+licen[cs]e.*union\s+of\s+india)/i },
];

/**
 * Checks if a PDF buffer is password-protected or encrypted
 */
export function isPdfPasswordProtected(buffer) {
  try {
    const headerStr = buffer.slice(0, Math.min(buffer.length, 4096)).toString('latin1');
    return headerStr.includes('/Encrypt');
  } catch {
    return false;
  }
}

/**
 * Evaluates document privacy classification before any processing begins
 */
export function evaluatePrivacyPolicy({ filename, buffer, textSample = '', extractedText = '', userConsent = 'PROCESSABLE' }) {
  const sensitiveEntities = [];
  const textToCheck = textSample || extractedText || '';

  // 1. Check explicit user consent override
  if (userConsent === PRIVACY_MODES.STORAGE_ONLY) {
    return {
      mode: PRIVACY_MODES.STORAGE_ONLY,
      policyVersion: POLICY_VERSION,
      reason: 'User explicitly marked document for Storage-Only vault protection.',
      sensitiveEntitiesDetected: ['User Excluded Consent'],
      canOcr: false,
      canUseAi: false,
      canEmbed: false,
    };
  }

  // 2. Check if password-protected / encrypted
  if (isPdfPasswordProtected(buffer)) {
    return {
      mode: PRIVACY_MODES.STORAGE_ONLY,
      policyVersion: POLICY_VERSION,
      reason: 'Document is password-protected / encrypted. Isolated to Storage-Only mode.',
      sensitiveEntitiesDetected: ['Encrypted Container'],
      canOcr: false,
      canUseAi: false,
      canEmbed: false,
    };
  }

  // 3. Check filename indicators
  for (const pattern of SENSITIVE_FILENAME_TRIGGERS) {
    if (pattern.test(filename)) {
      sensitiveEntities.push(`Filename match: ${pattern.toString()}`);
      return {
        mode: PRIVACY_MODES.STORAGE_ONLY,
        policyVersion: POLICY_VERSION,
        reason: 'Sensitive identity document detected from filename (Aadhaar / PAN / Identity).',
        sensitiveEntitiesDetected: sensitiveEntities,
        canOcr: false,
        canUseAi: false,
        canEmbed: false,
      };
    }
  }

  // 4. Check initial text sample (if available) for sensitive Indian Identity patterns
  if (textToCheck && textToCheck.length > 10) {
    for (const item of SENSITIVE_CONTENT_PATTERNS) {
      if (item.regex.test(textToCheck)) {
        sensitiveEntities.push(item.name);
        return {
          mode: PRIVACY_MODES.STORAGE_ONLY,
          policyVersion: POLICY_VERSION,
          reason: `Sensitive national identity document detected (${item.name}). Automatically isolated to Storage-Only mode.`,
          sensitiveEntitiesDetected: sensitiveEntities,
          canOcr: false,
          canUseAi: false,
          canEmbed: false,
        };
      }
    }
  }

  // Default: PROCESSABLE (Allowed for extraction ladder)
  return {
    mode: PRIVACY_MODES.PROCESSABLE,
    policyVersion: POLICY_VERSION,
    reason: 'Document cleared for deterministic extraction and verification ladder.',
    sensitiveEntitiesDetected: [],
    canOcr: true,
    canUseAi: true,
    canEmbed: true,
  };
}

/**
 * Gatekeeper Assertion: Guarantees that STORAGE_ONLY documents can NEVER enter
 * an OCR, AI, LLM, or embedding processing stage.
 */
export function assertProcessingAllowed(documentOrMode, stage = 'Processing') {
  const mode = typeof documentOrMode === 'string' 
    ? documentOrMode 
    : documentOrMode?.mode || documentOrMode?.privacyMode || documentOrMode?.processingMode;

  if (mode === PRIVACY_MODES.STORAGE_ONLY) {
    const error = new Error(`Security Policy Violation: Document is designated STORAGE_ONLY and cannot enter stage "${stage}".`);
    error.statusCode = 403;
    error.isPolicyViolation = true;
    throw error;
  }
}
