/**
 * Semantic Cache Service (Optimized Tiered Cache)
 * ================================================
 * Tier 1: O(1) normalized exact-string lookup (0ms, zero network calls)
 * Tier 2: Cosine similarity >= 0.92 over pre-warmed 384-dim embeddings (only calls HF when entries exist)
 * Persisted cleanly to MongoDB (`sessionId: '__semantic_cache__'`).
 */

import { generateEmbedding } from '../../../services/ai/huggingFaceService.js';
import { CopilotMessage } from '../models/copilotMessage.model.js';

const SIMILARITY_THRESHOLD = 0.92;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_ENTRIES = 200;
const CACHE_SESSION_ID = '__semantic_cache__';

// Map<userId, Array<{ normalizedQuery, queryEmbedding, queryText, answer, sources, createdAt }>>
const inMemoryCache = new Map();

function normalizeQuery(q) {
  return String(q || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

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
 * Retrieve cached answer via O(1) exact match first, then semantic vector similarity.
 * Skips HuggingFace network call completely if user has 0 cached entries!
 */
export async function getCachedAnswer(userId, query) {
  if (!query || query.length < 10) return null;

  const userEntries = inMemoryCache.get(userId);
  if (!userEntries || userEntries.length === 0) {
    return null; // Fast 0ms exit — do not waste 1.5s calling HuggingFace when cache is empty!
  }

  const now = Date.now();
  const norm = normalizeQuery(query);

  // Tier 1: Exact normalized string hit (0ms)
  for (const entry of userEntries) {
    if (now - entry.createdAt > CACHE_TTL_MS) continue;
    if (entry.normalizedQuery === norm) {
      return { answer: entry.answer, sources: entry.sources || [], cacheTier: 'exact' };
    }
  }

  // Tier 2: Semantic embedding similarity (only if cached vectors exist)
  const vectorEntries = userEntries.filter((e) => now - e.createdAt <= CACHE_TTL_MS && e.queryEmbedding?.length);
  if (vectorEntries.length === 0) return null;

  let queryVec;
  try {
    queryVec = await generateEmbedding(query);
  } catch (_) {
    return null;
  }
  if (!queryVec?.length) return null;

  for (const entry of vectorEntries) {
    const sim = cosineSimilarity(queryVec, entry.queryEmbedding);
    if (sim >= SIMILARITY_THRESHOLD) {
      return { answer: entry.answer, sources: entry.sources || [], cacheTier: 'semantic' };
    }
  }

  return null;
}

/**
 * Store an answer in exact + semantic cache.
 */
export async function cacheAnswer(userId, query, answer, sources = []) {
  if (!query || !answer || query.length < 10 || answer.length < 25) return;
  // Never cache fallback error messages
  if (/could not generate a response|encountered an issue|timed out/i.test(answer)) return;

  const norm = normalizeQuery(query);
  let queryVec = [];
  try {
    queryVec = await generateEmbedding(query);
  } catch (_) {
    queryVec = [];
  }

  const entry = {
    normalizedQuery: norm,
    queryEmbedding: Array.isArray(queryVec) ? queryVec : [],
    queryText: query.slice(0, 200),
    answer,
    sources,
    createdAt: Date.now(),
  };

  const userEntries = (inMemoryCache.get(userId) || []).filter((e) => e.normalizedQuery !== norm);
  userEntries.unshift(entry);
  if (userEntries.length > MAX_CACHE_ENTRIES) userEntries.length = MAX_CACHE_ENTRIES;
  inMemoryCache.set(userId, userEntries);

  CopilotMessage.create({
    userId,
    sessionId: CACHE_SESSION_ID,
    role: 'cache',
    content: answer,
    sources,
    metadata: {
      normalizedQuery: norm,
      queryText: entry.queryText,
      queryEmbedding: entry.queryEmbedding,
      createdAt: new Date(),
    },
  }).catch(() => {});
}

/**
 * Warm the in-memory cache for a user from MongoDB once per server lifecycle.
 */
export async function warmCacheFromDB(userId) {
  if (inMemoryCache.has(userId)) return;

  try {
    const records = await CopilotMessage.find({
      userId,
      sessionId: CACHE_SESSION_ID,
      role: 'cache',
      createdAt: { $gte: new Date(Date.now() - CACHE_TTL_MS) },
    })
      .select('content sources metadata createdAt')
      .sort({ createdAt: -1 })
      .limit(MAX_CACHE_ENTRIES)
      .lean();

    const entries = records.map((r) => ({
      normalizedQuery: r.metadata?.normalizedQuery || normalizeQuery(r.metadata?.queryText || ''),
      queryEmbedding: Array.isArray(r.metadata?.queryEmbedding) ? r.metadata.queryEmbedding : [],
      queryText: r.metadata?.queryText || '',
      answer: r.content,
      sources: r.sources || [],
      createdAt: new Date(r.metadata?.createdAt || r.createdAt).getTime(),
    }));

    // Always mark loaded (even if empty []) so DB is not queried repeatedly on misses
    inMemoryCache.set(userId, entries);
  } catch (err) {
    console.warn('[SemanticCache] DB warm failed:', err.message);
    inMemoryCache.set(userId, []);
  }
}

export function invalidateUserCache(userId) {
  inMemoryCache.delete(userId);
}
