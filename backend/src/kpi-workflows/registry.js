const trafficVolume = require('./traffic-volume');
const telecomMetric = require('./telecom-metric');
const cmgDataThroughput = require('./cmg-data-throughput');
const peakAttachedUsers = require('./peak-attached-users');

/**
 * Code workflows. These stay exactly as they were: hand-written modules, resolved
 * first, unaffected by anything in the database.
 */
const WORKFLOW_REGISTRY = {
  [trafficVolume.slug]: trafficVolume,
  [telecomMetric.slug]: telecomMetric,
  [cmgDataThroughput.slug]: cmgDataThroughput,
  [peakAttachedUsers.slug]: peakAttachedUsers,
};

/**
 * Database-defined workflows are resolved from a compiled cache held by
 * src/kpi-definitions. The require is lazy so that this module keeps working in
 * contexts with no database (tests, tooling) — kpi-definitions pulls in the pg pool.
 *
 * Resolution order is code-first and deliberate: an imported definition can never
 * shadow a built-in workflow, so a hostile or careless import cannot change how an
 * existing KPI behaves. It can only add new slugs.
 */
function definitions() {
  try {
    return require('../kpi-definitions');
  } catch (err) {
    return null;
  }
}

function getWorkflow(slug) {
  const workflow = WORKFLOW_REGISTRY[slug];
  if (workflow) return workflow;

  const compiled = definitions()?.getCompiled(slug);
  if (compiled) return compiled;

  throw new Error(`KPI workflow not found: ${slug}`);
}

/**
 * Async counterpart for callers that can await: loads the definition from Postgres
 * on a cache miss (cold serverless instance) and then resolves as usual. Existing
 * synchronous call sites are untouched; this is opt-in.
 */
async function resolveWorkflow(slug) {
  if (WORKFLOW_REGISTRY[slug]) return WORKFLOW_REGISTRY[slug];
  const defs = definitions();
  if (defs) await defs.ensureLoaded(slug);
  return getWorkflow(slug);
}

function describe(wf) {
  return {
    slug: wf.slug,
    name: wf.name,
    description: wf.description,
    version: wf.version,
    metadata: wf.metadata,
    requiredColumns: wf.requiredColumns,
    chartDefinitions: wf.chartDefinitions,
    source: wf.source === 'definition' ? 'definition' : 'builtin',
  };
}

function getAllWorkflows() {
  const compiled = definitions()?.listCompiled() || [];
  const merged = [
    ...Object.values(WORKFLOW_REGISTRY),
    ...compiled.filter((wf) => !WORKFLOW_REGISTRY[wf.slug]),
  ];
  return merged.map(describe);
}

function listWorkflowSlugs() {
  return getAllWorkflows().map((w) => w.slug);
}

/** The built-in workflow made for this workbook's sheets, if one claims it. */
function findWorkflowForWorkbook(sheetNames) {
  const match = Object.values(WORKFLOW_REGISTRY).find((wf) => wf.matchesWorkbook?.(sheetNames));
  return match ? { slug: match.slug, name: match.name } : null;
}

function isBuiltIn(slug) {
  return Object.prototype.hasOwnProperty.call(WORKFLOW_REGISTRY, slug);
}

module.exports = {
  getWorkflow,
  resolveWorkflow,
  getAllWorkflows,
  listWorkflowSlugs,
  isBuiltIn,
  findWorkflowForWorkbook,
};
