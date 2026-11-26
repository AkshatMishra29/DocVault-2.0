import { z } from 'zod';
import { Document, Asset, Deadline, UserConnection, DocumentShare, User } from '../../../models/index.js';
import { StudyDeck } from '../models/studyDeck.model.js';
import { DocumentAccessControlService } from '../../sharing/accessControl.service.js';
import { isAiAllowed, assertAiAllowed } from '../../../services/pipeline/privacyGate.js';
import { generateEmbedding } from '../../../services/ai/huggingFaceService.js';
import { ensureDocumentChunks, hybridChunkRetrieval } from '../services/chunking.service.js';
import { invalidateUserProfile } from '../services/userProfile.service.js';

export const toolRegistry = new Map();

/**
 * Register a tool
 */
export function registerTool(toolDef) {
  toolRegistry.set(toolDef.name, toolDef);
}

/* ==========================================================================
   READ TOOLS
   ========================================================================== */

/**
 * 1. search_documents
 */
registerTool({
  name: 'search_documents',
  description: 'Search personal and accessible documents by title, keyword, category, or semantic query.',
  kind: 'read',
  schema: z.object({
    query: z.string().optional().default('').describe('Search terms or semantic query (leave empty to list recent documents)'),
    category: z.string().optional().describe('Filter by category e.g. Tax Invoice, Identity, Medical, Insurance'),
    limit: z.coerce.number().optional().default(5).describe('Max results to return'),
  }),
  summarize: (args) => args.query ? `Searching documents for "${args.query}"` : 'Listing recent documents',
  async run(ctx, args) {
    const accessibleIds = await DocumentAccessControlService.getAccessibleDocumentIds(ctx.userId, 'view');
    const unfilteredBase = {
      _id: { $in: accessibleIds },
      aiPolicy: 'ai_enabled',
      sensitiveFlag: { $ne: true },
    };

    const baseFilter = { ...unfilteredBase };
    if (args.category) {
      baseFilter.category = { $regex: args.category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim(), $options: 'i' };
    }

    const isGenericQuery = !args.query || /^(?:all|recent|latest|documents?|my\s+documents?|recent\s+documents?|latest\s+documents?|vault)$/i.test(args.query.trim());

    const buildQueryFilter = (base, queryStr) => {
      const f = { ...base };
      if (!isGenericQuery && queryStr) {
        const words = queryStr
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .map((w) => w.trim())
          .filter((w) => w.length > 2 && !['the', 'and', 'for', 'my', 'document', 'documents', 'file', 'files', 'show', 'give', 'find', 'search'].includes(w.toLowerCase()));
        const pattern = words.length > 0 ? words.join('|') : queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
        if (pattern) {
          f.$or = [
            { title: { $regex: pattern, $options: 'i' } },
            { category: { $regex: pattern, $options: 'i' } },
            { 'extractedFields.value': { $regex: pattern, $options: 'i' } },
            { summary: { $regex: pattern, $options: 'i' } },
            { extractedText: { $regex: pattern, $options: 'i' } },
          ];
        }
      }
      return f;
    };

    // 1. Fetch candidate docs matching category + query (or all categories if category guess misses)
    const selectFields = '_id title category summary tags expiryDate extractedFields extractedText createdAt';
    let candidates = await Document.find(buildQueryFilter(baseFilter, args.query))
      .select(selectFields)
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();

    if (candidates.length === 0 && args.category) {
      candidates = await Document.find(buildQueryFilter(unfilteredBase, args.query))
        .select(selectFields)
        .sort({ createdAt: -1 })
        .limit(15)
        .lean();
    }

    // Score & rank candidates by relevance so unrelated docs don't pollute Verified Sources
    let docs = candidates;
    if (!isGenericQuery && args.query && candidates.length > 1) {
      const cleanQuery = args.query.trim().toLowerCase();
      const stopWords = new Set(['the', 'and', 'for', 'my', 'document', 'documents', 'file', 'files', 'show', 'give', 'find', 'search', 'new', 'updated']);
      const queryWords = cleanQuery
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w));

      const scored = candidates.map((d) => {
        const titleLower = (d.title || '').toLowerCase();
        const catLower = (d.category || '').toLowerCase();
        const sumLower = (d.summary || '').toLowerCase();
        const textLower = (d.extractedText || '').toLowerCase();

        let score = 0;
        if (titleLower.includes(cleanQuery)) score += 100;
        for (const w of queryWords) {
          if (titleLower.includes(w)) score += 25;
          if (catLower.includes(w) || sumLower.includes(w)) score += 8;
          if (textLower.includes(w)) score += 4;
        }
        return { doc: d, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const topScore = scored[0]?.score || 0;
      const threshold = topScore >= 25 ? topScore * 0.45 : 1;
      docs = scored
        .filter((s) => s.score >= threshold)
        .slice(0, args.limit || 3)
        .map((s) => s.doc);
    } else {
      docs = candidates.slice(0, args.limit || 5);
    }

    return {
      count: docs.length,
      documents: docs.map((d, idx) => ({
        id: d._id.toString(),
        title: d.title,
        category: d.category,
        summary: d.summary || 'No summary available',
        expiryDate: d.expiryDate,
        tags: d.tags || [],
        extractedFields: (d.extractedFields || []).map((f) => ({ label: f.label || f.fieldName, value: f.value })),
        evidence: idx < 2 && d.extractedText ? d.extractedText.slice(0, 1000) : undefined,
      })),
      sources: docs.map((d) => ({
        documentId: d._id.toString(),
        title: d.title,
        category: d.category || 'Document',
        page: 1,
        pageNumber: 1,
        previewRoute: `/documents/${d._id.toString()}`,
      })),
    };
  },
});

/**
 * 2. ask_documents
 */
registerTool({
  name: 'ask_documents',
  description: 'Retrieve grounded excerpts and answers from documents with exact page numbers.',
  kind: 'read',
  schema: z.object({
    question: z.string().describe('The user question to ground against documents'),
    documentId: z.string().optional().describe('Optional specific document ID to target'),
  }),
  summarize: (args) => `Finding grounded document answers for: "${args.question}"`,
  async run(ctx, args) {
    let targetDocIds = [];
    if (args.documentId) {
      const canView = await DocumentAccessControlService.canViewDocument(ctx.userId, args.documentId);
      if (!canView?.allowed) return { error: 'Document not found or access denied.' };
      const doc = await Document.findById(args.documentId).select('aiPolicy sensitiveFlag');
      if (!doc || !isAiAllowed(doc)) return { error: 'Document is restricted under storage_only privacy.' };
      targetDocIds = [args.documentId];
      await ensureDocumentChunks(args.documentId, ctx.userId);
    } else {
      const accessibleIds = await DocumentAccessControlService.getAccessibleDocumentIds(ctx.userId, 'view');
      const docs = await Document.find({
        _id: { $in: accessibleIds },
        aiPolicy: 'ai_enabled',
        sensitiveFlag: { $ne: true },
      })
        .select('_id title')
        .lean();

      targetDocIds = docs.map((d) => d._id);

      // Only chunk docs that don't have chunks yet (fast check via DocumentChunk.distinct)
      const { DocumentChunk } = await import('../models/documentChunk.model.js');
      const alreadyChunked = await DocumentChunk.distinct('documentId', {
        userId: ctx.userId,
        documentId: { $in: targetDocIds },
      });
      const chunkedSet = new Set(alreadyChunked.map((id) => id.toString()));
      const unchunked = docs.filter((d) => !chunkedSet.has(d._id.toString())).slice(0, 3);
      if (unchunked.length > 0) {
        await Promise.all(unchunked.map((d) => ensureDocumentChunks(d._id, ctx.userId)));
      }
    }

    let queryVector = null;
    try {
      queryVector = await generateEmbedding(args.question);
    } catch (e) {}

    const chunks = await hybridChunkRetrieval({
      userId: ctx.userId,
      accessibleDocIds: targetDocIds,
      query: args.question,
      queryEmbedding: queryVector,
      topK: 3,
    });

    if (chunks.length === 0) {
      return {
        sources: [],
        evidence: '',
        note: 'No relevant excerpts found in indexed chunks. Try search_documents to locate the document by title.',
      };
    }

    // Batch-fetch document metadata in 1 single query instead of N queries
    const uniqueDocIds = [...new Set(chunks.map((c) => c.documentId.toString()))];
    const docRecords = await Document.find({ _id: { $in: uniqueDocIds } })
      .select('_id title category')
      .lean();
    const docMap = new Map(docRecords.map((d) => [d._id.toString(), d]));

    const sources = [];
    const seenSourceDocs = new Set();
    const contextBlocks = [];

    for (const chunk of chunks) {
      const docIdStr = chunk.documentId.toString();
      const doc = docMap.get(docIdStr);
      if (!seenSourceDocs.has(docIdStr)) {
        seenSourceDocs.add(docIdStr);
        sources.push({
          documentId: docIdStr,
          title: doc?.title || 'Document',
          category: doc?.category || 'Document',
          page: chunk.pageNumber || 1,
          pageNumber: chunk.pageNumber || 1,
          previewRoute: `/documents/${docIdStr}`,
        });
      }
      contextBlocks.push(
        `--- Document: "${doc?.title || 'Unknown'}" (ID: ${docIdStr}, Page ${chunk.pageNumber || 1}) ---\n${chunk.text}`
      );
    }

    return {
      sources,
      evidence: contextBlocks.join('\n\n'),
      note: 'Grounded excerpts retrieved. Answer directly from these excerpts without calling search_documents.',
    };
  },
});

/**
 * 3. summarize_document
 */
registerTool({
  name: 'summarize_document',
  description: 'Get an overview and key details of a specific document.',
  kind: 'read',
  schema: z.object({
    documentId: z.string().describe('ID of the document to summarize'),
  }),
  summarize: (args) => `Summarizing document ${args.documentId}`,
  async run(ctx, args) {
    const canView = await DocumentAccessControlService.canViewDocument(ctx.userId, args.documentId);
    if (!canView?.allowed) return { error: 'Access denied or document not found.' };

    const doc = await Document.findById(args.documentId);
    if (!doc) return { error: 'Document not found.' };
    assertAiAllowed(doc, { operation: 'copilot_summarize' });

    return {
      id: doc._id.toString(),
      title: doc.title,
      category: doc.category,
      summary: doc.summary || '',
      evidence: doc.extractedText ? doc.extractedText.slice(0, 2000) : '',
      keyDetails: doc.keyDetails || [],
      extractedFields: (doc.extractedFields || []).map((f) => ({ label: f.label || f.fieldName, value: f.value })),
      expiryDate: doc.expiryDate,
      pageCount: doc.pageCount || (doc.pages ? doc.pages.length : 1),
      sources: [{
        documentId: doc._id.toString(),
        title: doc.title,
        category: doc.category || 'Document',
        page: 1,
        pageNumber: 1,
        previewRoute: `/documents/${doc._id.toString()}`,
      }],
    };
  },
});

/**
 * 4. compare_documents
 */
registerTool({
  name: 'compare_documents',
  description: 'Compare two documents across their key fields, terms, dates, and amounts.',
  kind: 'read',
  schema: z.object({
    docIdA: z.string().describe('First document ID'),
    docIdB: z.string().describe('Second document ID'),
  }),
  summarize: (args) => `Comparing document ${args.docIdA} and ${args.docIdB}`,
  async run(ctx, args) {
    const [canA, canB] = await Promise.all([
      DocumentAccessControlService.canViewDocument(ctx.userId, args.docIdA),
      DocumentAccessControlService.canViewDocument(ctx.userId, args.docIdB),
    ]);
    if (!canA?.allowed || !canB?.allowed) return { error: 'One or both documents not found or access denied.' };

    const [docA, docB] = await Promise.all([Document.findById(args.docIdA), Document.findById(args.docIdB)]);
    if (!docA || !docB) return { error: 'One or both documents do not exist.' };
    assertAiAllowed(docA, { operation: 'copilot_compare' });
    assertAiAllowed(docB, { operation: 'copilot_compare' });

    return {
      docA: {
        id: docA._id.toString(),
        title: docA.title,
        category: docA.category,
        summary: docA.summary,
        fields: (docA.extractedFields || []).map((f) => ({ label: f.label || f.fieldName, value: f.value })),
      },
      docB: {
        id: docB._id.toString(),
        title: docB.title,
        category: docB.category,
        summary: docB.summary,
        fields: (docB.extractedFields || []).map((f) => ({ label: f.label || f.fieldName, value: f.value })),
      },
      sources: [
        {
          documentId: docA._id.toString(),
          title: docA.title,
          category: docA.category || 'Document',
          page: 1,
          pageNumber: 1,
          previewRoute: `/documents/${docA._id.toString()}`,
        },
        {
          documentId: docB._id.toString(),
          title: docB.title,
          category: docB.category || 'Document',
          page: 1,
          pageNumber: 1,
          previewRoute: `/documents/${docB._id.toString()}`,
        },
      ],
    };
  },
});

/**
 * 5. extract_fields
 */
registerTool({
  name: 'extract_fields',
  description: 'Extract specific field values (e.g. invoice total, GSTIN, expiry date) from a document.',
  kind: 'read',
  schema: z.object({
    documentId: z.string().describe('Document ID to inspect'),
  }),
  summarize: (args) => `Extracting structured fields from document ${args.documentId}`,
  async run(ctx, args) {
    const canView = await DocumentAccessControlService.canViewDocument(ctx.userId, args.documentId);
    if (!canView?.allowed) return { error: 'Access denied.' };
    const doc = await Document.findById(args.documentId);
    if (!doc) return { error: 'Document not found.' };
    assertAiAllowed(doc, { operation: 'copilot_fields' });

    return {
      documentId: doc._id.toString(),
      title: doc.title,
      category: doc.category,
      summary: doc.summary || '',
      fields: (doc.extractedFields || []).map((f) => ({ label: f.label || f.fieldName, value: f.value })),
      evidence: doc.extractedText ? doc.extractedText.slice(0, 2500) : '',
      sources: [{
        documentId: doc._id.toString(),
        title: doc.title,
        category: doc.category || 'Document',
        page: 1,
        pageNumber: 1,
        previewRoute: `/documents/${doc._id.toString()}`,
      }],
    };
  },
});

/**
 * 6. list_deadlines
 */
registerTool({
  name: 'list_deadlines',
  description: 'List upcoming renewals, expiry dates, or reminders.',
  kind: 'read',
  schema: z.object({
    daysAhead: z.coerce.number().optional().default(60).describe('Number of days ahead to look'),
    status: z.enum(['pending', 'completed', 'all']).optional().default('pending'),
  }),
  summarize: (args) => `Listing deadlines for next ${args.daysAhead || 60} days`,
  async run(ctx, args) {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + (args.daysAhead || 60));

    const filter = { userId: ctx.userId };
    if (args.status !== 'all') {
      filter.status = args.status;
    }
    filter.dueDate = { $lte: maxDate };

    const deadlines = await Deadline.find(filter).sort({ dueDate: 1 }).limit(20).lean();
    return {
      count: deadlines.length,
      deadlines: deadlines.map((d) => ({
        id: d._id.toString(),
        title: d.title,
        dueDate: d.dueDate,
        status: d.status,
        priority: d.priority,
        category: d.category,
      })),
    };
  },
});

