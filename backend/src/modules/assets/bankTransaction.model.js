import mongoose from 'mongoose';

const BankTransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  importBatchId: { type: String, required: true, index: true },
  transactionDate: { type: String, required: true, index: true }, // YYYY-MM-DD
  description: { type: String, required: true, trim: true },
  referenceNumber: { type: String, default: '' },
  type: { type: String, enum: ['DEBIT', 'CREDIT'], required: true },
  amount: { type: Number, required: true },
  balance: { type: Number, default: null },
  category: { type: String, default: 'General' },
  linkedAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', default: null },
  isDuplicate: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Deterministic compound index for preventing duplicate transaction imports
BankTransactionSchema.index({ userId: 1, transactionDate: 1, amount: 1, type: 1, description: 1 });

export const BankTransaction = mongoose.model('BankTransaction', BankTransactionSchema);

