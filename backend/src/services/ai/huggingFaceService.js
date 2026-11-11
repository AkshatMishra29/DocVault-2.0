import { config } from '../../config/index.js';

/**
 * Generate 384-dimensional vector embeddings via Hugging Face Inference API
 */
export async function generateEmbedding(text) {
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
      signal: AbortSignal.timeout(3500),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[HuggingFace] Embedding error (${response.status}):`, errText);
      return [];
    }

    const embedding = await response.json();
    // Return float array
    return Array.isArray(embedding) ? embedding : [];
  } catch (err) {
    console.error('[HuggingFace] Failed to generate embedding:', err.message);
    return [];
  }
}