/**
 * 7. list_assets — with profile invalidation hook after mutations
 */
registerTool({
  name: 'list_assets',
  description: 'List asset cards / flashcards (vehicles, electronics, property) and their custom fields.',
  kind: 'read',
  schema: z.object({
    category: z.string().optional().describe('Filter by asset category'),
  }),
  summarize: (args) => `Listing assets${args.category ? ` for category ${args.category}` : ''}`,
  async run(ctx, args) {
    const filter = { userId: ctx.userId };
    if (args.category) {
      filter.category = { $regex: args.category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim(), $options: 'i' };
    }
    let assets = await Asset.find(filter).sort({ createdAt: -1 }).limit(25).lean();

    if (assets.length === 0 && args.category) {
      assets = await Asset.find({ userId: ctx.userId }).sort({ createdAt: -1 }).limit(25).lean();
    }

    return {
      count: assets.length,
      note: `User has exactly ${assets.length} registered asset(s). List ONLY these exact items and do not invent any others.`,
      assets: assets.map((a) => ({
        id: a._id.toString(),
        name: a.name || a.title,
        category: a.category,
        customFields: a.customFields || [],
        purchaseDate: a.purchaseDate,
        warrantyExpiry: a.warrantyExpiry,
        linkedDocumentCount: (a.linkedDocumentIds || []).length,
      })),
      sources: assets.map((a) => ({
        documentId: a._id.toString(),
        assetId: a._id.toString(),
        type: 'asset',
        documentType: 'flashcard',
        title: a.name || a.title,
        category: a.category || 'Flashcard',
        previewRoute: `/assets/${a._id.toString()}`,
      })),
    };
  },
});

