/**
 * Report discovery and retrieval tools.
 *
 * Note on JSONB: `processed_reports.summary` and `.report_data` are large (a
 * 15-minute report carries 288 aggregated periods plus a full Chart.js config per
 * chart). These tools therefore select narrow JSON paths rather than whole
 * documents, so a report lookup costs kilobytes instead of megabytes.
 */

const {
  jsonResult,
  notFoundResult,
  truncateArray,
  compact,
  summarizeLarge,
  safeTool,
} = require('../format');
const {
  z,
  uuid,
  text,
  boundedInt,
  isoDate,
  REPORT_STATUSES,
  WORKFLOW_SLUGS,
  REPORT_SORTS,
} = require('../validate');

/** Closed map from the sort enum to fixed SQL. Never built from caller text. */
const SORT_SQL = {
  created_desc: 'pr.created_at DESC',
  created_asc: 'pr.created_at ASC',
  completed_desc: 'pr.completed_at DESC NULLS LAST',
  kpi_asc: 'pr.kpi_name ASC NULLS LAST, pr.created_at DESC',
  status_asc: 'pr.status ASC, pr.created_at DESC',
};

/** Columns safe and cheap enough for a list row. No JSONB documents, no blobs. */
const LIST_COLUMNS = `
  pr.id,
  pr.status,
  pr.kpi_name,
  pr.sheet_name,
  pr.workbook_id,
  pr.created_at,
  pr.completed_at,
  pr.error_message,
  kw.slug AS workflow_slug,
  kw.name AS workflow_name,
  uf.original_filename,
  uf.file_size,
  u.email AS user_email,
  pr.summary->>'title' AS report_title,
  pr.summary->>'narrative' AS narrative,
  jsonb_array_length(COALESCE(pr.validation_errors, '[]'::jsonb)) AS validation_error_count,
  jsonb_array_length(COALESCE(pr.summary->'intelligence'->'findings', '[]'::jsonb)) AS finding_count,
  pr.summary->'intelligence'->'dataQuality'->>'grade' AS quality_grade,
  pr.summary->'intelligence'->'trend'->>'direction' AS trend_direction
`;

const LIST_JOINS = `
  FROM processed_reports pr
  JOIN kpi_workflows kw ON kw.id = pr.workflow_id
  LEFT JOIN uploaded_files uf ON uf.id = pr.uploaded_file_id
  LEFT JOIN users u ON u.id = pr.user_id
`;

/**
 * Build the WHERE clause from validated filters.
 * Every value becomes a bound parameter; only fixed fragments are concatenated.
 */
function buildReportFilters(args) {
  // The ownership anchor is the first condition, not an optional one, so every
  // statement built here is scoped whatever the caller asked for.
  const conditions = ['{{SCOPE:pr.user_id}}'];
  const values = [];
  const applied = {};

  const add = (fragment, value, name) => {
    values.push(value);
    conditions.push(fragment.replace('$?', `$${values.length}`));
    if (name) applied[name] = value;
  };

  if (args.workflow) add('kw.slug = $?', args.workflow, 'workflow');
  if (args.status) add('pr.status = $?', args.status, 'status');
  if (args.kpi_name) add('pr.kpi_name ILIKE $?', `%${args.kpi_name}%`, 'kpi_name');
  if (args.workbook_id) add('pr.workbook_id = $?', args.workbook_id, 'workbook_id');
  if (args.user_email) add('u.email ILIKE $?', args.user_email, 'user_email');
  if (args.created_from) add('pr.created_at >= $?', args.created_from, 'created_from');
  if (args.created_to) add('pr.created_at <= $?', args.created_to, 'created_to');

  if (args.search) {
    values.push(`%${args.search}%`);
    const p = `$${values.length}`;
    conditions.push(
      `(COALESCE(uf.original_filename, '') ILIKE ${p}
        OR COALESCE(pr.kpi_name, '') ILIKE ${p}
        OR COALESCE(pr.sheet_name, '') ILIKE ${p}
        OR COALESCE(pr.summary->>'title', '') ILIKE ${p}
        OR COALESCE(pr.summary->>'narrative', '') ILIKE ${p})`
    );
    applied.search = args.search;
  }

  if (args.only_standalone) {
    conditions.push('pr.workbook_id IS NULL');
    applied.only_standalone = true;
  }
  if (args.only_workbook_kpis) {
    conditions.push('pr.workbook_id IS NOT NULL');
    applied.only_workbook_kpis = true;
  }
  if (args.has_findings === true) {
    conditions.push(`jsonb_array_length(COALESCE(pr.summary->'intelligence'->'findings', '[]'::jsonb)) > 0`);
    applied.has_findings = true;
  }
  if (args.has_findings === false) {
    conditions.push(`jsonb_array_length(COALESCE(pr.summary->'intelligence'->'findings', '[]'::jsonb)) = 0`);
    applied.has_findings = false;
  }
  if (args.has_intelligence === true) {
    conditions.push(`(pr.summary ? 'intelligence')`);
    applied.has_intelligence = true;
  }

  return {
    where: `WHERE ${conditions.join(' AND ')}`,
    values,
    applied,
  };
}

