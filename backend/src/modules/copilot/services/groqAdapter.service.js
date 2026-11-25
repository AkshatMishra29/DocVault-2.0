import Groq from 'groq-sdk';
import { config } from '../../../config/index.js';

let groqClient = null;

function getGroqClient() {
  if (!groqClient && config.groq.apiKey) {
    groqClient = new Groq({ apiKey: config.groq.apiKey });
  }
  return groqClient;
}

// Production models available and verified on user Groq API key
export const COPILOT_MODELS = {
  PRIMARY: 'qwen/qwen3.8-27b',
  FALLBACK: 'openai/gpt-oss-120b',
  FAST: 'openai/gpt-oss-20b',
};

// Cooldown tracker when a model hits 429 rate limits
const modelCooldowns = new Map();

/**
 * Call Groq chat completions with tool definitions
 */
export async function callGroqWithTools({
  messages,
  tools = [],
  toolChoice = 'auto',
  model = COPILOT_MODELS.PRIMARY,
  temperature = 0.2,
  maxTokens = 2048,
}) {
  const client = getGroqClient();
  if (!client) {
    throw new Error('Groq API Key is not configured on server.');
  }

  // Skip primary if currently in 429 cooldown
  const cooldownUntil = modelCooldowns.get(model) || 0;
  const activeModel = Date.now() < cooldownUntil && model !== COPILOT_MODELS.FALLBACK
    ? COPILOT_MODELS.FALLBACK
    : model;

  const payload = {
    model: activeModel,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = toolChoice;
  }

  try {
    const response = await client.chat.completions.create(payload);
    return response;
  } catch (err) {
    if (err?.status === 429 || /rate_limit_exceeded/i.test(err?.message || '')) {
      modelCooldowns.set(activeModel, Date.now() + 5 * 60 * 1000);
    }
    console.warn(`[Copilot] Model ${activeModel} failed: ${err.message}. Retrying with fallback ${COPILOT_MODELS.FALLBACK}...`);
    if (activeModel !== COPILOT_MODELS.FALLBACK) {
      return client.chat.completions.create({
        ...payload,
        model: COPILOT_MODELS.FALLBACK,
      });
    }
    throw err;
  }
}