/**
 * 8. list_study_decks
 */
registerTool({
  name: 'list_study_decks',
  description: 'List study decks and flashcards created from documents.',
  kind: 'read',
  schema: z.object({}),
  summarize: () => 'Listing study decks',
  async run(ctx) {
    const decks = await StudyDeck.find({ userId: ctx.userId }).sort({ updatedAt: -1 }).limit(20).lean();
    return {
      count: decks.length,
      decks: decks.map((d) => ({
        id: d._id.toString(),
        title: d.title,
        cardCount: (d.cards || []).length,
        sourceDocumentId: d.sourceDocumentId,
        updatedAt: d.updatedAt,
      })),
    };
  },
});

/**
 * 9. list_shares
 */
registerTool({
  name: 'list_shares',
  description: 'List active document shares created by the user or received from others.',
  kind: 'read',
  schema: z.object({}),
  summarize: () => 'Listing document shares',
  async run(ctx) {
    const outgoing = await DocumentShare.find({ userId: ctx.userId, status: 'active' }).limit(20).lean();
    return {
      outgoingCount: outgoing.length,
      shares: outgoing.map((s) => ({
        id: s._id.toString(),
        documentId: s.documentId,
        permission: s.permission,
        expiresAt: s.expiresAt,
        status: s.status,
      })),
    };
  },
});

