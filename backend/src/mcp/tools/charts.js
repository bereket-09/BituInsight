/**
 * Chart inventory tools.
 *
 * `generated_charts.image_data` holds up to ~100 KB of raw PNG per row. It is
 * blocked by name in the read-only query guard, so no query in this server — now or
 * after a future edit — can select it. Everything here works from metadata plus
 * `image_bytes`, which is the size of the image the platform rendered.
 */

const { readRows, readOne } = require('../db');
const {
  jsonResult,
  notFoundResult,
  compact,
  summarizeLarge,
  truncateArray,
  safeTool,
} = require('../format');
const { z, uuid, boundedInt, text } = require('../validate');

function register(server) {
  server.registerTool(
    'list_charts',
    {
      title: 'List generated charts',
      description:
        'Chart inventory across reports (or for one report). Returns type, title, ' +
        'stored image size and the source report — never the image bytes themselves.',
      inputSchema: {
        report_id: uuid('report_id').optional().describe('Restrict to a single report'),
        workbook_id: uuid('workbook_id').optional().describe('Restrict to one workbook’s KPIs'),
        chart_type: text(50).optional().describe('Exact chart type, e.g. line, bar, doughnut'),
        title_contains: text(200).optional().describe('Case-insensitive substring of the chart title'),
        limit: boundedInt(1, 200, 50).describe('Rows to return (max 200)'),
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

      if (args.report_id) push('gc.report_id = $?', args.report_id);
      if (args.workbook_id) push('pr.workbook_id = $?', args.workbook_id);
      if (args.chart_type) push('gc.chart_type = $?', args.chart_type);
      if (args.title_contains) push('gc.title ILIKE $?', `%${args.title_contains}%`);

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;

      const totals = await readOne(
        `SELECT COUNT(*)::int AS total, COALESCE(SUM(gc.image_bytes), 0)::bigint AS total_bytes
         FROM generated_charts gc
         JOIN processed_reports pr ON pr.id = gc.report_id
         ${where}`,
        values
      );

      const rows = await readRows(
        `SELECT gc.id, gc.report_id, gc.chart_type, gc.title, gc.file_path,
                gc.image_bytes, gc.created_at,
                gc.config->>'id' AS config_id,
                pr.kpi_name, kw.slug AS workflow_slug
         FROM generated_charts gc
         JOIN processed_reports pr ON pr.id = gc.report_id
         JOIN kpi_workflows kw ON kw.id = pr.workflow_id
         ${where}
         ORDER BY gc.created_at DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset]
      );

      return jsonResult({
        total: totals ? totals.total : 0,
        totalStoredImageBytes: totals ? Number(totals.total_bytes) : 0,
        returned: rows.length,
        offset,
        limit,
        note: 'Image bytes are never transferred over MCP; image_bytes is the stored PNG size.',
        charts: rows.map((r) => compact(r)),
      });
    })
  );

  server.registerTool(
    'get_chart_config',
    {
      title: 'Get a chart’s definition',
      description:
        'The Chart.js definition behind one generated chart: type, options, dataset labels ' +
        'and (optionally) the plotted data. Datasets can hold hundreds of points, so labels ' +
        'and data are truncated unless you raise the limits.',
      inputSchema: {
        chart_id: uuid('chart_id'),
        include_data: z
          .boolean()
          .default(false)
          .describe('Include dataset values and axis labels, not just their shape'),
        max_series_points: boundedInt(1, 2000, 100).describe(
          'Cap on labels / values returned per dataset when include_data is true'
        ),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const row = await readOne(
        `SELECT gc.id, gc.report_id, gc.chart_type, gc.title, gc.image_bytes,
                gc.created_at, gc.config, pr.kpi_name
         FROM generated_charts gc
         JOIN processed_reports pr ON pr.id = gc.report_id
         WHERE gc.id = $1`,
        [args.chart_id]
      );

      if (!row) return notFoundResult('chart', args.chart_id, 'Use list_charts to find chart ids.');

      const config = row.config || {};
      const data = config.data || {};
      const datasets = Array.isArray(data.datasets) ? data.datasets : [];
      const cap = args.max_series_points ?? 100;

      const datasetSummary = datasets.map((ds) => {
        const values = Array.isArray(ds.data) ? ds.data : [];
        const base = {
          label: ds.label,
          type: ds.type,
          pointCount: values.length,
          borderColor: ds.borderColor,
          backgroundColor: typeof ds.backgroundColor === 'string' ? ds.backgroundColor : undefined,
        };
        if (!args.include_data) return compact(base);
        const trimmed = truncateArray(values, cap, `${ds.label || 'dataset'} values`);
        return compact({ ...base, values: trimmed.items, valuesTruncation: trimmed.truncationNote });
      });

      const labels = Array.isArray(data.labels) ? data.labels : [];
      const labelBlock = args.include_data
        ? truncateArray(labels, cap, 'axis labels')
        : { total: labels.length, truncated: labels.length > 0, items: labels.slice(0, 3) };

      return jsonResult({
        found: true,
        chart: compact({
          id: row.id,
          reportId: row.report_id,
          kpiName: row.kpi_name,
          chartType: row.chart_type,
          title: row.title,
          imageBytes: row.image_bytes,
          createdAt: row.created_at,
          configId: config.id,
          chartJsType: config.type,
        }),
        labels: labelBlock,
        datasets: datasetSummary,
        // Options can carry nested plugin/scale objects; keep them bounded.
        options: summarizeLarge(config.options, 6000, 'chart options'),
      });
    })
  );
}

module.exports = { register };
