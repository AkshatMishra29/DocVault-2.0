import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {
  Document,
  Asset,
  Deadline,
  DocumentShare,
  ConnectionRequest,
  AuditLog,
  User,
  DocumentVersionGroup,
} from '../../../models/index.js';
import { StudyDeck } from '../models/studyDeck.model.js';
import { DocumentChunk } from '../models/documentChunk.model.js';
import { DocumentAccessControlService } from '../../sharing/accessControl.service.js';
import { assertAiAllowed, isAiAllowed } from '../../../services/pipeline/privacyGate.js';
import { ensureDocumentChunks } from './chunking.service.js';
import { invalidateUserProfile } from './userProfile.service.js';
import { invalidateUserCache } from './semanticCache.service.js';

/**
 * Executes a confirmed action atomically after validation
 */
export async function executeConfirmedAction({ runId, action, args, userId }) {
  // Re-verify user authentication context
  if (!userId) {
    throw new Error('Unauthorized execution context: Missing userId.');
  }

  let result = null;

  switch (action) {
    /* ==========================================================================
       1. Assets / Flashcards Mutations
       ========================================================================== */
    case 'create_asset': {
      // Validate asset title
      if (!args.name && !args.title) throw new Error('Asset name or title is required.');
      const title = args.name || args.title;
      const asset = await Asset.create({
        userId,
        name: title,
        title,
        category: args.category || 'General',
        cardColor: args.cardColor || 'blue',
        description: args.description || '',
        tags: args.tags || [],
        customFields: args.customFields || [],
        purchaseDate: args.purchaseDate ? new Date(args.purchaseDate) : null,
        warrantyExpiry: args.warrantyExpiry ? new Date(args.warrantyExpiry) : null,
        notes: args.notes || '',
        linkedDocumentIds: args.linkedDocumentIds || [],
      });

      await AuditLog.create({
        userId,
        action: 'CREATE_ASSET_COPILOT',
        details: { assetId: asset._id, name: asset.name },
      });

      result = { assetId: asset._id.toString(), name: asset.name, asset, status: 'created' };
      break;
    }

    case 'update_asset': {
      if (!args.assetId) throw new Error('Asset ID required.');
      const asset = await Asset.findOne({ _id: args.assetId, userId });
      if (!asset) throw new Error('Asset not found or access denied.');

      if (args.name || args.title) {
        asset.name = args.name || args.title;
        asset.title = asset.name;
      }
      if (args.category) asset.category = args.category;
      if (args.customFields) asset.customFields = args.customFields;
      if (args.notes) asset.notes = args.notes;
      if (args.purchaseDate) asset.purchaseDate = new Date(args.purchaseDate);
      if (args.warrantyExpiry) asset.warrantyExpiry = new Date(args.warrantyExpiry);

      await asset.save();
      await AuditLog.create({
        userId,
        action: 'UPDATE_ASSET_COPILOT',
        details: { assetId: asset._id },
      });

      result = { assetId: asset._id.toString(), status: 'updated' };
      break;
    }

    case 'link_document_to_asset': {
      if (!args.assetId || !args.documentId) throw new Error('Both assetId and documentId are required.');
      const [canView, asset] = await Promise.all([
        DocumentAccessControlService.canViewDocument(userId, args.documentId),
        Asset.findOne({ _id: args.assetId, userId }),
      ]);
      if (!canView) throw new Error('Document not found or access denied.');
      if (!asset) throw new Error('Asset not found.');

      if (!asset.linkedDocumentIds.includes(args.documentId)) {
        asset.linkedDocumentIds.push(args.documentId);
        await asset.save();
      }

      await AuditLog.create({
        userId,
        action: 'LINK_DOCUMENT_ASSET_COPILOT',
        documentId: args.documentId,
        details: { assetId: asset._id },
      });

      result = { assetId: asset._id.toString(), documentId: args.documentId, status: 'linked' };
      break;
    }

    case 'unlink_document': {
      if (!args.assetId || !args.documentId) throw new Error('Both assetId and documentId are required.');
      const asset = await Asset.findOne({ _id: args.assetId, userId });
      if (!asset) throw new Error('Asset not found.');

      asset.linkedDocumentIds = (asset.linkedDocumentIds || []).filter(
        (id) => id.toString() !== args.documentId.toString()
      );
      await asset.save();

      result = { assetId: asset._id.toString(), documentId: args.documentId, status: 'unlinked' };
      break;
    }

    /* ==========================================================================
       2. Deadlines & Reminders Mutations
       ========================================================================== */
    case 'create_reminder': {
      if (!args.title || !args.dueDate) throw new Error('Title and dueDate are required for reminders.');
      const deadline = await Deadline.create({
        userId,
        title: args.title,
        dueDate: new Date(args.dueDate),
        category: args.category || 'General',
        priority: args.priority || 'medium',
        status: 'pending',
        documentId: args.documentId || null,
      });

      await AuditLog.create({
        userId,
        action: 'CREATE_DEADLINE_COPILOT',
        details: { deadlineId: deadline._id, title: deadline.title },
      });

      result = { deadlineId: deadline._id.toString(), title: deadline.title, status: 'created' };
      break;
    }

    case 'update_reminder': {
      if (!args.deadlineId) throw new Error('Deadline ID required.');
      const deadline = await Deadline.findOne({ _id: args.deadlineId, userId });
      if (!deadline) throw new Error('Deadline not found.');

      if (args.title) deadline.title = args.title;
      if (args.dueDate) deadline.dueDate = new Date(args.dueDate);
      if (args.priority) deadline.priority = args.priority;
      if (args.category) deadline.category = args.category;

      await deadline.save();
      result = { deadlineId: deadline._id.toString(), status: 'updated' };
      break;
    }

    case 'complete_reminder': {
      if (!args.deadlineId) throw new Error('Deadline ID required.');
      const deadline = await Deadline.findOne({ _id: args.deadlineId, userId });
      if (!deadline) throw new Error('Deadline not found.');

      deadline.status = 'completed';
      await deadline.save();

      await AuditLog.create({
        userId,
        action: 'COMPLETE_DEADLINE_COPILOT',
        details: { deadlineId: deadline._id },
      });

      result = { deadlineId: deadline._id.toString(), status: 'completed' };
      break;
    }

    /* ==========================================================================
       3. Documents Metadata & PDF Generation
       ========================================================================== */
    case 'update_document_metadata': {
      if (!args.documentId) throw new Error('Document ID required.');
      const doc = await Document.findOne({ _id: args.documentId, userId });
      if (!doc) throw new Error('Document not found or access denied.');

      if (args.title) doc.title = args.title;
      if (args.category) doc.category = args.category;
      if (args.expiryDate) doc.expiryDate = new Date(args.expiryDate);
      if (args.aiPolicy && ['ai_enabled', 'storage_only'].includes(args.aiPolicy)) {
        doc.aiPolicy = args.aiPolicy;
      }
      await doc.save();

      // Purge or refresh chunks based on privacy policy
      await DocumentChunk.deleteMany({ documentId: doc._id, userId });
      if (isAiAllowed(doc)) {
        await ensureDocumentChunks(doc._id, userId).catch(() => {});
      }

      await AuditLog.create({
        userId,
        action: 'UPDATE_DOCUMENT_METADATA_COPILOT',
        documentId: doc._id,
        details: { title: doc.title, category: doc.category, aiPolicy: doc.aiPolicy },
      });

      result = { documentId: doc._id.toString(), title: doc.title, category: doc.category, status: 'updated' };
      break;
    }

    case 'delete_document': {
      if (!args.documentId) throw new Error('Document ID required.');
      const doc = await Document.findOne({ _id: args.documentId, userId });
      if (!doc) throw new Error('Document not found or access denied.');

      await Document.deleteOne({ _id: doc._id });
      await Deadline.deleteMany({ linkedDocId: doc._id });
      await DocumentChunk.deleteMany({ documentId: doc._id, userId });

      await AuditLog.create({
        userId,
        action: 'DELETE_DOCUMENT_COPILOT',
        documentTitle: doc.title,
        details: { reason: args.reason || 'Deleted via Copilot' },
      });

      result = { documentId: doc._id.toString(), title: doc.title, status: 'deleted' };
      break;
    }

    case 'create_document_version': {
      if (!args.documentId || !args.changeSummary) {
        throw new Error('documentId and changeSummary required.');
      }
      const original = await Document.findOne({ _id: args.documentId, userId });
      if (!original) throw new Error('Original document not found.');

      // Record version group without overwriting original
      let versionGroup = await DocumentVersionGroup.findOne({
        $or: [{ rootDocumentId: original._id }, { versionDocumentIds: original._id }],
      });

      if (!versionGroup) {
        versionGroup = await DocumentVersionGroup.create({
          userId,
          rootDocumentId: original._id,
          versionDocumentIds: [original._id],
          currentVersion: 1,
        });
      }

      await AuditLog.create({
        userId,
        action: 'CREATE_DOCUMENT_VERSION_COPILOT',
        documentId: original._id,
        details: { changeSummary: args.changeSummary },
      });

      result = {
        documentId: original._id.toString(),
        versionGroupId: versionGroup._id.toString(),
        status: 'version_recorded',
      };
      break;
    }

    case 'create_document': {
      if (!args.title || !args.text) throw new Error('Title and text content are required to generate document.');

      // Server-side PDF generation using pdf-lib
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595.28, 841.89]); // A4 dimensions
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      page.drawText(args.title, {
        x: 50,
        y: 790,
        size: 18,
        font: boldFont,
        color: rgb(0.05, 0.05, 0.05),
      });

      const bodyText = args.text.slice(0, 3000); // safety cap
      const lines = bodyText.split('\n');
      let y = 740;

      for (const line of lines) {
        if (y < 50) break;
        page.drawText(line.slice(0, 90), {
          x: 50,
          y,
          size: 11,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= 16;
      }

      const pdfBytes = await pdfDoc.save();
      const base64Data = Buffer.from(pdfBytes).toString('base64');

      const newDoc = await Document.create({
        userId,
        title: args.title,
        category: args.category || 'General',
        summary: `Created by DocVault Copilot: ${args.title}`,
        extractedText: args.text,
        fileData: base64Data,
        mimeType: 'application/pdf',
        fileSize: pdfBytes.length,
        origin: 'copilot',
        aiPolicy: 'ai_enabled',
        processingStatus: 'indexed',
      });

      await ensureDocumentChunks(newDoc._id, userId).catch(() => {});

      await AuditLog.create({
        userId,
        action: 'CREATE_DOCUMENT_COPILOT',
        documentId: newDoc._id,
        details: { title: newDoc.title },
      });

      result = { documentId: newDoc._id.toString(), title: newDoc.title, status: 'created' };
      break;
    }

    /* ==========================================================================
       4. Study Decks (Flashcard Sets)
       ========================================================================== */
    case 'create_study_deck': {
      if (!args.title || !args.sourceDocumentId || !Array.isArray(args.cards)) {
        throw new Error('Title, sourceDocumentId, and cards array required.');
      }
      const canView = await DocumentAccessControlService.canViewDocument(userId, args.sourceDocumentId);
      if (!canView) throw new Error('Source document access denied.');

      const deck = await StudyDeck.create({
        userId,
        title: args.title,
        sourceDocumentId: args.sourceDocumentId,
        cards: args.cards.map((c) => ({
          front: c.front,
          back: c.back,
          sourcePage: c.sourcePage || 1,
          sourceExcerpt: c.sourceExcerpt || '',
        })),
      });

      result = { deckId: deck._id.toString(), cardCount: deck.cards.length, status: 'created' };
      break;
    }

    case 'edit_study_deck': {
      if (!args.deckId) throw new Error('Deck ID required.');
      const deck = await StudyDeck.findOne({ _id: args.deckId, userId });
      if (!deck) throw new Error('Study deck not found.');

      if (args.title) deck.title = args.title;
      if (Array.isArray(args.cards)) deck.cards = args.cards;
      await deck.save();

      result = { deckId: deck._id.toString(), status: 'updated' };
      break;
    }

    case 'remove_study_deck_cards': {
      if (!args.deckId || !Array.isArray(args.cardIds)) {
        throw new Error('deckId and cardIds array required.');
      }
      const deck = await StudyDeck.findOne({ _id: args.deckId, userId });
      if (!deck) throw new Error('Study deck not found.');

      deck.cards = deck.cards.filter((c) => !args.cardIds.includes(c._id.toString()));
      await deck.save();

      result = { deckId: deck._id.toString(), remainingCards: deck.cards.length, status: 'cards_removed' };
      break;
    }

    /* ==========================================================================
       5. Sharing & Connections (Strict Permissions)
       ========================================================================== */
    case 'send_connection_request': {
      if (!args.recipientDocvaultId) throw new Error('Recipient DocVault ID required.');
      const recipient = await User.findOne({
        $or: [{ docvaultId: args.recipientDocvaultId }, { _id: args.recipientDocvaultId.match(/^[0-9a-fA-F]{24}$/) ? args.recipientDocvaultId : null }],
      });
      if (!recipient) throw new Error('Recipient DocVault account not found.');
      if (recipient._id.toString() === userId.toString()) {
        throw new Error('Cannot connect to your own account.');
      }

      const existing = await ConnectionRequest.findOne({
        requesterId: userId,
        recipientId: recipient._id,
        status: 'pending',
      });
      if (existing) throw new Error('Connection request already pending.');

      const req = await ConnectionRequest.create({
        requesterId: userId,
        recipientId: recipient._id,
        status: 'pending',
        relationshipType: args.relationshipType || 'family',
      });

      await AuditLog.create({
        userId,
        action: 'SEND_CONNECTION_COPILOT',
        details: { recipientId: recipient._id },
      });

      result = { requestId: req._id.toString(), recipientName: recipient.name, status: 'sent' };
      break;
    }

    case 'create_share': {
      if (!args.documentId || !args.permission) {
        throw new Error('documentId and permission (view/download) required.');
      }
      const doc = await Document.findOne({ _id: args.documentId, userId });
      if (!doc) throw new Error('Document not found or you are not the owner.');

      const share = await DocumentShare.create({
        userId,
        documentId: doc._id,
        permission: args.permission || 'view',
        expiresAt: args.expiresAt ? new Date(args.expiresAt) : null,
        status: 'active',
      });

      await AuditLog.create({
        userId,
        action: 'CREATE_SHARE_COPILOT',
        documentId: doc._id,
        details: { shareId: share._id, permission: share.permission },
      });

      result = { shareId: share._id.toString(), permission: share.permission, status: 'active' };
      break;
    }

    case 'revoke_share': {
      if (!args.shareId) throw new Error('Share ID required.');
      const share = await DocumentShare.findOne({ _id: args.shareId, userId });
      if (!share) throw new Error('Share record not found.');

      share.status = 'revoked';
      await share.save();

      await AuditLog.create({
        userId,
        action: 'REVOKE_SHARE_COPILOT',
        details: { shareId: share._id },
      });

      result = { shareId: share._id.toString(), status: 'revoked' };
      break;
    }

    case 'suggest_share_pack': {
      // Suggestion only
      result = {
        suggestedDocuments: args.documentIds || [],
        packName: args.packName || 'Document Share Pack',
        message: 'Share pack suggested. Click Confirm to create shares for these documents.',
      };
      break;
    }

    /* ==========================================================================
       6. Delete Asset / Reminder (new tools added 2026-11)
       ========================================================================== */
    case 'delete_asset': {
      if (!args.assetId) throw new Error('Asset ID required.');
      const asset = await Asset.findOne({ _id: args.assetId, userId });
      if (!asset) throw new Error('Asset not found or access denied.');

      await Asset.deleteOne({ _id: asset._id });

      await AuditLog.create({
        userId,
        action: 'DELETE_ASSET_COPILOT',
        details: { assetId: asset._id, name: asset.name, reason: args.reason || 'Deleted via Copilot' },
      });

      result = { assetId: asset._id.toString(), name: asset.name, status: 'deleted' };
      break;
    }

    case 'delete_reminder': {
      if (!args.deadlineId) throw new Error('Deadline ID required.');
      const deadline = await Deadline.findOne({ _id: args.deadlineId, userId });
      if (!deadline) throw new Error('Deadline not found or access denied.');

      await Deadline.deleteOne({ _id: deadline._id });

      await AuditLog.create({
        userId,
        action: 'DELETE_DEADLINE_COPILOT',
        details: { deadlineId: deadline._id, title: deadline.title },
      });

      result = { deadlineId: deadline._id.toString(), title: deadline.title, status: 'deleted' };
      break;
    }

    default:
      throw new Error(`Unsupported action: ${action}`);
  }

  // Invalidate the personalization profile cache after any vault mutation
  const mutatingActions = [
    'create_asset', 'update_asset', 'delete_asset',
    'create_reminder', 'update_reminder', 'complete_reminder', 'delete_reminder',
    'delete_document', 'create_document', 'update_document_metadata',
    'create_share', 'revoke_share',
  ];
  if (mutatingActions.includes(action)) {
    invalidateUserProfile(userId);
    invalidateUserCache(userId);
  }

  return result;
}
