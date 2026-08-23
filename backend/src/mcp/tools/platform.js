/**
 * Platform-level tools: activity statistics, users, and schema introspection.
 *
 * `describe_schema` exists so a connected model can discover what is queryable
 * without guessing. It reports the real columns from information_schema plus a
 * hand-written map of the JSONB documents, which is where most of the interesting
 * data lives and which no catalog can describe on its own.
 */

const { readRows, readOne, BLOCKED_COLUMNS } = require('../db');
const { jsonResult, compact, safeTool } = require('../format');
const { z, boundedInt } = require('../validate');

/** Tables this server reads. A closed list; nothing here comes from caller input. */
const KNOWN_TABLES = [
  'users',
  'kpi_workflows',
  'uploaded_files',
  'processed_reports',
  'workbook_uploads',
  'generated_metrics',
  'generated_charts',
  'teams_delivery_logs',
];

/**
 * Hand-maintained map of the JSONB documents. information_schema can only say
 * "jsonb", so without this a model cannot know that findings live at
 * summary.intelligence.findings or that the series is under
 * report_data.tables.timeSeries.series.<span>.
 */
const JSONB_GUIDE = {
  'processed_reports.summary': {
    description: 'Formatted report the UI renders, plus the trimmed analytics block.',
    paths: {
      title: 'Report title',
      kpiName: 'KPI name',
      narrative: 'One-paragraph plain-language summary',
      narrativeLong: 'Longer narrative (CMG throughput only)',
      highlights: 'Array of { label, value, trend } headline chips',
      insight: 'Scope / formula / pipeline / snapshot blocks (CMG throughput only)',
      timeContext: '{ span, points, granularity }',
      dateRange: '{ start, end }',
      parseMeta: '{ sheetName, headerRow, dataStartRow, rowsProcessed, metricColumnName }',
      threshold: 'Configured KPI threshold (telecom metric)',
      anomalies: 'Legacy per-workflow anomaly list',
      'intelligence.scope': 'pointCount, from/to, spanLabel, cadenceLabel',
      'intelligence.findings': 'Ranked findings: { id, category, severity, title, detail, evidence }',
      'intelligence.trend': 'direction, slopePerDay, slopePerDayPct, totalChangePct, r2, confidence',
      'intelligence.forecast': 'Projection or { available:false, reason }',
      'intelligence.capacity': 'typical, observedPeak, planningPeak, threshold, utilizationPct, headroomPct, daysToSaturation',
      'intelligence.dataQuality': 'grade, score, coveragePct, gapCount, pointCount, issues[], gaps[]',
      'intelligence.dailyShape': 'Hour-of-day profile',
      'intelligence.balance': 'Share-of-total across named streams (MDC1/MDC2, 4G/2G3G)',
    },
    tools: ['get_report', 'get_report_intelligence', 'search_findings'],
  },
  'processed_reports.report_data': {
    description: 'Full processing output. Large — never select the whole document.',
    paths: {
      parseMeta: 'Where the parser found the header and data rows',
      'calculated.metrics': 'Headline metric object (average, peakValue, latest, unit, ...)',
      'calculated.anomalies': 'Workflow-level anomaly list',
      'calculated.timeSeries': 'Same series document as tables.timeSeries',
      'calculated.aggregatedPeriods': 'Raw aggregated rows (can be hundreds)',
      'tables.timeSeries.series.<span>': 'Point arrays keyed by span: native / hourly / daily / weekly / monthly',
      'tables.timeSeries.detected': 'Detected cadence and span',
      'tables.timeSeries.availableSpans': '{ auto, options[] } — which spans exist and how big',
      'tables.timeSeries.min / .peak': 'Extreme points',
      'intelligence.anomalies': '{ points[], levelShift, flatlines[] } — only stored here, not in summary',
      'intelligence.baseline': 'Seasonal baseline buckets',
      'intelligence.brief': 'Condensed narrative brief',
      charts: 'Chart id/title/type stubs (image metadata lives in generated_charts)',
    },
    tools: ['get_report', 'get_report_timeseries', 'get_report_intelligence', 'get_report_metrics'],
  },
  'workbook_uploads.summary': {
    description: 'Sheet detection preview and per-KPI processing outcome.',
    paths: {
      'preview.kpis': 'One entry per detected data sheet: sheetName, kpiName, headers, rowCount, granularity, valid, errors',
      'preview.totalSheets / dataSheetCount / ignoredSheetCount': 'Sheet census',
      validCount: 'Sheets that passed structural validation',
      invalidCount: 'Sheets that failed validation',
      completed: 'Child KPI reports that completed',
      failed: 'Child KPI reports that failed',
      defaultThreshold: 'Threshold applied when a KPI has no override',
      kpiThresholds: 'Per-KPI threshold overrides',
    },
    tools: ['list_workbooks', 'get_workbook'],
  },
  'generated_charts.config': {
    description: 'Full Chart.js definition: { id, type, data:{ labels[], datasets[] }, options }.',
    paths: {
      'data.labels': 'Axis labels — one per point, so up to several hundred',
      'data.datasets': 'Series: { label, data[], borderColor, backgroundColor }',
      options: 'Scales, plugins and formatting used at render time',
    },
    tools: ['list_charts', 'get_chart_config'],
  },
};

