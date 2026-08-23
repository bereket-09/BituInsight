/**
 * Introspection for the in-product "AI assistant access" settings section.
 *
 * The tool list is deliberately not restated here. Each module under `src/mcp` is
 * handed a collector that records what it registers, so the page shows exactly what
 * the MCP server registers and cannot drift out of date. A collector only captures
 * the name and metadata — no handler is ever invoked, so this endpoint issues no
 * MCP query and touches nothing under `src/mcp`.
 *
 * The only live check is how many accounts exist, because that decides whether the
 * MCP server's fail-closed multi-account guard (src/mcp/index.js) will let it start.
 */

const pool = require('../db/pool');
const logger = require('../utils/logger');

/**
 * Mirrors the grouping in `src/mcp/README.md`, keyed by the module that owns each
 * tool rather than by a copied list of names.
 */
function groupDefinitions() {
  return [
    {
      id: 'discovery',
      label: 'Discovery',
      blurb: 'Find your way around: schema, workflows, accounts, platform totals.',
      modules: [require('../mcp/tools/workflows'), require('../mcp/tools/platform')],
      // Registered by the server assembly itself rather than a tool module.
      extraNames: ['get_server_info'],
    },
    {
      id: 'reports',
      label: 'Reports',
      blurb: 'Search reports, then read one in full with its metrics and series.',
      modules: [require('../mcp/tools/reports'), require('../mcp/tools/timeseries')],
    },
    {
      id: 'analytics',
      label: 'Analytics',
      blurb: 'The analysis pass: findings, anomalies, trend, capacity, data quality.',
      modules: [require('../mcp/tools/intelligence')],
    },
    {
      id: 'cross-report',
      label: 'Cross-report analysis',
      blurb: 'Track a KPI over time, compare reports, roll up by period or workflow.',
      modules: [require('../mcp/tools/analysis')],
    },
    {
      id: 'workbooks',
      label: 'Workbooks',
      blurb: 'Multi-sheet workbook uploads and their per-KPI child reports.',
      modules: [require('../mcp/tools/workbooks')],
    },
    {
      id: 'charts',
      label: 'Charts',
      blurb: 'Chart inventory and Chart.js definitions — never the image bytes.',
      modules: [require('../mcp/tools/charts')],
    },
  ];
}

/**
 * Run a `register(server)` function against a stand-in that records registrations
 * instead of serving them.
 */
function collect(register) {
  const tools = [];
  const collector = {
    registerTool(name, cfg = {}) {
      tools.push({
        name,
        title: cfg.title || name,
        description: cfg.description || '',
        readOnly: Boolean(cfg.annotations && cfg.annotations.readOnlyHint),
      });
      return { name };
    },
  };
  register(collector);
  return tools;
}

function buildCatalog() {
  const { registerAll, SERVER_NAME, SERVER_VERSION } = require('../mcp/server');
  const { BLOCKED_COLUMNS, STATEMENT_TIMEOUT_MS } = require('../mcp/db');

  // The authoritative set: whatever the real server assembly registers.
  const all = collect(registerAll);
  const byName = new Map(all.map((tool) => [tool.name, tool]));
  const claimed = new Set();

  const groups = groupDefinitions().map((group) => {
    const names = [
      ...group.modules.flatMap((mod) => collect(mod.register).map((tool) => tool.name)),
      ...(group.extraNames || []),
    ];
    const tools = names
      .filter((name) => byName.has(name))
      .map((name) => {
        claimed.add(name);
        return byName.get(name);
      });
    return { id: group.id, label: group.label, blurb: group.blurb, tools };
  });

  // Anything registered but not attributed above still gets shown, so a tool added
  // later appears here rather than silently vanishing from the page.
  const unattributed = all.filter((tool) => !claimed.has(tool.name));
  if (unattributed.length > 0) {
    groups.push({
      id: 'other',
      label: 'Other tools',
      blurb: 'Registered by the server but not yet grouped.',
      tools: unattributed,
    });
  }

  return {
    server: { name: SERVER_NAME, version: SERVER_VERSION },
    toolCount: all.length,
    allReadOnly: all.every((tool) => tool.readOnly),
    groups: groups.filter((group) => group.tools.length > 0),
    limits: { statementTimeoutMs: STATEMENT_TIMEOUT_MS },
    blockedColumns: BLOCKED_COLUMNS,
  };
}

/**
 * GET /api/mcp/connection
 *
 * What the platform can actually determine about its own MCP server. It reports no
 * live client connection, because nothing here can observe one — an MCP client runs
 * the server itself over stdio on the user's machine.
 */
async function getConnectionInfo(req, res, next) {
  let catalog;
  try {
    catalog = buildCatalog();
  } catch (err) {
    logger.error('Could not introspect the MCP server', { error: err.message });
    return next(Object.assign(err, { status: 500 }));
  }

  const allowAllUsers = process.env.MCP_ALLOW_ALL_USERS === 'true';
  let accountCount = null;
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS n FROM users');
    accountCount = result.rows[0] ? result.rows[0].n : null;
  } catch (err) {
    // The guard explanation still stands without the count; do not fail the page.
    logger.warn('Could not read the account count for MCP connection info', {
      error: err.message,
    });
  }

  res.json({
    ...catalog,
    access: {
      accountCount,
      allowAllUsers,
      // null = unknown, so the page can say so instead of guessing.
      startsWithoutOverride:
        accountCount === null ? null : allowAllUsers || accountCount <= 1,
    },
  });
}

module.exports = { getConnectionInfo };
