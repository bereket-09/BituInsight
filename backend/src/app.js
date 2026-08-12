const express = require('express');
const cors = require('cors');
const fs = require('fs');
const config = require('./config');
const routes = require('./routes');
const { errorHandler } = require('./middleware/error.middleware');
const logger = require('./utils/logger');

const app = express();

// On serverless hosts only /tmp is writable, so a failure here is expected and
// must not take the process down — the routes that need a directory check again.
[config.uploadDir, config.reportsDir, config.chartsDir].forEach((dir) => {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    logger.warn('Could not create working directory', { dir, error: err.message });
  }
});

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.use(errorHandler);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;
