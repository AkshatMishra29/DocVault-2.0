import { DocumentChunk } from '../models/documentChunk.model.js';
import { Document } from '../../../models/index.js';
import { isAiAllowed } from '../../../services/pipeline/privacyGate.js';
import { generateEmbedding } from '../../../services/ai/huggingFaceService.js';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

/**
 * Splits raw text into overlapping character chunks
 */
export function chunkText(text, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();
  if (clean.length <= size) return [clean];

  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = start + size;
    // Don't cut a word in the middle if possible
    if (end < clean.length) {
      const nextSpace = clean.lastIndexOf(' ', end);
      if (nextSpace > start + size / 2) {
        end = nextSpace;
      }
    }
    const chunk = clean.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    start = end - overlap;
    if (start >= clean.length || end >= clean.length) break;
  }
  return chunks;
}

/**
 * Lazily chunks and indexes a document if not already indexed
 */
export async function ensureDocumentChunks(documentId, userId) {
  const doc = await Document.findOne({ _id: documentId, userId });
  if (!doc) return [];

  // Privacy gate: Never chunk storage_only or sensitive documents
  if (!isAiAllowed(doc)) {
    // Purge any stale chunks if policy was downgraded
    await DocumentChunk.deleteMany({ documentId, userId });
    return [];
  }

  // Check if chunks already exist
  const existingCount = await DocumentChunk.countDocuments({ documentId, userId });
  if (existingCount > 0) {
    return DocumentChunk.find({ documentId, userId }).sort({ chunkIndex: 1 });
  }

  // Generate chunks per page or extractedText
  const chunksToInsert = [];
  let globalChunkIndex = 0;

  if (Array.isArray(doc.pages) && doc.pages.length > 0) {
    for (const page of doc.pages) {
      const pageText = page.text || '';
      const textChunks = chunkText(pageText);
      for (const t of textChunks) {
        chunksToInsert.push({
          userId,
          documentId,
          pageNumber: page.pageNumber || 1,
          chunkIndex: globalChunkIndex++,
          text: t,
        });
      }
    }
  } else if (doc.extractedText) {
    const textChunks = chunkText(doc.extractedText);
    for (const t of textChunks) {
      chunksToInsert.push({
        userId,
        documentId,
        pageNumber: 1,
        chunkIndex: globalChunkIndex++,
        text: t,
      });
    }
  }

  if (chunksToInsert.length === 0) return [];

  // Generate embeddings for chunks in parallel with graceful failure handling
  await Promise.all(
    chunksToInsert.map(async (item) => {
      try {
        item.embedding = await generateEmbedding(item.text);
      } catch (err) {
        item.embedding = [];
      }
    })
  );

  await DocumentChunk.insertMany(chunksToInsert, { ordered: false }).catch(() => {});
  return DocumentChunk.find({ documentId, userId }).sort({ chunkIndex: 1 });
}

/**
 * Reciprocal Rank Fusion (RRF) combining keyword search and vector similarity
 */
export async function hybridChunkRetrieval({ userId, accessibleDocIds, query, queryEmbedding = null, topK = 6 }) {
  if (!accessibleDocIds || accessibleDocIds.length === 0) return [];

  // 1. Keyword search over accessible document chunks
  let keywordResults = [];
  try {
    keywordResults = await DocumentChunk.find(
      {
        userId,
        documentId: { $in: accessibleDocIds },
        $text: { $search: query },
      },
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(topK * 2);
  } catch (err) {
    // Fallback regex matching meaningful keywords if text index not yet built
    const stopWords = new Set(['what', 'is', 'the', 'and', 'on', 'my', 'in', 'of', 'for', 'to', 'a', 'an', 'please', 'give', 'me', 'show']);
    const meaningful = query
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()));
    const regexPattern = meaningful.length > 0 ? meaningful.slice(0, 5).join('|') : query.slice(0, 15);

    keywordResults = await DocumentChunk.find({
      userId,
      documentId: { $in: accessibleDocIds },
      text: { $regex: regexPattern, $options: 'i' },
    }).limit(topK * 2);
  }

  // 2. Vector search if query embedding provided
  let vectorResults = [];
  if (Array.isArray(queryEmbedding) && queryEmbedding.length === 384) {
    const allChunks = await DocumentChunk.find({
      userId,
      documentId: { $in: accessibleDocIds },
      embedding: { $exists: true, $ne: [] },
    }).limit(60);

    const scored = allChunks.map((chunk) => {
      let dot = 0;
      for (let i = 0; i < 384; i++) {
        dot += (chunk.embedding[i] || 0) * (queryEmbedding[i] || 0);
      }
      return { chunk, sim: dot };
    });

    scored.sort((a, b) => b.sim - a.sim);
    vectorResults = scored.slice(0, topK * 2).map((s) => s.chunk);
  }

  // 3. Compute RRF scores: RRF_score = sum(1 / (k + rank))
  const RRF_K = 60;
  const chunkScores = new Map();

  keywordResults.forEach((item, rank) => {
    const id = item._id.toString();
    const score = 1 / (RRF_K + rank + 1);
    chunkScores.set(id, { chunk: item, score: (chunkScores.get(id)?.score || 0) + score });
  });

  vectorResults.forEach((item, rank) => {
    const id = item._id.toString();
    const score = 1 / (RRF_K + rank + 1);
    chunkScores.set(id, { chunk: item, score: (chunkScores.get(id)?.score || 0) + score });
  });

  // If no scores from search, return latest accessible chunks
  if (chunkScores.size === 0) {
    const fallback = await DocumentChunk.find({
      userId,
      documentId: { $in: accessibleDocIds },
    })
      .sort({ createdAt: -1 })
      .limit(topK);
    return fallback;
  }

  const sorted = Array.from(chunkScores.values()).sort((a, b) => b.score - a.score);
  return sorted.slice(0, topK).map((s) => s.chunk);
}
