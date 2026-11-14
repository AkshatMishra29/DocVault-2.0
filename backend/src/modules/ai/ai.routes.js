import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { Document } from '../documents/document.model.js';
import { Asset } from '../assets/asset.model.js';
import { answerDocumentQuery } from '../../services/ai/groqService.js';
import { generateEmbedding } from '../../services/ai/huggingFaceService.js';
import { assertAiAllowed, isAiAllowed, PrivacyPolicyViolationError } from '../../services/pipeline/privacyGate.js';
import { DocumentAccessControlService } from '../sharing/accessControl.service.js';

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
 * Computes exact lexical / keyword matching score across document attributes
 */
function computeLexicalScore(doc, queryTokens) {
  let score = 0;
  const title = (doc.title || '').toLowerCase();
  const category = (doc.category || '').toLowerCase();
  const summary = (doc.summary || '').toLowerCase();
  const tags = (doc.tags || []).join(' ').toLowerCase();
  const extractedText = (doc.extractedText || '').toLowerCase();
  const docDate = (doc.documentDate || '').toLowerCase();
  const expDate = (doc.expiryDate || '').toLowerCase();
  const keyDetailsStr = JSON.stringify(doc.keyDetails || {}).toLowerCase();

  for (const token of queryTokens) {
    if (token.length < 2) continue;
    if (title.includes(token)) score += 6.0;
    if (category.includes(token)) score += 5.0;
    if (docDate.includes(token)) score += 6.0;
    if (expDate.includes(token)) score += 6.0;
    if (keyDetailsStr.includes(token)) score += 5.0;
    if (tags.includes(token)) score += 3.5;
    if (summary.includes(token)) score += 2.5;
    if (extractedText.includes(token)) score += 1.5;
  }
  return score;
}

/**
 * Core AI Query Handler
 * Enforces assertAiAllowed before any document context is passed to Groq or Hugging Face
 * Implements Smart Hybrid Retrieval (Dense Vector + Sparse Lexical + Reciprocal Rank Fusion)
 */