/**
 * 10. lookup_docvault_id
 */
registerTool({
  name: 'lookup_docvault_id',
  description: 'Find a user name by their DocVault ID for sharing or connection requests (rate limited, no email).',
  kind: 'read',
  schema: z.object({
    docvaultId: z.string().describe('The user DocVault identifier or code'),
  }),
  summarize: (args) => `Looking up user by DocVault ID: ${args.docvaultId}`,
  async run(ctx, args) {
    if (!args.docvaultId || args.docvaultId.length < 3) return { error: 'Invalid DocVault ID format.' };
    const user = await User.findOne({
      $or: [{ docvaultId: args.docvaultId }, { _id: args.docvaultId.match(/^[0-9a-fA-F]{24}$/) ? args.docvaultId : null }],
    })
      .select('name docvaultId')
      .lean();

    if (!user) return { found: false, message: 'User not found.' };
    return {
      found: true,
      user: {
        id: user._id.toString(),
        name: user.name || 'DocVault User',
        docvaultId: user.docvaultId,
      },
    };
  },
});

/* ==========================================================================
   WRITE TOOLS (Strict 2-Phase Confirmation Flow)
   Never execute inside the model loop directly; queue CopilotRun.
   ========================================================================== */

/**
 * 11. create_asset
 */
registerTool({
  name: 'create_asset',
  description: 'Create a new asset card / flashcard (e.g. MacBook Pro, Vehicle, House). Requires confirmation.',
  kind: 'write',
  schema: z.object({
    name: z.string().describe('Title / Name of the asset'),
    category: z.string().optional().describe('Category e.g. Work, Vehicle, Property, Electronics'),
    notes: z.string().optional().describe('Brief description or notes'),
    purchaseDate: z.string().optional().describe('Purchase date (ISO format YYYY-MM-DD)'),
    warrantyExpiry: z.string().optional().describe('Warranty expiration date (ISO format YYYY-MM-DD)'),
  }),
  summarize: (args) => `Create new asset card "${args.name || 'New Asset'}"`,
});

