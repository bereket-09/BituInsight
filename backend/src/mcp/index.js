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

function log(message) {
  process.stderr.write(`[${SERVER_NAME}-mcp] ${message}\n`);
}

/**
 * The tools here read the whole database; they do not reproduce the application's
 * per-user scoping, and retrofitting a filter into every query is the kind of
 * change where missing one query leaks silently.
 *
 * So this fails closed instead: on a single-account deployment there is nothing to
 * separate and the server starts normally, but the moment a second account exists
 * it refuses to run until the operator makes an explicit choice. A deliberate
 * decision beats a silent cross-account read.
 */
async function assertSingleTenant() {
  if (process.env.MCP_ALLOW_ALL_USERS === 'true') {
    log('MCP_ALLOW_ALL_USERS=true — serving data across every account');
    return;
  }

  let count;
  try {
    const row = await db.readOne('SELECT COUNT(*)::int AS n FROM users');
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
    log('  1. Point DATABASE_URL at a Postgres role restricted to the rows this');
    log('     user may read (recommended).');
    log('  2. Set MCP_ALLOW_ALL_USERS=true if every MCP user is entitled to see');
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

  await assertSingleTenant();

  const server = createServer();
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
  log(`v${SERVER_VERSION} ready on stdio (read-only)`);
}

main().catch((err) => {
  log(`fatal: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
