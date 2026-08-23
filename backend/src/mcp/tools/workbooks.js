/**
 * CMM workbook tools.
 *
 * A workbook upload is one Excel file holding many "Data for <KPI>" sheets. Each
 * valid sheet becomes a child row in processed_reports linked by workbook_id, so a
 * workbook is really a parent record plus a set of per-KPI reports.
 *
 * `workbook_uploads.summary.preview` embeds every detected sheet (headers, row
 * counts, validation errors) and is easily 100 KB on a 100-sheet workbook, so it is
 * summarised rather than returned wholesale.
 */

const { readRows, readOne } = require('../db');
const { jsonResult, notFoundResult, truncateArray, compact, safeTool } = require('../format');
const { z, uuid, text, boundedInt, REPORT_STATUSES } = require('../validate');

function register(server) {
  server.registerTool(
    'list_workbooks',
    {
      title: 'List uploaded workbooks',
      description:
        'Multi-sheet CMM workbook uploads with sheet/KPI counts and the processing state ' +
        'of their child KPI reports.',
      inputSchema: {
        status: z.enum(REPORT_STATUSES).optional(),
        filename_contains: text(200).optional(),
        user_email: text(255).optional(),
        limit: boundedInt(1, 100, 20),
        offset: boundedInt(0, 100000, 0),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const conditions = [];
      const values = [];
      const push = (fragment, value) => {
        values.push(value);
        conditions.push(fragment.replace('$?', `$${values.length}`));
      };
      if (args.status) push('wu.status = $?', args.status);
      if (args.filename_contains) push('wu.original_filename ILIKE $?', `%${args.filename_contains}%`);
      if (args.user_email) push('u.email ILIKE $?', args.user_email);

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const totals = await readOne(
        `SELECT COUNT(*)::int AS total
         FROM workbook_uploads wu LEFT JOIN users u ON u.id = wu.user_id ${where}`,
        values
      );

      const rows = await readRows(
        `SELECT wu.id, wu.original_filename, wu.file_size, wu.sheet_count, wu.kpi_count,
                wu.status, wu.created_at, wu.completed_at,
                u.email AS user_email,
                (wu.summary->>'validCount')::int AS valid_sheet_count,
                (wu.summary->>'invalidCount')::int AS invalid_sheet_count,
                (wu.summary->>'completed')::int AS completed_kpis,
                (wu.summary->>'failed')::int AS failed_kpis,
                (wu.summary->>'defaultThreshold')::numeric AS default_threshold,
                wu.summary->>'error' AS error_message,
                COUNT(pr.id)::int AS child_report_count,
                COUNT(pr.id) FILTER (WHERE pr.status = 'completed')::int AS child_completed,
                COUNT(pr.id) FILTER (WHERE pr.status = 'failed')::int AS child_failed
         FROM workbook_uploads wu
         LEFT JOIN users u ON u.id = wu.user_id
         LEFT JOIN processed_reports pr ON pr.workbook_id = wu.id
         ${where}
         GROUP BY wu.id, u.email
         ORDER BY wu.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, args.limit ?? 20, args.offset ?? 0]
      );

      return jsonResult({
        total: totals ? totals.total : 0,
        returned: rows.length,
        offset: args.offset ?? 0,
        workbooks: rows.map((r) => compact(r)),
      });
    })
  );

  server.registerTool(
    'get_workbook',
    {
      title: 'Get a workbook and its KPIs',
      description:
        'One workbook upload with its per-KPI child reports (status, KPI name, sheet, ' +
        'headline metric, quality grade, finding count) and a bounded view of the sheet ' +
        'detection preview.',
      inputSchema: {
        workbook_id: uuid('workbook_id'),
        kpi_status: z.enum(REPORT_STATUSES).optional().describe('Only child KPIs in this state'),
        kpi_limit: boundedInt(1, 200, 60).describe('Child KPI rows to return (max 200)'),
        include_preview: z
          .boolean()
          .default(false)
          .describe('Include the per-sheet detection preview (large; bounded to 40 sheets)'),
        preview_limit: boundedInt(1, 200, 40),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const workbook = await readOne(
        `SELECT wu.id, wu.original_filename, wu.file_size, wu.sheet_count, wu.kpi_count,
                wu.status, wu.created_at, wu.completed_at,
                u.email AS user_email,
                (wu.summary->>'validCount')::int AS valid_sheet_count,
                (wu.summary->>'invalidCount')::int AS invalid_sheet_count,
                (wu.summary->>'completed')::int AS completed_kpis,
                (wu.summary->>'failed')::int AS failed_kpis,
                (wu.summary->>'total')::int AS total_kpis,
                (wu.summary->>'defaultThreshold')::numeric AS default_threshold,
                wu.summary->'kpiThresholds' AS kpi_thresholds,
                wu.summary->>'error' AS error_message,
                wu.summary->'preview'->>'ignoredSheetCount' AS ignored_sheet_count,
                jsonb_array_length(COALESCE(wu.summary->'preview'->'kpis', '[]'::jsonb)) AS preview_kpi_count
         FROM workbook_uploads wu
         LEFT JOIN users u ON u.id = wu.user_id
         WHERE wu.id = $1`,
        [args.workbook_id]
      );

      if (!workbook) {
        return notFoundResult('workbook', args.workbook_id, 'Use list_workbooks to find valid ids.');
      }

      const kpiConditions = ['pr.workbook_id = $1'];
      const kpiValues = [args.workbook_id];
      if (args.kpi_status) {
        kpiValues.push(args.kpi_status);
        kpiConditions.push(`pr.status = $${kpiValues.length}`);
      }
      kpiValues.push(args.kpi_limit ?? 60);

      const kpis = await readRows(
        `SELECT pr.id AS report_id, pr.kpi_name, pr.sheet_name, pr.status,
                pr.created_at, pr.completed_at, pr.error_message,
                kw.slug AS workflow_slug,
                (pr.report_data->'calculated'->'metrics'->>'average')::numeric AS average,
                (pr.report_data->'calculated'->'metrics'->>'peakValue')::numeric AS peak,
                (pr.report_data->'calculated'->'metrics'->>'latest')::numeric AS latest,
                pr.report_data->'calculated'->'metrics'->>'unit' AS unit,
                (pr.report_data->'calculated'->'threshold')::text AS threshold,
                pr.summary->'intelligence'->'dataQuality'->>'grade' AS quality_grade,
                pr.summary->'intelligence'->'trend'->>'direction' AS trend_direction,
                jsonb_array_length(COALESCE(pr.summary->'intelligence'->'findings', '[]'::jsonb)) AS finding_count
         FROM processed_reports pr
         JOIN kpi_workflows kw ON kw.id = pr.workflow_id
         WHERE ${kpiConditions.join(' AND ')}
         ORDER BY pr.kpi_name ASC NULLS LAST
         LIMIT $${kpiValues.length}`,
        kpiValues
      );

      const statusCounts = await readRows(
        `SELECT status::text AS status, COUNT(*)::int AS count
         FROM processed_reports WHERE workbook_id = $1 GROUP BY status ORDER BY 2 DESC`,
        [args.workbook_id]
      );

      const payload = {
        found: true,
        workbook: compact(workbook),
        kpiStatusCounts: statusCounts,
        kpis: {
          returned: kpis.length,
          items: kpis.map((k) => compact(k)),
          note:
            kpis.length === (args.kpi_limit ?? 60)
              ? 'Result may be capped by kpi_limit; use list_reports with workbook_id to page through all KPIs.'
              : undefined,
        },
      };

      if (args.include_preview) {
        // Pulled with a bounded jsonb slice so a 100-sheet workbook cannot flood the response.
        const previewRows = await readRows(
          `SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb) AS sheets
           FROM workbook_uploads wu
           CROSS JOIN LATERAL jsonb_array_elements(
             COALESCE(wu.summary->'preview'->'kpis', '[]'::jsonb)
           ) WITH ORDINALITY AS s(elem, ord)
           WHERE wu.id = $1 AND s.ord <= $2`,
          [args.workbook_id, args.preview_limit ?? 40]
        );
        const sheets = (previewRows[0] && previewRows[0].sheets) || [];
        const total = workbook.preview_kpi_count || sheets.length;
        payload.sheetPreview = {
          total,
          returned: sheets.length,
          ...(sheets.length < total
            ? {
                truncationNote: `Returned ${sheets.length} of ${total} detected sheets; raise preview_limit for more.`,
              }
            : {}),
          sheets: sheets.map((s) =>
            compact({
              sheetName: s.sheetName,
              sheetIndex: s.sheetIndex,
              kpiName: s.kpiName,
              metricColumnName: s.metricColumnName,
              rowCount: s.rowCount,
              granularity: s.granularity,
              valid: s.valid,
              headers: s.headers,
              errors: truncateArray(s.errors || [], 5, 'validation errors').items,
            })
          ),
        };
      }

      return jsonResult(payload);
    })
  );
}

module.exports = { register };