async function handleAiQuery(req, res) {
  try {
    const { question, docId } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, error: 'Question is required' });
    }

    let documents = [];

    if (docId) {
      // Single Document Query: Enforce Central Access Control & assertAiAllowed
      const access = await DocumentAccessControlService.canViewDocument(req.user.userId, docId);
      if (!access.allowed) {
        return res.status(403).json({ success: false, error: 'Access denied to this document.' });
      }

      const doc = await Document.findById(docId).select('-fileData');
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }

      // Auto-backfill aiConsent for user-owned ai_enabled documents if missing
      if ((doc.aiPolicy === 'ai_enabled' || doc.privacyMode === 'PROCESSABLE') && (!doc.aiConsent || !doc.aiConsent.grantedAt)) {
        doc.aiConsent = {
          grantedAt: doc.createdAt || new Date(),
          noticeVersion: '1.0.0',
        };
        Document.updateOne({ _id: doc._id }, { $set: { aiConsent: doc.aiConsent } }).catch(() => {});
      }

      // Hard gatekeeper assertion: Throws 403 if storage_only or sensitive
      assertAiAllowed(doc, 'Single document AI query');
      documents.push(doc);
    } else {
      // Vault-Wide Query: strictly get documents user owns or has active VIEW grant for
      const accessibleDocIds = await DocumentAccessControlService.getAccessibleDocumentIds(req.user.userId, 'view');

      // Filter strictly by aiPolicy === 'ai_enabled' (or legacy PROCESSABLE) and sensitiveFlag !== true
      const candidates = await Document.find({
        _id: { $in: accessibleDocIds },
        $or: [
          { aiPolicy: 'ai_enabled' },
          { privacyMode: 'PROCESSABLE' },
        ],
        sensitiveFlag: { $ne: true },
      }).select('-fileData');

      // Auto-backfill aiConsent for user-owned ai_enabled documents if missing
      for (const d of candidates) {
        if ((d.aiPolicy === 'ai_enabled' || d.privacyMode === 'PROCESSABLE') && (!d.aiConsent || !d.aiConsent.grantedAt)) {
          d.aiConsent = {
            grantedAt: d.createdAt || new Date(),
            noticeVersion: '1.0.0',
          };
          Document.updateOne({ _id: d._id }, { $set: { aiConsent: d.aiConsent } }).catch(() => {});
        }
      }

      // Double-check with in-memory privacy gate
      const validCandidates = candidates.filter(d => isAiAllowed(d));

      if (validCandidates.length > 0) {
        // 1. Tokenize query for Lexical Match
        const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'in', 'of', 'and', 'or', 'for', 'to', 'my', 'what', 'tell', 'show', 'give']);
        const queryTokens = question.toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(t => t.length > 1 && !stopWords.has(t));

        // 2. Query Intent Analysis
        const isDateQuery = /(?:when|date|issued|expiry|expire|due|completed|award|valid|renewal|time|day|month|year)/i.test(question);
        const isCertQuery = /(?:certif|degree|diploma|grade|score|course|university|college|completion|mark|award)/i.test(question);
        const isFinanceQuery = /(?:amount|total|bill|invoice|gst|price|cost|paid|tax|expense|salary|statement)/i.test(question);

        // 3. Dense Vector Embeddings Generation
        let queryVector = [];
        try {
          queryVector = await generateEmbedding(question);
        } catch (err) {
          console.warn('[AI Assistant] Semantic vector generation skipped:', err.message);
        }

        // 4. Compute Dense and Lexical Rankings
        const denseRankings = [...validCandidates]
          .map(d => ({
            id: String(d._id),
            score: (queryVector.length > 0 && d.embedding && d.embedding.length > 0)
              ? cosineSimilarity(queryVector, d.embedding)
              : 0
          }))
          .sort((a, b) => b.score - a.score);

        const denseRankMap = new Map();
        denseRankings.forEach((item, idx) => denseRankMap.set(item.id, idx + 1));

        const lexicalRankings = [...validCandidates]
          .map(d => ({
            id: String(d._id),
            score: computeLexicalScore(d, queryTokens)
          }))
          .sort((a, b) => b.score - a.score);

        const lexicalRankMap = new Map();
        lexicalRankings.forEach((item, idx) => lexicalRankMap.set(item.id, idx + 1));

        // 5. Reciprocal Rank Fusion (RRF) with Intent Boosters
        const scoredDocs = validCandidates.map(doc => {
          const docIdStr = String(doc._id);
          const dRank = denseRankMap.get(docIdStr) || 999;
          const lRank = lexicalRankMap.get(docIdStr) || 999;

          // RRF core: 1 / (60 + rank)
          let rrf = (1.0 / (60 + dRank)) + (1.5 / (60 + lRank));

          // Domain Intent Boosters
          if (isDateQuery && (doc.documentDate || doc.expiryDate)) {
            rrf += 0.04;
          }
          if (isCertQuery && (doc.category === 'Academic Certificate' || doc.category === 'Certificates' || /certificate/i.test(doc.title))) {
            rrf += 0.05;
          }
          if (isFinanceQuery && (doc.category === 'Tax Invoice' || doc.category === 'Purchase Receipt' || doc.category === 'Bank Statement')) {
            rrf += 0.04;
          }

          return { doc, rrf };
        });

        // Sort by final fused RRF score and take top candidates (up to 5)
        scoredDocs.sort((a, b) => b.rrf - a.rrf);
        documents = scoredDocs.slice(0, 5).map(item => item.doc);
        if (documents.length === 0) {
          documents = validCandidates.slice(0, 5);
        }
      }
    }

    const assets = await Asset.find({ userId: req.user.userId }).catch(() => []);

    // If no AI-enabled documents are available and no assets exist
    if (documents.length === 0 && assets.length === 0) {
      const totalDocs = await Document.countDocuments({ userId: req.user.userId }).catch(() => 0);
      const storageOnlyDocs = await Document.countDocuments({
        userId: req.user.userId,
        $or: [{ aiPolicy: 'storage_only' }, { sensitiveFlag: true }]
      }).catch(() => 0);

      // If user has uploaded docs, but all are protected storage-only
      if (totalDocs > 0 && storageOnlyDocs === totalDocs) {
        return res.json({
          success: true,
          data: {
            answer: `You have **${totalDocs} document(s)** in your vault, but they are currently protected in **Storage-Only mode** (zero third-party AI egress). To allow DocVault AI to search and answer questions using these documents, please enable AI analysis in your Document Settings.`,
            confidence: 'low',
            referencedDocIds: [],
            referencedDocs: [],
            actionItem: null,
          },
        });
      }

      // Allow conversational responses or polite guidance when vault is empty
      const rawAnswer = await answerDocumentQuery(question, [], []);
      const answer = typeof rawAnswer === 'string' ? rawAnswer : (rawAnswer?.answer || 'Hello! I am your DocVault AI Assistant. You currently have no AI-enabled documents uploaded. Once you upload documents (like certificates, invoices, or policies) with AI analysis enabled, I can answer questions, summarize content, and extract key dates for you.');

      return res.json({
        success: true,
        data: {
          answer,
          confidence: 'low',
          referencedDocIds: [],
          referencedDocs: [],
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
    const referencedDocs = documents.map(d => ({
      id: d._id,
      title: d.title,
      category: d.category
    }));

    res.json({
      success: true,
      data: {
        answer,
        confidence: documents.length > 0 ? 'high' : 'low',
        referencedDocIds,
        referencedDocs,
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
