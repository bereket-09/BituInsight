/**
 * Analytics ("intelligence") tools.
 *
 * The analysis produced by src/analytics is persisted twice: a trimmed copy under
 * `summary.intelligence` (what the UI renders) and the full copy under
 * `report_data.intelligence` (which additionally carries `anomalies`, `baseline`
 * and `brief`). These tools read whichever location holds each section, so callers
 * do not have to know that split.
 */

const { jsonResult, notFoundResult, truncateArray, compact, safeTool } = require('../format');
const {
  z,
  uuid,
  text,
  boundedInt,
  isoDate,
  WORKFLOW_SLUGS,
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  QUALITY_GRADES,
} = require('../validate');

const INTELLIGENCE_SECTIONS = [
  'scope',
  'findings',
  'anomalies',
  'trend',
  'forecast',
  'capacity',
  'quality',
  'baseline',
  'dailyShape',
  'balance',
  'narrative',
];

/** Fixed ranking used for ORDER BY; never assembled from caller input. */
const SEVERITY_RANK_SQL = `CASE f.value->>'severity'
    WHEN 'critical' THEN 1
    WHEN 'major' THEN 2
    WHEN 'minor' THEN 3
    WHEN 'info' THEN 4
    ELSE 5 END`;

/** Findings embed an `evidence.all` array that can hold every anomaly in the period. */
function trimFinding(finding, evidenceLimit) {
  if (!finding || typeof finding !== 'object') return finding;
  const out = { ...finding };
  if (out.evidence && Array.isArray(out.evidence.all)) {
    const trimmed = truncateArray(out.evidence.all, evidenceLimit, 'evidence items');
    out.evidence = {
      ...out.evidence,
      all: trimmed.items,
      ...(trimmed.truncated ? { allTruncationNote: trimmed.truncationNote } : {}),
    };
  }
  return out;
}

