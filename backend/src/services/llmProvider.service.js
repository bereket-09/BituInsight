const config = require('../config');
const logger = require('../utils/logger');

/**
 * Provider abstraction for the executive-narrative feature.
 *
 * Two transports cover the field:
 *
 *  - `openai`    OpenAI Chat Completions. This is the lingua franca — OpenAI,
 *                Ollama, LM Studio, vLLM, Groq, Together and OpenRouter all
 *                speak it, so one client covers nearly every deployment.
 *  - `anthropic` The native Messages API, kept as its own implementation so the
 *                existing adaptive-thinking + schema-enforced behaviour is
 *                preserved bit-for-bit rather than approximated.
 *
 * Every provider exposes the same call:
 *
 *   complete({ system, user, schema, schemaName, signal })
 *     -> { text, model, usage, refusal, jsonMode }
 *
 * Callers are expected to treat `text` as untrusted and parse it defensively;
 * only the Anthropic transport and strict OpenAI structured outputs guarantee
 * well-formed JSON, and even they are not trusted blindly.
 */

// Structured-output strategies, strongest first. Providers are probed in this
// order and the first one the endpoint accepts is remembered for the process.
const JSON_MODES = ['json_schema', 'json_object', 'prompt'];

let cachedProvider;

function pickConstructor(mod) {
  return mod?.OpenAI || mod?.default || mod;
}

/**
 * True when a request failed because the server does not understand the
 * structured-output parameters — as opposed to being unreachable, throttled or
 * unauthorised, none of which are fixed by dropping to a weaker JSON mode.
 */
function isUnsupportedParameterError(err) {
  if (typeof err?.status !== 'number') return false; // connection error / timeout
  if (![400, 404, 415, 422, 500, 501].includes(err.status)) return false;
  const message = String(err?.message || '').toLowerCase();
  return /response_format|json_schema|json mode|json object|structured output|schema|unsupported|not supported|unrecognized|unknown (field|parameter|argument)|invalid[_ ](request[_ ])?(argument|parameter|value)|extra inputs/.test(
    message
  );
}

/** Groq and the newer OpenAI models renamed max_tokens to max_completion_tokens. */
function wantsMaxCompletionTokens(err) {
  return /max_completion_tokens/i.test(String(err?.message || ''));
}

function responseFormatFor(mode, schema, schemaName) {
  if (mode === 'json_schema') {
    return {
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
    };
  }
  if (mode === 'json_object') return { response_format: { type: 'json_object' } };
  return {};
}

function createOpenAIProvider(settings) {
  const OpenAI = pickConstructor(require('openai'));
  const client = new OpenAI({
    // Local servers (Ollama, LM Studio, vLLM) have no API key, but the SDK
    // refuses to construct without a non-empty string. They ignore the value.
    apiKey: settings.apiKey || 'not-required',
    baseURL: settings.baseUrl || undefined,
    timeout: settings.timeoutMs,
    maxRetries: settings.maxRetries,
  });

  // Remembered across reports so we probe an endpoint's capabilities once.
  let jsonMode = JSON_MODES[0];
  let tokenParam = 'max_tokens';

  async function complete({ system, user, schema, schemaName, signal }) {
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    let attempts = JSON_MODES.slice(JSON_MODES.indexOf(jsonMode));
    let lastError = null;

    while (attempts.length) {
      const mode = attempts[0];
      const body = {
        model: settings.model,
        messages,
        temperature: 0.2,
        ...responseFormatFor(mode, schema, schemaName),
      };
      if (settings.maxTokens) body[tokenParam] = settings.maxTokens;

      try {
        const response = await client.chat.completions.create(body, {
          signal,
          timeout: settings.timeoutMs,
        });
        jsonMode = mode; // this endpoint accepts it — stop probing next time
        const choice = response?.choices?.[0];
        return {
          text: choice?.message?.content || '',
          model: response?.model || settings.model,
          jsonMode: mode,
          refusal: choice?.message?.refusal
            ? { reason: choice.message.refusal }
            : choice?.finish_reason === 'content_filter'
              ? { reason: 'content_filter' }
              : null,
          usage: {
            inputTokens: response?.usage?.prompt_tokens,
            outputTokens: response?.usage?.completion_tokens,
          },
        };
      } catch (err) {
        if (settings.maxTokens && tokenParam === 'max_tokens' && wantsMaxCompletionTokens(err)) {
          tokenParam = 'max_completion_tokens';
          continue; // same JSON mode, corrected parameter name
        }
        if (attempts.length > 1 && isUnsupportedParameterError(err)) {
          logger.debug?.('Narrative endpoint rejected a structured-output mode — downgrading', {
            provider: settings.provider,
            from: mode,
            to: attempts[1],
            error: err.message,
          });
          lastError = err;
          attempts = attempts.slice(1);
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error('No structured-output mode succeeded');
  }

  return { name: settings.provider, transport: 'openai', model: settings.model, complete };
}

function createAnthropicProvider(settings) {
  const Anthropic = pickConstructor(require('@anthropic-ai/sdk'));
  const client = new Anthropic({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl || undefined,
    timeout: settings.timeoutMs,
    maxRetries: settings.maxRetries,
  });

  async function complete({ system, user, schema, signal }) {
    const response = await client.messages.create(
      {
        model: settings.model,
        max_tokens: settings.maxTokens || 4096,
        system,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema },
        },
        messages: [{ role: 'user', content: user }],
      },
      { signal, timeout: settings.timeoutMs }
    );

    if (response.stop_reason === 'refusal') {
      return {
        text: '',
        model: response.model,
        jsonMode: 'json_schema',
        refusal: { reason: response.stop_details?.category || 'refusal' },
        usage: {},
      };
    }

    const textBlock = response.content?.find((block) => block.type === 'text');
    return {
      text: textBlock?.text || '',
      model: response.model,
      jsonMode: 'json_schema',
      refusal: null,
      usage: {
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      },
    };
  }

  return { name: settings.provider, transport: 'anthropic', model: settings.model, complete };
}

/**
 * Builds (once) the provider described by config.llm.
 * Returns null when the feature is not configured or the SDK will not load —
 * both are ordinary states that leave the deterministic narrative in place.
 */
function getProvider(settings = config.llm) {
  if (cachedProvider !== undefined) return cachedProvider;
  cachedProvider = null;

  if (!settings?.enabled) return cachedProvider;

  try {
    cachedProvider =
      settings.transport === 'anthropic'
        ? createAnthropicProvider(settings)
        : createOpenAIProvider(settings);
    logger.info('Narrative provider ready', {
      provider: settings.provider,
      transport: settings.transport,
      model: settings.model,
      baseUrl: settings.baseUrl || 'default',
    });
  } catch (err) {
    logger.warn('Narrative provider unavailable — falling back to deterministic summaries', {
      provider: settings.provider,
      error: err.message,
    });
    cachedProvider = null;
  }

  return cachedProvider;
}

/**
 * Runs `fn` under a hard deadline. The AbortSignal is handed to the SDK so the
 * socket is actually torn down — an Ollama host that is down, or a proxy that
 * accepts the connection and never answers, must not hold an upload open.
 */
async function withDeadline(ms, fn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Test seam: drop the memoised client so config changes take effect. */
function resetProvider() {
  cachedProvider = undefined;
}

module.exports = {
  getProvider,
  withDeadline,
  resetProvider,
  isUnsupportedParameterError,
  JSON_MODES,
};
