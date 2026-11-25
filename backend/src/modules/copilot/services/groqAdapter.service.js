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

/**
 * Call Groq chat completions with tool definitions
 */
export async function callGroqWithTools({
  messages,
  tools = [],
  model = COPILOT_MODELS.PRIMARY,
  temperature = 0.2,
  maxTokens = 2048,
}) {
  const client = getGroqClient();
  if (!client) {
    throw new Error('Groq API Key is not configured on server.');
  }

  const payload = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
  }

  try {
    const response = await client.chat.completions.create(payload);
    return response;
  } catch (err) {
    console.warn(`[Copilot] Model ${model} failed: ${err.message}. Retrying with fallback ${COPILOT_MODELS.FALLBACK}...`);
    if (model !== COPILOT_MODELS.FALLBACK) {
      return client.chat.completions.create({
        ...payload,
        model: COPILOT_MODELS.FALLBACK,
      });
    }
    throw err;
  }
}