function register(server, scope) {
  server.registerTool(
    'get_report_intelligence',
    {
      title: 'Get a report’s analysis',
      description:
        'The analytics pass for one report: ranked findings, anomaly points / level shifts / ' +
        'flatlines, trend and its confidence, forecast, capacity and headroom, data-quality ' +
        'grade and gaps, seasonal baseline, daily shape, stream balance and the narrative.',
      inputSchema: {
        report_id: uuid('report_id'),
        sections: z
          .array(z.enum(INTELLIGENCE_SECTIONS))
          .optional()
          .describe('Subset of analysis sections. Omit for all of them.'),
        max_findings: boundedInt(1, 100, 25).describe('Cap on returned findings'),
        max_anomalies: boundedInt(1, 500, 50).describe('Cap on returned anomaly points'),
        max_evidence: boundedInt(1, 200, 10).describe('Cap on evidence items inside each finding'),
        max_baseline_buckets: boundedInt(1, 200, 24).describe('Cap on seasonal baseline buckets'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const row = await scope.readOne(
        `SELECT
           pr.id, pr.kpi_name, pr.status, pr.created_at,
           kw.slug AS workflow_slug, kw.name AS workflow_name,
           (pr.summary ? 'intelligence') AS in_summary,
           (pr.report_data ? 'intelligence') AS in_report_data,
           COALESCE(pr.summary->'intelligence'->'available', pr.report_data->'intelligence'->'available') AS available,
           COALESCE(pr.summary->'intelligence'->'scope', pr.report_data->'intelligence'->'scope') AS scope,
           COALESCE(pr.summary->'intelligence'->'findings', pr.report_data->'intelligence'->'findings') AS findings,
           COALESCE(pr.summary->'intelligence'->'trend', pr.report_data->'intelligence'->'trend') AS trend,
           COALESCE(pr.summary->'intelligence'->'forecast', pr.report_data->'intelligence'->'forecast') AS forecast,
           COALESCE(pr.summary->'intelligence'->'capacity', pr.report_data->'intelligence'->'capacity') AS capacity,
           COALESCE(pr.summary->'intelligence'->'balance', pr.report_data->'intelligence'->'balance') AS balance,
           COALESCE(pr.summary->'intelligence'->'dailyShape', pr.report_data->'intelligence'->'dailyShape') AS daily_shape,
           COALESCE(pr.summary->'intelligence'->'narrative', pr.report_data->'intelligence'->'narrative') AS narrative,
           COALESCE(pr.summary->'intelligence'->'dataQuality', pr.report_data->'intelligence'->'quality') AS quality,
           COALESCE(pr.summary->'intelligence'->'reason', pr.report_data->'intelligence'->'reason') AS reason,
           pr.report_data->'intelligence'->'anomalies' AS anomalies,
           pr.report_data->'intelligence'->'baseline' AS baseline,
           pr.report_data->'intelligence'->'brief' AS brief
         FROM processed_reports pr
         JOIN kpi_workflows kw ON kw.id = pr.workflow_id
         WHERE pr.id = $1 AND {{SCOPE:pr.user_id}}`,
        [args.report_id]
      );

      if (!row) return notFoundResult('report', args.report_id);

      if (!row.in_summary && !row.in_report_data) {
        return jsonResult({
          found: true,
          reportId: row.id,
          kpiName: row.kpi_name,
          status: row.status,
          intelligenceAvailable: false,
          message:
            row.status === 'completed'
              ? 'This report was processed before the analytics pass, or produced no analysis.'
              : `Report status is "${row.status}"; analytics only run on completed reports.`,
        });
      }

      const wanted = new Set(
        args.sections && args.sections.length ? args.sections : INTELLIGENCE_SECTIONS
      );

      const payload = {
        found: true,
        reportId: row.id,
        kpiName: row.kpi_name,
        status: row.status,
        workflowSlug: row.workflow_slug,
        createdAt: row.created_at,
        intelligenceAvailable: row.available !== false,
      };

      if (row.available === false && row.reason) payload.unavailableReason = row.reason;
      if (row.brief) payload.brief = row.brief;

      if (wanted.has('scope')) payload.scope = row.scope;
      if (wanted.has('narrative')) payload.narrative = row.narrative;

      if (wanted.has('findings')) {
        const trimmed = truncateArray(row.findings || [], args.max_findings ?? 25, 'findings');
        payload.findings = {
          total: trimmed.total,
          returned: trimmed.items.length,
          ...(trimmed.truncated ? { truncationNote: trimmed.truncationNote } : {}),
          items: trimmed.items.map((f) => trimFinding(f, args.max_evidence ?? 10)),
        };
      }

      if (wanted.has('anomalies')) {
        const anomalies = row.anomalies || {};
        const points = truncateArray(anomalies.points || [], args.max_anomalies ?? 50, 'anomaly points');
        payload.anomalies = {
          pointCount: points.total,
          points: points.items,
          ...(points.truncated ? { truncationNote: points.truncationNote } : {}),
          levelShift: anomalies.levelShift ?? null,
          flatlines: truncateArray(anomalies.flatlines || [], 25, 'flatlines').items,
          ...(row.in_report_data
            ? {}
            : { note: 'Anomaly detail lives in report_data.intelligence, which is absent for this report.' }),
        };
      }

      if (wanted.has('trend')) payload.trend = row.trend;
      if (wanted.has('forecast')) payload.forecast = row.forecast;
      if (wanted.has('capacity')) payload.capacity = row.capacity;
      if (wanted.has('quality')) payload.dataQuality = row.quality;
      if (wanted.has('balance')) payload.balance = row.balance;
      if (wanted.has('dailyShape')) payload.dailyShape = row.daily_shape;

      if (wanted.has('baseline') && row.baseline) {
        const buckets = truncateArray(
          row.baseline.buckets || [],
          args.max_baseline_buckets ?? 24,
          'baseline buckets'
        );
        payload.baseline = {
          profile: row.baseline.profile ?? row.baseline.profileId,
          profileLabel: row.baseline.profileLabel,
          center: row.baseline.center ?? (row.baseline.global && row.baseline.global.center),
          spread: row.baseline.spread ?? (row.baseline.global && row.baseline.global.spread),
          bucketCount: buckets.total,
          buckets: buckets.items,
          ...(buckets.truncated ? { truncationNote: buckets.truncationNote } : {}),
        };
      }

      return jsonResult(payload);
    })
  );

  server.registerTool(
    'search_findings',
    {
      title: 'Search analytics findings across reports',
      description:
        'Cross-report search over the ranked findings produced by the analytics pass. ' +
        'Filter by category (anomaly, data-quality, trend, capacity, distribution), severity, ' +
        'workflow, KPI or free text. Results are ordered by severity, then recency.',
      inputSchema: {
        category: z.enum(FINDING_CATEGORIES).optional(),
        severity: z.enum(FINDING_SEVERITIES).optional(),
        min_severity: z
          .enum(FINDING_SEVERITIES)
          .optional()
          .describe('Include this severity and anything worse'),
        workflow: z.enum(WORKFLOW_SLUGS).optional(),
        kpi_name: text(200).optional().describe('Case-insensitive substring match on KPI name'),
        workbook_id: uuid('workbook_id').optional(),
        contains: text(200).optional().describe('Substring of the finding title or detail'),
        created_from: isoDate.optional(),
        include_evidence: z.boolean().default(false).describe('Attach each finding’s evidence block'),
        limit: boundedInt(1, 200, 40).describe('Findings to return (max 200)'),
        offset: boundedInt(0, 100000, 0),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      // Anchored first: a cross-report search is exactly where a missing filter
      // would be least visible, so the scope is not one of the optional conditions.
      const conditions = ['{{SCOPE:pr.user_id}}'];
      const values = [];
      const push = (fragment, value) => {
        values.push(value);
        conditions.push(fragment.replace(/\$\?/g, `$${values.length}`));
      };

      if (args.category) push(`f.value->>'category' = $?`, args.category);
      if (args.severity) push(`f.value->>'severity' = $?`, args.severity);
      if (args.min_severity) {
        const rank = FINDING_SEVERITIES.indexOf(args.min_severity) + 1;
        push(`${SEVERITY_RANK_SQL} <= $?`, rank);
      }
      if (args.workflow) push('kw.slug = $?', args.workflow);
      if (args.kpi_name) push('pr.kpi_name ILIKE $?', `%${args.kpi_name}%`);
      if (args.workbook_id) push('pr.workbook_id = $?', args.workbook_id);
      if (args.created_from) push('pr.created_at >= $?', args.created_from);
      if (args.contains) {
        push(`(COALESCE(f.value->>'title', '') ILIKE $? OR COALESCE(f.value->>'detail', '') ILIKE $?)`, `%${args.contains}%`);
      }

      const where = `WHERE ${conditions.join(' AND ')}`;
      // The CASE guard matters: jsonb_array_elements() raises on a non-array, and a
      // report processed before the analytics pass has no findings array at all.
      const from = `
        FROM processed_reports pr
        JOIN kpi_workflows kw ON kw.id = pr.workflow_id
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(pr.summary->'intelligence'->'findings') = 'array'
               THEN pr.summary->'intelligence'->'findings'
               ELSE '[]'::jsonb END
        ) AS f(value)
      `;

      const totals = await scope.readOne(`SELECT COUNT(*)::int AS total ${from} ${where}`, values);

      const limit = args.limit ?? 40;
      const offset = args.offset ?? 0;

      const rows = await scope.readRows(
        `SELECT
           pr.id AS report_id,
           pr.kpi_name,
           pr.workbook_id,
           pr.created_at,
           kw.slug AS workflow_slug,
           f.value->>'id' AS finding_key,
           f.value->>'category' AS category,
           f.value->>'severity' AS severity,
           f.value->>'title' AS title,
           f.value->>'detail' AS detail,
           ${args.include_evidence ? `f.value->'evidence' AS evidence,` : ''}
           ${SEVERITY_RANK_SQL} AS severity_rank
         ${from} ${where}
         ORDER BY severity_rank ASC, pr.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      );

      const total = totals ? totals.total : 0;
      return jsonResult({
        total,
        returned: rows.length,
        offset,
        limit,
        hasMore: offset + rows.length < total,
        findings: rows.map((r) => {
          const out = compact({ ...r });
          delete out.severity_rank;
          if (out.evidence && Array.isArray(out.evidence.all)) {
            const trimmed = truncateArray(out.evidence.all, 10, 'evidence items');
            out.evidence = { ...out.evidence, all: trimmed.items };
          }
          return out;
        }),
      });
    })
  );

  server.registerTool(
    'get_data_quality_overview',
    {
      title: 'Data-quality overview',
      description:
        'Data-quality grades and coverage across completed reports: grade distribution plus ' +
        'the per-report score, coverage percentage, gap count and point count.',
      inputSchema: {
        workflow: z.enum(WORKFLOW_SLUGS).optional(),
        grade: z.enum(QUALITY_GRADES).optional().describe('Only reports with this grade'),
        workbook_id: uuid('workbook_id').optional(),
        limit: boundedInt(1, 200, 50).describe('Report rows to return (max 200)'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const conditions = ['{{SCOPE:pr.user_id}}', `pr.summary->'intelligence' ? 'dataQuality'`];
      const values = [];
      const push = (fragment, value) => {
        values.push(value);
        conditions.push(fragment.replace('$?', `$${values.length}`));
      };
      if (args.workflow) push('kw.slug = $?', args.workflow);
      if (args.workbook_id) push('pr.workbook_id = $?', args.workbook_id);
      if (args.grade) push(`pr.summary->'intelligence'->'dataQuality'->>'grade' = $?`, args.grade);

      const where = `WHERE ${conditions.join(' AND ')}`;
      const from = `FROM processed_reports pr JOIN kpi_workflows kw ON kw.id = pr.workflow_id`;

      const distribution = await scope.readRows(
        `SELECT pr.summary->'intelligence'->'dataQuality'->>'grade' AS grade,
                COUNT(*)::int AS reports,
                ROUND(AVG((pr.summary->'intelligence'->'dataQuality'->>'score')::numeric), 1) AS avg_score
         ${from} ${where}
         GROUP BY 1 ORDER BY 2 DESC`,
        values
      );

      const rows = await scope.readRows(
        `SELECT pr.id AS report_id, pr.kpi_name, kw.slug AS workflow_slug, pr.created_at,
                pr.summary->'intelligence'->'dataQuality'->>'grade' AS grade,
                (pr.summary->'intelligence'->'dataQuality'->>'score')::numeric AS score,
                (pr.summary->'intelligence'->'dataQuality'->>'coveragePct')::numeric AS coverage_pct,
                (pr.summary->'intelligence'->'dataQuality'->>'gapCount')::int AS gap_count,
                (pr.summary->'intelligence'->'dataQuality'->>'pointCount')::int AS point_count,
                jsonb_array_length(COALESCE(pr.summary->'intelligence'->'dataQuality'->'issues', '[]'::jsonb)) AS issue_count
         ${from} ${where}
         ORDER BY score ASC NULLS LAST, pr.created_at DESC
         LIMIT $${values.length + 1}`,
        [...values, args.limit ?? 50]
      );

      return jsonResult({
        gradeDistribution: distribution,
        returned: rows.length,
        note: 'Reports are ordered worst-score first so problems surface at the top.',
        reports: rows.map((r) => compact(r)),
      });
    })
  );
}

module.exports = { register };
