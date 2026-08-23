/**
 * KPI workflow tools.
 *
 * A workflow is defined in code (src/kpi-workflows/<slug>) and mirrored as a row in
 * `kpi_workflows`. The code side owns the required columns and chart definitions;
 * the database side owns the id other tables join to. These tools merge both.
 *
 * The registry is safe to require here: those modules are pure (validators,
 * transformers, calculators, chart definitions) and pull in no logger, no canvas
 * and no database, so importing them cannot write to stdout — which carries the
 * MCP JSON-RPC stream.
 */

const registry = require('../../kpi-workflows/registry');
const { readRows, readOne } = require('../db');
const { jsonResult, notFoundResult, compact, safeTool } = require('../format');
const { z, WORKFLOW_SLUGS } = require('../validate');

/** Chart definitions carry render callbacks; expose only the declarative parts. */
function describeChartDefinition(def) {
  if (!def || typeof def !== 'object') return def;
  return compact({
    id: def.id,
    type: def.type,
    title: def.title,
    description: def.description,
    axis: def.axis,
    stacked: def.stacked,
    optional: def.optional,
    keys: Object.keys(def).filter((k) => typeof def[k] !== 'function'),
  });
}

function register(server) {
  server.registerTool(
    'list_workflows',
    {
      title: 'List KPI workflows',
      description:
        'The KPI workflows this platform can run, merging the code definition (required ' +
        'columns, chart definitions, metadata) with the database row and report counts.',
      inputSchema: {
        include_charts: z.boolean().default(true).describe('Include each workflow’s chart definitions'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      const dbRows = await readRows(
        `SELECT kw.id, kw.slug, kw.name, kw.description, kw.version, kw.metadata,
                kw.is_active, kw.created_at,
                COUNT(pr.id)::int AS report_count,
                COUNT(pr.id) FILTER (WHERE pr.status = 'completed')::int AS completed_count,
                MAX(pr.created_at) AS last_report_at
         FROM kpi_workflows kw
         LEFT JOIN processed_reports pr ON pr.workflow_id = kw.id
         GROUP BY kw.id
         ORDER BY kw.slug`
      );

      const bySlug = new Map(dbRows.map((r) => [r.slug, r]));
      const code = registry.getAllWorkflows();

      const workflows = code.map((wf) => {
        const row = bySlug.get(wf.slug) || {};
        return compact({
          slug: wf.slug,
          name: wf.name,
          description: wf.description,
          version: wf.version,
          metadata: wf.metadata,
          source: wf.source,
          workflowId: row.id,
          isActive: row.is_active,
          reportCount: row.report_count,
          completedCount: row.completed_count,
          lastReportAt: row.last_report_at,
          requiredColumns: wf.requiredColumns,
          chartDefinitions:
            args.include_charts === false
              ? undefined
              : (wf.chartDefinitions || []).map(describeChartDefinition),
        });
      });

      // A workflow row can exist in the database with no matching code module (or the
      // reverse) after a rename; surfacing that is more useful than hiding it.
      const orphanRows = dbRows
        .filter((r) => !code.some((wf) => wf.slug === r.slug))
        .map((r) => ({ slug: r.slug, name: r.name, reportCount: r.report_count }));

      return jsonResult({
        count: workflows.length,
        workflows,
        ...(orphanRows.length ? { databaseOnlyWorkflows: orphanRows } : {}),
      });
    })
  );

  server.registerTool(
    'get_workflow',
    {
      title: 'Get one KPI workflow',
      description:
        'Full definition of a single workflow: required input columns, chart definitions, ' +
        'metadata, database row and report statistics.',
      inputSchema: {
        slug: z.enum(WORKFLOW_SLUGS).describe('Workflow slug'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async (args) => {
      let definition;
      try {
        definition = registry.getWorkflow(args.slug);
      } catch {
        return notFoundResult('workflow', args.slug, `Known slugs: ${WORKFLOW_SLUGS.join(', ')}`);
      }

      const row = await readOne(
        `SELECT kw.id, kw.slug, kw.name, kw.description, kw.version, kw.metadata,
                kw.is_active, kw.created_at, kw.updated_at,
                COUNT(pr.id)::int AS report_count,
                COUNT(pr.id) FILTER (WHERE pr.status = 'completed')::int AS completed_count,
                COUNT(pr.id) FILTER (WHERE pr.status = 'failed')::int AS failed_count,
                MIN(pr.created_at) AS first_report_at,
                MAX(pr.created_at) AS last_report_at
         FROM kpi_workflows kw
         LEFT JOIN processed_reports pr ON pr.workflow_id = kw.id
         WHERE kw.slug = $1
         GROUP BY kw.id`,
        [args.slug]
      );

      const recent = row
        ? await readRows(
            `SELECT id, kpi_name, status, created_at
             FROM processed_reports WHERE workflow_id = $1
             ORDER BY created_at DESC LIMIT 5`,
            [row.id]
          )
        : [];

      return jsonResult({
        found: true,
        slug: definition.slug,
        name: definition.name,
        description: definition.description,
        version: definition.version,
        metadata: definition.metadata,
        requiredColumns: definition.requiredColumns,
        chartDefinitions: (definition.chartDefinitions || []).map(describeChartDefinition),
        database: row ? compact(row) : { registered: false },
        recentReports: recent,
      });
    })
  );
}

module.exports = { register };