/**
 * 12. update_asset
 */
registerTool({
  name: 'update_asset',
  description: 'Update fields, notes, or warranty dates on an existing asset card. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    assetId: z.string().describe('Asset card ID to modify'),
    name: z.string().optional().describe('Updated asset name'),
    category: z.string().optional().describe('Updated category'),
    notes: z.string().optional().describe('Updated notes'),
    warrantyExpiry: z.string().optional().describe('Updated warranty date'),
  }),
  summarize: (args) => `Update asset card ${args.assetId}`,
});

/**
 * 13. link_document_to_asset
 */
registerTool({
  name: 'link_document_to_asset',
  description: 'Attach a document (receipt, invoice, warranty certificate) to an asset card. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    assetId: z.string().describe('Asset card ID'),
    documentId: z.string().describe('Document ID to link'),
  }),
  summarize: (args) => `Link document ${args.documentId} to asset ${args.assetId}`,
});

/**
 * 14. unlink_document
 */
registerTool({
  name: 'unlink_document',
  description: 'Remove a linked document from an asset card. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    assetId: z.string().describe('Asset card ID'),
    documentId: z.string().describe('Document ID to unlink'),
  }),
  summarize: (args) => `Unlink document ${args.documentId} from asset ${args.assetId}`,
});

/**
 * 15. create_reminder
 */
