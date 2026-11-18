import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../../config/index.js';
import { validateDocumentPipeline } from './documentValidationPipeline.service.js';

// In-memory decision cache by SHA-256 for instant duplicate validation
const _DECISION_CACHE = new Map();
const MAX_CACHE_ENTRIES = 5000;

// Fast circuit breaker: if standalone service is offline, skip network timeouts for 30 seconds
let _SERVICE_CIRCUIT_BROKEN_UNTIL = 0;

/**
 * Health check for the standalone Python/FastAPI validator service.
 */
export async function checkValidatorHealth() {
  if (Date.now() < _SERVICE_CIRCUIT_BROKEN_UNTIL) {
    return { available: false, circuitBroken: true };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);

    const res = await fetch(`${config.validator.serviceUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      _SERVICE_CIRCUIT_BROKEN_UNTIL = 0;
      return { available: true, details: data };
    }
    return { available: false, status: res.status };
  } catch (err) {
    _SERVICE_CIRCUIT_BROKEN_UNTIL = Date.now() + 30000; // Trip circuit breaker for 30s
    return { available: false, error: err.message };
  }
}

/**
 * Validates a quarantined file using the isolated FastAPI validation service.
 * Enforces internal auth token, SHA-256 caching, and seamless local pipeline fallback.
 */
export async function validateWithService({
  quarantinePath,
  sha256,
  buffer,
  originalname = 'document',
  mimetype = 'application/octet-stream',
}) {
  const startTime = Date.now();

  // 1. Calculate / verify SHA-256
  const fileHash = sha256 || (buffer ? crypto.createHash('sha256').update(buffer).digest('hex') : null);

  // 2. Decision Cache Check
  if (fileHash && _DECISION_CACHE.has(fileHash)) {
    const cached = { ..._DECISION_CACHE.get(fileHash) };
    cached.cached = true;
    cached.durationMs = Date.now() - startTime;
    return cached;
  }

  // 3. Attempt Call to Standalone Validator Microservice
  let serviceResult = null;
  if (Date.now() >= _SERVICE_CIRCUIT_BROKEN_UNTIL) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.min(config.validator?.timeoutMs || 2000, 2000));

      // Call internal validator service POST /validate
      const res = await fetch(`${config.validator.serviceUrl}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': config.validator.internalToken,
        },
        body: JSON.stringify({
          path: quarantinePath,
          sha256: fileHash,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        serviceResult = await res.json();
        _SERVICE_CIRCUIT_BROKEN_UNTIL = 0; // Service is healthy
      } else {
        console.warn(`[ValidatorClient] Service returned status ${res.status}: ${await res.text()}`);
      }
    } catch (netErr) {
      _SERVICE_CIRCUIT_BROKEN_UNTIL = Date.now() + 30000; // Trip circuit breaker for 30s
      console.info(`[ValidatorClient] Standalone service not reachable (${netErr.message}). Using local Node validation pipeline.`);
    }
  }

  // 4. Return result if standalone service succeeded
  if (serviceResult && serviceResult.decision) {
    const formatted = {
      decision: serviceResult.decision, // ACCEPT, REJECT, REVIEW
      doc_type: serviceResult.doc_type || 'printed',
      score: serviceResult.score !== undefined ? serviceResult.score : 0.85,
      reason: serviceResult.reason || 'Document validated by internal ML service.',
      reason_code: serviceResult.reason_code || 'VALIDATED',
      sha256: fileHash,
      durationMs: Date.now() - startTime,
      tier: 'validator_microservice',
    };

    if (fileHash && _DECISION_CACHE.size < MAX_CACHE_ENTRIES) {
      _DECISION_CACHE.set(fileHash, formatted);
    }
    return formatted;
  }

  // 5. High-Availability Local In-Process Fallback
  // If the Python service container is offline, execute Node.js multi-stage pipeline directly
  const localBuffer = buffer || (quarantinePath && fs.existsSync(quarantinePath) ? fs.readFileSync(quarantinePath) : null);
  if (!localBuffer) {
    return {
      decision: 'REJECT',
      doc_type: null,
      score: 0.0,
      reason: 'Quarantined file could not be read.',
      reason_code: 'FILE_UNREADABLE',
      sha256: fileHash,
    };
  }

  const localVal = await validateDocumentPipeline(localBuffer, { originalname, mimetype });

  let decision = 'ACCEPT';
  if (localVal.status === 'rejected') {
    decision = 'REJECT';
  } else if (localVal.status === 'review') {
    decision = 'REVIEW';
  }

  const localResult = {
    decision,
    doc_type: localVal.document_type || 'printed',
    score: localVal.document_confidence || (decision === 'ACCEPT' ? 0.90 : 0.50),
    reason: localVal.message || 'Validated by DocVault pipeline.',
    reason_code: localVal.reason_code || (decision === 'ACCEPT' ? 'DOCUMENT_VERIFIED' : 'REVIEW_REQUIRED'),
    sha256: fileHash,
    durationMs: Date.now() - startTime,
    tier: 'local_node_pipeline',
  };

  if (fileHash && _DECISION_CACHE.size < MAX_CACHE_ENTRIES) {
    _DECISION_CACHE.set(fileHash, localResult);
  }

  return localResult;
}
