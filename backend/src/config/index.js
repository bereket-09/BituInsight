require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 4000,
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://bituinsight:bituinsight_secret@localhost:5432/bituinsight',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  reportsDir: process.env.REPORTS_DIR || './reports',
  chartsDir: process.env.CHARTS_DIR || './charts',
  teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL || '',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  logLevel: process.env.LOG_LEVEL || 'info',
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 25,
  // Optional. Without it the platform still produces a deterministic narrative;
  // with it, reports also get a Claude-authored executive summary.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  // Escape hatch for hosts where chart rendering must be turned off.
  chartsEnabled: process.env.DISABLE_CHART_RENDERING !== 'true',
  /**
   * Run upload processing inside the request instead of deferring it.
   * Serverless functions are frozen the moment they respond, so deferred work is
   * killed part-way through and the upload is left stranded.
   */
  processInline:
    process.env.PROCESS_REPORTS_INLINE === 'true' || Boolean(process.env.VERCEL),
};

module.exports = config;
