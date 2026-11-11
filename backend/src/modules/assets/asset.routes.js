import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { Asset } from './asset.model.js';
import { Expense } from './expense.model.js';
import { TimelineEvent } from './timelineEvent.model.js';
import { Document } from '../documents/document.model.js';
import { Deadline } from '../deadlines/deadline.model.js';
import { recordTimelineEvent, syncAssetDeadline } from './assetLifecycle.service.js';

const router = Router();

// GET /api/assets - List all user assets with populated documents & summary stats
router.get('/', requireAuth, async (req, res) => {
  try {
    const assets = await Asset.find({ userId: req.user.userId })
      .populate({
        path: 'linkedDocumentIds',
        select: 'title category format fileSizeFormatted expiryDate createdAt'
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, count: assets.length, data: assets });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/assets - Create new asset with category metadata & initial timeline/deadline sync
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      name,
      category,
      description,
      estimatedValue,
      purchasePrice,
      purchaseDate,
      status,
      notes,
      metadata,
      cardColor,
      tags,
      customFields,
      warrantyExpiry,
      warrantyDurationMonths,
      insuranceExpiry,
      pucExpiry,
      nextService,
      linkedDocumentIds,
      icon
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const assignedCategory = category ? category.trim() : 'General';

    // Calculate warranty expiry automatically if duration months provided
    let computedWarrantyExpiry = warrantyExpiry;
    if (!computedWarrantyExpiry && purchaseDate && warrantyDurationMonths) {
      const pDate = new Date(purchaseDate);
      if (!isNaN(pDate.getTime())) {
        pDate.setMonth(pDate.getMonth() + parseInt(warrantyDurationMonths, 10));
        computedWarrantyExpiry = pDate.toISOString().split('T')[0];
      }
    }

    // Validate ownership of any linked documents
    if (linkedDocumentIds && linkedDocumentIds.length > 0) {
      const docsCount = await Document.countDocuments({
        _id: { $in: linkedDocumentIds },
        userId: req.user.userId
      });
      if (docsCount !== linkedDocumentIds.length) {
        return res.status(403).json({ success: false, error: 'One or more documents do not belong to you' });
      }
    }

    const asset = new Asset({
      userId: req.user.userId,
      name: name.trim(),
      category: assignedCategory,
      cardColor: cardColor || 'blue',
      tags: Array.isArray(tags) ? tags : [],
      customFields: Array.isArray(customFields) ? customFields : [],
      description: description || '',
      estimatedValue: estimatedValue || '',
      purchasePrice: purchasePrice ? Number(purchasePrice) : 0,
      purchaseDate: purchaseDate || null,
      status: status || 'Active',
      notes: notes || '',
      metadata: metadata || {},
      warrantyExpiry: computedWarrantyExpiry || null,
      warrantyDurationMonths: warrantyDurationMonths ? Number(warrantyDurationMonths) : null,
      insuranceExpiry: insuranceExpiry || null,
      pucExpiry: pucExpiry || null,
      nextService: nextService || null,
      icon: icon || (assignedCategory.toLowerCase().includes('vehicle') ? 'Car' : assignedCategory.toLowerCase().includes('appliance') ? 'Tv' : 'Box'),
      linkedDocumentIds: linkedDocumentIds || []
    });

    await asset.save();

    // 1. Record Asset Created Timeline Event
    await recordTimelineEvent({
      userId: req.user.userId,
      eventType: 'ASSET_CREATED',
      title: `Added ${asset.name} (${asset.category})`,
      description: asset.description || `Registered new ${asset.category} asset in vault.`,
      eventDate: purchaseDate || new Date().toISOString().split('T')[0],
      category: asset.category,
      assetId: asset._id,
      metadata: { purchasePrice, estimatedValue }
    });

    // 2. Synchronize Lifecycle Deadlines
    if (computedWarrantyExpiry) {
      await syncAssetDeadline({
        userId: req.user.userId,
        assetId: asset._id,
        title: `${asset.name} Warranty Expiry`,
        date: computedWarrantyExpiry,
        category: 'Warranty Expiry',
        action: 'Claim warranty or purchase AMC'
      });
    }

    if (insuranceExpiry) {
      await syncAssetDeadline({
        userId: req.user.userId,
        assetId: asset._id,
        title: `${asset.name} Insurance Expiry`,
        date: insuranceExpiry,
        category: 'Insurance Expiry',
        action: 'Renew insurance coverage'
      });
    }

    if (pucExpiry && asset.category === 'Vehicle') {
      await syncAssetDeadline({
        userId: req.user.userId,
        assetId: asset._id,
        title: `${asset.name} PUC Certificate Expiry`,
        date: pucExpiry,
        category: 'PUC Expiry',
        action: 'Renew vehicle emissions check'
      });
    }

    res.status(201).json({ success: true, data: asset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/assets/:id - Get single asset details with linked documents & timeline
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, userId: req.user.userId })
      .populate({
        path: 'linkedDocumentIds',
        select: 'title category format fileSizeFormatted expiryDate summary keyDetails'
      });

    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset not found or access denied' });
    }

    const [deadlines, expenses, timeline] = await Promise.all([
      Deadline.find({ userId: req.user.userId, linkedAssetId: asset._id }).sort({ date: 1 }),
      Expense.find({ userId: req.user.userId, assetId: asset._id }).sort({ date: -1 }),
      TimelineEvent.find({ userId: req.user.userId, assetId: asset._id }).sort({ eventDate: -1 })
    ]);

    const totalExpense = expenses.reduce((sum, item) => sum + (item.amount || 0), 0);

    res.json({
      success: true,
      data: {
        asset,
        deadlines,
        expenses,
        timeline,
        totalExpense
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/assets/:id - Update asset
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset not found or access denied' });
    }

    const updatableFields = [
      'name', 'category', 'description', 'estimatedValue', 'purchasePrice', 'purchaseDate',
      'status', 'notes', 'metadata', 'warrantyExpiry', 'warrantyDurationMonths',
      'insuranceExpiry', 'pucExpiry', 'nextService', 'icon', 'cardColor', 'tags', 'customFields'
    ];

    updatableFields.forEach(f => {
      if (req.body[f] !== undefined) asset[f] = req.body[f];
    });

    asset.updatedAt = new Date();
    await asset.save();

    // Re-sync deadlines if dates updated
    if (asset.warrantyExpiry) {
      await syncAssetDeadline({
        userId: req.user.userId,
        assetId: asset._id,
        title: `${asset.name} Warranty Expiry`,
        date: asset.warrantyExpiry,
        category: 'Warranty Expiry'
      });
    }

    if (asset.insuranceExpiry) {
      await syncAssetDeadline({
        userId: req.user.userId,
        assetId: asset._id,
        title: `${asset.name} Insurance Expiry`,
        date: asset.insuranceExpiry,
        category: 'Insurance Expiry'
      });
    }

    if (asset.pucExpiry && asset.category === 'Vehicle') {
      await syncAssetDeadline({
        userId: req.user.userId,
        assetId: asset._id,
        title: `${asset.name} PUC Certificate Expiry`,
        date: asset.pucExpiry,
        category: 'PUC Expiry'
      });
    }

    res.json({ success: true, data: asset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/assets/:id/documents - Link an existing document to this asset
router.post('/:id/documents', requireAuth, async (req, res) => {
  try {
    const { documentId } = req.body;
    if (!documentId) {
      return res.status(400).json({ success: false, error: 'documentId is required' });
    }

    const [asset, doc] = await Promise.all([
      Asset.findOne({ _id: req.params.id, userId: req.user.userId }),
      Document.findOne({ _id: documentId, userId: req.user.userId })
    ]);

    if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });
    if (!doc) return res.status(404).json({ success: false, error: 'Document not found or unauthorized' });

    // Prevent duplicate link
    if (!asset.linkedDocumentIds.includes(doc._id)) {
      asset.linkedDocumentIds.push(doc._id);
      await asset.save();
    }

    // If doc has expiry, automatically sync to asset deadline
    if (doc.expiryDate) {
      await syncAssetDeadline({
        userId: req.user.userId,
        assetId: asset._id,
        title: `${asset.name} - ${doc.title} Renewal`,
        date: doc.expiryDate,
        category: doc.category === 'Insurance' ? 'Insurance Expiry' : 'Policy Renewal',
        linkedDocId: doc._id
      });
    }

    await recordTimelineEvent({
      userId: req.user.userId,
      eventType: 'DOCUMENT_UPDATED',
      title: `Linked "${doc.title}" to ${asset.name}`,
      eventDate: new Date().toISOString().split('T')[0],
      category: asset.category,
      assetId: asset._id,
      documentId: doc._id
    });

    res.json({ success: true, message: 'Document linked successfully', data: asset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/assets/:id/documents/:documentId - Unlink document from asset
router.delete('/:id/documents/:documentId', requireAuth, async (req, res) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });

    asset.linkedDocumentIds = asset.linkedDocumentIds.filter(
      dId => dId.toString() !== req.params.documentId.toString()
    );
    await asset.save();

    res.json({ success: true, message: 'Document unlinked successfully', data: asset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/assets/:id/vehicle-wallet - Dedicated Vehicle Document & Compliance Wallet
router.get('/:id/vehicle-wallet', requireAuth, async (req, res) => {
  try {
    const asset = await Asset.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      category: 'Vehicle'
    }).populate('linkedDocumentIds');

    if (!asset) {
      return res.status(404).json({ success: false, error: 'Vehicle asset not found' });
    }

    const docs = asset.linkedDocumentIds || [];

    // Classify vehicle documents
    const rcDoc = docs.find(d => /registration|rc/i.test(d.title) || /registration|rc/i.test(d.category));
    const insDoc = docs.find(d => /insurance|policy/i.test(d.title) || /insurance/i.test(d.category));
    const pucDoc = docs.find(d => /puc|emission|pollution/i.test(d.title));
    const otherDocs = docs.filter(d => d !== rcDoc && d !== insDoc && d !== pucDoc);

    // Identify gaps as informational warnings (NOT legal non-compliance)
    const missingWarnings = [];
    if (!rcDoc) missingWarnings.push('Registration Certificate (RC) not attached in DocVault');
    if (!insDoc) missingWarnings.push('Vehicle Insurance Policy document not attached');
    if (!pucDoc) missingWarnings.push('Pollution Under Control (PUC) certificate not attached');

    // Fetch vehicle expenses
    const expenses = await Expense.find({ userId: req.user.userId, assetId: asset._id }).sort({ date: -1 });
    const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

    // Fetch upcoming deadlines
    const deadlines = await Deadline.find({
      userId: req.user.userId,
      linkedAssetId: asset._id,
      isCompleted: false
    }).sort({ date: 1 });

    res.json({
      success: true,
      data: {
        vehicle: asset,
        documents: {
          rc: rcDoc || null,
          insurance: insDoc || null,
          puc: pucDoc || null,
          others: otherDocs
        },
        missingWarnings,
        deadlines,
        expenses,
        totalSpent
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/assets/:id/policy-health - Rule-Based Insurance Policy Health Audit
router.get('/:id/policy-health', requireAuth, async (req, res) => {
  try {
    const asset = await Asset.findOne({ _id: req.params.id, userId: req.user.userId })
      .populate('linkedDocumentIds');

    if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });

    const auditChecks = [];
    let overallStatus = 'HEALTHY'; // HEALTHY, ATTENTION_REQUIRED, EXPIRED

    // 1. Insurance Document Check
    const insDoc = (asset.linkedDocumentIds || []).find(d => /insurance|policy/i.test(d.title) || /insurance/i.test(d.category));
    if (!insDoc) {
      overallStatus = 'ATTENTION_REQUIRED';
      auditChecks.push({
        check: 'Linked Policy Document',
        status: 'WARNING',
        message: 'No insurance document is currently linked to this asset.',
        action: 'Attach policy document'
      });
    } else {
      auditChecks.push({
        check: 'Linked Policy Document',
        status: 'PASSED',
        message: `Linked to "${insDoc.title}".`
      });
    }

    // 2. Expiration Check
    const expiry = asset.insuranceExpiry || insDoc?.expiryDate;
    if (!expiry) {
      auditChecks.push({
        check: 'Policy Validity Period',
        status: 'INFO',
        message: 'Expiration date not recorded. Please verify your policy renewal date.',
        action: 'Set expiry date'
      });
    } else {
      const today = new Date().toISOString().split('T')[0];
      if (expiry < today) {
        overallStatus = 'EXPIRED';
        auditChecks.push({
          check: 'Policy Validity Period',
          status: 'CRITICAL',
          message: `Insurance policy appears EXPIRED on ${expiry}. Please verify and update with your insurer.`,
          action: 'Renew policy immediately'
        });
      } else {
        const daysRemaining = Math.ceil((new Date(expiry).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        if (daysRemaining <= 30) {
          overallStatus = 'ATTENTION_REQUIRED';
          auditChecks.push({
            check: 'Policy Validity Period',
            status: 'WARNING',
            message: `Policy expires in ${daysRemaining} days (${expiry}). Renewal window is open.`,
            action: 'Initiate renewal'
          });
        } else {
          auditChecks.push({
            check: 'Policy Validity Period',
            status: 'PASSED',
            message: `Valid until ${expiry} (${daysRemaining} days remaining).`
          });
        }
      }
    }

    res.json({
      success: true,
      data: {
        assetId: asset._id,
        assetName: asset.name,
        overallStatus,
        auditChecks,
        disclaimer: 'This rule-based health audit checks document availability and expiration dates. It does not provide legal, financial, or underwriting guarantees regarding policy terms or claim eligibility.'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/assets/:id - Safely delete asset and linked deadlines/timeline
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const asset = await Asset.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!asset) {
      return res.status(404).json({ success: false, error: 'Asset not found or access denied' });
    }

    // Clean up associated deadlines & timeline events for this asset
    await Promise.all([
      Deadline.deleteMany({ linkedAssetId: asset._id, userId: req.user.userId }),
      Expense.deleteMany({ assetId: asset._id, userId: req.user.userId }),
      TimelineEvent.deleteMany({ assetId: asset._id, userId: req.user.userId })
    ]);

    res.json({ success: true, message: 'Asset, linked reminders, and expenses removed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
