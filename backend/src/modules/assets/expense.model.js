import mongoose from 'mongoose';

const ExpenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', default: null, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
  vendor: { type: String, required: true, trim: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  date: { type: String, required: true }, // YYYY-MM-DD
  category: {
    type: String,
    enum: ['Maintenance', 'Fuel', 'Insurance', 'Service/Repair', 'Tax/Fee', 'Accessories', 'Purchase', 'Other'],
    default: 'Other',
    index: true
  },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

ExpenseSchema.index({ userId: 1, date: -1 });

export const Expense = mongoose.model('Expense', ExpenseSchema);

