/**
 * Client for DocVault Isolated CPU Extraction Service (Python FastAPI).
 * Connects to http://127.0.0.1:8000 by default.
 * Provides health checks and automatic graceful fallback if the service is offline.
 */

const EXTRACTION_SERVICE_URL = process.env.EXTRACTION_SERVICE_URL || 'http://127.0.0.1:8000';
const HEALTH_CHECK_TIMEOUT_MS = 2000;
const EXTRACTION_TIMEOUT_MS = 45000;

export async function checkExtractionServiceHealth() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

    const res = await fetch(`${EXTRACTION_SERVICE_URL}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      return { available: true, details: data };
    }
    return { available: false, error: `Status ${res.status}` };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

export async function extractViaPythonService({ buffer, filename = 'document', mimetype = 'application/octet-stream', userConsent = 'PROCESSABLE' }) {
  try {
    const health = await checkExtractionServiceHealth();
    if (!health.available) {
      console.warn(`[ExtractionServiceClient] Python service not reachable (${health.error}). Falling back to local Node extraction.`);
      return null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);

    const formData = new FormData();
    const blob = new Blob([buffer], { type: mimetype });
    formData.append('file', blob, filename);
    formData.append('userConsent', userConsent);

    const res = await fetch(`${EXTRACTION_SERVICE_URL}/api/extract`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errorText = await res.text();
      console.warn(`[ExtractionServiceClient] Extraction returned status ${res.status}: ${errorText}`);
      return null;
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`[ExtractionServiceClient] Request failed: ${err.message}. Falling back to local pipeline.`);
    return null;
  }
}