registerTool({
  name: 'create_reminder',
  description: 'Set a new renewal or expiration reminder / deadline. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    title: z.string().describe('Reminder title e.g. Car Insurance Renewal'),
    dueDate: z.string().describe('Due date in ISO YYYY-MM-DD format'),
    category: z.string().optional().describe('Category e.g. Insurance, Tax, Vehicle, Utility'),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  }),
  summarize: (args) => `Create deadline "${args.title}" due on ${args.dueDate}`,
});

/**
 * 16. update_reminder
 */
registerTool({
  name: 'update_reminder',
  description: 'Modify title, due date, or priority of an existing reminder. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    deadlineId: z.string().describe('Reminder deadline ID'),
    title: z.string().optional().describe('New title'),
    dueDate: z.string().optional().describe('New due date'),
    priority: z.enum(['low', 'medium', 'high']).optional(),
  }),
  summarize: (args) => `Update reminder ${args.deadlineId}`,
});

/**
 * 17. complete_reminder
 */
registerTool({
  name: 'complete_reminder',
  description: 'Mark an active reminder or deadline as completed. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    deadlineId: z.string().describe('Reminder ID to complete'),
  }),
  summarize: (args) => `Mark reminder ${args.deadlineId} as completed`,
});

/**
 * 18. update_document_metadata
 */
registerTool({
  name: 'update_document_metadata',
  description: 'Update title, category, expiryDate, or AI privacy policy (ai_enabled / storage_only) of a document. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    documentId: z.string().describe('Document ID to update'),
    title: z.string().optional().describe('Updated document title'),
    category: z.string().optional().describe('Updated category'),
    expiryDate: z.string().optional().describe('Updated expiry date in ISO YYYY-MM-DD format'),
    aiPolicy: z.enum(['ai_enabled', 'storage_only']).optional().describe('Privacy policy: ai_enabled or storage_only'),
  }),
  summarize: (args) => `Update document "${args.title || args.documentId}"`,
});

/**
 * 19. create_document_version
 */
registerTool({
  name: 'create_document_version',
  description: 'Record a version update tracking note without overwriting original file bytes. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    documentId: z.string().describe('Document ID to version'),
    changeSummary: z.string().describe('Summary of changes or update notes'),
  }),
  summarize: (args) => `Record document version note for ${args.documentId}`,
});

/**
 * 20. create_document
 */
registerTool({
  name: 'create_document',
  description: 'Generate a new PDF document server-side from text content. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    title: z.string().describe('Title of the document'),
    text: z.string().describe('Full textual content to encode into PDF'),
    category: z.string().optional().default('General'),
  }),
  summarize: (args) => `Generate new PDF document "${args.title}"`,
});

