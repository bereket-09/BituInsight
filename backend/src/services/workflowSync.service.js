const pool = require('../db/pool');
const { getAllWorkflows, isBuiltIn } = require('../kpi-workflows/registry');
const logger = require('../utils/logger');

/**
 * Built-in (code) workflows need a kpi_workflows row before anyone can pick one
 * or upload against it. The seed script writes those rows, but a deploy that
 * adds a workflow should not depend on someone remembering to run it, so the
 * missing rows are inserted on first use. Existing rows are never touched: an
 * admin's edits to a name or an is_active flag stay as they are.
 */
let synced = null;

function ensureBuiltInWorkflows() {
  if (!synced) {
    synced = (async () => {
      const builtIns = getAllWorkflows().filter((wf) => isBuiltIn(wf.slug));
      for (const wf of builtIns) {
        const result = await pool.query(
          `INSERT INTO kpi_workflows (slug, name, description, version, metadata, is_active)
           VALUES ($1, $2, $3, $4, $5, TRUE)
           ON CONFLICT (slug) DO NOTHING`,
          [wf.slug, wf.name, wf.description, wf.version, JSON.stringify(wf.metadata)]
        );
        if (result.rowCount) logger.info('Registered built-in workflow', { slug: wf.slug });
      }
    })().catch((err) => {
      // Let the next request try again rather than caching the failure.
      synced = null;
      logger.warn('Could not register built-in workflows', { error: err.message });
    });
  }
  return synced;
}

module.exports = { ensureBuiltInWorkflows };
