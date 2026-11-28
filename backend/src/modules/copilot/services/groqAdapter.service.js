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
  PRIMARY:  'qwen/qwen3.8-27b',
  FALLBACK: 'openai/gpt-oss-120b',
  FAST:     'openai/gpt-oss-20b',
};

// Cooldown tracker when a model hits 429 rate limits
const modelCooldowns = new Map();

/**
 * Helper to strip `<think>...</think>` reasoning blocks seamlessly during SSE token streaming
 */
function createThinkStripper(onVisibleText) {
  let buffer = '';
  let inThink = false;

  return {
    push(chunk) {
      if (!chunk) return;
      buffer += chunk;

      while (buffer.length > 0) {
        if (inThink) {
          const closeIdx = buffer.indexOf('</think>');
          if (closeIdx === -1) {
            // Keep only tail in case `</think>` spans across chunks
            if (buffer.length > 8) {
              buffer = buffer.slice(-8);
            }
            return;
          }
          buffer = buffer.slice(closeIdx + 8);
          inThink = false;
        } else {
          const openIdx = buffer.indexOf('<think>');
          if (openIdx === -1) {
            // Hold back potential partial `<think>` prefix at end of chunk
            const partialStart = buffer.lastIndexOf('<');
            if (partialStart !== -1 && buffer.length - partialStart < 7 && '<think>'.startsWith(buffer.slice(partialStart))) {
              const safe = buffer.slice(0, partialStart);
              if (safe) onVisibleText(safe);
              buffer = buffer.slice(partialStart);
              return;
            }
            onVisibleText(buffer);
            buffer = '';
            return;
          }
          const before = buffer.slice(0, openIdx);
          if (before) onVisibleText(before);
          buffer = buffer.slice(openIdx + 7);
          inThink = true;
        }
      }
    },
    flush() {
      if (!inThink && buffer) {
        const cleaned = buffer.replace(/<\/?tool_call>/gi, '');
        if (cleaned) onVisibleText(cleaned);
      }
      buffer = '';
    },
  };
}

/**
 * Non-streaming fallback / utility call
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
    return await client.chat.completions.create(payload);
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

/**
 * Real-time SSE token-streaming Groq call with incremental tool_call reassembly.
 * Reduces perceived Time-To-First-Token from 3-5s down to ~250ms.
 */
export async function callGroqWithToolsStream({
  messages,
  tools = [],
  toolChoice = 'auto',
  model = COPILOT_MODELS.PRIMARY,
  temperature = 0.2,
  maxTokens = 1800,
  abortSignal,
  onTextDelta,
}) {
  const client = getGroqClient();
  if (!client) {
    throw new Error('Groq API Key is not configured on server.');
  }

  const cooldownUntil = modelCooldowns.get(model) || 0;
  const activeModel = Date.now() < cooldownUntil && model !== COPILOT_MODELS.FALLBACK
    ? COPILOT_MODELS.FALLBACK
    : model;

  const runStream = async (targetModel) => {
    const payload = {
      model: targetModel,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    };
    if (tools.length > 0 && toolChoice !== 'none') {
      payload.tools = tools;
      payload.tool_choice = toolChoice;
    }

    const stream = await client.chat.completions.create(payload, { signal: abortSignal });

    let fullRawContent = '';
    let fullVisibleContent = '';
    const toolCallsByIndex = new Map();
    let usage = null;
    let resolvedModel = targetModel;

    const stripper = createThinkStripper((visible) => {
      fullVisibleContent += visible;
      if (onTextDelta) onTextDelta(visible);
    });

    for await (const chunk of stream) {
      if (abortSignal?.aborted) break;
      if (chunk.model) resolvedModel = chunk.model;
      if (chunk.x_groq?.usage || chunk.usage) {
        usage = chunk.x_groq?.usage || chunk.usage;
      }

      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;

      if (typeof delta.content === 'string' && delta.content.length > 0) {
        fullRawContent += delta.content;
        stripper.push(delta.content);
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCallsByIndex.has(idx)) {
            toolCallsByIndex.set(idx, {
              id: tc.id || `call_${idx}_${Date.now()}`,
              type: 'function',
              function: {
                name: tc.function?.name || '',
                arguments: tc.function?.arguments || '',
              },
            });
          } else {
            const existing = toolCallsByIndex.get(idx);
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.function.name += tc.function.name;
            if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
          }
        }
      }
    }

    stripper.flush();

    const toolCalls = Array.from(toolCallsByIndex.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v);

    return {
      model: resolvedModel,
      usage,
      rawContent: fullRawContent,
      visibleContent: fullVisibleContent.trim(),
      toolCalls,
    };
  };

  try {
    return await runStream(activeModel);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    if (err?.status === 429 || /rate_limit_exceeded/i.test(err?.message || '')) {
      modelCooldowns.set(activeModel, Date.now() + 5 * 60 * 1000);
    }
    if (activeModel !== COPILOT_MODELS.FALLBACK) {
      console.warn(`[Copilot Stream] Model ${activeModel} failed (${err.message}), falling back to ${COPILOT_MODELS.FALLBACK}`);
      return await runStream(COPILOT_MODELS.FALLBACK);
    }
    throw err;
  }
}
