import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { Expense } from './expense.model.js';
import { Asset } from './asset.model.js';
import { recordTimelineEvent } from './assetLifecycle.service.js';

const router = Router();

// GET /api/expenses - List expenses with optional asset/category/year filters
router.get('/', requireAuth, async (req, res) => {
  try {
    const { assetId, category, year } = req.query;
    const filter = { userId: req.user.userId };

    if (assetId) filter.assetId = assetId;
    if (category) filter.category = category;
    if (year) filter.date = { $regex: new RegExp(`^${year}`) };

    const expenses = await Expense.find(filter)
      .populate('assetId', 'name category icon')
      .sort({ date: -1 });

    const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

    res.json({
      success: true,
      count: expenses.length,
      totalAmount,
      data: expenses
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/expenses/summary - Aggregated breakdown by category & monthly stats
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const expenses = await Expense.find({ userId: req.user.userId }).populate('assetId', 'name category');

    const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

    // Group by category
    const byCategory = {};
    expenses.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });

    // Group by month (YYYY-MM)
    const byMonth = {};
    expenses.forEach(e => {
      const monthKey = e.date ? e.date.slice(0, 7) : 'Unknown';
      byMonth[monthKey] = (byMonth[monthKey] || 0) + e.amount;
    });

    // Group by asset
    const byAsset = {};
    expenses.forEach(e => {
      const assetName = e.assetId?.name || 'General Expense';
      byAsset[assetName] = (byAsset[assetName] || 0) + e.amount;
    });

    res.json({
      success: true,
      data: {
        totalSpent,
        byCategory,
        byMonth,
        byAsset,
        count: expenses.length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/expenses - Add an asset or general expense
router.post('/', requireAuth, async (req, res) => {
  try {
    const { assetId, vendor, amount, date, category, notes, currency } = req.body;
    if (!vendor || amount === undefined || !date) {
      return res.status(400).json({ success: false, error: 'Vendor, amount, and date are required' });
    }

    if (assetId) {
      const asset = await Asset.findOne({ _id: assetId, userId: req.user.userId });
      if (!asset) {
        return res.status(404).json({ success: false, error: 'Asset not found or unauthorized' });
      }
    }

    const expense = new Expense({
      userId: req.user.userId,
      assetId: assetId || null,
      vendor: vendor.trim(),
      amount: Number(amount),
      currency: currency || 'INR',
      date,
      category: category || 'Other',
      notes: notes || ''
    });

    await expense.save();

    // Record Timeline Event
    await recordTimelineEvent({
      userId: req.user.userId,
      eventType: 'EXPENSE_LOGGED',
      title: `₹${expense.amount} to ${expense.vendor} (${expense.category})`,
      description: expense.notes || `Logged expense for ${category}.`,
      eventDate: date,
      category: expense.category,
      assetId: expense.assetId,
      expenseId: expense._id,
      metadata: { amount: expense.amount, vendor: expense.vendor }
    });

    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/expenses/:id - Delete an expense
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!expense) {
      return res.status(404).json({ success: false, error: 'Expense not found' });
    }
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

