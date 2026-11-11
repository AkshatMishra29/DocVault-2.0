import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { InAppNotification } from './inAppNotification.model.js';

const router = Router();

// GET /api/notifications - List user in-app notifications
router.get('/', requireAuth, async (req, res) => {
  try {
    const notifications = await InAppNotification.find({ userId: req.user.userId })
      .populate('linkedAssetId', 'name category icon')
      .populate('linkedDeadlineId', 'title date daysLeft')
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await InAppNotification.countDocuments({
      userId: req.user.userId,
      read: false
    });

    res.json({
      success: true,
      unreadCount,
      data: notifications
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/notifications/:id/read - Mark single notification as read
router.patch('/:id/read', requireAuth, async (req, res) => {
  try {
    const notif = await InAppNotification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { read: true },
      { returnDocument: 'after' }
    );
    if (!notif) return res.status(404).json({ success: false, error: 'Notification not found' });
    res.json({ success: true, data: notif });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/notifications/read-all - Mark all as read
router.patch('/read-all', requireAuth, async (req, res) => {
  try {
    await InAppNotification.updateMany({ userId: req.user.userId, read: false }, { read: true });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

