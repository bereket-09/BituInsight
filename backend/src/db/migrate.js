const fs = require('fs');
const path = require('path');
const pool = require('./pool');
const logger = require('../utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function applyMigrations(clientOrPool = pool) {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    logger.warn('Migrations directory not found', { path: MIGRATIONS_DIR });
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await clientOrPool.query(sql);
    logger.info('Migration applied', { file });
  }
}

module.exports = { applyMigrations };
