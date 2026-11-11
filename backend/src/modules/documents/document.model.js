import mongoose from 'mongoose';

const ExtractedFieldSchema = new mongoose.Schema(
  {
    fieldName: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    evidence: { type: String, default: null },
    pageNumber: { type: Number, default: 1 },
    boundingBox: {
      x0: { type: Number, default: null },
      y0: { type: Number, default: null },
      x1: { type: Number, default: null },
      y1: { type: Number, default: null },
      // Backward compatibility with legacy x/y/width/height
      x: { type: Number, default: null },
      y: { type: Number, default: null },
      width: { type: Number, default: null },
      height: { type: Number, default: null },
    },
    extractionMethod: {
      type: String,
      enum: ['rules', 'regex', 'text_layer', 'gliner', 'groq_llm', 'gemini_vision', 'user_corrected', 'fallback'],
      default: 'rules',
    },
    confidence: { type: Number, default: 0 },
    verificationStatus: {
      type: String,
      enum: ['accepted', 'needs_review', 'uncertain', 'rejected', 'user_corrected'],
      default: 'accepted',
    },
    rejectionReason: { type: String, default: null },
    pipelineVersion: { type: String, default: '1.0.0' },
  },
  { _id: false }
);

const DocumentPageSchema = new mongoose.Schema(
  {
    pageNumber: { type: Number, required: true },
    method: {
      type: String,
      enum: ['digital_text', 'tesseract_ocr', 'skipped_by_privacy', 'empty', 'failed'],
      default: 'digital_text',
    },
    status: {
      type: String,
      enum: ['TEXT_EXTRACTED', 'OCR_EXTRACTED', 'LOW_CONFIDENCE', 'EMPTY_PAGE', 'FAILED', 'SKIPPED_BY_PRIVACY_POLICY'],
      default: 'TEXT_EXTRACTED',
    },
    text: { type: String, default: '' },
    confidence: { type: Number, default: 0 },
    charCount: { type: Number, default: 0 },
    wordCount: { type: Number, default: 0 },
    error: { type: String, default: null },
    durationMs: { type: Number, default: 0 },
  },
  { _id: false }
);

const DocumentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
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

  // Extracted Document Information
  extractedText: { type: String, default: '' },
  summary: { type: String },
  keyDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
  tags: [{ type: String }],
  isFavorite: { type: Boolean, default: false },
  documentDate: { type: String, index: true }, // YYYY-MM-DD (e.g. Issue date, certificate date, invoice date)
  expiryDate: { type: String, index: true }, // YYYY-MM-DD
  isExpiringSoon: { type: Boolean, default: false },
  tierUsed: { type: String, default: 'Tier 1 (Regex & Rules)' },
  confidenceScore: { type: Number, default: 0 },
  embedding: [{ type: Number }], // Hugging Face 384-dim vector

  // PHASE A: Universal Pipeline Core Fields
  aiPolicy: {
    type: String,
    enum: ['storage_only', 'ai_enabled'],
    default: 'storage_only',
    index: true,
  },
  policyVersion: { type: String, default: '1.0.0' },
  sensitiveFlag: { type: Boolean, default: false, index: true },
  sensitiveReason: { type: String, default: null },
  aiConsent: {
    grantedAt: { type: Date, default: null },
    noticeVersion: { type: String, default: null },
  },
  status: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'needs_review', 'needs_retake', 'failed', 'storage_only'],
    default: 'queued',
    index: true,
  },
  sha256: { type: String, index: true },
  pageCount: { type: Number, default: 1 },
  pipelineVersion: { type: String, default: '1.0.0' },

  // Backward compatibility fields
  privacyMode: {
    type: String,
    enum: ['PROCESSABLE', 'STORAGE_ONLY'],
    default: function () {
      return this.aiPolicy === 'ai_enabled' ? 'PROCESSABLE' : 'STORAGE_ONLY';
    },
    index: true,
  },
  fileHash: { type: String, index: true },
  processingStatus: {
    type: String,
    enum: ['pending', 'queued', 'processing', 'completed', 'failed', 'needs_review', 'needs_retake', 'storage_only'],
    default: function () {
      return this.status === 'queued' ? 'pending' : this.status;
    },
    index: true,
  },
  reviewStatus: {
    type: String,
    enum: ['not_required', 'pending_review', 'reviewed', 'rejected'],
    default: 'not_required',
  },

  extractedFields: [ExtractedFieldSchema],

  // Stage Eight: Page-Level Traceability
  pages: [DocumentPageSchema],
  processedPages: { type: Number, default: 0 },
  failedPages: { type: Number, default: 0 },
  extractionMethod: { type: String, default: null },
  processingError: { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Middleware to sync sha256 <-> fileHash and aiPolicy <-> privacyMode
DocumentSchema.pre('save', function () {
  this.updatedAt = new Date();
  if (this.sha256 && !this.fileHash) {
    this.fileHash = this.sha256;
  } else if (this.fileHash && !this.sha256) {
    this.sha256 = this.fileHash;
  }

  if (this.aiPolicy === 'storage_only') {
    this.privacyMode = 'STORAGE_ONLY';
  } else if (this.aiPolicy === 'ai_enabled') {
    this.privacyMode = 'PROCESSABLE';
  }
});

export const Document = mongoose.model('Document', DocumentSchema);
