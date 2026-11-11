/**
 * In-Memory Sliding Window Rate Limiter for Document Uploads
 * Restricts excessive upload attempts per user to protect against resource exhaustion and DoS.
 */
const uploadHistory = new Map(); // userId -> Array of timestamps

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_UPLOADS_PER_WINDOW = 15; // Max 15 uploads per minute

export function checkUploadRateLimit(userId) {
  if (!userId) return { allowed: true };

  const now = Date.now();
  const timestamps = uploadHistory.get(String(userId)) || [];

  // Evict timestamps outside sliding window
  const recent = timestamps.filter(t => now - t < WINDOW_MS);

  if (recent.length >= MAX_UPLOADS_PER_WINDOW) {
    const oldest = recent[0];
    const retryAfterSec = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
    return {
      allowed: false,
      error: `Upload rate limit exceeded. Please wait ${retryAfterSec} seconds before uploading more documents.`,
      retryAfterSec
    };
  }

  recent.push(now);
  uploadHistory.set(String(userId), recent);

  // Periodically clean stale entries from map
  if (uploadHistory.size > 2000) {
    for (const [uid, times] of uploadHistory.entries()) {
      if (times.every(t => now - t >= WINDOW_MS)) {
        uploadHistory.delete(uid);
      }
    }
  }

  return { allowed: true };
}
