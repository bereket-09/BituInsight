/**
 * Read-only database access for the MCP server.
 *
 * The MCP surface is deliberately, structurally read-only. Four independent layers
 * enforce that, so no single mistake can turn a query into a write:
 *
 *   1. No tool accepts SQL. Every statement in this server is authored in-repo and
 *      all caller input arrives as bound parameters ($1, $2, ...). A model talking
 *      to this server cannot author a statement at all.
 *   2. `assertReadOnly()` below rejects any statement that is not a single SELECT
 *      or WITH..SELECT, and rejects every write/DDL/session-mutating keyword.
 *   3. Postgres itself refuses the write: every statement runs inside
 *      `BEGIN TRANSACTION READ ONLY`, so an INSERT/UPDATE/DELETE/DDL that somehow
 *      got past layer 2 fails with SQLSTATE 25006.
 *   4. Sensitive/huge columns are blocked by name (`image_data`, `password_hash`),
 *      so they cannot be selected even by a future edit to this file's callers.
 *
 * A dedicated pool is used rather than `src/db/pool.js` so the MCP process cannot
 * affect the API server's connection budget or behaviour in any way.
 */

const { Pool } = require('pg');
const config = require('../config');

// Mirrors src/db/pool.js: managed Postgres (Neon, Supabase, RDS) terminates TLS
// with a chain this process does not carry, so verification is relaxed for those
// hosts only. A plain local/Docker Postgres connects unencrypted as before.
const needsSsl =
  /sslmode=require|neon\.tech|supabase\.co|amazonaws\.com/.test(config.databaseUrl || '');

/** Hard ceiling on any single query, so a pathological request cannot hang a client. */
const STATEMENT_TIMEOUT_MS = parseInt(process.env.MCP_STATEMENT_TIMEOUT_MS, 10) || 20000;

// An MCP server is a single desktop client, not a web tier. A small pool is plenty
// and keeps the database's connection budget available to the real application.
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: parseInt(process.env.MCP_POOL_MAX, 10) || 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  // Shows up in pg_stat_activity so a DBA can tell MCP traffic from API traffic.
  application_name: 'core-insight-mcp-readonly',
});

pool.on('error', (err) => {
  // stderr only: stdout carries the MCP JSON-RPC stream and must never be polluted.
  process.stderr.write(`[mcp] pool error: ${err.message}\n`);
});

/**
 * Keywords that can mutate data, schema, session state, or the server itself.
 * Matched on word boundaries against SQL with comments and string literals removed,
 * so `created_at`, `updated_at`, `OFFSET` and `->>'start'` are not false positives.
 */
const FORBIDDEN_KEYWORDS = [
  'insert', 'update', 'delete', 'merge', 'upsert', 'truncate', 'drop', 'alter',
  'create', 'grant', 'revoke', 'copy', 'vacuum', 'reindex', 'cluster', 'comment',
  'lock', 'listen', 'unlisten', 'notify', 'prepare', 'execute', 'deallocate',
  'discard', 'refresh', 'reassign', 'import', 'call', 'do', 'set', 'reset',
  'begin', 'start', 'commit', 'rollback', 'savepoint', 'release', 'checkpoint',
  'load', 'declare', 'fetch', 'move', 'close', 'security',
];

const FORBIDDEN_RE = new RegExp(`\\b(${FORBIDDEN_KEYWORDS.join('|')})\\b`, 'i');

// Volatile/administrative functions that read or touch the host rather than the data.
const FORBIDDEN_FUNCTION_RE =
  /\b(pg_sleep|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|lo_import|lo_export|dblink|dblink_exec|nextval|setval|currval)\s*\(/i;

/**
 * Columns that must never leave the database through this server.
 *
 * `generated_charts.image_data` is up to ~100 KB of PNG bytes per row and would
 * flood a model's context (and the JSON-RPC pipe) for no benefit — `image_bytes`
 * carries the size, which is all an analytical query needs.
 * `users.password_hash` is a credential and has no analytical use at all.
 */
const BLOCKED_COLUMNS = ['image_data', 'password_hash'];

/**
 * Strip comments and string literals so keyword scanning cannot be fooled by, or
 * trip over, text inside quotes (e.g. the JSON key in `summary->>'start'`).
 */
function stripLiteralsAndComments(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // /* block comments */
    .replace(/--[^\n]*/g, ' ') // -- line comments
    .replace(/'(?:[^']|'')*'/g, "''") // 'string literals'
    .replace(/\$\$[\s\S]*?\$\$/g, "''"); // $$ dollar-quoted bodies $$
}

/**
 * Reject anything that is not a single, self-contained read.
 * Throws with an explicit reason; callers surface it as a tool error.
 */
function assertReadOnly(sql) {
  if (typeof sql !== 'string' || !sql.trim()) {
    throw new Error('read-only guard: empty statement');
  }

  const bare = stripLiteralsAndComments(sql).trim().replace(/;\s*$/, '');

  if (bare.includes(';')) {
    throw new Error('read-only guard: multiple statements are not allowed');
  }
  if (!/^\s*(select|with)\b/i.test(bare)) {
    throw new Error('read-only guard: only SELECT / WITH..SELECT statements are allowed');
  }

  const keyword = bare.match(FORBIDDEN_RE);
  if (keyword) {
    throw new Error(`read-only guard: forbidden keyword "${keyword[1].toUpperCase()}"`);
  }

  const fn = bare.match(FORBIDDEN_FUNCTION_RE);
  if (fn) {
    throw new Error(`read-only guard: forbidden function "${fn[1]}"`);
  }

  const blocked = BLOCKED_COLUMNS.find((col) => new RegExp(`\\b${col}\\b`, 'i').test(bare));
  if (blocked) {
    throw new Error(`read-only guard: column "${blocked}" is never readable through MCP`);
  }

  return true;
}

/**
 * Run one guarded read inside an explicit read-only transaction.
 *
 * The BEGIN/SET LOCAL/COMMIT statements are constants authored here and are
 * intentionally not passed through `assertReadOnly` — that guard exists for the
 * data statement, while these three are what make the database enforce read-only
 * for it. Neon's pooler rejects session-level startup options, so the read-only
 * mode is set per transaction, which works under transaction pooling.
 */
async function readQuery(sql, params = []) {
  assertReadOnly(sql);

  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const result = await client.query(sql, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // The connection may already be unusable; a failed rollback must not mask the
    // original error.
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function readRows(sql, params = []) {
  const result = await readQuery(sql, params);
  return result.rows;
}

async function readOne(sql, params = []) {
  const rows = await readRows(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function close() {
  await pool.end();
}

module.exports = {
  readQuery,
  readRows,
  readOne,
  assertReadOnly,
  close,
  BLOCKED_COLUMNS,
  STATEMENT_TIMEOUT_MS,
};
