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
        timeContext.granularity || summary.granularity || 'Hourly',
      timeSpan: timeContext.span || summary.spanLabel,
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

function buildWorkbookListItem(wb, childReports = []) {
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
        (n, r) => n + ((parseJsonField(r.summary)?.anomalies || []).length > 0 ? 1 : 0),
        0
      ),
    },
    stats,
    kpis: childReports.map((r) => {
      const enriched = enrichReportListItem(r);
      return {
        reportId: r.id,
        kpiName: r.kpi_name,
        sheetName: r.sheet_name,
        status: r.status,
        threshold: enriched.summary?.threshold,
        listSummary: enriched.listSummary,
      };
    }),
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

  const countSql = `
    SELECT (
      SELECT COUNT(*)::int FROM workbook_uploads wb WHERE ${wbWhere}
    ) + (
      SELECT COUNT(*)::int FROM processed_reports pr
      JOIN kpi_workflows kw ON pr.workflow_id = kw.id
      WHERE ${reportWhere}
    ) AS total
  `;

  // 1. Run union query and count query in parallel for instantaneous pagination
  const [pageResult, countResult] = await Promise.all([
    pool.query(unionSql, [...values, limit, offset]),
    pool.query(countSql, values),
  ]);

  const total = countResult.rows[0]?.total || 0;
  if (!pageResult.rows.length) {
    return { items: [], total, page, limit };
  }

  // 2. Partition IDs to batch fetch (eliminating N+1 sequential roundtrips)
  const wbIds = pageResult.rows.filter((r) => r.item_type === 'workbook').map((r) => r.id);
  const reportIds = pageResult.rows.filter((r) => r.item_type === 'report').map((r) => r.id);

  const fetchPromises = [];

  // Batch query for workbooks + child KPIs (lightweight columns only, excluding massive report_data)
  if (wbIds.length > 0) {
    fetchPromises.push(
      pool.query(
        `SELECT id, user_id, original_filename, stored_path, file_size, sheet_count, kpi_count, status, summary, created_at, completed_at
         FROM workbook_uploads
         WHERE id = ANY($1::uuid[]) AND user_id = $2`,
        [wbIds, userId]
      ),
      pool.query(
        `SELECT pr.id, pr.user_id, pr.workbook_id, pr.sheet_name, pr.kpi_name, pr.status, pr.validation_errors, pr.summary,
                pr.created_at, pr.completed_at, kw.slug as workflow_slug, kw.name as workflow_name
         FROM processed_reports pr
         JOIN kpi_workflows kw ON pr.workflow_id = kw.id
         WHERE pr.workbook_id = ANY($1::uuid[]) AND pr.user_id = $2
         ORDER BY pr.kpi_name ASC`,
        [wbIds, userId]
      )
    );
  } else {
    fetchPromises.push(Promise.resolve({ rows: [] }), Promise.resolve({ rows: [] }));
  }

  // Batch query for single reports
  if (reportIds.length > 0) {
    fetchPromises.push(
      pool.query(
        `SELECT pr.id, pr.user_id, pr.workflow_id, pr.uploaded_file_id, pr.status, pr.validation_errors,
                pr.summary, pr.error_message, pr.created_at, pr.completed_at,
                kw.slug as workflow_slug, kw.name as workflow_name,
                uf.original_filename as original_filename
         FROM processed_reports pr
         JOIN kpi_workflows kw ON pr.workflow_id = kw.id
         LEFT JOIN uploaded_files uf ON pr.uploaded_file_id = uf.id
         WHERE pr.id = ANY($1::uuid[]) AND pr.user_id = $2`,
        [reportIds, userId]
      )
    );
  } else {
    fetchPromises.push(Promise.resolve({ rows: [] }));
  }

  // Execute all batch fetches in parallel
  const [wbResult, childrenResult, reportResult] = await Promise.all(fetchPromises);

  const wbMap = new Map();
  for (const wb of wbResult.rows) {
    wbMap.set(wb.id, wb);
  }

  const childrenByWb = new Map();
  for (const child of childrenResult.rows) {
    if (!childrenByWb.has(child.workbook_id)) {
      childrenByWb.set(child.workbook_id, []);
    }
    childrenByWb.get(child.workbook_id).push(child);
  }

  const reportMap = new Map();
  for (const rep of reportResult.rows) {
    reportMap.set(rep.id, rep);
  }

  // 3. Assemble items in exact union order
  const items = [];
  for (const row of pageResult.rows) {
    if (row.item_type === 'workbook') {
      const wb = wbMap.get(row.id);
      if (wb) {
        const children = childrenByWb.get(row.id) || [];
        items.push(buildWorkbookListItem(wb, children));
      }
    } else {
      const rep = reportMap.get(row.id);
      if (rep) {
        items.push({
          type: 'report',
          ...enrichReportListItem(rep),
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
