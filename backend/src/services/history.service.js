const pool = require('../db/pool');

function parseJsonField(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

function enrichReportListItem(report) {
  report.summary = parseJsonField(report.summary);
  report.report_data = parseJsonField(report.report_data);
  report.validation_errors = parseJsonField(report.validation_errors);
  const summary = report.summary || {};
  const timeContext = summary.timeContext || {};
  const highlights = summary.highlights || [];
  const findHighlight = (label) => highlights.find((h) => h.label === label)?.value;

  return {
    ...report,
    listSummary: {
      title: summary.title || report.workflow_name,
      narrative: summary.narrative,
      timeGranularity:
        timeContext.granularity || report.report_data?.tables?.timeSeries?.detected?.label,
      timeSpan: timeContext.span || report.report_data?.tables?.timeSeries?.detected?.spanLabel,
      totalVolume: findHighlight('Total volume') || findHighlight('Total daily volume'),
      average: findHighlight('Average'),
      latest: findHighlight('Latest'),
      contribution4g: findHighlight('4G share') || findHighlight('4G Contribution'),
      peakPeriod:
        findHighlight('Peak day') ||
        findHighlight('Peak period') ||
        findHighlight('Peak Hour') ||
        findHighlight('Peak'),
      dataPoints: findHighlight('Data points') || findHighlight('Records Processed'),
      threshold: summary.threshold,
      anomalyCount: (summary.anomalies || []).length,
    },
  };
}

function buildWorkbookListItem(wb, childReports) {
  const summary = parseJsonField(wb.summary);
  const preview = summary.preview || {};
  const stats = {
    total: childReports.length,
    completed: childReports.filter((r) => r.status === 'completed').length,
    failed: childReports.filter((r) => r.status === 'failed').length,
    inProgress: childReports.filter((r) =>
      ['pending', 'validating', 'processing'].includes(r.status)
    ).length,
  };

  return {
    type: 'workbook',
    id: wb.id,
    status: wb.status,
    original_filename: wb.original_filename,
    created_at: wb.created_at,
    completed_at: wb.completed_at,
    kpi_count: wb.kpi_count,
    sheet_count: wb.sheet_count,
    defaultThreshold: summary.defaultThreshold ?? 99,
    listSummary: {
      title: `CMM Workbook — ${wb.original_filename}`,
      narrative: `${stats.completed}/${stats.total} KPIs completed`,
      dataPoints: String(stats.total),
      timeGranularity: 'Multi-KPI',
      timeSpan: preview.validCount ? `${preview.validCount} data sheets` : undefined,
      anomalyCount: childReports.reduce(
        (n, r) => n + ((r.summary?.anomalies || []).length > 0 ? 1 : 0),
        0
      ),
    },
    stats,
    kpis: childReports.map((r) => ({
      reportId: r.id,
      kpiName: r.kpi_name,
      sheetName: r.sheet_name,
      status: r.status,
      threshold: r.summary?.threshold,
      listSummary: enrichReportListItem(r).listSummary,
    })),
  };
}

async function listGroupedHistory(userId, { page = 1, limit = 15, status, workflowSlug } = {}) {
  const offset = (page - 1) * limit;

  const wbConditions = ['wb.user_id = $1'];
  const reportConditions = ['pr.user_id = $1', 'pr.workbook_id IS NULL'];
  const values = [userId];
  let idx = 2;

  if (status) {
    wbConditions.push(`wb.status = $${idx}`);
    reportConditions.push(`pr.status = $${idx}`);
    values.push(status);
    idx++;
  }
  if (workflowSlug) {
    reportConditions.push(`kw.slug = $${idx}`);
    idx++;
    values.push(workflowSlug);
    wbConditions.push('1=0');
  }

  const wbWhere = wbConditions.join(' AND ');
  const reportWhere = reportConditions.join(' AND ');

  const unionSql = `
    SELECT wb.id, wb.created_at, 'workbook'::text AS item_type
    FROM workbook_uploads wb
    WHERE ${wbWhere}
    UNION ALL
    SELECT pr.id, pr.created_at, 'report'::text AS item_type
    FROM processed_reports pr
    JOIN kpi_workflows kw ON pr.workflow_id = kw.id
    WHERE ${reportWhere}
    ORDER BY created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;

  const pageValues = [...values, limit, offset];
  const pageResult = await pool.query(unionSql, pageValues);

  const countSql = `
    SELECT (
      SELECT COUNT(*)::int FROM workbook_uploads wb WHERE ${wbWhere}
    ) + (
      SELECT COUNT(*)::int FROM processed_reports pr
      JOIN kpi_workflows kw ON pr.workflow_id = kw.id
      WHERE ${reportWhere}
    ) AS total
  `;
  const countResult = await pool.query(countSql, values);
  const total = countResult.rows[0]?.total || 0;

  const items = [];

  for (const row of pageResult.rows) {
    if (row.item_type === 'workbook') {
      const wbResult = await pool.query(
        `SELECT * FROM workbook_uploads WHERE id = $1 AND user_id = $2`,
        [row.id, userId]
      );
      if (wbResult.rows.length === 0) continue;
      const wb = wbResult.rows[0];

      const children = await pool.query(
        `SELECT pr.*, kw.slug as workflow_slug, kw.name as workflow_name
         FROM processed_reports pr
         JOIN kpi_workflows kw ON pr.workflow_id = kw.id
         WHERE pr.workbook_id = $1 AND pr.user_id = $2
         ORDER BY pr.kpi_name`,
        [row.id, userId]
      );

      items.push(buildWorkbookListItem(wb, children.rows));
    } else {
      const reportResult = await pool.query(
        `SELECT pr.*, kw.slug as workflow_slug, kw.name as workflow_name,
                uf.original_filename
         FROM processed_reports pr
         JOIN kpi_workflows kw ON pr.workflow_id = kw.id
         LEFT JOIN uploaded_files uf ON pr.uploaded_file_id = uf.id
         WHERE pr.id = $1 AND pr.user_id = $2`,
        [row.id, userId]
      );
      if (reportResult.rows.length > 0) {
        items.push({
          type: 'report',
          ...enrichReportListItem(reportResult.rows[0]),
        });
      }
    }
  }

  return { items, total, page, limit };
}

module.exports = {
  listGroupedHistory,
  enrichReportListItem,
};
