/**
 * Where this authorization server thinks it lives, and how long the things it
 * issues stay valid.
 *
 * Getting the issuer wrong is not a cosmetic problem: an MCP client fetches
 * /.well-known/oauth-authorization-server, reads the absolute URLs out of it and
 * redirects the person's browser there. If the document advertises localhost
 * while running on Vercel, the connect flow dead-ends in the user's browser.
 *
 * Resolution order, first hit wins:
 *
 *   1. OAUTH_ISSUER_URL          - set this explicitly in production. For Core
 *                                  Insight that is https://bituinsight.vercel.app
 *   2. VERCEL_PROJECT_PRODUCTION_URL - the stable production alias, preferred
 *                                  over the per-deployment URL so a token issued
 *                                  by one deployment is still valid after the
 *                                  next one.
 *   3. VERCEL_URL                - the per-deployment host; correct for preview
 *                                  deployments, which have no stable alias.
 *   4. http://localhost:<PORT>   - development.
 *
 * Two related URLs derive from it and can be overridden the same way:
 *
 *   OAUTH_APP_URL      Where the human-facing consent page is served. Differs
 *                      from the issuer only in local development, where Vite
 *                      runs on :3000 and the API on :4000.
 *   OAUTH_RESOURCE_URL The MCP endpoint this token is good for, advertised in
 *                      the protected-resource metadata.
 */

const config = require('../config');

const SUPPORTED_SCOPES = ['mcp:read'];

/**
 * What the consent screen tells the person each scope actually permits. Keep the
 * wording concrete: "read-only" is the whole point of the grant.
 */
const SCOPE_DETAILS = {
  'mcp:read': {
    label: 'Read your Core Insight data',
    description:
      'View your KPI reports, workbooks, time series, charts and analysis results. ' +
      'Read-only — the assistant cannot upload, edit or delete anything.',
  },
};

const TOKEN_LIFETIMES = {
  // Long enough to survive a sign-in detour on the consent screen, short enough
  // that a code leaked through a referrer header or a proxy log is already dead.
  authorizationCodeSeconds: 60,
  // The pending consent request itself, which spans the redirect and the login.
  authorizationRequestSeconds: 10 * 60,
  accessTokenSeconds: 60 * 60,
  refreshTokenSeconds: 30 * 24 * 60 * 60,
};

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function normalizeOrigin(value) {
  const url = new URL(value);
  if (url.hash || url.search) {
    throw new Error(`OAuth issuer URL must not carry a query or fragment: ${value}`);
  }
  return stripTrailingSlash(url.href);
}

function resolveIssuerUrl(env = process.env) {
  if (env.OAUTH_ISSUER_URL) return normalizeOrigin(env.OAUTH_ISSUER_URL);
  if (env.VERCEL_PROJECT_PRODUCTION_URL) {
    return normalizeOrigin(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  if (env.VERCEL_URL) return normalizeOrigin(`https://${env.VERCEL_URL}`);
  return normalizeOrigin(`http://localhost:${config.port}`);
}

/**
 * The origin serving the React app. On Vercel the API and the app share one
 * origin, so the issuer is the right answer; locally they do not, and
 * config.corsOrigin already records where the app is.
 */
function resolveAppUrl(env = process.env) {
  if (env.OAUTH_APP_URL) return normalizeOrigin(env.OAUTH_APP_URL);
  if (env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL || env.OAUTH_ISSUER_URL) {
    return resolveIssuerUrl(env);
  }
  return stripTrailingSlash(config.corsOrigin || `http://localhost:${config.port}`);
}

/**
 * The MCP endpoint the access token is an admission ticket for. Kept separate
 * from the issuer because RFC 9728 metadata names the resource, not the server
 * that issued the token — and because the HTTP MCP handler is mounted by
 * another module that may move.
 */
function resolveResourceUrl(env = process.env) {
  if (env.OAUTH_RESOURCE_URL) return stripTrailingSlash(new URL(env.OAUTH_RESOURCE_URL).href);
  return `${resolveIssuerUrl(env)}/api/mcp`;
}

module.exports = {
  SUPPORTED_SCOPES,
  SCOPE_DETAILS,
  TOKEN_LIFETIMES,
  resolveIssuerUrl,
  resolveAppUrl,
  resolveResourceUrl,
};
