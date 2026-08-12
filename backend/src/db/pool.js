const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

// Managed Postgres (Neon, Supabase, RDS) terminates TLS with a certificate chain
// the container doesn't carry, so verification is relaxed for those hosts only.
// A plain local/Docker Postgres connects unencrypted as before.
const needsSsl =
  /sslmode=require|neon\.tech|supabase\.co|amazonaws\.com/.test(config.databaseUrl || '');

// Serverless invocations are short-lived and each one holds its own pool, so a
// large per-instance pool would exhaust the database's connection limit.
const maxConnections = process.env.VERCEL ? 3 : 20;

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: maxConnections,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

module.exports = pool;