function register(server, scope) {
  server.registerTool(
    'list_reports',
    {
      title: 'List / search reports',
      description:
        'Search processed KPI reports with filters (workflow, status, KPI name, workbook, ' +
        'date range, free text) and pagination. Returns headline fields only — use ' +
        'get_report, get_report_intelligence or get_report_timeseries for detail.',
      inputSchema: {
        workflow: z.enum(WORKFLOW_SLUGS).optional().describe('Workflow slug filter'),
        status: z.enum(REPORT_STATUSES).optional().describe('Processing status filter'),
        kpi_name: text(200).optional().describe('Case-insensitive substring match on KPI name'),
        search: text(200)
          .optional()
          .describe('Free text across filename, KPI, sheet, report title and narrative'),
        workbook_id: uuid('workbook_id').optional().describe('Only KPIs from this workbook'),
        user_email: text(255).optional().describe('Owning user email (exact, case-insensitive)'),
        created_from: isoDate.optional().describe('Created at or after this ISO date'),
        created_to: isoDate.optional().describe('Created at or before this ISO date'),
        only_standalone: z.boolean().optional().describe('Only single-file uploads (no workbook)'),
        only_workbook_kpis: z.boolean().optional().describe('Only KPIs that belong to a workbook'),
        has_findings: z.boolean().optional().describe('Reports that do / do not have analytics findings'),
        has_intelligence: z.boolean().optional().describe('Only reports carrying an intelligence block'),
        sort: z.enum(REPORT_SORTS).default('created_desc').describe('Result ordering'),
        page: boundedInt(1, 1000, 1).describe('1-based page number'),
        limit: boundedInt(1, 100, 20).describe('Rows per page (max 100)'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const { where, values, applied } = buildReportFilters(args);
      const limit = args.limit ?? 20;
      const page = args.page ?? 1;
      const offset = (page - 1) * limit;

      const countRow = await scope.readOne(
        `SELECT COUNT(*)::int AS total ${LIST_JOINS} ${where}`,
        values
      );

      const rows = await scope.readRows(
        `SELECT ${LIST_COLUMNS} ${LIST_JOINS} ${where}
         ORDER BY ${SORT_SQL[args.sort || 'created_desc']}
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      );

      const total = countRow ? countRow.total : 0;
      return jsonResult({
        total,
        page,
        limit,
        pageCount: Math.ceil(total / limit) || 0,
        hasMore: offset + rows.length < total,
        filters: applied,
        reports: rows.map((r) => compact(r)),
      });
    })
  );

  server.registerTool(
    'get_report',
    {
      title: 'Get one report in full',
      description:
        'Full detail for a single report: status, workflow, source file, formatted summary ' +
        '(title, highlights, narrative, insight), calculated metrics, stored metric rows, ' +
        'parse metadata, validation errors, chart inventory (metadata only, never image bytes) ' +
        'and time-series metadata. The analytics block is returned by get_report_intelligence ' +
        'and the series points by get_report_timeseries.',
      inputSchema: {
        report_id: uuid('report_id'),
        sections: z
          .array(
            z.enum([
              'overview',
              'summary',
              'metrics',
              'charts',
              'parse_meta',
              'timeseries_meta',
              'validation',
            ])
          )
          .optional()
          .describe('Subset of sections to return. Omit for all of them.'),
        max_summary_chars: boundedInt(1000, 200000, 40000).describe(
          'Inline size budget for the formatted summary block'
        ),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const wanted = new Set(
        args.sections && args.sections.length
          ? args.sections
          : ['overview', 'summary', 'metrics', 'charts', 'parse_meta', 'timeseries_meta', 'validation']
      );

      // `summary - 'intelligence'` strips the analytics block at the database, so the
      // formatted-summary section never carries the (much larger) analysis payload.
      const report = await scope.readOne(
        `SELECT
           pr.id, pr.status, pr.kpi_name, pr.sheet_name, pr.workbook_id,
           pr.created_at, pr.completed_at, pr.updated_at, pr.error_message,
           kw.slug AS workflow_slug, kw.name AS workflow_name, kw.description AS workflow_description,
           uf.original_filename, uf.file_size, uf.mime_type, uf.uploaded_at,
           u.email AS user_email, u.full_name AS user_name,
           wb.original_filename AS workbook_filename,
           COALESCE(pr.summary, '{}'::jsonb) - 'intelligence' AS summary_core,
           (pr.summary ? 'intelligence') AS has_intelligence,
           pr.validation_errors,
           pr.report_data->'parseMeta' AS parse_meta,
           pr.report_data->'calculated'->'metrics' AS calculated_metrics,
           pr.report_data->'calculated'->'anomalies' AS calculated_anomalies,
           pr.report_data->'calculated'->'threshold' AS threshold,
           pr.report_data->'calculated'->'valueType' AS value_type,
           pr.report_data->'calculated'->'rawRecordCount' AS raw_record_count,
           pr.report_data->'transformed' AS transformed,
           pr.report_data->'tables'->'timeSeries'->'detected' AS ts_detected,
           pr.report_data->'tables'->'timeSeries'->'availableSpans' AS ts_available_spans,
           pr.report_data->'tables'->'timeSeries'->'min' AS ts_min,
           pr.report_data->'tables'->'timeSeries'->'peak' AS ts_peak
         FROM processed_reports pr
         JOIN kpi_workflows kw ON kw.id = pr.workflow_id
         LEFT JOIN uploaded_files uf ON uf.id = pr.uploaded_file_id
         LEFT JOIN users u ON u.id = pr.user_id
         LEFT JOIN workbook_uploads wb ON wb.id = pr.workbook_id
         WHERE pr.id = $1 AND {{SCOPE:pr.user_id}}`,
        [args.report_id]
      );

      if (!report) {
        return notFoundResult('report', args.report_id, 'Use list_reports to find valid report ids.');
      }

      const payload = { found: true };

      if (wanted.has('overview')) {
        payload.overview = compact({
          id: report.id,
          status: report.status,
          workflowSlug: report.workflow_slug,
          workflowName: report.workflow_name,
          kpiName: report.kpi_name,
          sheetName: report.sheet_name,
          workbookId: report.workbook_id,
          workbookFilename: report.workbook_filename,
          sourceFile: report.original_filename,
          sourceFileBytes: report.file_size,
          user: report.user_email,
          createdAt: report.created_at,
          completedAt: report.completed_at,
          updatedAt: report.updated_at,
          errorMessage: report.error_message,
          hasIntelligence: report.has_intelligence,
        });
      }

      if (wanted.has('summary')) {
        payload.summary = summarizeLarge(
          report.summary_core,
          args.max_summary_chars ?? 40000,
          'summary'
        );
        if (report.has_intelligence) {
          payload.intelligenceHint =
            'Analytics (findings, anomalies, trend, forecast, capacity, quality) available via get_report_intelligence.';
        }
      }

      if (wanted.has('metrics')) {
        // generated_metrics carries no user_id of its own; ownership comes from the
        // report it hangs off, so the join to processed_reports is what makes the
        // anchor available and is not optional.
        const metricRows = await scope.readRows(
          `SELECT gm.metric_key, gm.metric_value, gm.metric_label, gm.metric_type, gm.unit, gm.metadata
           FROM generated_metrics gm
           JOIN processed_reports pr ON pr.id = gm.report_id
           WHERE gm.report_id = $1 AND {{SCOPE:pr.user_id}}
           ORDER BY gm.metric_key`,
          [args.report_id]
        );
        payload.metrics = {
          calculated: report.calculated_metrics,
          threshold: report.threshold,
          valueType: report.value_type,
          rawRecordCount: report.raw_record_count,
          anomalies: report.calculated_anomalies,
          storedRows: metricRows.map((m) => compact(m)),
        };
      }

      if (wanted.has('charts')) {
        // image_data is deliberately absent: it holds up to ~100 KB of PNG per row
        // and is blocked at the query guard. image_bytes carries the size instead.
        const charts = await scope.readRows(
          `SELECT gc.id, gc.chart_type, gc.title, gc.file_path, gc.image_bytes, gc.created_at,
                  gc.config->>'id' AS config_id,
                  gc.config->>'type' AS config_type
           FROM generated_charts gc
           JOIN processed_reports pr ON pr.id = gc.report_id
           WHERE gc.report_id = $1 AND {{SCOPE:pr.user_id}}
           ORDER BY gc.created_at`,
          [args.report_id]
        );
        payload.charts = {
          count: charts.length,
          totalImageBytes: charts.reduce((sum, c) => sum + (c.image_bytes || 0), 0),
          note: 'Image bytes are never returned over MCP. Use get_chart_config for the chart definition.',
          items: charts.map((c) => compact(c)),
        };
      }

      if (wanted.has('parse_meta')) {
        payload.parseMeta = report.parse_meta;
        payload.transformed = report.transformed;
      }

      if (wanted.has('timeseries_meta')) {
        payload.timeSeriesMeta = compact({
          detected: report.ts_detected,
          availableSpans: report.ts_available_spans,
          min: report.ts_min,
          peak: report.ts_peak,
          hint: 'Points come from get_report_timeseries.',
        });
      }

      if (wanted.has('validation')) {
        const errors = truncateArray(report.validation_errors || [], 25, 'validation errors');
        payload.validation = errors;
      }

      return jsonResult(payload);
    })
  );

  server.registerTool(
    'get_report_metrics',
    {
      title: 'Get a report’s metrics',
      description:
        'Headline metrics for one report: the calculated metric object (average, peak, ' +
        'latest, minimum, threshold, unit, ...) plus the persisted generated_metrics rows.',
      inputSchema: {
        report_id: uuid('report_id'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const row = await scope.readOne(
        `SELECT pr.id, pr.kpi_name, pr.status, kw.slug AS workflow_slug,
                pr.report_data->'calculated'->'metrics' AS calculated_metrics,
                pr.report_data->'calculated'->'threshold' AS threshold,
                pr.report_data->'calculated'->'valueType' AS value_type,
                pr.report_data->'calculated'->'nodeSplit' AS node_split,
                pr.report_data->'calculated'->'dailyPeaks' AS daily_peaks,
                pr.report_data->'calculated'->'peaksByView' AS peaks_by_view,
                pr.summary->'highlights' AS highlights
         FROM processed_reports pr
         JOIN kpi_workflows kw ON kw.id = pr.workflow_id
         WHERE pr.id = $1 AND {{SCOPE:pr.user_id}}`,
        [args.report_id]
      );

      if (!row) return notFoundResult('report', args.report_id);

      const metricRows = await scope.readRows(
        `SELECT gm.metric_key, gm.metric_value, gm.metric_label, gm.metric_type, gm.unit
         FROM generated_metrics gm
         JOIN processed_reports pr ON pr.id = gm.report_id
         WHERE gm.report_id = $1 AND {{SCOPE:pr.user_id}}
         ORDER BY gm.metric_key`,
        [args.report_id]
      );

      return jsonResult({
        found: true,
        reportId: row.id,
        kpiName: row.kpi_name,
        status: row.status,
        workflowSlug: row.workflow_slug,
        calculated: row.calculated_metrics,
        threshold: row.threshold,
        valueType: row.value_type,
        highlights: row.highlights,
        nodeSplit: row.node_split,
        dailyPeaks: truncateArray(row.daily_peaks || [], 60, 'daily peaks'),
        peaksByView: row.peaks_by_view,
        storedRows: metricRows.map((m) => compact(m)),
      });
    })
  );
}

module.exports = { register };
