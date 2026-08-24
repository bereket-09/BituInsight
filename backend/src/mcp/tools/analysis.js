/**
 * Cross-report aggregation and comparison.
 *
 * Each report is one processing run over one sheet, so "how has this KPI moved
 * across uploads?" and "how do these reports compare?" both mean joining several
 * reports and lining up their calculated metric objects. Those objects differ per
 * workflow (a throughput report has no `average`, a percentage KPI has no
 * `mdc1SharePct`), so the whole metric object is returned rather than a
 * lowest-common-denominator subset, with a few common fields lifted out for sorting.
 */

const { jsonResult, notFoundResult, truncateArray, compact, safeTool } = require('../format');
const { z, uuid, text, boundedInt, isoDate, WORKFLOW_SLUGS } = require('../validate');

/**
 * Metric keys that mean "the headline value", tried in the order the workflows use.
 * Telecom-metric reports store `average`/`peakValue`; CMG throughput stores
 * `averagePeriodGbps`/`peakPeriodGbps`; traffic volume stores `averageTotal`.
 * Aggregating these across workflows mixes units, which the tools call out.
 */
const HEADLINE_SQL = `COALESCE(
  (pr.report_data->'calculated'->'metrics'->>'average')::numeric,
  (pr.report_data->'calculated'->'metrics'->>'averagePeriodGbps')::numeric,
  (pr.report_data->'calculated'->'metrics'->>'averageTotal')::numeric
)`;

const PEAK_SQL = `COALESCE(
  (pr.report_data->'calculated'->'metrics'->>'peakValue')::numeric,
  (pr.report_data->'calculated'->'metrics'->>'peakPeriodGbps')::numeric,
  (pr.report_data->'calculated'->'metrics'->>'peakTotal')::numeric,
  (pr.report_data->'calculated'->'metrics'->>'maximum')::numeric
)`;

