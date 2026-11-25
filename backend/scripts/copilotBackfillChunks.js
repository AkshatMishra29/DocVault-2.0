import mongoose from 'mongoose';
import { config } from '../src/config/index.js';
import { Document } from '../src/models/index.js';
import { ensureDocumentChunks } from '../src/modules/copilot/services/chunking.service.js';

async function backfill() {
  console.log('[Copilot Backfill] Connecting to MongoDB...');
  await mongoose.connect(config.mongoUri);
  console.log('[Copilot Backfill] Connected. Searching for processable documents...');

  const docs = await Document.find({
    aiPolicy: 'ai_enabled',
    sensitiveFlag: { $ne: true },
  }).select('_id userId title');

  console.log(`[Copilot Backfill] Found ${docs.length} eligible documents.`);
  let count = 0;

  for (const doc of docs) {
    try {
      const chunks = await ensureDocumentChunks(doc._id, doc.userId);
      console.log(`[${++count}/${docs.length}] Indexed "${doc.title}" -> ${chunks.length} chunks.`);
    } catch (err) {
      console.error(`Failed to chunk doc ${doc._id}: ${err.message}`);
    }
  }

  console.log('[Copilot Backfill] Completed.');
  await mongoose.disconnect();
}

backfill().catch((e) => {
  console.error(e);
  process.exit(1);
});
