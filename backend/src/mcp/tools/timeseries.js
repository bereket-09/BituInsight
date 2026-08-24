/**
 * Time-series access.
 *
 * A single 15-minute report holds 288 native points (and hourly/daily/weekly
 * rollups on top), each with several numeric fields. Returning a whole series
 * unprompted would dominate a model's context, so points are always paged and the
 * slice is taken inside Postgres with `jsonb_array_elements ... WITH ORDINALITY`
 * rather than by loading the document into Node and cutting it there.
 */

const { jsonResult, notFoundResult, compact, safeTool } = require('../format');
const { z, uuid, boundedInt, text } = require('../validate');

const MAX_POINTS_PER_CALL = 500;

function register(server, scope) {
  server.registerTool(
    'get_report_timeseries',
    {
      title: 'Get a report’s time-series points',
      description:
        'Paginated time-series points for one report. Series are stored per span ' +
        '(native / hourly / daily / weekly / monthly depending on the source cadence); ' +
        'call without "span" to get the auto-detected one plus the list of available spans ' +
        'and their sizes. Never returns more than 500 points per call and always reports ' +
        'how many were omitted.',
      inputSchema: {
        report_id: uuid('report_id'),
        span: text(30)
          .optional()
          .describe('Series key, e.g. native, hourly, daily, weekly, monthly. Defaults to the auto-detected span.'),
        offset: boundedInt(0, 1000000, 0).describe('0-based index of the first point to return'),
        limit: boundedInt(1, MAX_POINTS_PER_CALL, 200).describe('Points per call (max 500)'),
        fields: z
          .array(text(60))
          .max(20)
          .optional()
          .describe('Only keep these keys on each point (e.g. ["timestamp","total"]) to save tokens'),
        include_meta: z.boolean().default(true).describe('Include min/peak/detected/spans metadata'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      // Step 1: series metadata and the size of every available span. Cheap, and it
      // tells the caller what to page through without transferring any points.
      const meta = await scope.readOne(
        `SELECT
           pr.kpi_name,
           pr.status,
           kw.slug AS workflow_slug,
           ts.doc->'detected' AS detected,
           ts.doc->'availableSpans' AS available_spans,
           ts.doc->'min' AS min_point,
           ts.doc->'peak' AS peak_point,
           (
             SELECT jsonb_object_agg(k, jsonb_array_length(v))
             FROM jsonb_each(COALESCE(ts.doc->'series', '{}'::jsonb)) AS e(k, v)
             WHERE jsonb_typeof(v) = 'array'
           ) AS span_sizes
         FROM processed_reports pr
         JOIN kpi_workflows kw ON kw.id = pr.workflow_id
         CROSS JOIN LATERAL (
           SELECT COALESCE(pr.report_data->'tables'->'timeSeries', '{}'::jsonb) AS doc
         ) ts
         WHERE pr.id = $1 AND {{SCOPE:pr.user_id}}`,
        [args.report_id]
      );

      if (!meta) return notFoundResult('report', args.report_id);

      const spanSizes = meta.span_sizes || {};
      const spanKeys = Object.keys(spanSizes);

      if (spanKeys.length === 0) {
        return jsonResult({
          found: true,
          reportId: args.report_id,
          kpiName: meta.kpi_name,
          status: meta.status,
          message:
            meta.status === 'completed'
              ? 'This report has no stored time series.'
              : `Report status is "${meta.status}", so no time series was produced.`,
          availableSpans: [],
        });
      }

      // Prefer the caller's span, then the auto-detected one, then the largest series.
      const auto =
        (meta.available_spans && meta.available_spans.auto) ||
        (meta.detected && meta.detected.bucket) ||
        null;
      let span = args.span || auto;
      if (!span || !spanKeys.includes(span)) {
        if (args.span) {
          return jsonResult({
            found: true,
            reportId: args.report_id,
            error: 'unknown_span',
            message: `Span "${args.span}" is not stored for this report.`,
            availableSpans: spanSizes,
          });
        }
        span = spanKeys.reduce((a, b) => (spanSizes[a] >= spanSizes[b] ? a : b));
      }

      const total = spanSizes[span] || 0;
      const offset = args.offset ?? 0;
      const limit = args.limit ?? 200;

      // Step 2: slice the requested window server-side. WITH ORDINALITY preserves the
      // stored order, which is chronological.
      const rows = await scope.readRows(
        `SELECT COALESCE(jsonb_agg(elem ORDER BY ord), '[]'::jsonb) AS points
         FROM processed_reports pr
         CROSS JOIN LATERAL jsonb_array_elements(
           COALESCE(pr.report_data->'tables'->'timeSeries'->'series'->$2, '[]'::jsonb)
         ) WITH ORDINALITY AS s(elem, ord)
         WHERE pr.id = $1 AND {{SCOPE:pr.user_id}} AND s.ord > $3 AND s.ord <= $3 + $4`,
        [args.report_id, span, offset, limit]
      );

      let points = (rows[0] && rows[0].points) || [];

      // Field projection happens after the bounded fetch: the page is at most 500
      // points, so trimming keys in Node is cheap and keeps the SQL simple.
      if (args.fields && args.fields.length) {
        const keys = new Set(args.fields);
        points = points.map((p) => {
          const out = {};
          for (const k of Object.keys(p || {})) if (keys.has(k)) out[k] = p[k];
          return out;
        });
      }

      const returnedEnd = offset + points.length;
      const payload = {
        found: true,
        reportId: args.report_id,
        kpiName: meta.kpi_name,
        workflowSlug: meta.workflow_slug,
        span,
        totalPoints: total,
        offset,
        returned: points.length,
        hasMore: returnedEnd < total,
        nextOffset: returnedEnd < total ? returnedEnd : null,
        availableSpans: spanSizes,
        points,
      };

      if (returnedEnd < total || offset > 0) {
        payload.truncationNote =
          `Returned points ${offset + 1}–${returnedEnd} of ${total} for span "${span}". ` +
          `Call again with offset=${returnedEnd} for the next page.`;
      }

      if (args.include_meta !== false) {
        payload.meta = compact({
          detected: meta.detected,
          availableSpanOptions: meta.available_spans,
          min: meta.min_point,
          peak: meta.peak_point,
        });
      }

      return jsonResult(payload);
    })
  );
}

module.exports = { register };
