import { TimelineEvent } from './timelineEvent.model.js';
import { Deadline } from '../deadlines/deadline.model.js';
import { InAppNotification } from '../deadlines/inAppNotification.model.js';

/**
 * Record a timeline event idempotently
 */
export async function recordTimelineEvent({
  userId,
  eventType,
  title,
  description = '',
  eventDate,
  category = 'General',
  assetId = null,
  documentId = null,
  deadlineId = null,
  expenseId = null,
  metadata = {}
}) {
  try {
    if (!userId || !eventType || !title || !eventDate) return null;

    const parsedYear = parseInt(eventDate.slice(0, 4), 10) || new Date().getFullYear();

    // Check for existing duplicate event on this date
    const existing = await TimelineEvent.findOne({
      userId,
      eventType,
      title,
      eventDate,
      ...(assetId ? { assetId } : {}),
      ...(documentId ? { documentId } : {})
    });

    if (existing) return existing;

    return await TimelineEvent.create({
      userId,
      eventType,
      title,
      description,
      eventDate,
      year: parsedYear,
      category,
      assetId,
      documentId,
      deadlineId,
      expenseId,
      metadata
    });
  } catch (err) {
    console.warn('[TimelineService] Failed to record event:', err.message);
    return null;
  }
}

/**
 * Sync or create a deadline linked to an asset or document idempotently
 */
export async function syncAssetDeadline({
  userId,
  assetId,
  title,
  date,
  category,
  action = 'Renew / Inspect',
  linkedDocId = null
}) {
  try {
    if (!userId || !assetId || !title || !date) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(date);
    const diffTime = targetDate.getTime() - today.getTime();
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let severity = 'normal';
    let status = 'Upcoming';

    if (daysLeft < 0) {
      severity = 'urgent';
      status = 'Overdue';
    } else if (daysLeft <= 15) {
      severity = 'urgent';
      status = 'Due Soon';
    }

    const deadline = await Deadline.findOneAndUpdate(
      { userId, linkedAssetId: assetId, category },
      {
        userId,
        title,
        date,
        daysLeft,
        category,
        severity,
        status,
        action,
        linkedAssetId: assetId,
        ...(linkedDocId ? { linkedDocId } : {}),
        updatedAt: new Date()
      },
      { upsert: true, returnDocument: 'after' }
    );

    // If urgent or due soon, notify user
    if (status === 'Due Soon' || status === 'Overdue') {
      await InAppNotification.findOneAndUpdate(
        { userId, linkedDeadlineId: deadline._id },
        {
          userId,
          title: `${title} is ${status}`,
          message: `Scheduled for ${date}. ${daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue!` : `${daysLeft} days remaining.`}`,
          type: 'DEADLINE_REMINDER',
          severity: status === 'Overdue' ? 'critical' : 'warning',
          linkUrl: '/deadlines',
          linkedAssetId: assetId,
          linkedDeadlineId: deadline._id
        },
        { upsert: true }
      ).catch(() => {});
    }

    return deadline;
  } catch (err) {
    console.warn('[AssetLifecycleService] Sync deadline error:', err.message);
    return null;
  }
}

