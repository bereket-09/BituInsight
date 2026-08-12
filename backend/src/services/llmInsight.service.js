const config = require('../config');
const logger = require('../utils/logger');

/**
 * Claude-authored executive narrative on top of the statistical analysis.
 *
 * Design notes:
 *  - Only the derived brief is sent upstream — never raw Excel rows, PLMN records,
 *    or customer identifiers. The model sees numbers it is asked to explain.
 *  - Structured outputs guarantee a parseable shape, so no regex/retry scaffolding.
 *  - Every failure path falls back to the deterministic narrative the analytics core
 *    already produced, so a report is never left without a written summary.
 */

const MODEL = process.env.LLM_MODEL || 'claude-opus-5';

let clientPromise = null;

function getClient() {
  if (!config.anthropicApiKey) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const Anthropic = require('@anthropic-ai/sdk');
      return new Anthropic({ apiKey: config.anthropicApiKey });
    })().catch((err) => {
      logger.warn('Anthropic SDK unavailable — narrative falls back to deterministic', {
        error: err.message,
      });
      return null;
    });
  }
  return clientPromise;
}

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

const SYSTEM_PROMPT = `You write executive summaries of telecom KPI reports for a network operations team.

You are given a structured brief containing the results of a statistical analysis: the KPI, its scope, level and trend statistics, data-quality assessment, and a ranked list of findings. Write the summary from that brief.

Ground every claim in the brief. Never introduce a number that is not present in it, and never infer a root cause the data does not support — a dip tells you something changed, not why. If the brief says data quality is degraded, say so before drawing conclusions from the numbers.

When the analysis found nothing of concern, say that plainly and return an empty recommendations array. A quiet period is a valid, useful result; do not manufacture concerns to fill space.

Write for a reader who knows telecom but is skimming. Complete sentences, no arrow chains, no invented severity language.`;

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

/**
 * @param {Object} analysis  Result of analytics.analyze()
 * @param {Object} context   { kpiName, workflowName, sheetName }
 * @returns {Object} { source, summary, keyPoints, recommendations, riskLevel, model? }
 */
async function generateNarrative(analysis, context = {}) {
  const fallback = analysis?.narrative || {
    source: 'deterministic',
    summary: 'No narrative available.',
    keyPoints: [],
    recommendations: [],
  };

  if (!analysis?.available || !analysis.brief) return fallback;

  const client = await getClient();
  if (!client) {
    return { ...fallback, llmSkipped: config.anthropicApiKey ? 'sdk_unavailable' : 'no_api_key' };
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: NARRATIVE_SCHEMA },
      },
      messages: [{ role: 'user', content: buildUserPrompt(analysis.brief, context) }],
    });

    if (response.stop_reason === 'refusal') {
      logger.warn('Narrative model declined the request', {
        category: response.stop_details?.category,
      });
      return { ...fallback, llmSkipped: 'refusal' };
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) return { ...fallback, llmSkipped: 'empty_response' };

    const parsed = JSON.parse(textBlock.text);

    logger.info('Claude narrative generated', {
      kpi: context.kpiName,
      model: response.model,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    });

    return {
      source: 'claude',
      model: response.model,
      summary: parsed.summary,
      keyPoints: parsed.keyPoints || [],
      recommendations: parsed.recommendations || [],
      riskLevel: parsed.riskLevel || 'none',
      deterministicSummary: fallback.summary,
    };
  } catch (err) {
    // A narrative is a nice-to-have; never let it fail the report.
    logger.warn('Narrative generation failed — using deterministic summary', {
      error: err.message,
      status: err.status,
    });
    return { ...fallback, llmSkipped: 'error', llmError: err.message };
  }
}

function isEnabled() {
  return Boolean(config.anthropicApiKey);
}

module.exports = { generateNarrative, isEnabled, MODEL };
