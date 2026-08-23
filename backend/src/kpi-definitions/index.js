/**
 * Public entry point for database-defined KPI workflows.
 *
 * Holds the compiled-definition cache that lets the synchronous `getWorkflow(slug)`
 * in kpi-workflows/registry.js resolve a database workflow without becoming async.
 *
 * Why a cache rather than making the registry async: `getWorkflow` is called from
 * six places, including inside chart and PPTX builders, and every one of them is
 * synchronous today. Turning it async would ripple through the whole service layer
 * for no benefit — definitions change on import, not per request. So the cache is
 * refreshed at boot and on every import, and `ensureLoaded()` covers the cold-start
 * case (a serverless invocation that never ran the boot hook) by loading a single
 * slug on demand before the synchronous path needs it.
 *
 * Trade-off: a definition edited directly in Postgres, bypassing the import API,
 * is not picked up until the next refresh or process start. That is acceptable —
 * the import API is meant to be the only write path — and `refresh()` is exported
 * for anyone who needs to force it.
 */
const logger = require('../utils/logger');
const store = require('./store');
const { compileDefinition } = require('./compile');
const { validateDefinition, formatErrors, SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS } = require('./validator');

/** slug -> compiled workflow module */
const cache = new Map();
let lastRefreshAt = null;

function parseDefinitionColumn(row) {
  // pg returns JSONB already parsed; a JSON column or a string round-trip would not.
  return typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
}

function compileRow(row) {
  const definition = parseDefinitionColumn(row);
  const workflow = compileDefinition(definition);
  workflow.definitionId = row.id;
  workflow.definitionSource = row.source;
  workflow.updatedAt = row.updated_at;
  return workflow;
}

/**
 * Reload every active definition. A row that fails to compile is logged and skipped
 * rather than thrown: one bad definition must not stop the server from booting or
 * take the other workflows offline with it.
 */
async function refresh() {
  const rows = await store.listDefinitions({ activeOnly: true });
  const next = new Map();
  let failed = 0;

  for (const row of rows) {
    try {
      next.set(row.slug, compileRow(row));
    } catch (err) {
      failed++;
      logger.error('Skipping invalid workflow definition', { slug: row.slug, error: err.message });
    }
  }

  cache.clear();
  for (const [slug, wf] of next) cache.set(slug, wf);
  lastRefreshAt = new Date();

  logger.info('Database workflow definitions loaded', { loaded: cache.size, failed });
  return { loaded: cache.size, failed };
}

/** Synchronous cache read — this is what the registry uses. */
function getCompiled(slug) {
  return cache.get(slug) || null;
}

function listCompiled() {
  return [...cache.values()];
}

/**
 * Load one definition into the cache if it is not already there. Call this from an
 * async boundary (a controller, the upload pipeline) before code that will reach
 * the synchronous registry.
 */
async function ensureLoaded(slug) {
  if (cache.has(slug)) return cache.get(slug);
  const row = await store.getDefinition(slug);
  if (!row || !row.is_active) return null;
  try {
    const workflow = compileRow(row);
    cache.set(slug, workflow);
    return workflow;
  } catch (err) {
    logger.error('Workflow definition failed to compile', { slug, error: err.message });
    return null;
  }
}

/** Import path: validate, persist, then make it usable immediately. */
async function importDefinition(definition, opts = {}) {
  const { row } = await store.saveDefinition(definition, opts);
  const workflow = compileRow(row);
  cache.set(row.slug, workflow);
  return { row, workflow };
}

function invalidate(slug) {
  if (slug) cache.delete(slug);
  else cache.clear();
}

module.exports = {
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  validateDefinition,
  formatErrors,
  compileDefinition,
  refresh,
  ensureLoaded,
  getCompiled,
  listCompiled,
  importDefinition,
  invalidate,
  store,
  get lastRefreshAt() {
    return lastRefreshAt;
  },
};
