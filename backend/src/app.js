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

// The OAuth authorization server sits at the application root, not under /api:
// RFC 8414 and RFC 9728 both put their discovery documents under /.well-known at
// the origin, and an MCP client that has only been given the site's URL has no
// other way to find them.
//
// Ahead of the app's own CORS and body parsers on purpose. The SDK's handlers
// bring their own — an open CORS policy, because an OAuth client may be any
// origin, and the exact body parser each endpoint's content type requires. Let
// the app's CORS run first and it would answer the preflight for /token with the
// single browser origin this API otherwise allows, which is precisely the wrong
// answer for a token endpoint.
//
// A failure to build it must not take the whole API down: the rest of the
// product does not depend on it.
try {
  const { buildOAuthRouter } = require('./oauth');
  app.use(buildOAuthRouter());
} catch (err) {
  logger.error('OAuth authorization server not mounted', { error: err.message });
}

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
