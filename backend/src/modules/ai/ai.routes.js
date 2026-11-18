import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { Document } from '../documents/document.model.js';
import { Asset } from '../assets/asset.model.js';
import { Conversation } from './models/conversation.model.js';
import { Message } from './models/message.model.js';
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
 * Computes exact lexical / keyword matching score across tracked asset attributes & flashcard custom fields
 */
function computeAssetScore(asset, queryTokens) {
  let score = 0;
  const name = (asset.name || '').toLowerCase();
  const category = (asset.category || '').toLowerCase();
  const desc = (asset.description || '').toLowerCase();
  const notes = (asset.notes || '').toLowerCase();
  const tags = (asset.tags || []).join(' ').toLowerCase();
  const customFieldsStr = (asset.customFields || []).map(f => `${f.label} ${f.value}`).join(' ').toLowerCase();
  const metadataStr = JSON.stringify(asset.metadata || {}).toLowerCase();

  for (const token of queryTokens) {
    if (token.length < 2) continue;
    if (name.includes(token)) score += 8.0;
    if (category.includes(token)) score += 4.0;
    if (customFieldsStr.includes(token)) score += 6.0;
    if (tags.includes(token)) score += 4.0;
    if (desc.includes(token)) score += 4.0;
    if (metadataStr.includes(token)) score += 3.0;
    if (notes.includes(token)) score += 2.0;
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
    const { question, docId, conversationId } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, error: 'Question is required' });
    }

    // Resolve or automatically provision user conversation
    let conversation = null;
    if (conversationId) {
      conversation = await Conversation.findOne({ _id: conversationId, userId: req.user.userId });
    }
    if (!conversation) {
      const cleanTitle = question.replace(/[\n\r]+/g, ' ').trim().slice(0, 50);
      conversation = await Conversation.create({
        userId: req.user.userId,
        title: cleanTitle.length > 0 ? (cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1)) : 'New Conversation',
      });
    }

    // Save user message to persistent history
    await Message.create({
      conversationId: conversation._id,
      userId: req.user.userId,
      role: 'user',
      content: question,
    });

    // 1. Tokenize query for Lexical & Asset Matching
    const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'in', 'of', 'and', 'or', 'for', 'to', 'my', 'what', 'tell', 'show', 'give', 'me', 'about', 'this', 'that', 'with', 'from', 'have', 'i', 'as', 'created', 'flash', 'card', 'flashcard']);
    const queryTokens = question.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1 && !stopWords.has(t));

    // 2. Query Intent Analysis
    const isOverviewQuery = /(?:all|every|overview|summarize|summary|inventory|list|what\s*(?:do\s*i\s*have|are\s*my\s*documents|documents\s*do\s*i\s*have|assets\s*do\s*i\s*have|is\s*in\s*my\s*vault)|fetch\s*(?:the\s*)?document|get\s*(?:the\s*)?document|show\s*(?:the\s*)?document|open\s*(?:the\s*)?document)/i.test(question);
    const isFlashcardQuery = /(?:flash\s*card|flashcard|asset|device|laptop|macbook|hardware|appliance|vehicle)/i.test(question);
    const isDateQuery = /(?:when|date|issued|expiry|expire|due|completed|award|valid|renewal|time|day|month|year)/i.test(question);
    const isCertQuery = /(?:certif|degree|diploma|grade|score|course|university|college|completion|mark|award)/i.test(question);
    const isFinanceQuery = /(?:amount|total|bill|invoice|gst|price|cost|paid|tax|expense|salary|statement)/i.test(question);

    // 3. Retrieve and Score User Assets / Flashcards
    const allAssets = await Asset.find({ userId: req.user.userId }).lean().catch(() => []);
    const scoredAssets = allAssets.map(a => ({
      asset: a,
      score: computeAssetScore(a, queryTokens) + (isFlashcardQuery ? 4.0 : 0)
    })).sort((a, b) => b.score - a.score);

    const matchingAssets = scoredAssets.filter(item => item.score > 0).map(item => item.asset);
    const relevantAssets = matchingAssets.length > 0 ? matchingAssets : (isOverviewQuery ? allAssets : []);

    // Set of document IDs linked to matching assets
    const assetLinkedDocIds = new Set(
      relevantAssets.flatMap(a => (a.linkedDocumentIds || []).map(id => String(id)))
    );

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

      if (doc.status === 'REJECTED' || doc.reviewStatus === 'rejected' || doc.reject_reason) {
        return res.status(400).json({ success: false, error: 'Cannot query a document that was rejected during validation.' });
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
      // Exclude REJECTED, non-documents, or failed processing documents
      const candidates = await Document.find({
        _id: { $in: accessibleDocIds },
        $or: [
          { aiPolicy: 'ai_enabled' },
          { privacyMode: 'PROCESSABLE' },
        ],
        sensitiveFlag: { $ne: true },
        status: { $nin: ['REJECTED', 'failed', 'rejected'] },
        processingStatus: { $nin: ['failed', 'needs_retake'] },
        reviewStatus: { $ne: 'rejected' },
        reject_reason: null,
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

      // Double-check with in-memory privacy gate and non-document filter
      const validCandidates = candidates.filter(d => {
        if (!isAiAllowed(d)) return false;
        if (d.status === 'REJECTED' || d.status === 'failed' || d.reviewStatus === 'rejected') return false;
        if (d.reject_reason) return false;
        if (/synthetic landscape|non-document/i.test(d.title || '') || /synthetic landscape/i.test(d.extractedText || '')) return false;
        return true;
      });

      if (validCandidates.length > 0) {
        // Dense Vector Embeddings Generation
        let queryVector = [];
        try {
          queryVector = await generateEmbedding(question);
        } catch (err) {
          console.warn('[AI Assistant] Semantic vector generation skipped:', err.message);
        }

        // Compute Dense and Lexical Rankings
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

        // Reciprocal Rank Fusion (RRF) with Intent Boosters & Strict Relevance Gate
        const scoredDocs = validCandidates.map(doc => {
          const docIdStr = String(doc._id);
          const dRank = denseRankMap.get(docIdStr) || 999;
          const lRank = lexicalRankMap.get(docIdStr) || 999;
          const lexScore = lexicalRankings.find(r => r.id === docIdStr)?.score || 0;
          const denseScore = denseRankings.find(r => r.id === docIdStr)?.score || 0;
          const isLinkedToAsset = assetLinkedDocIds.has(docIdStr);

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
          if (isLinkedToAsset) {
            rrf += 0.25; // Strongly prioritize documents linked to relevant asset
          }

          // Strict Relevance Criterion:
          // A document is only relevant if it has lexical overlap, high semantic similarity,
          // is linked to a matching asset, or the query is an overview query.
          const isRelevant = isLinkedToAsset || lexScore > 0 || denseScore >= 0.48 || isOverviewQuery;

          return { doc, rrf, isRelevant };
        });

        // Filter by relevance first, then sort by fused RRF score
        scoredDocs.sort((a, b) => b.rrf - a.rrf);
        documents = scoredDocs.filter(item => item.isRelevant).slice(0, 5).map(item => item.doc);
      }
    }

    // If no AI-enabled documents are relevant AND no relevant assets exist
    if (documents.length === 0 && relevantAssets.length === 0) {
      const totalDocs = await Document.countDocuments({ userId: req.user.userId }).catch(() => 0);
      const storageOnlyDocs = await Document.countDocuments({
        userId: req.user.userId,
        $or: [{ aiPolicy: 'storage_only' }, { sensitiveFlag: true }]
      }).catch(() => 0);

      let answer = '';
      if (totalDocs > 0 && storageOnlyDocs === totalDocs && allAssets.length === 0) {
        answer = `You have **${totalDocs} document(s)** in your vault, but they are currently protected in **Storage-Only mode** (zero third-party AI egress). To allow DocVault AI to search and answer questions using these documents, please enable AI analysis in your Document Settings.`;
      } else if (totalDocs === 0 && allAssets.length === 0) {
        answer = 'Hello! I am your DocVault AI Assistant. You currently have no documents or tracked assets in your vault. Once you upload documents (like certificates, invoices, or policies) or create asset flashcards, I can answer questions, summarize content, and extract key details for you.';
      } else {
        answer = `I could not find matching records for "${question}" in your currently uploaded documents or tracked assets.\n\nTip: You can ask questions about your stored documents (such as invoices, bills, certificates, or policies) or your tracked assets and flashcards.`;
      }

      await Message.create({
        conversationId: conversation._id,
        userId: req.user.userId,
        role: 'assistant',
        content: answer,
        sources: [],
        referencedDocIds: [],
        confidence: 'low',
      });

      conversation.lastMessageAt = new Date();
      await conversation.save();

      return res.json({
        success: true,
        data: {
          conversationId: conversation._id,
          answer,
          confidence: 'low',
          sources: [],
          referencedDocIds: [],
          referencedDocs: [],
          referencedAssets: [],
          actionItem: null,
        },
      });
    }

    // Verify all candidate docs passed the gate
    for (const d of documents) {
      assertAiAllowed(d, 'RAG prompt construction');
    }

    const rawAnswer = await answerDocumentQuery(question, documents, relevantAssets);

    // Format response cleanly for frontend
    const answer = typeof rawAnswer === 'string' ? rawAnswer : (rawAnswer?.answer || JSON.stringify(rawAnswer));

    // Construct structured sources for deep linking (both Assets and Documents!)
    const isUnanswerable = /I cannot find that information in your currently uploaded documents/i.test(answer) ||
                           /I could not find matching records in your currently uploaded documents/i.test(answer);
    
    const assetSources = isUnanswerable ? [] : relevantAssets.slice(0, 3).map(a => ({
      type: 'asset',
      documentId: a._id,
      assetId: a._id,
      title: `${a.name} (Flashcard)`,
      category: `Asset • ${a.category || 'General'}`,
      documentType: 'flashcard',
      previewRoute: `/assets/${a._id}`,
      downloadUrl: null,
    }));

    const docSources = isUnanswerable ? [] : documents.map(d => ({
      type: 'document',
      documentId: d._id,
      title: d.title,
      category: d.category || 'Document',
      documentType: d.format || (d.mimetype?.includes('pdf') ? 'pdf' : (d.mimetype?.includes('image') ? 'image' : 'document')),
      pageNumber: d.pageCount || 1,
      previewRoute: `/documents/${d._id}`,
      downloadUrl: `/api/documents/${d._id}/download`,
    }));

    const sources = [...assetSources, ...docSources];
    const referencedDocIds = isUnanswerable ? [] : documents.map(d => d._id);
    const referencedDocs = isUnanswerable ? [] : documents.map(d => ({
      id: d._id,
      title: d.title,
      category: d.category
    }));
    const referencedAssets = isUnanswerable ? [] : relevantAssets.map(a => ({
      id: a._id,
      name: a.name,
      category: a.category
    }));

    // Persist Assistant Message
    await Message.create({
      conversationId: conversation._id,
      userId: req.user.userId,
      role: 'assistant',
      content: answer,
      sources,
      referencedDocIds,
      confidence: sources.length > 0 ? 'high' : 'low',
    });

    conversation.lastMessageAt = new Date();
    if (conversation.title === 'New Conversation') {
      const cleanTitle = question.replace(/[\n\r]+/g, ' ').trim().slice(0, 50);
      if (cleanTitle) {
        conversation.title = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
      }
    }
    await conversation.save();

    res.json({
      success: true,
      data: {
        conversationId: conversation._id,
        answer,
        confidence: sources.length > 0 ? 'high' : 'low',
        sources,
        referencedDocIds,
        referencedDocs,
        referencedAssets,
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

// ============================================================================
// CONVERSATION HISTORY & PERSISTENCE APIS
// ============================================================================

// GET /api/ai/conversations - List authenticated user's conversations
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const conversations = await Conversation.find({ userId: req.user.userId })
      .sort({ lastMessageAt: -1 })
      .limit(60);

    res.json({
      success: true,
      count: conversations.length,
      data: conversations,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/conversations - Initialize a clean new conversation
router.post('/conversations', requireAuth, async (req, res) => {
  try {
    const title = (req.body.title || 'New Conversation').trim().slice(0, 80);
    const conversation = await Conversation.create({
      userId: req.user.userId,
      title: title || 'New Conversation',
      lastMessageAt: new Date(),
    });

    res.status(201).json({ success: true, data: conversation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/ai/conversations/:id - Retrieve conversation and its chronological message history
router.get('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const messages = await Message.find({
      conversationId: conversation._id,
      userId: req.user.userId,
    }).sort({ createdAt: 1 });

    res.json({
      success: true,
      data: {
        conversation,
        messages,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/ai/conversations/:id - Rename conversation title
router.patch('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    const cleanTitle = title.trim().slice(0, 100);
    const conversation = await Conversation.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { $set: { title: cleanTitle, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    res.json({ success: true, data: conversation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/ai/conversations/:id - Delete conversation and its messages
router.delete('/conversations/:id', requireAuth, async (req, res) => {
  try {
    const conversation = await Conversation.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    await Message.deleteMany({ conversationId: conversation._id });

    res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/ai/query - Contextual AI Q&A across user vault
router.post('/query', requireAuth, handleAiQuery);

// POST /api/ai/ask - Alias for backward compatibility with PROJECT_REPORT.md
router.post('/ask', requireAuth, handleAiQuery);

export default router;
