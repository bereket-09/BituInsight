/**
 * Narrative provider smoke check.
 *
 * Prints the provider the current environment resolves to, then generates one
 * executive narrative from synthetic KPI data so you can see whether the model
 * is actually reachable and whether its output survives validation.
 *
 * No credentials live here — everything comes from the environment, exactly as
 * the running server reads it.
 *
 *   cd backend && node scripts/check-llm.js
 *   LLM_PROVIDER=groq LLM_API_KEY="$GROQ_API_KEY" node scripts/check-llm.js
 *
 * Exit code is 0 whenever the platform behaved correctly — including a clean
 * fallback to the deterministic narrative, which is a pass, not a failure.
 */
const config = require('../src/config');
const { analyze } = require('../src/analytics');
const { generateNarrative, describeProvider } = require('../src/services/llmInsight.service');

function syntheticSeries() {
  const series = [];
  const start = Date.UTC(2026, 4, 1);
  for (let i = 0; i < 30; i += 1) {
    let total = 1200 + Math.round(60 * Math.sin(i / 3));
    if (i === 21) total = 430; // one dip, so there is something worth narrating
    const timestamp = new Date(start + i * 86400000).toISOString();
    series.push({ timestamp, label: timestamp.slice(0, 10), total });
  }
  return series;
}

async function main() {
  const resolved = describeProvider();
  console.log('Resolved provider');
  console.log('  provider :', resolved.provider);
  console.log('  transport:', resolved.transport || '(none)');
  console.log('  model    :', resolved.model || '(none)');
  console.log('  base URL :', resolved.baseUrl || '(provider default)');
  console.log('  api key  :', config.llm.apiKey ? 'set' : config.llm.keyless ? 'not needed' : 'MISSING');
  console.log('  enabled  :', resolved.enabled, resolved.reason ? `(${resolved.reason})` : '');
  console.log('  timeout  :', `${config.llm.timeoutMs}ms, retries ${config.llm.maxRetries}`);
  console.log();

  const analysis = analyze(syntheticSeries(), { kpiName: 'Attach Success Rate' });
  const startedAt = Date.now();
  const narrative = await generateNarrative(analysis, {
    kpiName: 'Attach Success Rate',
    workflowName: 'llm-smoke-check',
  });
  const elapsed = Date.now() - startedAt;

  const authored = narrative.source === 'claude';
  console.log(`Narrative (${elapsed}ms)`);
  console.log('  source   :', authored ? `model via ${narrative.provider}/${narrative.model}` : 'deterministic');
  if (narrative.llmSkipped) console.log('  skipped  :', narrative.llmSkipped, narrative.llmError || '');
  console.log('  risk     :', narrative.riskLevel || '(n/a)');
  console.log('  summary  :', narrative.summary);
  for (const point of narrative.keyPoints || []) console.log('  point    :', point);
  for (const rec of narrative.recommendations || []) console.log('  action   :', rec);
  console.log();

  if (authored) {
    console.log('PASS — the model wrote the narrative and it passed validation.');
  } else if (resolved.enabled) {
    console.log(
      `PASS (fallback) — the provider did not produce a usable narrative (${narrative.llmSkipped}),\n` +
        '       and the report correctly kept the deterministic summary. Fix the provider\n' +
        '       settings above if you expected a model-written summary.'
    );
  } else {
    console.log('PASS (not configured) — no provider set, deterministic summary used as designed.');
  }
}

main().catch((err) => {
  // Reaching here would mean the narrative layer threw, which it must never do.
  console.error('FAIL — narrative generation threw instead of falling back:', err);
  process.exitCode = 1;
});
