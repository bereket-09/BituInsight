/**
 * One-shot database setup for a fresh Postgres (managed or local).
 *
 * In Docker, database/init.sql is applied automatically by the Postgres image's
 * entrypoint. A managed database (Neon, Supabase, RDS) has no such hook, so this
 * script applies the base schema, then migrations, then the seed.
 *
 * Safe to re-run: the base schema is only applied when the public schema is empty.
 *
 *   DATABASE_URL=postgres://... npm run db:setup
 */
const fs = require('fs');
const path = require('path');
const pool = require('./pool');
const logger = require('../utils/logger');
const { applyMigrations } = require('./migrate');

const INIT_SQL = path.join(__dirname, '../../../database/init.sql');

async function schemaIsEmpty() {
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM pg_tables WHERE schemaname = 'public'"
  );
  return rows[0].count === 0;
}

async function bootstrap() {
  const empty = await schemaIsEmpty();

  if (empty) {
    if (!fs.existsSync(INIT_SQL)) {
      throw new Error(`Base schema not found at ${INIT_SQL}`);
    }
    logger.info('Empty database detected — applying base schema');
    await pool.query(fs.readFileSync(INIT_SQL, 'utf8'));
    logger.info('Base schema applied');
  } else {
    logger.info('Existing schema detected — skipping base schema');
  }

  await applyMigrations();
  logger.info('Migrations applied');

  const { rows } = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
  );
  logger.info('Database ready', { tables: rows.map((r) => r.tablename) });
}

if (require.main === module) {
  bootstrap()
    // seed() shares this same pool singleton and closes it when it finishes,
    // so it must run before anything here ends the pool.
    .then(() => require('./seed')())
    .then(() => process.exit(0))
    .catch(async (err) => {
      logger.error('Database bootstrap failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = bootstrap;