/**
 * 21. create_study_deck
 */
registerTool({
  name: 'create_study_deck',
  description: 'Create a study deck of flashcards grounded in a specific document. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    title: z.string().describe('Deck title e.g. Insurance Policy Key Facts'),
    sourceDocumentId: z.string().describe('Source document ID'),
    cards: z.array(
      z.object({
        front: z.string().describe('Question or concept'),
        back: z.string().describe('Answer or explanation'),
        sourcePage: z.number().optional().default(1),
        sourceExcerpt: z.string().optional(),
      })
    ),
  }),
  summarize: (args) => `Create study deck "${args.title}" with ${(args.cards || []).length} cards`,
});

/**
 * 22. edit_study_deck
 */
registerTool({
  name: 'edit_study_deck',
  description: 'Edit a study deck title or update cards. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    deckId: z.string().describe('Study deck ID'),
    title: z.string().optional(),
  }),
  summarize: (args) => `Edit study deck ${args.deckId}`,
});

/**
 * 23. remove_study_deck_cards
 */
registerTool({
  name: 'remove_study_deck_cards',
  description: 'Delete selected flashcards from a study deck. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    deckId: z.string().describe('Study deck ID'),
    cardIds: z.array(z.string()).describe('IDs of cards to remove'),
  }),
  summarize: (args) => `Remove cards from study deck ${args.deckId}`,
});

/**
 * 24. send_connection_request
 */
registerTool({
  name: 'send_connection_request',
  description: 'Send a family or trusted contact connection request by DocVault ID. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    recipientDocvaultId: z.string().describe('Recipient DocVault ID or account identifier'),
    relationshipType: z.string().optional().default('family'),
  }),
  summarize: (args) => `Send connection request to ${args.recipientDocvaultId}`,
});

/**
 * 25. create_share
 */
registerTool({
  name: 'create_share',
  description: 'Share a document with view or download permissions and optional expiry. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    documentId: z.string().describe('Document ID to share'),
    permission: z.enum(['view', 'download']).default('view'),
    expiresAt: z.string().optional().describe('Expiration ISO date e.g. YYYY-MM-DD'),
  }),
  summarize: (args) => `Create ${args.permission || 'view'} share for document ${args.documentId}`,
});

/**
 * 26. revoke_share
 */
registerTool({
  name: 'revoke_share',
  description: 'Revoke an active document share link immediately. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    shareId: z.string().describe('Share ID to revoke'),
  }),
  summarize: (args) => `Revoke document share ${args.shareId}`,
});

/**
 * 27. suggest_share_pack
 */
registerTool({
  name: 'suggest_share_pack',
  description: 'Suggest a bundled pack of documents for sharing (e.g. Visa Application Pack). Suggestion only.',
  kind: 'write',
  schema: z.object({
    packName: z.string().describe('Name of share pack'),
    documentIds: z.array(z.string()).describe('Document IDs in pack'),
  }),
  summarize: (args) => `Suggest share pack "${args.packName}"`,
});

/**
 * 28. delete_document
 */
registerTool({
  name: 'delete_document',
  description: 'Permanently delete a document and its linked reminders/chunks from the vault. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    documentId: z.string().describe('Document ID to permanently delete'),
    title: z.string().optional().describe('Document title for confirmation display'),
    reason: z.string().optional().describe('Optional reason for deletion'),
  }),
  summarize: (args) => `Permanently delete document "${args.title || args.documentId}"`,
});

/**
 * 29. propose_flashcard_form */
