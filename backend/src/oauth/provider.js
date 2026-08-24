/**
 * The OAuthServerProvider the MCP SDK's auth router drives.
 *
 * The SDK owns the wire format — parsing /authorize, authenticating the client at
 * /token, verifying the PKCE challenge, shaping error responses. What lives here
 * is the part the SDK cannot know: where a code or a token is kept, who the
 * person behind it is, and which requests must be refused.
 *
 * The refusals, in one place, because they are the reason this file exists:
 *
 *   - PKCE is mandatory and S256 only. The SDK enforces the method at /authorize;
 *     the challenge is stored with the code and the SDK compares the verifier
 *     against it before exchangeAuthorizationCode is ever called. There is no
 *     path through this provider that issues a token without that comparison.
 *   - A redirect URI is matched exactly. The SDK checks the requested URI against
 *     the registered ones at /authorize; the code then carries the URI it was
 *     issued for, and the token request must present the identical string.
 *   - A code is single use, lives 60 seconds and is bound to one client. Present
 *     it twice and the entire grant is revoked, because a second presentation
 *     means someone other than the client has a copy.
 *   - A refresh token rotates. The old one is revoked as the new one is issued,
 *     and replaying a rotated-out refresh token also takes the grant down.
 *   - An access token that is expired or revoked fails verification.
 *
 * Nothing here logs a token, a code, a verifier or a client secret.
 */

const {
  InvalidClientError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
  ServerError,
} = require('@modelcontextprotocol/sdk/server/auth/errors.js');

const logger = require('../utils/logger');
const store = require('./store');
const {
  SUPPORTED_SCOPES,
  TOKEN_LIFETIMES,
  resolveAppUrl,
  resolveResourceUrl,
} = require('./config');

/**
 * Two URLs name the same resource if they agree on origin and path. Trailing
 * slashes and fragments are noise; a differing host or path is a different
 * audience and must be refused.
 */
