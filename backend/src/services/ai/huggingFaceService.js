import { config } from '../../config/index.js';

let isHfAvailable = true;
let lastHfFailure = 0;

/**
 * Generate 384-dimensional vector embeddings via Hugging Face Inference API
 * Includes 60s circuit breaker to prevent cascade latency if endpoint is unreachable.
 */
export async function generateEmbedding(text) {
  if (!config.huggingFace?.apiKey || (!isHfAvailable && Date.now() - lastHfFailure < 60000)) {
    return [];
  }

  try {
    const response = await fetch(config.huggingFace.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.huggingFace.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: text.slice(0, 2000), // Max chunk
      }),
      signal: AbortSignal.timeout(1500),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[HuggingFace] Embedding error (${response.status}):`, errText);
      isHfAvailable = false;
      lastHfFailure = Date.now();
      return [];
    }

    const embedding = await response.json();
    isHfAvailable = true;
    return Array.isArray(embedding) ? embedding : [];
  } catch (err) {
    isHfAvailable = false;
    lastHfFailure = Date.now();
    console.warn('[HuggingFace] Circuit breaker tripped (fallback to keyword search):', err.message);
    return [];
  }
}
