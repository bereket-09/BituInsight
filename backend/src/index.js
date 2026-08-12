const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const pool = require('./db/pool');

async function start() {
  try {
    await pool.query('SELECT 1');
    logger.info('PostgreSQL connected');

    const { applyMigrations } = require('./db/migrate');
    await applyMigrations();

    const { getAllWorkflows } = require('./kpi-workflows/registry');
    logger.info('KPI workflows loaded', {
      count: getAllWorkflows().length,
      workflows: getAllWorkflows().map((w) => w.slug),
    });

    app.listen(config.port, () => {
      logger.info(`BituInsight API running on port ${config.port}`, {
        env: config.env,
      });
    });
  } catch (err) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

start();
