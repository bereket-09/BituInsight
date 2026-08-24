/**
 * Read-only, account-scoped database access for the MCP server.
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
 * A fifth layer decides *whose* rows a statement may see. Tools never call the raw
 * reader; they are handed a scope object (see `createUserScope` /
 * `createAllUsersScope`) and every statement they pass through it must carry at
 * least one `{{SCOPE:alias.column}}` anchor, which the scope substitutes for a
 * bound predicate. A statement without an anchor is refused before it reaches the
 * database, so a tool cannot leak another account's rows by forgetting a filter —
 * it fails loudly instead. The escape hatch for genuinely account-neutral reads
 * (the workflow catalogue, information_schema) is a separate reader that refuses
 * to touch any table holding per-account rows.
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

async function close() {
  await pool.end();
}

/* ------------------------------------------------------------------ *
 * Account scoping
 * ------------------------------------------------------------------ */

/**
 * Every table whose rows belong to one account. A statement touching any of these
 * must be run through a scope, never through the catalogue reader.
 *
 * `users` is included because a row here *is* an account: an authenticated caller
 * may see their own row and nothing else.
 */
const USER_OWNED_TABLES = [
  'users',
  'uploaded_files',
  'processed_reports',
  'workbook_uploads',
  'generated_metrics',
  'generated_charts',
  'teams_delivery_logs',
];

/**
 * The anchor a scoped statement must carry, e.g. `{{SCOPE:pr.user_id}}`.
 *
 * The column half is a closed set — `user_id` (every owned table) or `id` (the
 * `users` row itself) — so an anchor can only ever expand into an ownership test.
 * A tool cannot accidentally anchor on `pr.status` and end up unfiltered.
 */
const SCOPE_ANCHOR_RE = /\{\{SCOPE:([A-Za-z_][A-Za-z0-9_]*)\.(user_id|id)\}\}/g;

/**
 * Substitute the anchors and return the statement Postgres will actually run.
 *
 * In `user` mode the caller's id is appended once to the parameter list and every
 * anchor expands to `alias.column = $n`, so the filter is a bound parameter like
 * every other value in this server. Appending keeps the existing $1..$n indices
 * a tool computed for itself intact.
 */
function bindScope(sql, params, mode, userId) {
  const source = String(sql);

  SCOPE_ANCHOR_RE.lastIndex = 0;
  if (!SCOPE_ANCHOR_RE.test(source)) {
    throw new Error(
      'scope guard: statement carries no {{SCOPE:alias.user_id}} anchor. ' +
        'Every scoped read must state which column ties its rows to an account; ' +
        'use the catalogue reader for statements that touch no account-owned table.'
    );
  }
  SCOPE_ANCHOR_RE.lastIndex = 0;

  let text;
  let values;

  if (mode === 'user') {
    values = [...params, userId];
    const index = values.length;
    text = source.replace(SCOPE_ANCHOR_RE, (_match, alias, column) => `${alias}.${column} = $${index}`);
  } else {
    // The local stdio server has no authenticated caller. The anchor still has to
    // be present — it is refused above otherwise — but it expands to a constant,
    // and index.js will not start this mode at all once the database holds more
    // than one account. The comment survives into pg_stat_activity, so an
    // unscoped statement is identifiable in the database's own view.
    values = [...params];
    text = source.replace(SCOPE_ANCHOR_RE, () => 'TRUE /* mcp: unscoped, local stdio server */');
  }

  // A malformed anchor (say `{{SCOPE:pr.status}}`) does not match the pattern and
  // would otherwise survive into the statement as a syntax error at the database.
  if (text.includes('{{')) {
    throw new Error(
      'scope guard: statement still contains an unexpanded {{...}} placeholder; ' +
        'an anchor must read {{SCOPE:alias.user_id}} or {{SCOPE:alias.id}}'
    );
  }

  return { text, values };
}

/**
 * Refuse a "this is not account data" read that in fact touches account data.
 * The counterpart to the anchor requirement: between them, every statement in this
 * server is either scoped or provably account-neutral.
 */
function assertAccountNeutral(sql) {
  const bare = stripLiteralsAndComments(sql);
  const owned = USER_OWNED_TABLES.find((table) => new RegExp(`\\b${table}\\b`, 'i').test(bare));
  if (owned) {
    throw new Error(
      `scope guard: "${owned}" holds per-account rows, so it cannot be read through the ` +
        'catalogue reader. Use the scoped reader with a {{SCOPE:...}} anchor.'
    );
  }
  return true;
}

function makeScope(mode, userId) {
  async function readQueryScoped(sql, params = []) {
    const { text, values } = bindScope(sql, params, mode, userId);
    return readQuery(text, values);
  }

  async function readRows(sql, params = []) {
    const result = await readQueryScoped(sql, params);
    return result.rows;
  }

  async function readOne(sql, params = []) {
    const rows = await readRows(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async function catalogRows(sql, params = []) {
    assertAccountNeutral(sql);
    const result = await readQuery(sql, params);
    return result.rows;
  }

  async function catalogOne(sql, params = []) {
    const rows = await catalogRows(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  return {
    mode,
    userId: mode === 'user' ? userId : null,
    /** Scoped reads. The statement must carry a {{SCOPE:...}} anchor. */
    readRows,
    readOne,
    /** Account-neutral reads. The statement must touch no account-owned table. */
    catalogRows,
    catalogOne,
    describe() {
      return mode === 'user'
        ? { mode: 'user', userId, note: 'Every query is filtered to this account.' }
        : {
            mode: 'all-accounts',
            userId: null,
            note:
              'Local stdio server: there is no authenticated caller, so queries are not ' +
              'filtered by account. The stdio entry point refuses to start when the ' +
              'database holds more than one account.',
          };
    },
  };
}

/**
 * The scope used by the hosted HTTP transport: one authenticated platform user,
 * every statement filtered to their rows.
 */
function createUserScope(userId) {
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new Error('createUserScope: a platform user id is required');
  }
  return makeScope('user', userId);
}

/**
 * The scope used by the local stdio server, which has no authenticated caller.
 *
 * This is deliberately awkward to reach: it takes an acknowledgement string so it
 * cannot be produced by a typo or a missing argument, and it is named for what it
 * does rather than for the transport that uses it. `src/mcp/index.js` gates it
 * behind the existing fail-closed multi-account check.
 */
const ALL_ACCOUNTS_ACKNOWLEDGEMENT = 'stdio-local-no-authenticated-user';

function createAllAccountsScope(acknowledgement) {
  if (acknowledgement !== ALL_ACCOUNTS_ACKNOWLEDGEMENT) {
    throw new Error(
      'createAllAccountsScope: refused. This scope does not filter by account and must be ' +
        `requested explicitly with the acknowledgement "${ALL_ACCOUNTS_ACKNOWLEDGEMENT}".`
    );
  }
  return makeScope('all-accounts', null);
}

module.exports = {
  assertReadOnly,
  assertAccountNeutral,
  bindScope,
  createUserScope,
  createAllAccountsScope,
  ALL_ACCOUNTS_ACKNOWLEDGEMENT,
  close,
  BLOCKED_COLUMNS,
  USER_OWNED_TABLES,
  STATEMENT_TIMEOUT_MS,
};
