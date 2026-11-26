/**
 * Intent Classifier Service
 * ==========================
 * Classifies the user's message into one of 9 Copilot intents using fast
 * regex + keyword heuristics (runs in <1ms, no network, no model needed).
 *
 * Benefits:
 *  1. Pre-selects the most relevant tool schemas → smaller Groq prompt → faster response
 *  2. Provides a tool_choice hint so the model calls the right tool first
 *  3. Enables semantic cache namespace (don't mix search vs deadline queries)
 *
 * Intents:
 *   search      – find / list / search documents
 *   deadline    – expiry / renewal / reminder / deadline
 *   compare     – compare two documents
 *   share       – share / connection / family
 *   flashcard   – asset / flashcard / card / create asset
 *   study       – study deck / quiz / learn
 *   upload      – upload / add document
 *   delete      – delete / remove / purge
 *   stats       – vault overview / how many / summary
 *   general     – fallback
 */

const INTENT_PATTERNS = [
  {
    intent: 'search',
    patterns: [
      /\b(find|search|look|show|list|get|fetch|where|which|what|retrieve|my)\b/i,
      /\b(document|invoice|receipt|policy|insurance|identity|medical|tax|bill|certificate|id|passport|aadhaar|pan)\b/i,
    ],
    minMatches: 1,
  },
  {
    intent: 'deadline',
    patterns: [
      /\b(expir|renew|deadline|reminder|due|upcoming|soon|overdue|alert|warranty|expire|renewal|notify)\b/i,
    ],
    minMatches: 1,
  },
  {
    intent: 'compare',
    patterns: [
      /\b(compar|versus|vs\.?|difference|differ|better|worse|between|contrast|side.by.side)\b/i,
    ],
    minMatches: 1,
  },
  {
    intent: 'share',
    patterns: [
      /\b(shar|family|connection|connect|link|access|grant|permission|trust|public|private|revoke)\b/i,
    ],
    minMatches: 1,
  },
  {
    intent: 'flashcard',
    patterns: [
      /\b(flashcard|asset|card|create asset|new asset|macbook|vehicle|appliance|electronics|property|gadget)\b/i,
    ],
    minMatches: 1,
  },
  {
    intent: 'study',
    patterns: [
      /\b(study|deck|quiz|learn|question|answer|test|practice|memorize|flashcard set)\b/i,
    ],
    minMatches: 1,
  },
  {
    intent: 'upload',
    patterns: [
      /\b(upload|add|import|attach|store|save|scan|photo|picture|image|drop|ingest)\b/i,
    ],
    minMatches: 1,
  },
  {
    intent: 'delete',
    patterns: [
      /\b(delete|remove|purge|destroy|erase|clear|wipe|discard)\b/i,
    ],
    minMatches: 1,
  },
  {
    intent: 'stats',
    patterns: [
      /\b(overview|summary|how many|total|count|vault|status|dashboard|report|analyze vault|my vault)\b/i,
    ],
    minMatches: 1,
  },
];

/**
 * Map of intent → preferred tools to surface to the model
 * (others are still available, just deprioritized via system context)
 */
const INTENT_PREFERRED_TOOLS = {
  search:    ['search_documents', 'ask_documents', 'extract_fields'],
  deadline:  ['list_deadlines', 'create_reminder', 'update_reminder'],
  compare:   ['compare_documents', 'search_documents'],
  share:     ['list_shares', 'create_share', 'revoke_share', 'send_connection_request'],
  flashcard: ['list_assets', 'create_asset', 'propose_flashcard_form', 'link_document_to_asset'],
  study:     ['list_study_decks', 'create_study_deck', 'ask_documents'],
  upload:    ['search_documents'],
  delete:    ['delete_document', 'search_documents'],
  stats:     ['search_documents', 'list_assets', 'list_deadlines', 'list_shares'],
  general:   null, // all tools
};

/**
 * Classify a user message into an intent.
 * @param {string} message
 * @returns {{ intent: string, preferredTools: string[] | null }}
 */
export function classifyIntent(message) {
  if (!message || typeof message !== 'string') {
    return { intent: 'general', preferredTools: null };
  }

  const scores = {};

  for (const { intent, patterns, minMatches } of INTENT_PATTERNS) {
    let matchCount = 0;
    for (const pattern of patterns) {
      if (pattern.test(message)) matchCount++;
    }
    if (matchCount >= minMatches) {
      scores[intent] = (scores[intent] || 0) + matchCount;
    }
  }

  // Pick highest-scored intent; tie-break by order above
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topIntent = sorted[0]?.[0] || 'general';

  return {
    intent: topIntent,
    preferredTools: INTENT_PREFERRED_TOOLS[topIntent] ?? null,
    scores, // expose for debugging / logging
  };
}
