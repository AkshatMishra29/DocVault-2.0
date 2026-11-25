import mongoose from 'mongoose';

/**
 * StudyDeck Schema
 * Flashcard study sets grounded in specific document pages.
 */
const StudyCardSchema = new mongoose.Schema(
  {
    front: { type: String, required: true },
    back: { type: String, required: true },
    sourcePage: { type: Number, default: 1 },
    sourceExcerpt: { type: String, default: '' },
  },
  { _id: true }
);

const StudyDeckSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    sourceDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    cards: [StudyCardSchema],
  },
  { timestamps: true }
);

export const StudyDeck = mongoose.models.StudyDeck || mongoose.model('StudyDeck', StudyDeckSchema);
