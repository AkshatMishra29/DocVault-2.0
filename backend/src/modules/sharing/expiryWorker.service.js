import { DocumentShareGrant, GRANT_STATUS } from './models/documentShareGrant.model.js';
import { ShareAccessLog, SHARE_ACTION } from './models/shareAccessLog.model.js';

let intervalId = null;

export async function processExpiredGrants() {
  try {
    const now = new Date();
    const expiredGrants = await DocumentShareGrant.find({
      status: GRANT_STATUS.ACTIVE,
      expiresAt: { $ne: null, $lte: now },
    });

    if (expiredGrants.length > 0) {
      console.log(`[Expiry Worker] Processing ${expiredGrants.length} expired document grants...`);
      for (const grant of expiredGrants) {
        grant.status = GRANT_STATUS.EXPIRED;
        await grant.save();

        await ShareAccessLog.create({
          ownerId: grant.ownerId,
          recipientId: grant.recipientId,
          documentId: grant.documentId,
          action: SHARE_ACTION.ACCESS_EXPIRED,
          metadata: { expiredAt: grant.expiresAt },
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('[Expiry Worker Error]:', err.message);
  }
}

export function startSharingExpiryWorker(intervalMs = 60000) {
  if (intervalId) return;
  console.log('[Expiry Worker] Background document expiry task scheduled (no Redis required).');
  // Run once on startup
  processExpiredGrants();
  // Check every minute
  intervalId = setInterval(processExpiredGrants, intervalMs);
}

