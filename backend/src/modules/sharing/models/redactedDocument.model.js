import mongoose from 'mongoose';

const RedactedDocumentSchema = new mongoose.Schema(
  {
    originalDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    // Genuine redacted binary payload stored safely as base64 string
    fileData: {
      type: String,
      required: true,
    },
    format: {
      type: String,
      default: 'PDF',
    },
    mimetype: {
      type: String,
      default: 'application/pdf',
    },
    sizeBytes: {
      type: Number,
      default: 0,
    },
    redactionMetadata: {
      redactedFields: [{ type: String }],
      textTermsRedacted: [{ type: String }],
      totalRegionsSanitized: { type: Number, default: 0 },
      isVerifiedSanitized: { type: Boolean, default: true },
    },
    sha256: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const RedactedDocument = mongoose.model('RedactedDocument', RedactedDocumentSchema);

