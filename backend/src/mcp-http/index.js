/**
 * Core Insight MCP server — hosted Streamable HTTP transport.
 *
 * The same 21 read-only tools as the local stdio server (src/mcp), served over
 * HTTP so an assistant can connect to this deployment instead of running a copy of
 * the server on someone's laptop with a raw DATABASE_URL. Nothing is forked: the
 * tool implementations live in src/mcp/tools and both transports register the same
 * assembly (src/mcp/server.js).
 *
 * Two things differ from stdio, and both follow from where this runs.
 *
 * 1. There is an authenticated caller. The bearer middleware in front of this
 *    handler verifies the token and puts the platform user id at
 *    `req.auth.extra.userId`; that id becomes the scope every tool query is bound
 *    to, so a session sees one account's reports and no others. Without it this
 *    handler refuses the request rather than falling back to reading everything.
 *
 * 2. It is serverless. Vercel keeps no memory between invocations and may route
 *    two requests of the same conversation to different instances, so the
 *    transport runs stateless: no session id generator, no session map, and a
 *    fresh McpServer + transport per request. The SDK enforces this too — a
 *    stateless transport throws if it is handed a second request.
 *
 * Mounting (done by the OAuth layer, not here):
 *
 *   router.use('/mcp', requireBearerAuth(...), handleMcpRequest);
 */

const {
  StreamableHTTPServerTransport,
} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');

const { createServer, SERVER_NAME, SERVER_VERSION } = require('../mcp/server');
const { createUserScope } = require('../mcp/db');
const logger = require('../utils/logger');

/** Same shape the rest of the platform uses for a user id. */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const JSONRPC_INVALID_REQUEST = -32600;
const JSONRPC_INTERNAL_ERROR = -32603;
/** The SDK's convention for transport/auth-level refusals. */
const JSONRPC_TRANSPORT_ERROR = -32000;

/**
 * The agreed contract with the OAuth layer: a verified token exposes the platform
 * user id at `req.auth.extra.userId`.
 *
 * This validates the shape rather than trusting it, because the value goes on to
 * decide which account's rows the whole session can read. Anything else — missing,
 * not a string, not a UUID — is treated as "no caller", never as "every caller".
 */
function resolveUserId(req) {
  const extra = req && req.auth && req.auth.extra;
  const userId = extra && extra.userId;
  if (typeof userId !== 'string' || !UUID_RE.test(userId.trim())) return null;
  return userId.trim();
}

function jsonRpcError(res, status, code, message, extraHeaders) {
  if (res.headersSent) return;
  res.status(status);
  if (extraHeaders) {
    for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value);
  }
  res.json({ jsonrpc: '2.0', error: { code, message }, id: null });
}

/**
 * Express handler for the MCP endpoint.
 *
 * POST carries the JSON-RPC traffic. GET is refused: it exists in the spec to open
 * a server-initiated SSE stream, and a stateless server on a serverless host has
 * nothing to push down one — holding the connection open would just burn an
 * invocation until it timed out. DELETE ends a session, and with no session state
 * to discard it succeeds trivially. The spec allows both answers.
 */
async function handleMcpRequest(req, res) {
  if (req.method === 'GET') {
    res.setHeader('Allow', 'POST, DELETE');
    return jsonRpcError(
      res,
      405,
      JSONRPC_TRANSPORT_ERROR,
      'Method Not Allowed: this endpoint is stateless and does not offer a server-initiated SSE stream. Send requests as POST.'
    );
  }

  if (req.method === 'DELETE') {
    // Nothing is retained between requests, so there is no session to tear down.
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, DELETE');
    return jsonRpcError(res, 405, JSONRPC_TRANSPORT_ERROR, 'Method Not Allowed');
  }

  const userId = resolveUserId(req);
  if (!userId) {
    // Reaching here means the bearer middleware admitted a request without
    // identifying the account. Refuse: an unscoped session would read every
    // account's reports, which is the exact failure this endpoint exists to avoid.
    logger.warn('MCP request reached the handler without an authenticated platform user');
    return jsonRpcError(
      res,
      401,
      JSONRPC_INVALID_REQUEST,
      'Unauthorized: this endpoint serves one signed-in Core Insight account and could not identify yours.',
      { 'WWW-Authenticate': 'Bearer error="invalid_token"' }
    );
  }

  const scope = createUserScope(userId);
  const server = createServer(scope);

  // Stateless: no session id is generated, so no session is tracked and every
  // request stands alone. `enableJsonResponse` returns the reply as a plain JSON
  // body instead of a one-message SSE stream, which is what a serverless function
  // can actually deliver.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // The per-request server and transport are garbage once the response is done.
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    try {
      await transport.close();
    } catch {
      /* already closed */
    }
    try {
      await server.close();
    } catch {
      /* already closed */
    }
  };
  res.on('close', () => {
    dispose();
  });

  try {
    await server.connect(transport);
    // req.body is present when an upstream express.json() has already consumed the
    // stream (src/app.js applies one). When it has not, the transport parses the
    // request itself.
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error('MCP request failed', { error: err.message });
    jsonRpcError(res, 500, JSONRPC_INTERNAL_ERROR, 'Internal error handling the MCP request');
    await dispose();
  }
}

/**
 * Static description of the endpoint, for the settings page and for anything that
 * wants to advertise the server without opening a session.
 */
function describeEndpoint() {
  return {
    server: { name: SERVER_NAME, version: SERVER_VERSION },
    transport: 'streamable-http',
    stateless: true,
    methods: ['POST', 'DELETE'],
    scoping: 'Every tool query is bound to the account that owns the bearer token.',
  };
}

module.exports = { handleMcpRequest, describeEndpoint, resolveUserId };
