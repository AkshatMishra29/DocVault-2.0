import { TokenLedger } from './tokenLedger.model.js';

/**
 * Token Optimization, Ledger & Quota Defense Service
 *
 * Enforces:
 * - Persistent MongoDB token auditing per user and per document.
 * - Daily token budgets (User & Global).
 * - Circuit breaker threshold alert at 80% consumption.
 */

const DEFAULT_USER_DAILY_LIMIT = parseInt(process.env.USER_DAILY_TOKEN_LIMIT || '50000', 10);
const DEFAULT_GLOBAL_DAILY_LIMIT = parseInt(process.env.GLOBAL_DAILY_TOKEN_LIMIT || '500000', 10);

/**
 * Record LLM Token Consumption in MongoDB
 */
export async function recordTokenUsage({
  userId,
  documentId = null,
  provider = 'groq',
  model,
  inputTokens = 0,
  outputTokens = 0,
  processingStage = 'extraction_fallback',
}) {
  try {
    const totalTokens = inputTokens + outputTokens;
    const entry = await TokenLedger.create({
      userId,
      documentId,
      provider,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      processingStage,
    });

    console.log(
      `[Token Ledger] Recorded ${totalTokens} tokens for user ${userId} (${provider}/${model}) in stage "${processingStage}".`
    );
    return entry;
  } catch (err) {
    console.warn('[Token Ledger] Failed to save token ledger entry:', err.message);
    return null;
  }
}

/**
 * Checks whether user or system has exceeded daily token budgets
 */
export async function checkTokenBudget(userId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // 1. Calculate user daily usage
  const userUsage = await TokenLedger.aggregate([
    { $match: { userId, timestamp: { $gte: startOfDay } } },
    { $group: { _id: null, total: { $sum: '$totalTokens' } } },
  ]);
  const userTotal = userUsage[0]?.total || 0;

  // 2. Calculate global daily usage
  const globalUsage = await TokenLedger.aggregate([
    { $match: { timestamp: { $gte: startOfDay } } },
    { $group: { _id: null, total: { $sum: '$totalTokens' } } },
  ]);
  const globalTotal = globalUsage[0]?.total || 0;

  const isUserExceeded = userTotal >= DEFAULT_USER_DAILY_LIMIT;
  const isGlobalExceeded = globalTotal >= DEFAULT_GLOBAL_DAILY_LIMIT;

  // 80% Alert Threshold
  if (userTotal >= DEFAULT_USER_DAILY_LIMIT * 0.8) {
    console.warn(
      `[Token Budget ALERT] User ${userId} has consumed ${userTotal}/${DEFAULT_USER_DAILY_LIMIT} (>= 80%) of daily token limit.`
    );
  }

  if (isUserExceeded || isGlobalExceeded) {
    return {
      allowed: false,
      reason: isUserExceeded
        ? `Daily AI token limit reached (${userTotal}/${DEFAULT_USER_DAILY_LIMIT}). Please wait for midnight reset.`
        : 'Global daily AI token quota reached across the platform.',
      userTotal,
      globalTotal,
    };
  }

  return {
    allowed: true,
    userTotal,
    globalTotal,
    remainingUserTokens: DEFAULT_USER_DAILY_LIMIT - userTotal,
  };
}
