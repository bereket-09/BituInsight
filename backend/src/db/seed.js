const bcrypt = require('bcryptjs');
const pool = require('./pool');
const { getAllWorkflows } = require('../kpi-workflows/registry');
const logger = require('../utils/logger');
const { applyMigrations } = require('./migrate');

async function seed() {
  const client = await pool.connect();
  try {
    const hash = await bcrypt.hash('admin123', 10);
    await client.query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      ['admin@bituinsight.local', hash, 'System Administrator']
    );

    const workflows = getAllWorkflows();
    for (const wf of workflows) {
      await client.query(
        `INSERT INTO kpi_workflows (slug, name, description, version, metadata, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           version = EXCLUDED.version,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [wf.slug, wf.name, wf.description, wf.version, JSON.stringify(wf.metadata)]
      );
    }

    await applyMigrations(client);

    logger.info('Database seed completed', { workflows: workflows.length });
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Seed failed', { error: err.message });
      process.exit(1);
    });
}

module.exports = seed;
