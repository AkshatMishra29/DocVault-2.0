/**
 * Semantic Cache Service
 * ========================
 * Caches Copilot answers by semantic similarity of the user query.
 * Uses the existing HuggingFace embedding service (BAAI/bge-small-en-v1.5, 384-dim).
 * Cache entries stored in-process (LRU) + persisted to MongoDB CopilotMessage 
 * collection with a special sessionId: '__semantic_cache__'.
 *
 * Hit threshold: cosine similarity >= SIMILARITY_THRESHOLD
 * TTL: entries expire after CACHE_TTL_MS (default 24 hours)
 */

import { generateEmbedding } from '../../../services/ai/huggingFaceService.js';
import { CopilotMessage } from '../models/copilotMessage.model.js';

const SIMILARITY_THRESHOLD = 0.92;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 200; // per-user LRU cap in memory
const CACHE_SESSION_ID = '__semantic_cache__';

// In-memory LRU store: Map<userId, Array<{ queryEmbedding, answer, sources, createdAt }>>
const inMemoryCache = new Map();

/**
 * Cosine similarity between two equal-length vectors
 */
function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Retrieve a cached answer for a user query, or null if cache miss.
 * @param {string} userId
 * @param {string} query
 * @returns {{ answer: string, sources: Array } | null}
 */
export async function getCachedAnswer(userId, query) {
  if (!query || query.length < 10) return null;

  let queryVec;
  try {
    queryVec = await generateEmbedding(query);
  } catch (_) {
    return null;
  }
  if (!queryVec?.length) return null;

  const userEntries = inMemoryCache.get(userId) || [];
  const now = Date.now();

  for (const entry of userEntries) {
    // Skip expired
    if (now - entry.createdAt > CACHE_TTL_MS) continue;
    const sim = cosineSimilarity(queryVec, entry.queryEmbedding);
    if (sim >= SIMILARITY_THRESHOLD) {
      console.log(`[SemanticCache] HIT (similarity=${sim.toFixed(3)}) for user ${userId}`);
      return { answer: entry.answer, sources: entry.sources || [] };
    }
  }

  return null;
}

/**
 * Store an answer in the cache for a user query.
 * @param {string} userId
 * @param {string} query
 * @param {string} answer
 * @param {Array}  sources
 */
export async function cacheAnswer(userId, query, answer, sources = []) {
  if (!query || !answer || query.length < 10 || answer.length < 20) return;

  let queryVec;
  try {
    queryVec = await generateEmbedding(query);
  } catch (_) {
    return;
  }
  if (!queryVec?.length) return;

  const entry = {
    queryEmbedding: queryVec,
    queryText: query.slice(0, 200),
    answer,
    sources,
    createdAt: Date.now(),
  };

  // Update in-memory LRU
  const userEntries = inMemoryCache.get(userId) || [];
  userEntries.unshift(entry);
  if (userEntries.length > MAX_CACHE_ENTRIES) userEntries.length = MAX_CACHE_ENTRIES;
  inMemoryCache.set(userId, userEntries);

  // Persist to MongoDB (best-effort, non-blocking)
  CopilotMessage.create({
    userId,
    sessionId: CACHE_SESSION_ID,
    role: 'cache',
    content: answer,
    sources,
    metadata: {
      queryText: entry.queryText,
      queryEmbedding: queryVec,
      createdAt: new Date(),
    },
  }).catch(() => {});
}

/**
 * Warm the in-memory cache for a user from MongoDB on first login / cache miss.
 * Call once at session init; subsequent queries hit in-memory.
 * @param {string} userId
 */
export async function warmCacheFromDB(userId) {
  if (inMemoryCache.has(userId)) return; // already loaded

  try {
    const records = await CopilotMessage.find({
      userId,
      sessionId: CACHE_SESSION_ID,
      role: 'cache',
      createdAt: { $gte: new Date(Date.now() - CACHE_TTL_MS) },
    })
      .sort({ createdAt: -1 })
      .limit(MAX_CACHE_ENTRIES)
      .lean();

    const entries = records
      .filter((r) => r.metadata?.queryEmbedding?.length)
      .map((r) => ({
        queryEmbedding: r.metadata.queryEmbedding,
        queryText: r.metadata.queryText || '',
        answer: r.content,
        sources: r.sources || [],
        createdAt: new Date(r.metadata.createdAt || r.createdAt).getTime(),
      }));

    if (entries.length > 0) {
      inMemoryCache.set(userId, entries);
      console.log(`[SemanticCache] Warmed ${entries.length} entries for user ${userId}`);
    }
  } catch (err) {
    console.warn('[SemanticCache] DB warm failed:', err.message);
  }
}
