/**
 * User Profile / Personalization Service
 * =========================================
 * Builds a lightweight user context summary from their vault data:
 *   - Most-used document categories
 *   - Documents expiring soon
 *   - Number of active assets and shares
 *   - Most recently accessed document titles
 *
 * This context block is injected into the Copilot system prompt so the LLM
 * immediately knows the user's vault shape without calling any tool first,
 * reducing tool-call iterations from 3-4 to 1-2 per query.
 *
 * Cache TTL: 5 minutes (re-fetched lazily when stale)
 */

import { Document, Asset, Deadline, DocumentShare } from '../../../models/index.js';

const profileCache = new Map(); // userId → { summary, builtAt }
const PROFILE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns a 4-6 line personalized vault summary string.
 * @param {string} userId
 * @returns {string}
 */
export async function getUserProfileContext(userId) {
  const cached = profileCache.get(userId);
  if (cached && Date.now() - cached.builtAt < PROFILE_TTL_MS) {
    return cached.summary;
  }

  try {
    const [docs, assets, deadlines, shares] = await Promise.all([
      Document.find({ userId })
        .select('category title expiryDate createdAt')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Asset.countDocuments({ userId }),
      Deadline.find({ userId, status: 'pending', dueDate: { $lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } })
        .select('title dueDate')
        .sort({ dueDate: 1 })
        .limit(5)
        .lean(),
      DocumentShare.countDocuments({ userId, status: 'active' }),
    ]);

    // Top categories by frequency
    const catCounts = {};
    for (const d of docs) {
      if (d.category) catCounts[d.category] = (catCounts[d.category] || 0) + 1;
    }
    const topCats = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([cat, n]) => `${cat} (${n})`)
      .join(', ');

    // Recent titles (last 5)
    const recentTitles = docs
      .slice(0, 5)
      .map((d) => `"${d.title}"`)
      .join(', ');

    // Expiring soon (next 60 days)
    const expiring = docs
      .filter((d) => d.expiryDate && new Date(d.expiryDate) < new Date(Date.now() + 60 * 24 * 60 * 60 * 1000))
      .slice(0, 3)
      .map((d) => `"${d.title}" on ${new Date(d.expiryDate).toLocaleDateString('en-IN')}`)
      .join(', ');

    // Upcoming deadlines
    const upcomingDeadlines = deadlines
      .slice(0, 3)
      .map((d) => `"${d.title}" due ${new Date(d.dueDate).toLocaleDateString('en-IN')}`)
      .join(', ');

    const lines = [
      `USER VAULT PROFILE (auto-injected personalization context):`,
      `• Total documents: ${docs.length} | Asset flashcards: ${assets} | Active shares: ${shares}`,
      topCats ? `• Most-used categories: ${topCats}` : null,
      recentTitles ? `• Recently added: ${recentTitles}` : null,
      expiring ? `• Expiring soon: ${expiring}` : null,
      upcomingDeadlines ? `• Upcoming deadlines: ${upcomingDeadlines}` : null,
    ].filter(Boolean);

    const summary = lines.join('\n');
    profileCache.set(userId, { summary, builtAt: Date.now() });
    return summary;
  } catch (err) {
    console.warn('[UserProfile] Failed to build profile context:', err.message);
    return '';
  }
}

/**
 * Invalidate cached profile for a user (call after document/asset mutations).
 * @param {string} userId
 */
export function invalidateUserProfile(userId) {
  profileCache.delete(userId);
}