function canonicalResource(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(String(value));
  } catch {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${path}`.toLowerCase();
}

/**
 * The requested scopes, or the default when the client asked for none. An
 * unsupported scope is an error rather than something to quietly drop: a client
 * that believes it was granted write access should be told plainly that it was
 * not.
 */
function normalizeScopes(requested) {
  if (!requested || requested.length === 0) return [...SUPPORTED_SCOPES];
  const unique = [...new Set(requested.filter(Boolean))];
  const unsupported = unique.filter((scope) => !SUPPORTED_SCOPES.includes(scope));
  if (unsupported.length > 0) {
    throw new InvalidScopeError(
      `Unsupported scope(s): ${unsupported.join(', ')}. This server grants ${SUPPORTED_SCOPES.join(', ')} only.`
    );
  }
  return unique;
}

const clientsStore = {
  async getClient(clientId) {
    return store.getClient(clientId);
  },

  /**
   * Dynamic client registration. The SDK has already generated the client id and
   * secret and validated the metadata against RFC 7591; all that is left is to
   * keep the document. The secret is stored as issued because the SDK's token
   * endpoint authenticates by comparing it with what the client presents.
   */
  async registerClient(client) {
    await store.insertClient(client);
    logger.info('OAuth client registered', {
      clientId: client.client_id,
      clientName: client.client_name,
      redirectUris: client.redirect_uris,
    });
    return client;
  },
};

/**
 * Mints an access/refresh pair under one grant and returns the OAuth token
 * response. The raw values are returned to the caller and never stored — only
 * their hashes reach the database.
 */
async function issueTokens({ grantId, clientId, userId, scopes, resource }) {
  const accessToken = store.randomSecret();
  const refreshToken = store.randomSecret();

  await store.insertToken({
    token: accessToken,
    type: 'access',
    grantId,
    clientId,
    userId,
    scopes,
    resource,
    ttlSeconds: TOKEN_LIFETIMES.accessTokenSeconds,
  });
  await store.insertToken({
    token: refreshToken,
    type: 'refresh',
    grantId,
    clientId,
    userId,
    scopes,
    resource,
    ttlSeconds: TOKEN_LIFETIMES.refreshTokenSeconds,
  });

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: TOKEN_LIFETIMES.accessTokenSeconds,
    refresh_token: refreshToken,
    scope: scopes.join(' '),
  };
}

/**
 * Checks that a token request is not trying to redirect the grant at a different
 * MCP server, and returns the audience the tokens should carry.
 */
function resolveGrantResource(storedResource, requestedResource) {
  const stored = canonicalResource(storedResource);
  const requested = canonicalResource(requestedResource);

  if (stored && requested && stored !== requested) {
    throw new InvalidTargetError('Resource does not match the authorization request');
  }

  const effective = stored || requested;
  if (!effective) return null;

  const expected = canonicalResource(resolveResourceUrl());
  if (expected && effective !== expected) {
    throw new InvalidTargetError('Unknown resource for this authorization server');
  }
  return storedResource || String(requestedResource);
}

const provider = {
  get clientsStore() {
    return clientsStore;
  },

  /**
   * Hands the browser to Core Insight's own consent screen rather than deciding
   * anything here. The client's PKCE challenge, redirect URI, scopes and state
   * are parked in a row and only a random handle travels in the URL, so none of
   * it passes through the address bar of a page the user may leave open.
   *
   * The flow resumes at POST /api/oauth/consent/:id/approve, which is what
   * finally redirects back to the client with `code` and `state`.
   */
  async authorize(client, params, res) {
    const scopes = normalizeScopes(params.scopes);

    const requestId = await store.createAuthorizationRequest({
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scopes,
      state: params.state,
      resource: params.resource ? params.resource.href : null,
      ttlSeconds: TOKEN_LIFETIMES.authorizationRequestSeconds,
    });

    const target = new URL('/oauth/authorize', resolveAppUrl());
    target.searchParams.set('request_id', requestId);

    logger.info('OAuth authorization requested', {
      clientId: client.client_id,
      clientName: client.client_name,
      scopes,
    });

    res.redirect(302, target.href);
  },

  /**
   * The SDK asks for the challenge, compares it with the verifier itself, and
   * only then calls exchangeAuthorizationCode. Refusing an unknown, expired,
   * replayed or foreign-client code here means a bad code never reaches the
   * comparison at all.
   */
  async challengeForAuthorizationCode(client, authorizationCode) {
    const row = await store.findAuthorizationCode(authorizationCode);
    if (!row) {
      throw new InvalidGrantError('Invalid authorization code');
    }
    if (row.client_id !== client.client_id) {
      throw new InvalidGrantError('Authorization code was issued to a different client');
    }
    if (row.used_at) {
      // A code offered twice means a copy is loose. Everything it produced dies.
      await store.revokeGrant(row.grant_id);
      logger.warn('OAuth authorization code replayed; grant revoked', {
        clientId: client.client_id,
        grantId: row.grant_id,
      });
      throw new InvalidGrantError('Authorization code has already been used');
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new InvalidGrantError('Authorization code has expired');
    }
    return row.code_challenge;
  },

  /**
   * Reached only after the SDK has verified the PKCE verifier against the
   * challenge returned above.
   */
  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri, resource) {
    const row = await store.consumeAuthorizationCode(authorizationCode);
    if (!row) {
      // Either it never existed, or it expired, or someone won the race to burn
      // it. The last case is the dangerous one, so look again to tell them apart.
      const existing = await store.findAuthorizationCode(authorizationCode);
      if (existing && existing.used_at) {
        await store.revokeGrant(existing.grant_id);
        logger.warn('OAuth authorization code replayed; grant revoked', {
          clientId: client.client_id,
          grantId: existing.grant_id,
        });
      }
      throw new InvalidGrantError('Invalid or expired authorization code');
    }

    if (row.client_id !== client.client_id) {
      await store.revokeGrant(row.grant_id);
      throw new InvalidGrantError('Authorization code was issued to a different client');
    }

    // Exact string comparison, deliberately. The code carries the one URI it was
    // issued for; anything else, including a longer URI that merely starts with
    // it, is a different destination.
    if (redirectUri !== undefined) {
      if (redirectUri !== row.redirect_uri) {
        await store.revokeGrant(row.grant_id);
        throw new InvalidGrantError('redirect_uri does not match the authorization request');
      }
    } else {
      // Omitting it is only unambiguous when the client registered exactly one
      // URI and that is the one the code was issued for.
      const registered = client.redirect_uris || [];
      if (registered.length !== 1 || registered[0] !== row.redirect_uri) {
        throw new InvalidGrantError('redirect_uri is required for this client');
      }
    }

    const grantResource = resolveGrantResource(row.resource, resource);

    const tokens = await issueTokens({
      grantId: row.grant_id,
      clientId: row.client_id,
      userId: row.user_id,
      scopes: row.scopes,
      resource: grantResource,
    });

    logger.info('OAuth access token issued', {
      clientId: row.client_id,
      userId: row.user_id,
      grantId: row.grant_id,
      scopes: row.scopes,
    });

    return tokens;
  },

  /**
   * Rotating refresh: the presented token is revoked as the replacement is
   * issued. Presenting an already-revoked one afterwards is the classic sign of
   * a stolen token, and takes the whole grant with it.
   */
  async exchangeRefreshToken(client, refreshToken, scopes, resource) {
    const row = await store.findToken(refreshToken);
    if (!row || row.token_type !== 'refresh') {
      throw new InvalidGrantError('Invalid refresh token');
    }
    if (row.client_id !== client.client_id) {
      throw new InvalidGrantError('Refresh token was issued to a different client');
    }
    if (row.revoked_at) {
      await store.revokeGrant(row.grant_id);
      logger.warn('Revoked OAuth refresh token replayed; grant revoked', {
        clientId: client.client_id,
        grantId: row.grant_id,
      });
      throw new InvalidGrantError('Refresh token has been revoked');
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new InvalidGrantError('Refresh token has expired');
    }

    // A refresh may narrow the grant but never widen it.
    let nextScopes = row.scopes;
    if (scopes && scopes.length > 0) {
      const requested = normalizeScopes(scopes);
      const widened = requested.filter((scope) => !row.scopes.includes(scope));
      if (widened.length > 0) {
        throw new InvalidScopeError('Requested scope exceeds the original grant');
      }
      nextScopes = requested;
    }

    const grantResource = resolveGrantResource(row.resource, resource);

    await store.revokeTokenById(row.id);
    const tokens = await issueTokens({
      grantId: row.grant_id,
      clientId: row.client_id,
      userId: row.user_id,
      scopes: nextScopes,
      resource: grantResource,
    });

    logger.info('OAuth access token refreshed', {
      clientId: row.client_id,
      userId: row.user_id,
      grantId: row.grant_id,
    });

    return tokens;
  },

  /**
   * The contract with the MCP tool layer: `extra.userId` is the Core Insight
   * users.id the assistant is acting for. Every tool scopes its queries to it,
   * so this field is the whole tenancy boundary — do not rename it.
   */
  async verifyAccessToken(token) {
    // InvalidTokenError, not InvalidGrantError: it is what makes requireBearerAuth
    // answer 401 with a WWW-Authenticate header pointing at the resource metadata,
    // which is how an MCP client knows to start the OAuth flow again.
    const row = await store.findTokenWithUser(token);
    if (!row || row.token_type !== 'access') {
      throw new InvalidTokenError('Invalid access token');
    }
    if (row.revoked_at) {
      throw new InvalidTokenError('Access token has been revoked');
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      throw new InvalidTokenError('Access token has expired');
    }

    return {
      token,
      clientId: row.client_id,
      scopes: row.scopes,
      expiresAt: Math.floor(new Date(row.expires_at).getTime() / 1000),
      resource: row.resource ? new URL(row.resource) : undefined,
      extra: {
        userId: row.user_id,
        userEmail: row.user_email,
        userName: row.user_name,
        grantId: row.grant_id,
        tokenId: row.id,
      },
    };
  },

  /**
   * RFC 7009. An unknown or already-revoked token is not an error — the caller
   * asked for the token to stop working, and it does not work.
   */
  async revokeToken(client, request) {
    const row = await store.findToken(request.token);
    if (!row) return;
    if (row.client_id !== client.client_id) {
      throw new InvalidClientError('Token was issued to a different client');
    }

    if (row.token_type === 'refresh') {
      // Revoking the refresh token revokes what it produced, as RFC 7009 asks.
      await store.revokeGrant(row.grant_id);
    } else {
      await store.revokeTokenById(row.id);
    }

    logger.info('OAuth token revoked', {
      clientId: row.client_id,
      grantId: row.grant_id,
      tokenType: row.token_type,
    });
  },
};

/**
 * Turns an approved consent into the redirect the client is waiting for. Lives
 * here rather than in the controller because minting a code is an authorization
 * server concern, and because the code must be bound to exactly the request that
 * was approved.
 */
async function completeAuthorization(request, userId) {
  if (!request.redirect_uri) {
    throw new ServerError('Authorization request has no redirect URI');
  }

  const code = await store.createAuthorizationCode({
    clientId: request.client_id,
    userId,
    redirectUri: request.redirect_uri,
    codeChallenge: request.code_challenge,
    scopes: request.scopes,
    resource: request.resource,
    ttlSeconds: TOKEN_LIFETIMES.authorizationCodeSeconds,
  });

  const target = new URL(request.redirect_uri);
  target.searchParams.set('code', code);
  if (request.state) target.searchParams.set('state', request.state);

  logger.info('OAuth authorization approved', {
    clientId: request.client_id,
    userId,
    scopes: request.scopes,
  });

  return target.href;
}

/** The denial redirect, per OAuth 2.1 section 4.1.2.1. */
function denyAuthorization(request) {
  const target = new URL(request.redirect_uri);
  target.searchParams.set('error', 'access_denied');
  target.searchParams.set('error_description', 'The user denied the request');
  if (request.state) target.searchParams.set('state', request.state);
  return target.href;
}

module.exports = {
  provider,
  clientsStore,
  normalizeScopes,
  completeAuthorization,
  denyAuthorization,
};
