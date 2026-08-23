/**
 * Resolves which LLM the executive-narrative feature should talk to.
 *
 * The platform is not tied to one vendor. Almost every inference server in use
 * today — OpenAI, Ollama, LM Studio, vLLM, Groq, Together, OpenRouter — speaks
 * the OpenAI Chat Completions wire format, so that is the common transport.
 * Anthropic keeps its own native transport so its existing behaviour (adaptive
 * thinking + schema-enforced output) is preserved exactly.
 *
 * Nothing here is required. With no configuration at all the resolver reports
 * `enabled: false` and every report falls back to the deterministic narrative.
 */

// Transport: which client implementation handles the provider.
const OPENAI_TRANSPORT = 'openai';
const ANTHROPIC_TRANSPORT = 'anthropic';

/**
 * Known provider presets. Anything not listed here is still accepted and
 * treated as a generic OpenAI-compatible endpoint, so a new vendor only needs
 * LLM_BASE_URL — no code change.
 */
const PRESETS = {
  openai: {
    transport: OPENAI_TRANSPORT,
    baseUrl: '', // SDK default: https://api.openai.com/v1
    model: 'gpt-4o-mini',
    keyless: false,
  },
  ollama: {
    transport: OPENAI_TRANSPORT,
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    keyless: true, // a local Ollama has no concept of an API key
  },
  lmstudio: {
    transport: OPENAI_TRANSPORT,
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    keyless: true,
  },
  vllm: {
    transport: OPENAI_TRANSPORT,
    baseUrl: 'http://localhost:8000/v1',
    model: 'local-model',
    keyless: true,
  },
  groq: {
    transport: OPENAI_TRANSPORT,
    baseUrl: 'https://api.groq.com/openai/v1',
    // Verified against the live API: honours JSON mode and stays inside the
    // numbers it was given. Groq also wants max_completion_tokens rather than
    // max_tokens, which the OpenAI transport negotiates on its own.
    model: 'openai/gpt-oss-120b',
    keyless: false,
  },
  together: {
    transport: OPENAI_TRANSPORT,
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    keyless: false,
  },
  openrouter: {
    transport: OPENAI_TRANSPORT,
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    keyless: false,
  },
  anthropic: {
    transport: ANTHROPIC_TRANSPORT,
    baseUrl: '', // SDK default: https://api.anthropic.com
    model: 'claude-opus-5',
    keyless: false,
  },
};

// Spellings people actually type, mapped onto the presets above.
const ALIASES = {
  'openai-compatible': 'openai',
  compatible: 'openai',
  custom: 'openai',
  oai: 'openai',
  azure: 'openai',
  'lm-studio': 'lmstudio',
  claude: 'anthropic',
  'llama.cpp': 'lmstudio',
  llamacpp: 'lmstudio',
};

const DISABLED = new Set(['none', 'off', 'disabled', 'false', 'no', 'deterministic']);

const LOCAL_HOSTS =
  /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?|host\.docker\.internal|[a-z0-9-]+\.local)$/i;

/** A model server on this machine (or the docker host) needs no credentials. */
function isLocalEndpoint(baseUrl) {
  if (!baseUrl) return false;
  try {
    return LOCAL_HOSTS.test(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Pick a provider when LLM_PROVIDER is absent or set to "auto".
 *
 * The generic LLM_* variables win, so an operator who opts into the new config
 * gets what they asked for. Otherwise a bare ANTHROPIC_API_KEY — the only thing
 * that existed before this was provider-agnostic — keeps working untouched.
 */
function autoDetect(env) {
  if (clean(env.LLM_BASE_URL) || clean(env.LLM_API_KEY)) return 'openai';
  if (clean(env.OPENAI_API_KEY) || clean(env.OPENAI_BASE_URL)) return 'openai';
  if (clean(env.GROQ_API_KEY)) return 'groq';
  if (clean(env.OLLAMA_BASE_URL) || clean(env.OLLAMA_HOST)) return 'ollama';
  if (clean(env.ANTHROPIC_API_KEY)) return 'anthropic';
  return 'none';
}

function normalizeBaseUrl(url) {
  return url ? url.replace(/\/+$/, '') : '';
}

function resolveLlmConfig(env = process.env) {
  const requested = clean(env.LLM_PROVIDER).toLowerCase();
  const name = !requested || requested === 'auto' ? autoDetect(env) : requested;

  if (DISABLED.has(name)) {
    return {
      provider: 'none',
      transport: null,
      enabled: false,
      // Told to stay off, versus simply never configured. Both keep the
      // deterministic narrative; only the log line differs.
      reason: DISABLED.has(requested) ? 'disabled' : 'not_configured',
      baseUrl: '',
      model: '',
      apiKey: '',
      timeoutMs: positiveInt(env.LLM_TIMEOUT_MS, 30000),
      maxRetries: nonNegativeInt(env.LLM_MAX_RETRIES, 1),
      maxTokens: positiveInt(env.LLM_MAX_TOKENS, 0) || null,
      known: true,
    };
  }

  const key = ALIASES[name] || name;
  const preset = PRESETS[key];
  // An unknown name is not an error: treat it as a generic OpenAI-compatible
  // endpoint so a brand-new vendor works with LLM_BASE_URL alone.
  const resolved = preset || { ...PRESETS.openai, model: '' };

  const baseUrl = normalizeBaseUrl(
    clean(env.LLM_BASE_URL) ||
      (resolved.transport === OPENAI_TRANSPORT ? clean(env.OPENAI_BASE_URL) : '') ||
      (key === 'ollama' ? clean(env.OLLAMA_BASE_URL) : '') ||
      resolved.baseUrl
  );

  // LLM_API_KEY is the portable name; the vendor's own conventional variable
  // (OPENAI_API_KEY, GROQ_API_KEY, ANTHROPIC_API_KEY, …) is accepted too so an
  // existing deployment does not have to rename anything.
  const vendorKeyVar = `${key.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`;
  const apiKey = clean(env.LLM_API_KEY) || clean(env[vendorKeyVar]) || '';

  const model = clean(env.LLM_MODEL) || resolved.model;

  // Local model servers are keyless by design; refusing to run without a key
  // would make Ollama look "not configured" when it is working fine.
  const keyless = resolved.keyless || isLocalEndpoint(baseUrl);
  const hasCredentials = Boolean(apiKey) || keyless;

  let reason = null;
  if (!hasCredentials) reason = 'no_api_key';
  else if (!model) reason = 'no_model';

  return {
    provider: key,
    transport: resolved.transport,
    enabled: !reason,
    reason,
    baseUrl,
    model,
    apiKey,
    keyless,
    known: Boolean(preset),
    // One total budget for the call, retries included. A local Ollama that is
    // not running must never hold an upload open.
    timeoutMs: positiveInt(env.LLM_TIMEOUT_MS, 30000),
    maxRetries: nonNegativeInt(env.LLM_MAX_RETRIES, 1),
    maxTokens: positiveInt(env.LLM_MAX_TOKENS, 0) || null,
  };
}

module.exports = { resolveLlmConfig, isLocalEndpoint, PRESETS };
