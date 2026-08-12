const logger = require('../utils/logger');

function errorHandler(err, req, res, _next) {
  logger.error('Request error', {
    path: req.path,
    method: req.method,
    error: err.message,
    stack: err.stack,
  });

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

module.exports = { errorHandler };
