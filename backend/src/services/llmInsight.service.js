const config = require('../config');
const logger = require('../utils/logger');
const { getProvider, withDeadline } = require('./llmProvider.service');

/**
 * Model-authored executive narrative on top of the statistical analysis.
 *
 * Design notes:
 *  - Provider-agnostic. The model behind this is whatever config.llm resolves
 *    to — OpenAI, Ollama, Groq, any OpenAI-compatible endpoint, or Anthropic.
 *    See ../config/llm.js for the selection rules.
 *  - PRIVACY BOUNDARY: only the derived brief is sent upstream — never raw
 *    Excel rows, PLMN records, or customer identifiers. The model sees the
 *    numbers it is asked to explain and nothing else. Anything added to the
 *    request below must respect that; `analysis.brief` is the only payload.
 *  - Structured output is negotiated per provider (JSON schema -> JSON mode ->
 *    prompted JSON) and the result is parsed tolerantly and validated, because
 *    not every endpoint honours the format it was asked for.
 *  - Every failure path falls back to the deterministic narrative the analytics
 *    core already produced, so a report is never left without a written summary.
 */

const MODEL = config.llm.model;

const NARRATIVE_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description:
        'Two to four sentences an operations manager can read without opening the charts. Lead with what happened, then why it matters.',
    },
    keyPoints: {
      type: 'array',
      items: { type: 'string' },
      description: 'Three to five short factual bullets, each tied to a number from the brief.',
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Zero to four concrete next actions. Return an empty array when the data genuinely warrants no action.',
    },
    riskLevel: {
      type: 'string',
      enum: ['none', 'low', 'medium', 'high'],
      description: 'Overall operational risk implied by the findings.',
    },
  },
  required: ['summary', 'keyPoints', 'recommendations', 'riskLevel'],
  additionalProperties: false,
};

const RISK_LEVELS = new Set(NARRATIVE_SCHEMA.properties.riskLevel.enum);

const SYSTEM_PROMPT = `You write executive summaries of telecom KPI reports for a network operations team.

You are given a structured brief containing the results of a statistical analysis: the KPI, its scope, level and trend statistics, data-quality assessment, and a ranked list of findings. Write the summary from that brief.

Ground every claim in the brief. Never introduce a number that is not present in it, and never infer a root cause the data does not support — a dip tells you something changed, not why. If the brief says data quality is degraded, say so before drawing conclusions from the numbers.

When the analysis found nothing of concern, say that plainly and return an empty recommendations array. A quiet period is a valid, useful result; do not manufacture concerns to fill space.

Write for a reader who knows telecom but is skimming. Complete sentences, no arrow chains, no invented severity language.`;

/**
 * Appended for providers whose structured output is not schema-enforced. It
 * also satisfies OpenAI-style JSON mode, which rejects requests that never
 * mention JSON.
 */
const RESPONSE_CONTRACT = `

Reply with a single JSON object and nothing else — no prose, no markdown code fences. It must match this shape exactly:

{
  "summary": "string",
  "keyPoints": ["string", ...],
  "recommendations": ["string", ...],
  "riskLevel": "none" | "low" | "medium" | "high"
}`;

function buildUserPrompt(brief, context) {
  return [
    context.kpiName ? `KPI: ${context.kpiName}` : null,
    context.workflowName ? `Workflow: ${context.workflowName}` : null,
    context.sheetName ? `Source sheet: ${context.sheetName}` : null,
    '',
    'Analysis brief (JSON):',
    JSON.stringify(brief, null, 2),
  ]
    .filter((line) => line !== null)
    .join('\n');
}

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Returns the outermost balanced {...} span, ignoring braces inside strings.
 * Handles the common "here is your JSON: {...} hope that helps" reply.
 */
function outermostObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Tolerant parse: raw JSON, fenced JSON, or JSON embedded in commentary. */
function parseModelJson(text) {
  if (typeof text !== 'string' || !text.trim()) return null;

  let candidate = text.trim();
  const fenced = candidate.match(/```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)```/);
  if (fenced) candidate = fenced[1].trim();

  return tryParse(candidate) || tryParse(outermostObject(candidate) || '') || null;
}

function toStringList(value, limit) {
  if (typeof value === 'string') return value.trim() ? [value.trim()].slice(0, limit) : [];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      // Some models emit [{ point: "..." }] instead of a flat list.
      if (item && typeof item === 'object') {
        const first = Object.values(item).find((v) => typeof v === 'string' && v.trim());
        return first ? first.trim() : '';
      }
      return '';
    })
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * Validates the parsed shape before it is allowed anywhere near a report.
 * Returns null when the model produced something unusable, which sends the
 * caller to the deterministic narrative.
 */