function register(server) {
  server.registerTool(
    'get_platform_stats',
    {
      title: 'Platform statistics',
      description:
        'Overall state of the platform: report and workbook counts by status, per-workflow ' +
        'usage, chart storage, KPI coverage, activity over the last 30 days and the most ' +
        'recent uploads.',
      inputSchema: {
        recent_limit: boundedInt(1, 50, 10).describe('How many recent reports / workbooks to list'),
        activity_days: boundedInt(1, 365, 30).describe('Window for the daily activity histogram'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const recentLimit = args.recent_limit ?? 10;
      const activityDays = args.activity_days ?? 30;

      const reportStats = await readOne(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
                COUNT(*) FILTER (WHERE status IN ('pending','validating','processing'))::int AS in_progress,
                COUNT(*) FILTER (WHERE workbook_id IS NOT NULL)::int AS from_workbooks,
                COUNT(DISTINCT kpi_name)::int AS distinct_kpis,
                MIN(created_at) AS first_report_at,
                MAX(created_at) AS last_report_at
         FROM processed_reports`
      );

      const workbookStats = await readOne(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
                COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
                COALESCE(SUM(sheet_count), 0)::int AS total_sheets,
                COALESCE(SUM(kpi_count), 0)::int AS total_kpis,
                COALESCE(SUM(file_size), 0)::bigint AS total_source_bytes
         FROM workbook_uploads`
      );

      const storage = await readOne(
        `SELECT (SELECT COUNT(*)::int FROM generated_charts) AS charts,
                (SELECT COALESCE(SUM(image_bytes), 0)::bigint FROM generated_charts) AS chart_image_bytes,
                (SELECT COUNT(*)::int FROM generated_charts WHERE image_bytes IS NULL) AS charts_without_image,
                (SELECT COUNT(*)::int FROM generated_metrics) AS metric_rows,
                (SELECT COUNT(*)::int FROM uploaded_files) AS uploaded_files,
                (SELECT COALESCE(SUM(file_size), 0)::bigint FROM uploaded_files) AS uploaded_bytes,
                (SELECT COUNT(*)::int FROM users) AS users,
                (SELECT COUNT(*)::int FROM teams_delivery_logs) AS teams_deliveries`
      );

      const byWorkflow = await readRows(
        `SELECT kw.slug, kw.name,
                COUNT(pr.id)::int AS reports,
                COUNT(pr.id) FILTER (WHERE pr.status = 'completed')::int AS completed,
                MAX(pr.created_at) AS last_report_at
         FROM kpi_workflows kw
         LEFT JOIN processed_reports pr ON pr.workflow_id = kw.id
         GROUP BY kw.id ORDER BY reports DESC`
      );

      const activity = await readRows(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS reports,
                COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
         FROM processed_reports
         WHERE created_at >= NOW() - ($1 || ' days')::interval
         GROUP BY 1 ORDER BY 1 DESC`,
        [String(activityDays)]
      );

      const recentReports = await readRows(
        `SELECT pr.id, pr.kpi_name, pr.status, pr.created_at, kw.slug AS workflow_slug,
                uf.original_filename
         FROM processed_reports pr
         JOIN kpi_workflows kw ON kw.id = pr.workflow_id
         LEFT JOIN uploaded_files uf ON uf.id = pr.uploaded_file_id
         ORDER BY pr.created_at DESC LIMIT $1`,
        [recentLimit]
      );

      const recentWorkbooks = await readRows(
        `SELECT id, original_filename, status, sheet_count, kpi_count, created_at
         FROM workbook_uploads ORDER BY created_at DESC LIMIT $1`,
        [recentLimit]
      );

      const qualitySpread = await readRows(
        `SELECT COALESCE(summary->'intelligence'->'dataQuality'->>'grade', 'none') AS grade,
                COUNT(*)::int AS reports
         FROM processed_reports WHERE status = 'completed'
         GROUP BY 1 ORDER BY 2 DESC`
      );

      return jsonResult({
        reports: compact(reportStats || {}),
        workbooks: compact(workbookStats || {}),
        storage: compact(storage || {}),
        byWorkflow: byWorkflow.map((w) => compact(w)),
        dataQualitySpread: qualitySpread,
        activity: { days: activityDays, byDay: activity },
        recentReports: recentReports.map((r) => compact(r)),
        recentWorkbooks: recentWorkbooks.map((w) => compact(w)),
      });
    })
  );

  server.registerTool(
    'list_users',
    {
      title: 'List platform users',
      description:
        'Platform accounts with their report and workbook counts. Credentials are never ' +
        'returned — password_hash is blocked at the query guard.',
      inputSchema: {
        limit: boundedInt(1, 100, 25),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const rows = await readRows(
        `SELECT u.id, u.email, u.full_name, u.created_at,
                COUNT(DISTINCT pr.id)::int AS report_count,
                COUNT(DISTINCT wu.id)::int AS workbook_count,
                MAX(pr.created_at) AS last_report_at
         FROM users u
         LEFT JOIN processed_reports pr ON pr.user_id = u.id
         LEFT JOIN workbook_uploads wu ON wu.user_id = u.id
         GROUP BY u.id
         ORDER BY u.created_at
         LIMIT $1`,
        [args.limit ?? 25]
      );

      return jsonResult({
        count: rows.length,
        note: 'password_hash is unreadable through this server by design.',
        users: rows.map((u) => compact(u)),
      });
    })
  );

  server.registerTool(
    'describe_schema',
    {
      title: 'Describe the queryable schema',
      description:
        'Discovery tool: every table this server reads, its columns and types, row counts, ' +
        'enum values, and a map of the JSONB documents (where findings, time series and ' +
        'chart configs actually live) with the tool that reads each one.',
      inputSchema: {
        table: z
          .enum(KNOWN_TABLES)
          .optional()
          .describe('Restrict to one table. Omit for the whole schema.'),
        include_jsonb_guide: z
          .boolean()
          .default(true)
          .describe('Include the JSONB document map (recommended on first use)'),
        include_counts: z.boolean().default(true).describe('Include per-table row counts'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const tables = args.table ? [args.table] : KNOWN_TABLES;

      const columns = await readRows(
        `SELECT table_name, column_name, data_type, is_nullable, column_default, udt_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ANY($1::text[])
         ORDER BY table_name, ordinal_position`,
        [tables]
      );

      const grouped = {};
      for (const col of columns) {
        if (!grouped[col.table_name]) grouped[col.table_name] = [];
        grouped[col.table_name].push(
          compact({
            name: col.column_name,
            type: col.udt_name === 'jsonb' ? 'jsonb' : col.data_type,
            nullable: col.is_nullable === 'YES',
            default: col.column_default,
            // Called out so a model does not plan a query around a column it can never read.
            readable: BLOCKED_COLUMNS.includes(col.column_name) ? false : undefined,
            note: BLOCKED_COLUMNS.includes(col.column_name)
              ? 'Blocked by the read-only guard and never returned over MCP'
              : undefined,
          })
        );
      }

      const enums = await readRows(
        // enumlabel is of type "name"; casting to text lets node-postgres decode the
        // array into a real JS array instead of the raw "{a,b,c}" literal.
        `SELECT t.typname AS enum_name, ARRAY_AGG(e.enumlabel::text ORDER BY e.enumsortorder) AS values
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
         JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'public'
         GROUP BY t.typname ORDER BY t.typname`
      );

      // Fixed subqueries, one per known table, so counts need no dynamic SQL.
      let counts = null;
      if (args.include_counts !== false) {
        counts = await readOne(
          `SELECT (SELECT COUNT(*)::int FROM users) AS users,
                  (SELECT COUNT(*)::int FROM kpi_workflows) AS kpi_workflows,
                  (SELECT COUNT(*)::int FROM uploaded_files) AS uploaded_files,
                  (SELECT COUNT(*)::int FROM processed_reports) AS processed_reports,
                  (SELECT COUNT(*)::int FROM workbook_uploads) AS workbook_uploads,
                  (SELECT COUNT(*)::int FROM generated_metrics) AS generated_metrics,
                  (SELECT COUNT(*)::int FROM generated_charts) AS generated_charts,
                  (SELECT COUNT(*)::int FROM teams_delivery_logs) AS teams_delivery_logs`
        );
      }

      const relationships = {
        processed_reports:
          'user_id → users.id, workflow_id → kpi_workflows.id, uploaded_file_id → uploaded_files.id, workbook_id → workbook_uploads.id (null for single-file uploads)',
        generated_metrics: 'report_id → processed_reports.id (cascade delete)',
        generated_charts: 'report_id → processed_reports.id (cascade delete)',
        workbook_uploads: 'user_id → users.id; children are processed_reports rows sharing workbook_id',
        teams_delivery_logs: 'report_id → processed_reports.id, user_id → users.id',
      };

      return jsonResult({
        access: 'read-only',
        tables: Object.entries(grouped).map(([name, cols]) =>
          compact({
            name,
            rowCount: counts ? counts[name] : undefined,
            relationships: relationships[name],
            columns: cols,
          })
        ),
        enums: enums.map((e) => ({ name: e.enum_name, values: e.values })),
        ...(args.include_jsonb_guide === false ? {} : { jsonbDocuments: JSONB_GUIDE }),
        blockedColumns: BLOCKED_COLUMNS,
      });
    })
  );
}

module.exports = { register, KNOWN_TABLES, JSONB_GUIDE };
