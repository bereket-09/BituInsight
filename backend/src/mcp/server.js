/**
 * Core Insight MCP server — assembly.
 *
 * Read-only by construction. See db.js for the enforcement layers; the short
 * version is: no tool accepts SQL, every statement is authored in this directory,
 * a guard rejects anything that is not a single SELECT, and Postgres runs each one
 * inside `BEGIN TRANSACTION READ ONLY`. Nothing in this directory writes to the
 * database, the filesystem, or the platform's processing pipeline.
 *
 * The assembly is transport-agnostic and takes the scope that decides whose rows
 * the tools may read, so the hosted HTTP endpoint (src/mcp-http) and the local
 * stdio entry point (./index.js) share one set of tool implementations rather than
 * each carrying its own copy. The HTTP endpoint builds a fresh server per request
 * with a scope bound to the authenticated user; stdio builds one at startup with
 * the all-accounts scope it has always effectively had.
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');

const { jsonResult, safeTool } = require('./format');
const { BLOCKED_COLUMNS, STATEMENT_TIMEOUT_MS } = require('./db');

const reports = require('./tools/reports');
const intelligence = require('./tools/intelligence');
const timeseries = require('./tools/timeseries');
const charts = require('./tools/charts');
const workbooks = require('./tools/workbooks');
const workflows = require('./tools/workflows');
const analysis = require('./tools/analysis');
const platform = require('./tools/platform');

const SERVER_NAME = 'core-insight';
const SERVER_VERSION = '1.0.0';

const INSTRUCTIONS = `Read-only access to the Core Insight telecom KPI analytics platform.

Start with describe_schema (it maps the JSONB documents where findings, time series
and chart configs live), then list_workflows / list_reports / list_kpis to find
something, then get_report, get_report_intelligence and get_report_timeseries for
detail. Use search_findings, get_kpi_history, compare_reports and
get_workflow_rollup for cross-report questions.

This server can only read. It cannot upload files, start report processing, edit
reports, or change anything about the platform. Chart image bytes and password
hashes are never returned.

Over an authenticated connection every tool is scoped to the signed-in account, so
"all reports" means that account's reports. get_server_info reports which scope the
session is running under.`;

/**
 * `scope` is only ever dereferenced inside a tool handler, never during
 * registration, so the introspection endpoint in src/controllers/mcp.controller.js
 * can keep collecting the catalogue by calling this with a stand-in and no scope.
 */
function registerAll(server, scope) {
  workflows.register(server, scope);
  reports.register(server, scope);
  intelligence.register(server, scope);
  timeseries.register(server, scope);
  charts.register(server, scope);
  workbooks.register(server, scope);
  analysis.register(server, scope);
  platform.register(server, scope);

  server.registerTool(
    'get_server_info',
    {
      title: 'Server info and access policy',
      description:
        'What this server is, what it can and cannot do, and the limits applied to every ' +
        'query. Useful when you need to explain to a user why a write is not possible.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    safeTool(async () =>
      jsonResult({
        server: SERVER_NAME,
        version: SERVER_VERSION,
        product: 'Core Insight — telecom KPI analytics platform',
        access: 'read-only',
        scope: scope ? scope.describe() : undefined,
        guarantees: [
          'No tool accepts SQL; every statement is authored in the server source and all caller input is bound as a parameter.',
          'A query guard rejects anything that is not a single SELECT / WITH..SELECT, and rejects all write, DDL and session-mutating keywords.',
          'Every statement runs inside BEGIN TRANSACTION READ ONLY, so PostgreSQL refuses a write even if the guard were bypassed (SQLSTATE 25006).',
          'No tool writes files, uploads data, or triggers report processing.',
          'Over an authenticated connection every statement carries a bound ownership ' +
            'predicate, and the query helper refuses any statement that does not declare one.',
        ],
        blockedColumns: BLOCKED_COLUMNS.map((column) => ({
          column,
          reason:
            column === 'image_data'
              ? 'Up to ~100 KB of PNG per row; image_bytes carries the size instead.'
              : 'Credential material with no analytical use.',
        })),
        limits: {
          statementTimeoutMs: STATEMENT_TIMEOUT_MS,
          maxReportsPerPage: 100,
          maxTimeSeriesPointsPerCall: 500,
          maxFindingsPerCall: 200,
          maxReportsPerComparison: 10,
        },
      })
    )
  );

  return server;
}

function createServer(scope) {
  if (!scope || typeof scope.readRows !== 'function') {
    throw new Error(
      'createServer: a scope from src/mcp/db.js is required — it decides whose rows the tools read'
    );
  }
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS, capabilities: { tools: {} } }
  );
  return registerAll(server, scope);
}

module.exports = { createServer, registerAll, SERVER_NAME, SERVER_VERSION, INSTRUCTIONS };