function validateNarrative(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  let node = parsed;
  if (typeof node.summary !== 'string') {
    // Tolerate one level of wrapping, e.g. { "narrative": { "summary": ... } }.
    const nested = Object.values(node).find(
      (value) => value && typeof value === 'object' && typeof value.summary === 'string'
    );
    if (!nested) return null;
    node = nested;
  }

  const summary = node.summary.trim();
  if (!summary) return null;

  const risk = typeof node.riskLevel === 'string' ? node.riskLevel.trim().toLowerCase() : '';

  return {
    summary,
    keyPoints: toStringList(node.keyPoints, 8),
    recommendations: toStringList(node.recommendations, 8),
    riskLevel: RISK_LEVELS.has(risk) ? risk : 'none',
  };
}

/**
 * @param {Object} analysis  Result of analytics.analyze()
 * @param {Object} context   { kpiName, workflowName, sheetName }
 * @returns {Object} { source, summary, keyPoints, recommendations, riskLevel?, model? }
 */
async function generateNarrative(analysis, context = {}) {
  const fallback = analysis?.narrative || {
    source: 'deterministic',
    summary: 'No narrative available.',
    keyPoints: [],
    recommendations: [],
  };

  if (!analysis?.available || !analysis.brief) return fallback;

  const settings = config.llm;
  const provider = getProvider(settings);
  if (!provider) {
    return { ...fallback, llmSkipped: settings.enabled ? 'sdk_unavailable' : settings.reason };
  }

  try {
    // Schema-enforced transports get the prompt unchanged; everyone else is
    // told, in words, what JSON to produce.
    const system =
      provider.transport === 'anthropic' ? SYSTEM_PROMPT : SYSTEM_PROMPT + RESPONSE_CONTRACT;

    const response = await withDeadline(settings.timeoutMs, (signal) =>
      provider.complete({
        system,
        // Only the derived brief crosses the network — see the privacy note above.
        user: buildUserPrompt(analysis.brief, context),
        schema: NARRATIVE_SCHEMA,
        schemaName: 'kpi_executive_narrative',
        signal,
      })
    );

    if (response.refusal) {
      logger.warn('Narrative model declined the request', {
        provider: provider.name,
        category: response.refusal.reason,
      });
      return { ...fallback, llmSkipped: 'refusal' };
    }

    if (!response.text) return { ...fallback, llmSkipped: 'empty_response' };

    const parsed = validateNarrative(parseModelJson(response.text));
    if (!parsed) {
      // Malformed output is a normal outcome for weaker models in JSON mode.
      logger.warn('Narrative model returned unusable JSON — using deterministic summary', {
        provider: provider.name,
        model: response.model,
        jsonMode: response.jsonMode,
        preview: response.text.slice(0, 200),
      });
      return { ...fallback, llmSkipped: 'invalid_json' };
    }

    logger.info('Model narrative generated', {
      kpi: context.kpiName,
      provider: provider.name,
      model: response.model,
      jsonMode: response.jsonMode,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
    });

    return {
      // 'model' rather than a vendor name: the provider is configurable, and
      // labelling a Groq-written summary 'claude' put a false attribution in
      // front of the user. `provider` carries which one actually wrote it.
      source: 'model',
      provider: provider.name,
      model: response.model,
      summary: parsed.summary,
      keyPoints: parsed.keyPoints,
      recommendations: parsed.recommendations,
      riskLevel: parsed.riskLevel,
      deterministicSummary: fallback.summary,
    };
  } catch (err) {
    // A narrative is a nice-to-have; never let it fail the report.
    logger.warn('Narrative generation failed — using deterministic summary', {
      provider: provider.name,
      error: err.message,
      status: err.status,
    });
    return { ...fallback, llmSkipped: 'error', llmError: err.message };
  }
}

function isEnabled() {
  return Boolean(config.llm.enabled);
}

/** Describes the resolved provider, for logs and health output. */
function describeProvider() {
  return {
    provider: config.llm.provider,
    transport: config.llm.transport,
    model: config.llm.model,
    baseUrl: config.llm.baseUrl || null,
    enabled: config.llm.enabled,
    reason: config.llm.reason,
  };
}

module.exports = {
  generateNarrative,
  isEnabled,
  describeProvider,
  MODEL,
  // Exported for tests.
  parseModelJson,
  validateNarrative,
  NARRATIVE_SCHEMA,
};