registerTool({
  name: 'propose_flashcard_form',
  description: 'Open an interactive, pre-filled Asset Flashcard Builder inside the chat so the user can review, fill missing fields, and submit directly.',
  kind: 'read',
  schema: z.object({
    name: z.string().describe('Suggested Flashcard / Asset name e.g. MacBook Pro 16'),
    category: z.string().optional().default('General').describe('Category e.g. Electronics, Vehicle, Appliance, Property, Utility, Insurance'),
    cardColor: z.enum(['blue', 'purple', 'green', 'amber', 'rose', 'indigo', 'slate']).optional().default('blue'),
    description: z.string().optional().default(''),
    linkedDocumentId: z.string().optional().describe('Optional document ID to attach to this flashcard'),
    linkedDocumentTitle: z.string().optional().describe('Optional document title'),
    customFields: z.array(
      z.union([
        z.object({
          label: z.string(),
          value: z.string().optional().default(''),
          type: z.enum(['text', 'date', 'number']).optional().default('text'),
        }),
        z.string(),
      ])
    ).optional().default([]),
  }),
  summarize: (args) => `Preparing interactive Flashcard "${args.name}"`,
  async run(ctx, args) {
    const normalizedFields = (Array.isArray(args.customFields) ? args.customFields : []).map((item) => {
      if (typeof item === 'string') {
        const idx = item.indexOf(':');
        if (idx > 0) {
          return {
            label: item.slice(0, idx).trim(),
            value: item.slice(idx + 1).trim(),
            type: 'text',
          };
        }
        return { label: item.trim(), value: '', type: 'text' };
      }
      return {
        label: item.label || 'Field',
        value: item.value || '',
        type: item.type || 'text',
      };
    });

    return {
      status: 'form_ready',
      message: `Interactive flashcard form prepared for "${args.name}". The user can now fill or edit fields and submit it directly in the chat.`,
      flashcardDraft: {
        id: `fc_${Date.now()}`,
        name: args.name,
        category: args.category || 'General',
        cardColor: args.cardColor || 'blue',
        description: args.description || '',
        linkedDocumentId: args.linkedDocumentId || null,
        linkedDocumentTitle: args.linkedDocumentTitle || null,
        customFields: normalizedFields,
      },
    };
  },
});


/**
 * 30. delete_asset
 */
registerTool({
  name: 'delete_asset',
  description: 'Permanently delete an asset card / flashcard from the vault. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    assetId: z.string().describe('Asset ID to delete'),
    name: z.string().optional().describe('Asset name for confirmation display'),
    reason: z.string().optional().describe('Optional reason for deletion'),
  }),
  summarize: (args) => `Permanently delete asset "${args.name || args.assetId}"`,
});

/**
 * 31. delete_reminder
 */
registerTool({
  name: 'delete_reminder',
  description: 'Permanently delete a reminder / deadline. Requires confirmation.',
  kind: 'write',
  schema: z.object({
    deadlineId: z.string().describe('Deadline ID to delete'),
    title: z.string().optional().describe('Deadline title for display'),
  }),
  summarize: (args) => `Delete reminder "${args.title || args.deadlineId}"`,
});

/**
 * 32. get_vault_stats  (READ — cheap overview, no AI needed)
 */
registerTool({
  name: 'get_vault_stats',
  description: 'Return a quick overview of the vault: total documents, assets, active shares, deadlines due soon, and storage stats. Use for "vault overview" or "how many documents" queries.',
  kind: 'read',
  schema: z.object({}),
  summarize: () => 'Fetching vault statistics overview',
  async run(ctx) {
    const [
      totalDocs,
      totalAssets,
      activeShares,
      pendingDeadlines,
      expiringSoon,
    ] = await Promise.all([
      Document.countDocuments({ userId: ctx.userId }),
      Asset.countDocuments({ userId: ctx.userId }),
      DocumentShare.countDocuments({ userId: ctx.userId, status: 'active' }),
      Deadline.countDocuments({ userId: ctx.userId, status: 'pending' }),
      Document.countDocuments({
        userId: ctx.userId,
        expiryDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), $gte: new Date() },
      }),
    ]);

    return {
      totalDocuments: totalDocs,
      totalAssets,
      activeShares,
      pendingReminders: pendingDeadlines,
      documentsExpiringSoon: expiringSoon,
      note: `User has ${totalDocs} document(s), ${totalAssets} asset flashcard(s), ${activeShares} active share(s), ${pendingDeadlines} pending reminder(s). ${expiringSoon} document(s) expire within 30 days.`,
    };
  },
});
