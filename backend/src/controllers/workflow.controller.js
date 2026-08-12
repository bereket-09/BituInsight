const pool = require('../db/pool');
const { getAllWorkflows, getWorkflow } = require('../kpi-workflows/registry');

async function listWorkflows(req, res, next) {
  try {
    const dbResult = await pool.query(
      'SELECT id, slug, name, description, version, metadata, is_active FROM kpi_workflows WHERE is_active = TRUE ORDER BY name'
    );

    const codeWorkflows = getAllWorkflows();
    const merged = dbResult.rows.map((db) => {
      const code = codeWorkflows.find((c) => c.slug === db.slug);
      const dbMeta = db.metadata && typeof db.metadata === 'object' ? db.metadata : {};
      return {
        ...db,
        description: db.description || code?.description,
        requiredColumns: code?.requiredColumns || [],
        chartDefinitions: code?.chartDefinitions || [],
        metadata: { ...code?.metadata, ...dbMeta },
      };
    });

    res.json({ workflows: merged });
  } catch (err) {
    next(err);
  }
}

async function getWorkflowDetails(req, res, next) {
  try {
    const { slug } = req.params;
    const workflow = getWorkflow(slug);

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
