const pool = require('../db/pool');
const logger = require('../utils/logger');

/**
 * Aggregates multiple completed reports for a single KPI workflow.
 * Used for "show me everything you've seen so far" roll-up views.
 */
async function aggregateWorkflowReports(userId, workflowSlug, { from, to, limit = 50 } = {}) {
  const conditions = ['pr.user_id = $1', 'kw.slug = $2', "pr.status = 'completed'"];
  const values = [userId, workflowSlug];
  let idx = 3;

  if (from) {
    conditions.push(`pr.created_at >= $${idx++}`);
    values.push(from);
  }
  if (to) {
    conditions.push(`pr.created_at <= $${idx++}`);
    values.push(to);
  }

  values.push(limit);

  const reportsResult = await pool.query(
    `SELECT pr.id, pr.created_at, pr.completed_at, pr.summary, pr.report_data,
            uf.original_filename, kw.name AS workflow_name
     FROM processed_reports pr
     JOIN kpi_workflows kw ON pr.workflow_id = kw.id
     LEFT JOIN uploaded_files uf ON pr.uploaded_file_id = uf.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY pr.created_at ASC
     LIMIT $${idx}`,
    values
  );

  const reports = reportsResult.rows;
  if (reports.length === 0) {
    return {
      workflowSlug,
      reportCount: 0,
      message: 'No completed reports found for aggregation',
      combinedTimeSeries: [],
      combinedMetrics: {},
      sourceReports: [],
    };
  }

  const combinedTimeSeries = [];
  const metricSums = {};
  const metricCounts = {};
  const sourceReports = [];

  for (const report of reports) {
    const summary = report.summary || {};
    const reportData = report.report_data || {};
    const timeSeries = reportData.tables?.timeSeries || reportData.calculated?.timeSeries;
    const primary = timeSeries?.series?.primary || [];

    sourceReports.push({
      id: report.id,
      createdAt: report.created_at,
      filename: report.original_filename,
      span: summary.timeContext?.span || timeSeries?.detected?.spanLabel,
      granularity: summary.timeContext?.granularity || timeSeries?.detected?.label,
      pointCount: primary.length,
    });

    for (const pt of primary) {
      combinedTimeSeries.push({
        ...pt,
        reportId: report.id,
        sourceFile: report.original_filename,
      });
    }

    const metricsResult = await pool.query(
      'SELECT metric_key, metric_value FROM generated_metrics WHERE report_id = $1',
      [report.id]
    );

    for (const m of metricsResult.rows) {
      if (m.metric_value == null) continue;
      const key = m.metric_key;
      if (!metricSums[key]) {
        metricSums[key] = 0;
        metricCounts[key] = 0;
      }
      metricSums[key] += parseFloat(m.metric_value);
      metricCounts[key] += 1;
    }
  }

  combinedTimeSeries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const combinedMetrics = {
    reportCount: reports.length,
    totalDataPoints: combinedTimeSeries.length,
    span: {
      start: combinedTimeSeries[0]?.timestamp,
      end: combinedTimeSeries[combinedTimeSeries.length - 1]?.timestamp,
    },
  };

  if (metricSums.totalVolume || metricSums.totalDailyVolume) {
    const totalKey = metricSums.totalVolume ? 'totalVolume' : 'totalDailyVolume';
    combinedMetrics.totalVolume = metricSums[totalKey];
    combinedMetrics.avgVolumePerReport = metricSums[totalKey] / metricCounts[totalKey];
  }

  if (metricSums.contribution4gPct) {
    combinedMetrics.avgContribution4gPct =
      metricSums.contribution4gPct / metricCounts.contribution4gPct;
  }

  logger.info('KPI aggregation computed', {
    workflowSlug,
    reportCount: reports.length,
    points: combinedTimeSeries.length,
  });

  return {
    workflowSlug,
    workflowName: reports[0].workflow_name,
    reportCount: reports.length,
    combinedTimeSeries,
    combinedMetrics,
    sourceReports,
    narrative: `Combined ${reports.length} Traffic Volume report(s) into ${combinedTimeSeries.length} time-series points.`,
  };
}

module.exports = {
  aggregateWorkflowReports,
};
