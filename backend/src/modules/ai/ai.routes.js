import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { Document } from '../documents/document.model.js';
import { Asset } from '../assets/asset.model.js';
import { answerDocumentQuery } from '../../services/ai/groqService.js';
import { generateEmbedding } from '../../services/ai/huggingFaceService.js';
import { assertAiAllowed, isAiAllowed, PrivacyPolicyViolationError } from '../../services/pipeline/privacyGate.js';

const router = Router();

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Core AI Query Handler
 * Enforces assertAiAllowed before any document context is passed to Groq or Hugging Face
 */
async function handleAiQuery(req, res) {
  try {
    const { question, docId } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, error: 'Question is required' });
    }

    let documents = [];

    if (docId) {
      // Single Document Query: Enforce strict ownership & assertAiAllowed
      const doc = await Document.findOne({ _id: docId, userId: req.user.userId }).select('-fileData');
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      // Hard gatekeeper assertion: Throws 403 if storage_only or sensitive
      assertAiAllowed(doc, 'Single document AI query');
      documents.push(doc);
    } else {
      // Vault-Wide Query: Filter strictly by aiPolicy === 'ai_enabled' and sensitiveFlag === false BEFORE ranking
      const candidates = await Document.find({
        userId: req.user.userId,
        aiPolicy: 'ai_enabled',
        sensitiveFlag: false,
      }).select('-fileData');

      // Double-check with in-memory privacy gate
      documents = candidates.filter(d => isAiAllowed(d));

      // Rank via semantic embeddings if query vector is generated
      if (documents.length > 0) {
        try {
          const queryVector = await generateEmbedding(question);
          if (queryVector && queryVector.length > 0) {
            documents = documents
              .map(d => ({
                doc: d,
                score: d.embedding && d.embedding.length > 0 ? cosineSimilarity(queryVector, d.embedding) : 0,
              }))
              .sort((a, b) => b.score - a.score)
              .map(item => item.doc);
          }
        } catch (err) {
          console.warn('[AI Assistant] Semantic vector search skipped, using candidate docs:', err.message);
        }
      }
    }

    const assets = await Asset.find({ userId: req.user.userId }).catch(() => []);

    // If no AI-enabled documents are available and no assets exist
    if (documents.length === 0 && assets.length === 0) {
      return res.json({
        success: true,
        data: {
          answer: 'I could not find this information in your available documents.',
          confidence: 'low',
          referencedDocIds: [],
          actionItem: null,
        },
      });
    }

    // Verify all candidate docs passed the gate
    for (const d of documents) {
      assertAiAllowed(d, 'RAG prompt construction');
    }

    const rawAnswer = await answerDocumentQuery(question, documents, assets);

    // Format response cleanly for frontend
    const answer = typeof rawAnswer === 'string' ? rawAnswer : (rawAnswer?.answer || JSON.stringify(rawAnswer));
    const referencedDocIds = documents.map(d => d._id);

    res.json({
      success: true,
      data: {
        answer,
        confidence: documents.length > 0 ? 'high' : 'low',
        referencedDocIds,
        actionItem: null,
      },
    });
  } catch (err) {
    if (err instanceof PrivacyPolicyViolationError || err.isPolicyViolation) {
      return res.status(403).json({ success: false, error: err.message });
    }
    console.error('[AI Assistant Query Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/ai/query - Contextual AI Q&A across user vault
router.post('/query', requireAuth, handleAiQuery);

// POST /api/ai/ask - Alias for backward compatibility with PROJECT_REPORT.md
router.post('/ask', requireAuth, handleAiQuery);

export default router;
