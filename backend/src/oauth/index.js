/**
 * Mounts the authorization server on the Express app and exposes the bearer
 * middleware the HTTP MCP endpoint sits behind.
 *
 * The SDK's mcpAuthRouter provides /authorize, /token, /register, /revoke and
 * the two metadata documents. It insists on being mounted at the application
 * root, because RFC 8414 and RFC 9728 both place their documents under
 * /.well-known at the origin — a client that has only been told "the server is
 * at https://bituinsight.vercel.app" must be able to find them from that alone.
 *
 * The protected-resource document is served twice on purpose. RFC 9728 puts it
 * at a path derived from the resource URL (/.well-known/oauth-protected-resource
 * /api/mcp), and that is what a current MCP client asks for first — but clients
 * and proxies in the wild still probe the bare /.well-known/oauth-protected-
 * resource, and answering only one of the two is a discovery failure that looks
 * like a broken server.
 */

const express = require('express');
const { mcpAuthRouter } = require('@modelcontextprotocol/sdk/server/auth/router.js');
const { metadataHandler } = require('@modelcontextprotocol/sdk/server/auth/handlers/metadata.js');
const {
  requireBearerAuth,
} = require('@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js');

const logger = require('../utils/logger');
const { provider } = require('./provider');
const {
  SUPPORTED_SCOPES,
  resolveIssuerUrl,
  resolveResourceUrl,
} = require('./config');

const RESOURCE_NAME = 'Core Insight';

/**
 * express-rate-limit's default key is req.ip, which behind Vercel's proxy is the
 * proxy rather than the caller unless the app trusts the forwarded header. Rather
 * than flipping `trust proxy` app-wide — which would change req.ip and
 * req.protocol for every existing route — the limiters get their own key.
 * Validation is switched off because those warnings are all about the app-wide
 * setting this deliberately avoids.
 */
const rateLimitOptions = {
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
    return first || req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  },
  validate: false,
};

function buildOAuthRouter() {
  const issuerUrl = new URL(resolveIssuerUrl());
  const resourceUrl = new URL(resolveResourceUrl());

  const router = express.Router();

  router.use(
    mcpAuthRouter({
      provider,
      issuerUrl,
      baseUrl: issuerUrl,
      resourceServerUrl: resourceUrl,
      resourceName: RESOURCE_NAME,
      scopesSupported: SUPPORTED_SCOPES,
      authorizationOptions: { rateLimit: rateLimitOptions },
      tokenOptions: { rateLimit: rateLimitOptions },
      clientRegistrationOptions: { rateLimit: rateLimitOptions },
      revocationOptions: { rateLimit: rateLimitOptions },
    })
  );

  // The bare protected-resource document, for clients that probe the origin
  // rather than the resource path. mcpAuthRouter already served the path-derived
  // one, so this only fires when the resource has a path of its own.
  if (resourceUrl.pathname && resourceUrl.pathname !== '/') {
    router.use(
      '/.well-known/oauth-protected-resource',
      metadataHandler({
        resource: resourceUrl.href,
        authorization_servers: [issuerUrl.href],
        scopes_supported: SUPPORTED_SCOPES,
        resource_name: RESOURCE_NAME,
      })
    );
  }

  logger.info('OAuth authorization server mounted', {
    issuer: issuerUrl.href,
    resource: resourceUrl.href,
    scopes: SUPPORTED_SCOPES,
  });

  return router;
}

/**
 * What the HTTP MCP endpoint is mounted behind. On rejection it answers 401 with
 * a WWW-Authenticate header naming the metadata document, which is the signal an
 * MCP client uses to begin the authorization flow.
 */
function requireMcpAuth() {
  const resourceUrl = new URL(resolveResourceUrl());
  const rsPath = resourceUrl.pathname === '/' ? '' : resourceUrl.pathname;
  return requireBearerAuth({
    verifier: provider,
    requiredScopes: ['mcp:read'],
    resourceMetadataUrl: new URL(
      `/.well-known/oauth-protected-resource${rsPath}`,
      resourceUrl
    ).href,
  });
}

module.exports = { buildOAuthRouter, requireMcpAuth, provider };
