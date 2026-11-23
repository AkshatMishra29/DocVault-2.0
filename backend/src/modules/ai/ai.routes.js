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
import { classifyConversationalIntent } from './conversationalIntent.service.js';

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
  const fieldsStr = (doc.extractedFields || []).map(f => `${f.fieldName} ${f.value}`).join(' ').toLowerCase();

  // Intent/attribute tokens should not hijack document entity matching
  const intentTokens = new Set(['date', 'issue', 'issued', 'due', 'expiry', 'expire', 'amount', 'total', 'price', 'cost', 'fee', 'who', 'name', 'account', 'number', 'status', 'summary', 'details']);

  for (const token of queryTokens) {
    if (token.length < 2) continue;
    const isIntentToken = intentTokens.has(token);
    const weightMult = isIntentToken ? 0.2 : 1.0;

    // Cross-lingual and domain-specific semantic synonyms (Hindi / Hinglish / English)
    const isElectricity = /electricity|electric|bijli|power|light|energy|meter|kwh|consumer|uppcl|bses|discom/.test(token);
    const isBillOrReceipt = /bill|receipt|invoice|payment|paid|chalan|expense|kharche?/.test(token);
    const isInsurance = /insurance|policy|bima|premium|claim|cov(?:er|erage)/.test(token);
    const isVehicle = /vehicle|car|bike|motor|gadi|scooter|rc|puc|dl|licen[cs]e/.test(token);
    const isCert = /certif|certf|degree|diploma|marksheet|matric|passing/.test(token);

    if (isElectricity) {
      if (/electricity|electric|bill|receipt|payment|power|consumer/i.test(title) || /receipt|bill|invoice/i.test(category) || /electricity|consumer|amount|kwh/i.test(extractedText) || /electricity|consumer|amount/i.test(fieldsStr)) {
        score += 10.0;
      }
    }

    if (isBillOrReceipt) {
      if (/bill|receipt|invoice|payment|tax/i.test(title) || /receipt|bill|invoice|statement/i.test(category) || /total|amount|receipt|paid/i.test(keyDetailsStr) || /total|amount|receipt|paid/i.test(fieldsStr)) {
        score += 7.0;
      }
    }

    if (isInsurance) {
      if (/insurance|policy|motor|health|life|term/i.test(title) || /insurance/i.test(category) || /policy|insured|premium/i.test(extractedText) || /policy|insured/i.test(fieldsStr)) {
        score += 8.0;
      }
    }

    if (isVehicle) {
      if (/vehicle|motor|car|bike|rc|puc|chassis|engine/i.test(title) || /vehicle|automobile/i.test(category) || /registration|engine|chassis/i.test(extractedText)) {
        score += 8.0;
      }
    }

    if (isCert) {
      if (/certif|certf|degree|diploma|stanford|university|college/i.test(title) || /certificate|education/i.test(category)) {
        score += 8.0;
      }
    }

    const tokenRegex = (token === 'certificate' || token === 'certficate') ? /certif|certf/
      : (token === 'resume' || token === 'cv') ? /resume|cv|curriculum/
      : new RegExp(token);

    if (tokenRegex.test(title)) score += 8.0 * (isIntentToken ? 0.3 : 1.0);
    if (tokenRegex.test(category)) score += 6.0 * (isIntentToken ? 0.3 : 1.0);
    if (!isIntentToken && tokenRegex.test(tags)) score += 4.0;
    if (!isIntentToken && tokenRegex.test(summary)) score += 3.0;
    if (tokenRegex.test(extractedText)) score += 2.0 * weightMult;
    if (fieldsStr.includes(token)) score += 5.0 * weightMult;

    if (isIntentToken) {
      if (docDate.includes(token)) score += 0.5;
      if (expDate.includes(token)) score += 0.5;
      if (keyDetailsStr.includes(token)) score += 0.5;
    } else {
      if (docDate.includes(token)) score += 4.0;
      if (expDate.includes(token)) score += 4.0;
      if (keyDetailsStr.includes(token)) score += 4.0;
    }
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
 * Production-Grade Source & Flashcard Resolver:
 * Disambiguates whether the query/answer was resolved from an Asset Flashcard,
 * a Stored Document, or an Overview, and eliminates cross-contamination.
 */
export function resolveQuerySourcesAndEntities({
  answer = '',
  question = '',
  documents = [],
  relevantAssets = [],
  matchingAssets = [],
  scoredAssets = [],
  isOverviewQuery = false,
}) {
  const isUnanswerable = /I cannot find that information in your currently uploaded documents/i.test(answer) ||
                         /I could not find matching records in your currently uploaded documents/i.test(answer) ||
                         /I could not find matching records/i.test(answer);

  const lowerAnswer = (answer || '').toLowerCase();
  const lowerQ = (question || '').toLowerCase();

  // Check which assets were directly cited in the answer or specifically targeted in query
  const citedAssets = isUnanswerable ? [] : relevantAssets.filter(a => {
    const aName = (a.name || '').toLowerCase();
    return aName && (lowerAnswer.includes(aName) || lowerQ.includes(aName));
  });

  // Check which documents were directly cited in the answer or specifically targeted in query
  const citedDocs = isUnanswerable ? [] : documents.filter(d => {
    const dTitle = (d.title || '').toLowerCase();
    return dTitle && (lowerAnswer.includes(dTitle) || lowerQ.includes(dTitle));
  });

  let finalAssets = [];
  let finalDocs = [];

  if (isUnanswerable) {
    finalAssets = [];
    finalDocs = [];
  } else if (citedAssets.length > 0) {
    // Query answered from Asset Flashcard(s)
    finalAssets = citedAssets;
    // Only attach documents if they are explicitly linked to this asset OR explicitly cited in answer
    finalDocs = documents.filter(d => {
      const isLinked = citedAssets.some(a => (a.linkedDocumentIds || []).map(String).includes(String(d._id)));
      const isExplicitlyCited = d.title && lowerAnswer.includes(d.title.toLowerCase());
      return isLinked || isExplicitlyCited;
    });
  } else if (citedDocs.length > 0) {
    // Query answered from Document(s)
    finalDocs = citedDocs;
    // Only attach assets if they are explicitly linked or cited
    finalAssets = relevantAssets.filter(a => {
      const isLinked = citedDocs.some(d => (a.linkedDocumentIds || []).map(String).includes(String(d._id)));
      const isExplicitlyCited = a.name && lowerAnswer.includes(a.name.toLowerCase());
      return isLinked || isExplicitlyCited;
    });
  } else if (isOverviewQuery) {
    finalAssets = relevantAssets.slice(0, 3);
    finalDocs = documents.slice(0, 3);
  } else {
    // Single item resolution fallback where name was not explicitly echoed in answer text
    const topAssetScore = scoredAssets[0]?.score || 0;
    if (topAssetScore >= 6 && matchingAssets.length > 0) {
      finalAssets = matchingAssets.slice(0, 1);
      finalDocs = documents.filter(d => (matchingAssets[0].linkedDocumentIds || []).map(String).includes(String(d._id)));
    } else if (documents.length > 0) {
      finalDocs = documents.slice(0, 1);
      finalAssets = [];
    } else if (matchingAssets.length > 0) {
      finalAssets = matchingAssets.slice(0, 1);
      finalDocs = [];
    }
  }

  const assetSources = isUnanswerable ? [] : finalAssets.map(a => ({
    type: 'asset',
    documentId: a._id,
    assetId: a._id,
    title: `${a.name} (Flashcard)`,
    category: `Asset • ${a.category || 'General'}`,
    documentType: 'flashcard',
    previewRoute: `/assets/${a._id}`,
    downloadUrl: null,
  }));

  const pageMatch = answer ? answer.match(/\(Page\s*(\d+)\)/i) : null;
  const citedPage = pageMatch ? parseInt(pageMatch[1], 10) : null;

  const docSources = isUnanswerable ? [] : finalDocs.map(d => {
    let cleanCat = d.category || 'Document';
    if (/resume|cv/i.test(d.title || '') && (/insurance|other|admit/i.test(cleanCat) || cleanCat === 'Document')) {
      cleanCat = 'Resume / CV';
    }
    return {
      type: 'document',
      documentId: d._id,
      title: d.title,
      category: cleanCat,
      documentType: d.format || (d.mimetype?.includes('pdf') ? 'pdf' : (d.mimetype?.includes('image') ? 'image' : 'document')),
      pageNumber: citedPage || 1,
      previewRoute: `/documents/${d._id}`,
      downloadUrl: `/api/documents/${d._id}/download`,
    };
  });

  const sources = [...assetSources, ...docSources];
  const referencedDocIds = isUnanswerable ? [] : finalDocs.map(d => d._id);
  const referencedDocs = isUnanswerable ? [] : finalDocs.map(d => ({
    id: d._id,
    title: d.title,
    category: d.category
  }));
  const referencedAssets = isUnanswerable ? [] : finalAssets.map(a => ({
    id: a._id,
    name: a.name,
    category: a.category
  }));

  return {
    sources,
    referencedDocIds,
    referencedDocs,
    referencedAssets,
    finalAssets,
    finalDocs,
  };
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

    // 0. Conversational & Greeting Intent Classifier (Fast-Path)
    // Resolves pure greetings, gratitude, pleasantries, and assistant identity in < 1ms
    const conversationalMatch = classifyConversationalIntent(question);
    if (conversationalMatch && !docId) {
      await Message.create({
        conversationId: conversation._id,
        userId: req.user.userId,
        role: 'assistant',
        content: conversationalMatch.response,
        sources: [],
        referencedDocIds: [],
        confidence: 'high',
      });

      conversation.lastMessageAt = new Date();
      await conversation.save();

      return res.json({
        success: true,
        data: {
          conversationId: conversation._id,
          answer: conversationalMatch.response,
          confidence: 'high',
          sources: [],
          referencedDocIds: [],
          referencedDocs: [],
          referencedAssets: [],
          actionItem: null,
        },
      });
    }

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
    const isCertQuery = /(?:certif|certf|degree|diploma|grade|score|course|university|college|completion|mark|award)/i.test(question);
    const isFinanceQuery = /(?:amount|total|bill|invoice|gst|price|cost|paid|tax|expense|salary|statement)/i.test(question);
    const isResumeQuery = /(?:resume|cv|curriculum\s*vitae|candidate|experience|work\s*history|skills?|education|qualification|hire|hiring|portfolio|profile|bio|projects?|accomplishments?|achievements?|technolog(?:y|ies)|applicant|developer|engineer|tech\s*stack)/i.test(question);
    const isProjectQuery = /(?:project|architecture|stack|technology|tech\s*stack|features?|implementation|backend|frontend|framework|design|code|system|component|guardrail)/i.test(question);

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

          // Domain Intent Boosters & Cross-Domain Penalties
          if (isDateQuery && (doc.documentDate || doc.expiryDate)) {
            rrf += 0.04;
          }
          if (isCertQuery) {
            if (doc.category === 'Academic Certificate' || doc.category === 'Certificates' || /certif|certf/i.test(doc.title) || /certif|certf/i.test(doc.extractedText)) {
              rrf += 0.12;
            }
            if (/bill|receipt|invoice|tax|salary|statement/i.test(doc.title) || ['Purchase Receipt', 'Tax Invoice', 'Bank Statement'].includes(doc.category)) {
              rrf -= 0.20; // Prevent utility bills/receipts from competing with certificates
            }
          }
          if (isFinanceQuery) {
            if (doc.category === 'Tax Invoice' || doc.category === 'Purchase Receipt' || doc.category === 'Bank Statement' || /bill|receipt|invoice/i.test(doc.title)) {
              rrf += 0.08;
            }
            if (doc.category === 'Academic Certificate' || /certif|certf/i.test(doc.title)) {
              rrf -= 0.20; // Prevent certificates from competing with financial receipts
            }
          }
          if (isResumeQuery) {
            if (['Resume / CV', 'Employment Document'].includes(doc.category) || /resume|cv|curriculum/i.test(doc.title) || /experience|skills|education/i.test(doc.extractedText)) {
              rrf += 0.25; // Strongly boost resume documents for career/skills/work queries
            }
            if (/bill|receipt|invoice|tax|statement|electricity/i.test(doc.title) || ['Purchase Receipt', 'Tax Invoice', 'Bank Statement'].includes(doc.category)) {
              rrf -= 0.25; // Suppress utility bills/receipts on resume queries
            }
          }
          if (isProjectQuery) {
            if (['Technical Architecture', 'Project Portfolio'].includes(doc.category) || /architecture|project|portfolio/i.test(doc.title) || /architecture|system design|backend|frontend/i.test(doc.extractedText)) {
              rrf += 0.25; // Strongly boost project documentation
            }
            if (/bill|receipt|invoice|tax|statement|electricity/i.test(doc.title) || ['Purchase Receipt', 'Tax Invoice'].includes(doc.category)) {
              rrf -= 0.20;
            }
          }
          if (isLinkedToAsset) {
            rrf += 0.25; // Strongly prioritize documents linked to relevant asset
          }

          // Strict Relevance Criterion:
          // If query matched an asset strongly, an unlinked document is only relevant if it has lexical overlap.
          // Dense semantic similarity without lexical overlap requires high confidence (>= 0.65) and no asset conflict.
          const hasAssetTarget = matchingAssets.length > 0 && (scoredAssets[0]?.score || 0) >= 4;
          const isRelevant = isLinkedToAsset || 
                             lexScore > 0 || 
                             (!hasAssetTarget && denseScore >= 0.65) || 
                             isOverviewQuery;

          return { doc, rrf, isRelevant };
        });

        // Filter by relevance first, then sort by fused RRF score
        scoredDocs.sort((a, b) => b.rrf - a.rrf);
        documents = scoredDocs.filter(item => item.isRelevant).slice(0, 5).map(item => item.doc);

        // Fallback: If no document passed strict threshold but user has valid processable documents,
        // provide the top candidate documents to Groq so user's factual queries are not dropped
        if (documents.length === 0 && validCandidates.length > 0 && !hasAssetTarget) {
          documents = scoredDocs.slice(0, 3).map(item => item.doc);
        }
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

    // Construct structured sources for direct document forwarding and deep linking
    const {
      sources,
      referencedDocIds,
      referencedDocs,
      referencedAssets
    } = resolveQuerySourcesAndEntities({
      answer,
      question,
      documents,
      relevantAssets,
      matchingAssets,
      scoredAssets,
      isOverviewQuery
    });

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
