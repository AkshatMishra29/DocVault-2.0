/**
 * Conversational & Courtesy Intent Classifier (Fast-Path)
 *
 * Provides sub-millisecond local classification for conversational pleasantries,
 * greetings, gratitude, farewells, and assistant capabilities.
 *
 * Eliminates redundant LLM egress, embedding generation, and database scans
 * for non-document turns while maintaining natural, warm, production-grade dialogue.
 */

// Critical domain keywords that indicate a document or asset query
const VAULT_DOMAIN_KEYWORDS = /\b(?:doc|docs|document\w*|certif\w*|certf\w*|bill\w*|receipt\w*|invoice\w*|policy|policies|warrant\w*|statement\w*|account\w*|tax\w*|gst\w*|salary|amount\w*|price\w*|cost\w*|due|date\w*|when|expiry|expire\w*|serial\w*|macbook|laptop|honda|car|cars|vehicle\w*|engine|chassis|aadhaar|pan|license\w*|report\w*)\b/i;

/**
 * Classifies whether a user prompt is purely conversational and returns a tailored response.
 * Returns null if the query contains domain-specific document/asset questions.
 */
export function classifyConversationalIntent(query = '') {
  if (!query || typeof query !== 'string') return null;

  const raw = query.trim();
  // Strip trailing punctuation and excessive whitespaces
  const trimmed = raw.toLowerCase().replace(/[!?.,;:\-]+$/g, '').trim();

  // If the query contains explicit document/asset domain terms, always route to RAG
  if (VAULT_DOMAIN_KEYWORDS.test(trimmed)) {
    return null;
  }

  // 1. Pure Gratitude / Appreciation
  const gratitudePatterns = [
    /^(?:nice\s+)?thanks(?:\s+(?:a\s+lot|so\s+much|man|bro|mate|docvault|assistant|copilot))?$/i,
    /^thank\s+you(?:\s+(?:so\s+much|very\s+much|a\s+lot|docvault|copilot|assistant))?$/i,
    /^(?:nice|great|awesome|superb|wonderful|amazing|brilliant|excellent|cool)(?:\s+(?:job|work|thanks|thank\s+you))?$/i,
    /^(?:much\s+)?appreciated?$/i,
    /^(?:that\s+(?:was|is)\s+)?(?:very\s+)?helpful(?:\s+thanks)?$/i,
    /^(?:got\s+it|noted|understood|ok\s+thanks|okay\s+thanks)(?:\s+so\s+much)?$/i,
    /^(?:love\s+it|kudos|well\s+done)$/i
  ];

  for (const pat of gratitudePatterns) {
    if (pat.test(trimmed)) {
      return {
        type: 'GRATITUDE',
        response: "You're very welcome! If you need help with any other documents or tracked assets in your DocVault, feel free to ask anytime."
      };
    }
  }

  // 2. Pure Greetings
  const greetingPatterns = [
    /^(?:hi|hello|hey|heyy|heya|hiya|hola|namaste|greetings)(?:\s+there|\s+docvault|\s+assistant|\s+copilot|\s+ai)?$/i,
    /^good\s+(?:morning|afternoon|evening|day)(?:\s+there|\s+docvault)?$/i,
    /^what'?s\s+up(?:\s+docvault)?$/i,
    /^howdy(?:\s+there)?$/i
  ];

  for (const pat of greetingPatterns) {
    if (pat.test(trimmed)) {
      return {
        type: 'GREETING',
        response: "Hello! I am your DocVault AI Copilot. How can I assist you with your stored policies, certificates, invoices, or tracked assets today?"
      };
    }
  }

  // 3. Pure Farewells
  const farewellPatterns = [
    /^(?:bye|goodbye|cya|see\s+ya|see\s+you|talk\s+to\s+you\s+later|farewell|good\s+night|have\s+a\s+good\s+(?:day|night|one))$/i,
    /^take\s+care$/i
  ];

  for (const pat of farewellPatterns) {
    if (pat.test(trimmed)) {
      return {
        type: 'FAREWELL',
        response: "Goodbye! Your documents and records remain securely encrypted in your DocVault. Have a great day!"
      };
    }
  }

  // 4. Assistant Identity & Capabilities
  const identityPatterns = [
    /^(?:who\s+are\s+you|what\s+are\s+you|what\s+is\s+docvault\s*ai|introduce\s+yourself)$/i,
    /^(?:what\s+can\s+you\s+do|how\s+can\s+you\s+help(?:\s+me)?|what\s+are\s+your\s+capabilities|help(?:\s+me)?)$/i
  ];

  for (const pat of identityPatterns) {
    if (pat.test(trimmed)) {
      return {
        type: 'IDENTITY',
        response: `I am your **DocVault AI Copilot**, your privacy-first intelligent assistant for personal document and asset intelligence.\n\nHere is how I can assist you:\n• **Instant Fact Retrieval:** Look up issue dates, due dates, policy numbers, or billing amounts from your stored certificates, invoices, and bills.\n• **Asset Flashcards:** Ask about device warranties, serial numbers, and purchase dates for your tracked hardware.\n• **Clause & Condition Search:** Search for specific contractual clauses, coverage terms, or SLAs across multi-page documents.\n• **Direct Source Forwarding:** Access verified, deep-linked preview cards to inspect the original document directly.\n\nTry asking: *"what is the issue date of my AMD certificate"* or *"when does my MacBook warranty expire"*!`
      };
    }
  }

  // 5. Pure Acknowledgment & Conversational Fillers
  const acknowledgmentPatterns = [
    /^(?:ok|okay|cool|alright|all\s+right|sure|fine|sounds\s+good|perfect|done|yes|yeah|yep)$/i
  ];

  for (const pat of acknowledgmentPatterns) {
    if (pat.test(trimmed)) {
      return {
        type: 'ACKNOWLEDGMENT',
        response: "Glad to help! Let me know if you need any other details or verification from your vault."
      };
    }
  }

  return null;
}
