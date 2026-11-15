import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Conversation } from '../src/modules/ai/models/conversation.model.js';
import { Message } from '../src/modules/ai/models/message.model.js';

test('AI Chat & Conversations Data Contracts', async (t) => {
  await t.test('Conversation Schema enforces userId and defaults title', () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const conv = new Conversation({ userId: fakeUserId });
    assert.equal(conv.title, 'New Conversation');
    assert.equal(String(conv.userId), String(fakeUserId));
    assert.ok(conv.lastMessageAt instanceof Date);
  });

  await t.test('Message Schema stores sources, referencedDocIds, and roles', () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const fakeConvId = new mongoose.Types.ObjectId();
    const fakeDocId = new mongoose.Types.ObjectId();

    const msg = new Message({
      conversationId: fakeConvId,
      userId: fakeUserId,
      role: 'assistant',
      content: 'Your AC warranty is valid until 15 March 2026.',
      sources: [
        {
          documentId: fakeDocId,
          title: 'AC Purchase Invoice',
          category: 'Purchase Receipt',
          documentType: 'pdf',
          pageNumber: 1,
          previewRoute: `/documents/${fakeDocId}`,
          downloadUrl: `/api/documents/${fakeDocId}/download`,
        },
      ],
      referencedDocIds: [fakeDocId],
      confidence: 'high',
    });

    assert.equal(msg.role, 'assistant');
    assert.equal(msg.sources.length, 1);
    assert.equal(msg.sources[0].title, 'AC Purchase Invoice');
    assert.equal(msg.sources[0].previewRoute, `/documents/${fakeDocId}`);
    assert.equal(msg.referencedDocIds.length, 1);
  });

  await t.test('Message Schema rejects invalid roles', () => {
    const msg = new Message({
      conversationId: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(),
      role: 'invalid_role',
      content: 'hello',
    });

    const err = msg.validateSync();
    assert.ok(err, 'Should produce validation error for invalid role');
    assert.ok(err.errors.role);
  });
});
