const kpiAggregation = require('../services/kpiAggregation.service');

async function getWorkflowAggregate(req, res, next) {
  try {
    const { workflowSlug } = req.params;
    const { from, to, limit } = req.query;

    const result = await kpiAggregation.aggregateWorkflowReports(
      req.user.id,
      workflowSlug,
      {
        from: from || undefined,
        to: to || undefined,
        limit: parseInt(limit, 10) || 50,
      }
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { getWorkflowAggregate };