function register(server, scope) {
  server.registerTool(
    'list_kpis',
    {
      title: 'List distinct KPIs',
      description:
        'Every distinct KPI name seen across reports, with how many times it has been ' +
        'processed, its workflows, latest run and the average/peak of its most recent report. ' +
        'Use this to discover what can be asked about before drilling in.',
      inputSchema: {
        workflow: z.enum(WORKFLOW_SLUGS).optional(),
        name_contains: text(200).optional().describe('Case-insensitive substring of the KPI name'),
        workbook_id: uuid('workbook_id').optional(),
        limit: boundedInt(1, 300, 100).describe('KPI rows to return (max 300)'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const conditions = ['{{SCOPE:pr.user_id}}', 'pr.kpi_name IS NOT NULL'];
      const values = [];
      const push = (fragment, value) => {
        values.push(value);
        conditions.push(fragment.replace('$?', `$${values.length}`));
      };
      if (args.workflow) push('kw.slug = $?', args.workflow);
      if (args.name_contains) push('pr.kpi_name ILIKE $?', `%${args.name_contains}%`);
      if (args.workbook_id) push('pr.workbook_id = $?', args.workbook_id);

      values.push(args.limit ?? 100);

      const rows = await scope.readRows(
        `SELECT pr.kpi_name,
                COUNT(*)::int AS report_count,
                COUNT(*) FILTER (WHERE pr.status = 'completed')::int AS completed_count,
                MIN(pr.created_at) AS first_seen,
                MAX(pr.created_at) AS last_seen,
                ARRAY_AGG(DISTINCT kw.slug) AS workflows,
                COUNT(DISTINCT pr.workbook_id)::int AS workbook_count,
                ROUND(AVG(${HEADLINE_SQL}), 3) AS avg_of_averages,
                ROUND(MAX(${PEAK_SQL}), 3) AS highest_peak,
                MAX(pr.report_data->'calculated'->'metrics'->>'unit') AS unit
         FROM processed_reports pr
         JOIN kpi_workflows kw ON kw.id = pr.workflow_id
         WHERE ${conditions.join(' AND ')}
         GROUP BY pr.kpi_name
         ORDER BY MAX(pr.created_at) DESC
         LIMIT $${values.length}`,
        values
      );

      return jsonResult({
        returned: rows.length,
        limit: args.limit ?? 100,
        note: 'Reports with a null kpi_name (single-file uploads) are excluded; find those with list_reports.',
        kpis: rows.map((r) => compact(r)),
      });
    })
  );

  server.registerTool(
    'get_kpi_history',
    {
      title: 'Track one KPI across reports',
      description:
        'The same KPI across every report that produced it, newest first: calculated metrics, ' +
        'trend direction and slope, data-quality grade, capacity headroom and the covered time ' +
        'span. Use it to answer "is this KPI getting better or worse over successive uploads?".',
      inputSchema: {
        kpi_name: text(200).describe('KPI name; matched case-insensitively as a substring'),
        exact: z.boolean().default(false).describe('Require an exact (case-insensitive) name match'),
        workflow: z.enum(WORKFLOW_SLUGS).optional(),
        created_from: isoDate.optional(),
        limit: boundedInt(1, 100, 25).describe('Reports to return (max 100)'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const values = [args.exact ? args.kpi_name : `%${args.kpi_name}%`];
      const conditions = ['{{SCOPE:pr.user_id}}', 'pr.kpi_name ILIKE $1'];
      if (args.workflow) {
        values.push(args.workflow);
        conditions.push(`kw.slug = $${values.length}`);
      }
      if (args.created_from) {
        values.push(args.created_from);
        conditions.push(`pr.created_at >= $${values.length}`);
      }
      values.push(args.limit ?? 25);

      const rows = await scope.readRows(
        `SELECT pr.id AS report_id, pr.kpi_name, pr.status, pr.created_at, pr.completed_at,
                pr.workbook_id, kw.slug AS workflow_slug,
                pr.report_data->'calculated'->'metrics' AS metrics,
                (pr.report_data->'calculated'->'threshold')::text AS threshold,
                pr.summary->'timeContext' AS time_context,
                pr.summary->'intelligence'->'trend'->>'direction' AS trend_direction,
                (pr.summary->'intelligence'->'trend'->>'slopePerDayPct')::numeric AS slope_per_day_pct,
                pr.summary->'intelligence'->'trend'->>'confidence' AS trend_confidence,
                pr.summary->'intelligence'->'dataQuality'->>'grade' AS quality_grade,
                (pr.summary->'intelligence'->'capacity'->>'utilizationPct')::numeric AS utilization_pct,
                (pr.summary->'intelligence'->'capacity'->>'headroomPct')::numeric AS headroom_pct,
                jsonb_array_length(COALESCE(pr.summary->'intelligence'->'findings', '[]'::jsonb)) AS finding_count
         FROM processed_reports pr
         JOIN kpi_workflows kw ON kw.id = pr.workflow_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY pr.created_at DESC
         LIMIT $${values.length}`,
        values
      );

      if (rows.length === 0) {
        return notFoundResult('KPI report', args.kpi_name, 'Use list_kpis to see available KPI names.');
      }

      const distinctNames = [...new Set(rows.map((r) => r.kpi_name))];

      return jsonResult({
        found: true,
        query: args.kpi_name,
        matchedNames: distinctNames,
        returned: rows.length,
        note:
          distinctNames.length > 1
            ? 'The substring matched more than one KPI name; set exact=true to isolate one.'
            : undefined,
        history: rows.map((r) => compact(r)),
      });
    })
  );

  server.registerTool(
    'compare_reports',
    {
      title: 'Compare reports side by side',
      description:
        'Line up 2–10 reports: calculated metrics, trend, capacity, data quality, finding ' +
        'counts and time span, plus the union of metric keys so differences are easy to spot.',
      inputSchema: {
        report_ids: z
          .array(uuid('report_id'))
          .min(2)
          .max(10)
          .describe('Between 2 and 10 report ids'),
        include_findings: z
          .boolean()
          .default(true)
          .describe('Include each report’s top findings (title + severity)'),
        max_findings_each: boundedInt(1, 20, 5),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const rows = await scope.readRows(
        `SELECT pr.id AS report_id, pr.kpi_name, pr.status, pr.created_at,
                kw.slug AS workflow_slug,
                uf.original_filename,
                pr.report_data->'calculated'->'metrics' AS metrics,
                (pr.report_data->'calculated'->'threshold')::text AS threshold,
                pr.summary->'timeContext' AS time_context,
                pr.summary->'intelligence'->'trend' AS trend,
                pr.summary->'intelligence'->'capacity' AS capacity,
                pr.summary->'intelligence'->'dataQuality' AS data_quality,
                pr.summary->'intelligence'->'findings' AS findings,
                pr.summary->>'narrative' AS narrative
         FROM processed_reports pr
         JOIN kpi_workflows kw ON kw.id = pr.workflow_id
         LEFT JOIN uploaded_files uf ON uf.id = pr.uploaded_file_id
         WHERE pr.id = ANY($1::uuid[]) AND {{SCOPE:pr.user_id}}`,
        [args.report_ids]
      );

      const foundIds = new Set(rows.map((r) => r.report_id));
      const missing = args.report_ids.filter((id) => !foundIds.has(id));

      if (rows.length === 0) {
        return notFoundResult(
          'report',
          args.report_ids,
          'None of the supplied ids exist in this account.'
        );
      }

      const metricKeys = new Set();
      for (const row of rows) {
        for (const key of Object.keys(row.metrics || {})) metricKeys.add(key);
      }

      const reports = rows
        // Preserve the caller's ordering so the comparison reads as requested.
        .sort((a, b) => args.report_ids.indexOf(a.report_id) - args.report_ids.indexOf(b.report_id))
        .map((row) =>
          compact({
            reportId: row.report_id,
            kpiName: row.kpi_name,
            status: row.status,
            workflowSlug: row.workflow_slug,
            sourceFile: row.original_filename,
            createdAt: row.created_at,
            timeContext: row.time_context,
            threshold: row.threshold,
            metrics: row.metrics,
            trend: row.trend
              ? compact({
                  direction: row.trend.direction,
                  slopePerDayPct: row.trend.slopePerDayPct,
                  totalChangePct: row.trend.totalChangePct,
                  confidence: row.trend.confidence,
                  r2: row.trend.r2,
                })
              : undefined,
            capacity: row.capacity
              ? compact({
                  typical: row.capacity.typical,
                  observedPeak: row.capacity.observedPeak,
                  threshold: row.capacity.threshold,
                  utilizationPct: row.capacity.utilizationPct,
                  headroomPct: row.capacity.headroomPct,
                  daysToSaturation: row.capacity.daysToSaturation,
                })
              : undefined,
            dataQuality: row.data_quality
              ? compact({
                  grade: row.data_quality.grade,
                  score: row.data_quality.score,
                  coveragePct: row.data_quality.coveragePct,
                  gapCount: row.data_quality.gapCount,
                })
              : undefined,
            findingCount: Array.isArray(row.findings) ? row.findings.length : 0,
            findings:
              args.include_findings === false
                ? undefined
                : truncateArray(row.findings || [], args.max_findings_each ?? 5, 'findings').items.map(
                    (f) => compact({ id: f.id, category: f.category, severity: f.severity, title: f.title })
                  ),
            narrative: row.narrative,
          })
        );

      return jsonResult({
        found: true,
        requested: args.report_ids.length,
        returned: reports.length,
        ...(missing.length ? { missingReportIds: missing } : {}),
        metricKeyUnion: [...metricKeys].sort(),
        reports,
      });
    })
  );

  server.registerTool(
    'get_workflow_rollup',
    {
      title: 'Aggregate reports by workflow or period',
      description:
        'Rollup counts and averages grouped by workflow, status, day, week or month. ' +
        'Answers "how many reports per workflow last month?" or "how did the average of ' +
        'this KPI move week to week?" without pulling individual reports.',
      inputSchema: {
        group_by: z
          .enum(['workflow', 'status', 'day', 'week', 'month', 'quality_grade', 'trend_direction'])
          .describe('Grouping dimension'),
        workflow: z.enum(WORKFLOW_SLUGS).optional(),
        kpi_name: text(200).optional().describe('Case-insensitive substring of the KPI name'),
        created_from: isoDate.optional(),
        created_to: isoDate.optional(),
        only_completed: z.boolean().default(true).describe('Restrict to completed reports'),
        limit: boundedInt(1, 200, 50),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      // Closed map: the grouping expression is never built from caller text.
      const GROUP_SQL = {
        workflow: 'kw.slug',
        status: 'pr.status::text',
        day: `to_char(date_trunc('day', pr.created_at), 'YYYY-MM-DD')`,
        week: `to_char(date_trunc('week', pr.created_at), 'YYYY-MM-DD')`,
        month: `to_char(date_trunc('month', pr.created_at), 'YYYY-MM')`,
        quality_grade: `pr.summary->'intelligence'->'dataQuality'->>'grade'`,
        trend_direction: `pr.summary->'intelligence'->'trend'->>'direction'`,
      };
      const groupExpr = GROUP_SQL[args.group_by];

      const conditions = ['{{SCOPE:pr.user_id}}'];
      const values = [];
      const push = (fragment, value) => {
        values.push(value);
        conditions.push(fragment.replace('$?', `$${values.length}`));
      };
      if (args.only_completed !== false) conditions.push(`pr.status = 'completed'`);
      if (args.workflow) push('kw.slug = $?', args.workflow);
      if (args.kpi_name) push('pr.kpi_name ILIKE $?', `%${args.kpi_name}%`);
      if (args.created_from) push('pr.created_at >= $?', args.created_from);
      if (args.created_to) push('pr.created_at <= $?', args.created_to);

      const where = `WHERE ${conditions.join(' AND ')}`;
      values.push(args.limit ?? 50);

      const rows = await scope.readRows(
        `SELECT ${groupExpr} AS group_key,
                COUNT(*)::int AS reports,
                COUNT(DISTINCT pr.kpi_name)::int AS distinct_kpis,
                COUNT(DISTINCT pr.workbook_id)::int AS workbooks,
                ROUND(AVG(${HEADLINE_SQL}), 3) AS avg_value,
                ROUND(MAX(${PEAK_SQL}), 3) AS max_peak,
                SUM(jsonb_array_length(COALESCE(pr.summary->'intelligence'->'findings', '[]'::jsonb)))::int AS total_findings,
                MIN(pr.created_at) AS first_report_at,
                MAX(pr.created_at) AS last_report_at
         FROM processed_reports pr
         JOIN kpi_workflows kw ON kw.id = pr.workflow_id
         ${where}
         GROUP BY 1
         ORDER BY 1
         LIMIT $${values.length}`,
        values
      );

      return jsonResult({
        groupBy: args.group_by,
        groups: rows.length,
        note:
          args.workflow || args.kpi_name
            ? undefined
            : 'avg_value and max_peak mix units across workflows (% vs Gbps vs users). Filter by workflow or kpi_name for a comparable number.',
        rows: rows.map((r) => compact(r)),
      });
    })
  );
}

module.exports = { register };
