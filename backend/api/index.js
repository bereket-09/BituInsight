/**
 * Serverless entry point (Vercel).
 *
 * Differs from src/index.js in two ways:
 *   - it exports the Express app instead of calling listen(), because the platform
 *     owns the HTTP server;
 *   - it does not run migrations on boot. Every cold start would re-run them, and
 *     a serverless function is the wrong place to hold a schema lock. Migrations
 *     are applied once from a workstation or CI (`npm run seed`).
 */
const app = require('../src/app');

module.exports = app;
