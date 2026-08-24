/**
 * The human half of the OAuth flow.
 *
 * /authorize parks the client's request and sends the browser to Core Insight's
 * own consent page; these three endpoints are what that page talks to. They live
 * under /api like every other route so no additional platform routing is needed,
 * and they are deliberately small: the decision they record is "this person, this
 * client, this scope", and the authorization server module does the minting.
 *
 * Who the person is comes from the app's normal JWT login. OAuth here is how an
 * assistant is granted access, not a second place to keep identities — approving
 * requires the same session that opening the dashboard requires.
 */

const logger = require('../utils/logger');
const store = require('../oauth/store');
const { completeAuthorization, denyAuthorization } = require('../oauth/provider');
const { SCOPE_DETAILS } = require('../oauth/config');

function describeScopes(scopes) {
  return (scopes || []).map((scope) => ({
    scope,
    label: SCOPE_DETAILS[scope] ? SCOPE_DETAILS[scope].label : scope,
    description: SCOPE_DETAILS[scope] ? SCOPE_DETAILS[scope].description : '',
  }));
}

/**
 * Loads a pending request and says why it is unusable, if it is. Expiry and
 * "already answered" are separated from "never existed" so the page can tell the
 * person to retry from their assistant rather than showing a dead end.
 */
async function loadPendingRequest(requestId) {
  const request = await store.getAuthorizationRequest(requestId);
  if (!request) {
    return { error: { status: 404, code: 'not_found', message: 'Authorization request not found' } };
  }
  if (request.resolved_at) {
    return {
      error: { status: 410, code: 'already_resolved', message: 'This request has already been answered' },
    };
  }
  if (new Date(request.expires_at).getTime() <= Date.now()) {
    return { error: { status: 410, code: 'expired', message: 'This request has expired' } };
  }
  return { request };
}

/**
 * GET /api/oauth/consent/:requestId
 *
 * Public on purpose: the person arriving from their assistant is very often not
 * signed in yet, and the page has to be able to say who is asking before it can
 * ask them to sign in. It discloses only what the consent decision needs — the
 * client's own registered name and where it will be sent back to.
 */
async function getConsentRequest(req, res, next) {
  try {
    const { request, error } = await loadPendingRequest(req.params.requestId);
    if (error) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }

    let redirectHost = null;
    try {
      redirectHost = new URL(request.redirect_uri).host;
    } catch {
      redirectHost = null;
    }

    res.json({
      requestId: request.id,
      expiresAt: request.expires_at,
      client: {
        clientId: request.client_id,
        name: request.client_name || request.client_id,
        uri: request.client_uri || null,
        redirectUri: request.redirect_uri,
        redirectHost,
      },
      scopes: describeScopes(request.scopes),
      readOnly: true,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/oauth/consent/:requestId/approve
 *
 * Requires the app's own session. The user id on that session is the one bound
 * into the authorization code and, later, into every token minted from it.
 */
async function approveConsent(req, res, next) {
  try {
    const { error } = await loadPendingRequest(req.params.requestId);
    if (error) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }

    // Claiming and checking are the same statement, so two approvals racing on
    // one request cannot both produce a code.
    const claimed = await store.resolveAuthorizationRequest(req.params.requestId, 'approved');
    if (!claimed) {
      return res
        .status(410)
        .json({ error: 'This request has already been answered', code: 'already_resolved' });
    }

    const user = await store.findUserById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const redirectTo = await completeAuthorization(claimed, user.id);
    res.json({ redirectTo });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/oauth/consent/:requestId/deny
 *
 * No session required — refusing needs no proof of identity, and someone who
 * landed here by mistake must be able to back out without signing in first.
 */
async function denyConsent(req, res, next) {
  try {
    const { request, error } = await loadPendingRequest(req.params.requestId);
    if (error) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }

    const claimed = await store.resolveAuthorizationRequest(req.params.requestId, 'denied');
    if (!claimed) {
      return res
        .status(410)
        .json({ error: 'This request has already been answered', code: 'already_resolved' });
    }

    logger.info('OAuth authorization denied', { clientId: request.client_id });
    res.json({ redirectTo: denyAuthorization(claimed) });
  } catch (err) {
    next(err);
  }
}

module.exports = { getConsentRequest, approveConsent, denyConsent };
