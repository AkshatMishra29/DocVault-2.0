import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { upload } from '../../middleware/upload.middleware.js';
import { BankTransaction } from './bankTransaction.model.js';
import { recordTimelineEvent } from './assetLifecycle.service.js';

const router = Router();

/**
 * Robust CSV Line Parser that handles quoted commas and trims fields
 */
function parseCsvLine(text) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Standardize varied bank date strings to YYYY-MM-DD
 */
function normalizeDate(str) {
  if (!str) return new Date().toISOString().split('T')[0];
  const cleaned = str.replace(/['"]/g, '').trim();

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = cleaned.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  // YYYY-MM-DD
  const ymd = cleaned.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  }

  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
}

// POST /api/bank-statements/preview - Privacy-First Local CSV Parser
// Does NOT send data to Groq, Hugging Face, or external AI APIs!
router.post('/preview', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'CSV file required' });
    }

    const { originalname, buffer } = req.file;
    if (!originalname.toLowerCase().endsWith('.csv')) {
      return res.status(400).json({ success: false, error: 'Only CSV bank statements are supported in this phase.' });
    }

    const content = buffer.toString('utf-8');
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

    if (lines.length < 2) {
      return res.status(400).json({ success: false, error: 'CSV file appears empty or lacks headers' });
    }

    // Locate header row containing date/narration/amount/debit/credit
    let headerIdx = -1;
    let headers = [];
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const parsed = parseCsvLine(lines[i].toLowerCase());
      if (parsed.some(h => /date|txn|time/i.test(h)) && parsed.some(h => /desc|narration|particular|detail/i.test(h))) {
        headerIdx = i;
        headers = parsed;
        break;
      }
    }

    if (headerIdx === -1) {
      // Fallback: use first row
      headerIdx = 0;
      headers = parseCsvLine(lines[0].toLowerCase());
    }

    const dateCol = headers.findIndex(h => /^(date|txn_date|txndate|transaction_date)$/i.test(h) || /date/i.test(h));
    const descCol = headers.findIndex(h => /^(desc|description|narration|particulars?|details?|remarks?)$/i.test(h));
    const debitCol = headers.findIndex(h => /^(debit|dr|withdrawal|debit_amount)$/i.test(h) || /\b(debit|withdrawal)\b/i.test(h));
    const creditCol = headers.findIndex(h => /^(credit|cr|deposit|credit_amount)$/i.test(h) || /\b(credit|deposit)\b/i.test(h));
    const amountCol = headers.findIndex(h => /^(amount|txn_amount|net_amount)$/i.test(h));
    const balanceCol = headers.findIndex(h => /^(balance|bal|closing_balance)$/i.test(h) || /balance/i.test(h));

    const previewTransactions = [];
    const importBatchId = 'batch_' + crypto.randomBytes(6).toString('hex');

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      if (row.length < 2) continue;

      const rawDate = row[dateCol >= 0 ? dateCol : 0];
      const rawDesc = row[descCol >= 0 ? descCol : 1];
      if (!rawDesc) continue;

      let type = 'DEBIT';
      let amount = 0;

      if (debitCol >= 0 && creditCol >= 0) {
        const debitVal = parseFloat((row[debitCol] || '0').replace(/[^0-9.-]+/g, '')) || 0;
        const creditVal = parseFloat((row[creditCol] || '0').replace(/[^0-9.-]+/g, '')) || 0;
        if (creditVal > 0) {
          type = 'CREDIT';
          amount = creditVal;
        } else {
          type = 'DEBIT';
          amount = debitVal;
        }
      } else if (amountCol >= 0) {
        const amtStr = row[amountCol] || '0';
        const rawAmt = parseFloat(amtStr.replace(/[^0-9.-]+/g, '')) || 0;
        if (amtStr.includes('-') || /dr/i.test(amtStr)) {
          type = 'DEBIT';
          amount = Math.abs(rawAmt);
        } else {
          type = 'CREDIT';
          amount = Math.abs(rawAmt);
        }
      }

      if (amount <= 0) continue;

      const balance = balanceCol >= 0 ? parseFloat((row[balanceCol] || '0').replace(/[^0-9.-]+/g, '')) || null : null;
      const normalizedTxnDate = normalizeDate(rawDate);

      // Check if duplicate transaction already exists in database
      const existingTxn = await BankTransaction.findOne({
        userId: req.user.userId,
        transactionDate: normalizedTxnDate,
        amount,
        type,
        description: rawDesc.trim()
      });

      previewTransactions.push({
        transactionDate: normalizedTxnDate,
        description: rawDesc.trim(),
        type,
        amount,
        balance,
        isDuplicate: Boolean(existingTxn),
        category: /fuel|petrol|hpcl|bpcl/i.test(rawDesc) ? 'Fuel'
          : /insurance|lic|hdfc ergo|icici lombard/i.test(rawDesc) ? 'Insurance'
          : /service|garage|repair|workshop/i.test(rawDesc) ? 'Maintenance'
          : 'General'
      });
    }

    res.json({
      success: true,
      importBatchId,
      filename: originalname,
      totalCount: previewTransactions.length,
      duplicateCount: previewTransactions.filter(t => t.isDuplicate).length,
      preview: previewTransactions
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to preview CSV: ' + err.message });
  }
});

// POST /api/bank-statements/confirm - Explicit User Confirmation to save transactions
router.post('/confirm', requireAuth, async (req, res) => {
  try {
    const { importBatchId, transactions } = req.body;
    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ success: false, error: 'No transactions to import' });
    }

    const batchId = importBatchId || 'batch_' + Date.now();
    const docsToInsert = transactions.map(t => ({
      userId: req.user.userId,
      importBatchId: batchId,
      transactionDate: t.transactionDate,
      description: t.description.trim(),
      type: t.type,
      amount: Number(t.amount),
      balance: t.balance !== null && t.balance !== undefined ? Number(t.balance) : null,
      category: t.category || 'General',
      isDuplicate: Boolean(t.isDuplicate)
    }));

    const result = await BankTransaction.insertMany(docsToInsert);

    // Record timeline summary
    await recordTimelineEvent({
      userId: req.user.userId,
      eventType: 'EXPENSE_LOGGED',
      title: `Imported ${result.length} bank transactions`,
      description: `Statement batch ${batchId} imported with user confirmation.`,
      eventDate: new Date().toISOString().split('T')[0],
      category: 'Banking',
      metadata: { count: result.length, batchId }
    });

    res.status(201).json({
      success: true,
      message: `Successfully confirmed and stored ${result.length} transactions`,
      count: result.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/bank-statements/transactions - List saved bank transactions with search & filtering
router.get('/transactions', requireAuth, async (req, res) => {
  try {
    const { type, category, q } = req.query;
    const filter = { userId: req.user.userId };

    if (type) filter.type = type.toUpperCase();
    if (category) filter.category = category;
    if (q) filter.description = { $regex: q, $options: 'i' };

    const transactions = await BankTransaction.find(filter).sort({ transactionDate: -1, createdAt: -1 });

    const totalDebit = transactions.filter(t => t.type === 'DEBIT').reduce((s, t) => s + t.amount, 0);
    const totalCredit = transactions.filter(t => t.type === 'CREDIT').reduce((s, t) => s + t.amount, 0);

    res.json({
      success: true,
      count: transactions.length,
      totalDebit,
      totalCredit,
      data: transactions
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

