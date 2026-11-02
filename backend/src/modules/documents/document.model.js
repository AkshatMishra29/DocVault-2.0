import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: { type: String, required: true },
  originalName: { type: String, required: true },
  category: { 
    type: String, 
    trim: true,
    default: 'Other',
    index: true
  },
  format: { type: String, default: 'PDF' },
  mimetype: { type: String },
  fileData: { type: String }, // Base64 encoded file data
  sizeBytes: { type: Number },
  fileSizeFormatted: { type: String },
  storagePath: { type: String, default: 'mongodb' },
  downloadUrl: { type: String },
  extractedText: { type: String, default: '' },
  summary: { type: String },
  keyDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
  tags: [{ type: String }],
  isFavorite: { type: Boolean, default: false },
  expiryDate: { type: String }, // YYYY-MM-DD
  isExpiringSoon: { type: Boolean, default: false },
  embedding: [{ type: Number }], // Hugging Face 384-dim vector

  // Production Document Extraction & Verification Extensions
  privacyMode: {
    type: String,
    enum: ['PROCESSABLE', 'STORAGE_ONLY'],
    default: 'PROCESSABLE',
    index: true,
  },
  policyVersion: { type: String, default: '1.0.0' },
  fileHash: { type: String, index: true }, // SHA-256 for deduplication & caching
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'needs_review', 'storage_only'],
    default: 'pending',
    index: true,
  },
  reviewStatus: {
    type: String,
    enum: ['not_required', 'pending_review', 'reviewed', 'rejected'],
    default: 'not_required',
  },
  pipelineVersion: { type: String, default: '1.0.0' },
  extractedFields: [
    {
      fieldName: { type: String, required: true },
      value: { type: mongoose.Schema.Types.Mixed },
      evidence: { type: String },
      pageNumber: { type: Number, default: 1 },
      boundingBox: {
        x: Number,
        y: Number,
        width: Number,
        height: Number,
      },
      extractionMethod: {
        type: String,
        enum: ['regex', 'text_layer', 'gliner', 'groq_llm', 'gemini_vision', 'user_corrected', 'fallback'],
        default: 'regex',
      },
      confidence: { type: Number, default: 0 },
      verificationStatus: {
        type: String,
        enum: ['accepted', 'needs_review', 'rejected', 'user_corrected'],
        default: 'accepted',
      },
      rejectionReason: { type: String },
      pipelineVersion: { type: String, default: '1.0.0' },
    },
  ],

  createdAt: { type: Date, default: Date.now },
});

export const Document = mongoose.model('Document', DocumentSchema);

