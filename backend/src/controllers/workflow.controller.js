const pool = require('../db/pool');
const { getAllWorkflows, resolveWorkflow, isBuiltIn } = require('../kpi-workflows/registry');
const { ensureBuiltInWorkflows } = require('../services/workflowSync.service');

/**
 * Resolve a catalogue row to its runtime workflow. `resolveWorkflow` also warms the
 * definition cache on a cold instance, which is what lets an imported workflow show
 * its columns and charts here immediately after import. A slug with no module and no
 * definition simply has nothing to describe — that is a catalogue row without an
 * implementation, not a request failure.
 */
async function describeSafely(slug) {
  try {
    return await resolveWorkflow(slug);
  } catch {
    return null;
  }
}

async function listWorkflows(req, res, next) {
  try {
    await ensureBuiltInWorkflows();
    const dbResult = await pool.query(
      'SELECT id, slug, name, description, version, metadata, is_active FROM kpi_workflows WHERE is_active = TRUE ORDER BY name'
    );

    const codeWorkflows = getAllWorkflows();
    const merged = await Promise.all(
      dbResult.rows.map(async (db) => {
        const code = codeWorkflows.find((c) => c.slug === db.slug) || (await describeSafely(db.slug));
        const dbMeta = db.metadata && typeof db.metadata === 'object' ? db.metadata : {};
        return {
          ...db,
          description: db.description || code?.description,
          requiredColumns: code?.requiredColumns || [],
          chartDefinitions: code?.chartDefinitions || [],
          metadata: { ...code?.metadata, ...dbMeta },
          source: isBuiltIn(db.slug) ? 'builtin' : code ? code.source : 'unknown',
        };
      })
    );

    res.json({ workflows: merged });
  } catch (err) {
    next(err);
  }
}

async function getWorkflowDetails(req, res, next) {
  try {
    const { slug } = req.params;
    // Async resolve so a database-defined workflow is found on a cold instance whose
    // definition cache has not been warmed yet.
    const workflow = await resolveWorkflow(slug);

    const dbResult = await pool.query(
      'SELECT id, slug, name, description, version, metadata FROM kpi_workflows WHERE slug = $1',
      [slug]
    );

    res.json({
      ...dbResult.rows[0],
      requiredColumns: workflow.requiredColumns,
      chartDefinitions: workflow.chartDefinitions,
      metadata: { ...dbResult.rows[0]?.metadata, ...workflow.metadata },
    });
  } catch (err) {
    err.status = err.message.includes('not found') ? 404 : 500;
    next(err);
  }
}

module.exports = { listWorkflows, getWorkflowDetails };
