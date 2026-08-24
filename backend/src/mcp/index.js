#!/usr/bin/env node
/**
 * Core Insight MCP server — stdio entry point.
 *
 * Run with:  npm run mcp    (from backend/, with DATABASE_URL set)
 *
 * stdout carries the MCP JSON-RPC stream and must stay clean, so every diagnostic
 * this process emits goes to stderr. That is also why the app's winston logger is
 * never imported here: its console transport writes to stdout and would corrupt
 * the protocol.
 */

const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');

const config = require('../config');
const { createServer, SERVER_NAME, SERVER_VERSION } = require('./server');
const db = require('./db');

/**
 * The local server has no authenticated caller — an MCP client launches it over a
 * pipe with a DATABASE_URL and nothing else — so there is no user id to scope to
 * and the tools behave exactly as they always have: they read the whole database.
 *
 * That is a deliberate, named choice rather than an omission. The scope is built
 * through `createAllAccountsScope`, which refuses to exist without an explicit
 * acknowledgement, and it is only reached after `assertSingleTenant()` below has
 * confirmed there is nothing to separate. The hosted transport (src/mcp-http)
 * never constructs this scope; it always builds a per-user one.
 */
const LOCAL_SCOPE = () => db.createAllAccountsScope(db.ALL_ACCOUNTS_ACKNOWLEDGEMENT);

function log(message) {
  process.stderr.write(`[${SERVER_NAME}-mcp] ${message}\n`);
}

/**
 * Run over stdio there is no signed-in user, so the tools read every account's
 * rows. The scoping that the hosted transport applies has no input here.
 *
 * So this fails closed instead: on a single-account deployment there is nothing to
 * separate and the server starts normally, but the moment a second account exists
 * it refuses to run until the operator makes an explicit choice. A deliberate
 * decision beats a silent cross-account read. Anyone who wants per-account
 * separation should connect to the hosted endpoint instead, where the bearer token
 * identifies the caller and every query is filtered to them.
 */
async function assertSingleTenant(scope) {
  if (process.env.MCP_ALLOW_ALL_USERS === 'true') {
    log('MCP_ALLOW_ALL_USERS=true — serving data across every account');
    return;
  }

  let count;
  try {
    // The anchor is required even here; under the all-accounts scope it expands to
    // a constant, which is exactly the thing this check is measuring the risk of.
    const row = await scope.readOne('SELECT COUNT(*)::int AS n FROM users u WHERE {{SCOPE:u.id}}');
    count = row ? row.n : 0;
  } catch (err) {
    log(`could not verify account count: ${err.message}`);
    process.exit(1);
  }

  if (count > 1) {
    log('');
    log(`Refusing to start: this database holds ${count} accounts.`);
    log('These tools read across all of them, so starting now would expose one');
    log("account's reports to another. Choose one of:");
    log('  1. Connect to the hosted endpoint instead (Settings → AI assistant');
    log('     access). It signs you in and scopes every tool to your account.');
    log('  2. Point DATABASE_URL at a Postgres role restricted to the rows this');
    log('     user may read.');
    log('  3. Set MCP_ALLOW_ALL_USERS=true if every MCP user is entitled to see');
    log('     all reports.');
    log('');
    process.exit(1);
  }
}

async function main() {
  if (!config.databaseUrl) {
    log('DATABASE_URL is not set. Set it in backend/.env or in the MCP client config.');
    process.exit(1);
  }

  const scope = LOCAL_SCOPE();
  await assertSingleTenant(scope);

  const server = createServer(scope);
  const transport = new StdioServerTransport();

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`shutting down (${signal})`);
    try {
      await server.close();
    } catch {
      /* transport may already be gone */
    }
    try {
      await db.close();
    } catch {
      /* pool may already be drained */
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  // The client closes the pipe when it disconnects; exit rather than linger.
  process.stdin.on('close', () => shutdown('stdin closed'));

  await server.connect(transport);
  log(`v${SERVER_VERSION} ready on stdio (read-only, all accounts)`);
}

main().catch((err) => {
  log(`fatal: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
