import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { Deadline } from './deadline.model.js';
import { InAppNotification } from './inAppNotification.model.js';

const router = Router();

// GET /api/deadlines - Get all user deadlines with computed status & daysLeft
router.get('/', requireAuth, async (req, res) => {
  try {
    const deadlines = await Deadline.find({ userId: req.user.userId })
      .populate('linkedDocId', 'title category format')
      .populate('linkedAssetId', 'name category icon')
      .sort({ date: 1 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Compute live daysLeft and status at request time
    const computed = deadlines.map(d => {
      const targetDate = new Date(d.date);
      const diffTime = targetDate.getTime() - today.getTime();
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let status = d.status;
      let severity = d.severity;

      if (!d.isCompleted) {
        if (daysLeft < 0) {
          status = 'Overdue';
          severity = 'urgent';
        } else if (daysLeft <= 15) {
          status = 'Due Soon';
          severity = 'urgent';
        } else {
          status = 'Upcoming';
          severity = 'normal';
        }
      }

      return {
        ...d.toObject(),
        daysLeft,
        status,
        severity
      };
    });

    res.json({ success: true, count: computed.length, data: computed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/deadlines - Create custom deadline
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, description, date, category, priority, linkedAssetId, linkedDocId, action } = req.body;
    if (!title || !date) {
      return res.status(400).json({ success: false, error: 'Title and date are required' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(date);
    const diffTime = targetDate.getTime() - today.getTime();
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const status = daysLeft < 0 ? 'Overdue' : daysLeft <= 15 ? 'Due Soon' : 'Upcoming';
    const severity = daysLeft <= 15 ? 'urgent' : 'normal';

    const deadline = new Deadline({
      userId: req.user.userId,
      title: title.trim(),
      description: description || '',
      date,
      daysLeft,
      category: category || 'Custom',
      priority: priority || 'medium',
      status,
      severity,
      action: action || 'Action required',
      linkedAssetId: linkedAssetId || null,
      linkedDocId: linkedDocId || null
    });

    await deadline.save();

    res.status(201).json({ success: true, data: deadline });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/deadlines/:id/complete - Toggle completed state
router.patch('/:id/complete', requireAuth, async (req, res) => {
  try {
    const deadline = await Deadline.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!deadline) {
      return res.status(404).json({ success: false, error: 'Deadline not found' });
    }

    deadline.isCompleted = !deadline.isCompleted;
    deadline.status = deadline.isCompleted ? 'Completed' : 'Upcoming';
    await deadline.save();

    // If marked completed, dismiss active notifications
    if (deadline.isCompleted) {
      await InAppNotification.updateMany(
        { userId: req.user.userId, linkedDeadlineId: deadline._id },
        { read: true }
      ).catch(() => {});
    }

    res.json({ success: true, data: deadline });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/deadlines/:id - Update deadline details & reschedule
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const deadline = await Deadline.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!deadline) {
      return res.status(404).json({ success: false, error: 'Deadline not found' });
    }

    const { title, description, date, category, priority, action } = req.body;
    if (title) deadline.title = title.trim();
    if (description !== undefined) deadline.description = description;
    if (category) deadline.category = category;
    if (priority) deadline.priority = priority;
    if (action) deadline.action = action;

    if (date) {
      deadline.date = date;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const targetDate = new Date(date);
      deadline.daysLeft = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (!deadline.isCompleted) {
        deadline.status = deadline.daysLeft < 0 ? 'Overdue' : deadline.daysLeft <= 15 ? 'Due Soon' : 'Upcoming';
        deadline.severity = deadline.daysLeft <= 15 ? 'urgent' : 'normal';
      }
    }

    deadline.updatedAt = new Date();
    await deadline.save();

    res.json({ success: true, data: deadline });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/deadlines/:id - Delete deadline
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const deadline = await Deadline.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!deadline) {
      return res.status(404).json({ success: false, error: 'Deadline not found' });
    }

    // Clean up notifications for this deadline
    await InAppNotification.deleteMany({ linkedDeadlineId: req.params.id });

    res.json({ success: true, message: 'Deadline removed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/deadlines/calendar.ics - Export standard iCalendar file (Apple/Google sync)
router.get('/calendar.ics', async (req, res) => {
  try {
    const filter = req.user?.userId ? { userId: req.user.userId } : {};
    const deadlines = await Deadline.find(filter).sort({ date: 1 });

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//DocVault//Renewal Deadlines//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ];

    const todayStr = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    for (const item of deadlines) {
      if (!item.date) continue;
      const cleanDate = item.date.replace(/-/g, '').slice(0, 8);
      const uid = `${item._id}@docvault.app`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${todayStr}`,
        `DTSTART;VALUE=DATE:${cleanDate}`,
        `SUMMARY:DocVault Reminder: ${item.title.replace(/[\r\n]/g, ' ')}`,
        `DESCRIPTION:${(item.action || 'Renew document').replace(/[\r\n]/g, ' ')}. Days remaining: ${item.daysLeft}`,
        'STATUS:CONFIRMED',
        'END:VEVENT'
      );
    }

    lines.push('END:VCALENDAR');
    const icsContent = lines.join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="docvault-deadlines.ics"');
    res.send(icsContent);
  } catch (err) {
    res.status(500).send('Error generating calendar file');
  }
});

export default router;
