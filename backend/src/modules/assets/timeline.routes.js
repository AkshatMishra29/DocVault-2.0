import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { TimelineEvent } from './timelineEvent.model.js';

const router = Router();

// GET /api/timeline - Get chronological user lifecycle events with year & category filtering
router.get('/', requireAuth, async (req, res) => {
  try {
    const { year, category, assetId } = req.query;
    const filter = { userId: req.user.userId };

    if (year) filter.year = parseInt(year, 10);
    if (category) filter.category = category;
    if (assetId) filter.assetId = assetId;

    const [events, availableYears] = await Promise.all([
      TimelineEvent.find(filter)
        .populate('assetId', 'name category icon')
        .populate('documentId', 'title category format')
        .sort({ eventDate: -1, createdAt: -1 }),
      TimelineEvent.distinct('year', { userId: req.user.userId })
    ]);

    res.json({
      success: true,
      count: events.length,
      availableYears: availableYears.sort((a, b) => b - a),
      data: events
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

