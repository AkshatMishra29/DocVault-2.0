/**
 * Client-Side Pre-Upload Sensitive Document Detector
 * ===================================================
 * Runs 100% locally in the browser BEFORE any file bytes leave the device.
 * Detects:
 *  - Sensitive identity filenames (Aadhaar, PAN, Passport, Voter ID, Confidential)
 *  - Password-protected / encrypted PDFs (/Encrypt marker in first 4KB)
 */

const SENSITIVE_FILENAME_PATTERNS = [
  { label: 'Aadhaar / UIDAI', regex: /aadhaa?r|uidai/i },
  { label: 'PAN Card', regex: /(?:^|[_\W])pan(?:card|[_\W].*card)|pancard/i },
  { label: 'Voter ID', regex: /voter.*id|election.*card/i },
  { label: 'Passport', regex: /passport/i },
  { label: 'Confidential / Private ID', regex: /confidential|private.*id|secret/i },
];

/**
 * Inspect a File object locally in the browser.
 * @param {File} file
 * @returns {Promise<{ isSensitive: boolean, isEncryptedPdf: boolean, reason: string | null }>}
 */
export async function detectSensitiveFileLocally(file) {
  if (!file) return { isSensitive: false, isEncryptedPdf: false, reason: null };

  const name = file.name || '';
  for (const rule of SENSITIVE_FILENAME_PATTERNS) {
    if (rule.regex.test(name)) {
      return {
        isSensitive: true,
        isEncryptedPdf: false,
        reason: `Sensitive document detected locally (${rule.label}). Automatically switched to Private Storage-Only with Zero-Knowledge E2EE.`,
      };
    }
  }

  // Inspect first 4KB of PDFs for /Encrypt dictionary
  if (file.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
    try {
      const headSlice = file.slice(0, 4096);
      const buf = await headSlice.arrayBuffer();
      const headerText = new TextDecoder('latin1').decode(buf);
      if (headerText.includes('/Encrypt')) {
        return {
          isSensitive: true,
          isEncryptedPdf: true,
          reason: 'Password-protected PDF detected locally. Automatically switched to Private Storage-Only with Zero-Knowledge E2EE.',
        };
      }
    } catch (_) {
      // ignore slice errors
    }
  }

  return { isSensitive: false, isEncryptedPdf: false, reason: null };
}
