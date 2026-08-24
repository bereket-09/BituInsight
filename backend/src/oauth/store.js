/**
 * Every database read and write the authorization server performs.
 *
 * Kept apart from the provider so the security rules in provider.js read as
 * rules rather than as SQL, and so there is exactly one place that knows a token
 * is stored as a hash. Nothing in this file ever returns a raw secret: callers
 * hand in the raw value, the store hashes it and looks up by the hash.
 */

const crypto = require('crypto');
const pool = require('../db/pool');

/**
 * SHA-256, hex. Fast is fine and salting is not: these are 256-bit random
 * values, not passwords, so there is no dictionary to run and no rainbow table
 * to build. Hashing exists so a leaked table row is not a working credential.
 */
function hashSecret(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

/** 256 bits of randomness, URL-safe, for codes, tokens and request handles. */
function randomSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

/* -------------------------------------------------------------------------- */
/* Clients                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The SDK's client documents round-trip through the `metadata` column verbatim,
 * so a field we do not model here is still returned to the client exactly as it
 * was registered.
 */
function rowToClient(row) {
  if (!row) return undefined;
  return row.metadata;
}

async function getClient(clientId) {
  const result = await pool.query('SELECT metadata FROM oauth_clients WHERE client_id = $1', [
    clientId,
  ]);
  return rowToClient(result.rows[0]);
}

async function insertClient(client) {
  await pool.query(
    `INSERT INTO oauth_clients
       (client_id, client_secret, client_id_issued_at, client_secret_expires_at,
        client_name, client_uri, redirect_uris, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
     ON CONFLICT (client_id) DO UPDATE SET
       client_secret = EXCLUDED.client_secret,
       client_id_issued_at = EXCLUDED.client_id_issued_at,
       client_secret_expires_at = EXCLUDED.client_secret_expires_at,
       client_name = EXCLUDED.client_name,
       client_uri = EXCLUDED.client_uri,
       redirect_uris = EXCLUDED.redirect_uris,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()`,
    [
      client.client_id,
      client.client_secret || null,
      client.client_id_issued_at || null,
      client.client_secret_expires_at == null ? null : client.client_secret_expires_at,
      client.client_name || null,
      client.client_uri || null,
      JSON.stringify(client.redirect_uris || []),
      JSON.stringify(client),
    ]
  );
  return client;
}

/* -------------------------------------------------------------------------- */
/* Pending authorization requests                                              */
/* -------------------------------------------------------------------------- */

async function createAuthorizationRequest({
  clientId,
  redirectUri,
  codeChallenge,
  scopes,
  state,
  resource,
  ttlSeconds,
}) {
  const id = randomSecret();
  await pool.query(
    `INSERT INTO oauth_authorization_requests
       (id, client_id, redirect_uri, code_challenge, scopes, state, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + ($8 || ' seconds')::interval)`,
    [id, clientId, redirectUri, codeChallenge, scopes, state || null, resource || null, String(ttlSeconds)]
  );
  return id;
}

async function getAuthorizationRequest(id) {
  const result = await pool.query(
    `SELECT r.*, c.client_name, c.client_uri, c.metadata AS client_metadata
       FROM oauth_authorization_requests r
       JOIN oauth_clients c ON c.client_id = r.client_id
      WHERE r.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Claims a pending request. The `resolved_at IS NULL` predicate is the whole
 * point: two simultaneous approvals race here and exactly one gets a row back,
 * so a request can never yield two authorization codes.
 */
async function resolveAuthorizationRequest(id, outcome) {
  const result = await pool.query(
    `UPDATE oauth_authorization_requests
        SET resolved_at = NOW(), outcome = $2
      WHERE id = $1 AND resolved_at IS NULL AND expires_at > NOW()
      RETURNING *`,
    [id, outcome]
  );
  return result.rows[0] || null;
}

/* -------------------------------------------------------------------------- */
/* Authorization codes                                                         */
/* -------------------------------------------------------------------------- */

async function createAuthorizationCode({
  clientId,
  userId,
  redirectUri,
  codeChallenge,
  scopes,
  resource,
  ttlSeconds,
}) {
  const code = randomSecret();
  await pool.query(
    `INSERT INTO oauth_authorization_codes
       (code_hash, client_id, user_id, redirect_uri, code_challenge, scopes, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + ($8 || ' seconds')::interval)`,
    [
      hashSecret(code),
      clientId,
      userId,
      redirectUri,
      codeChallenge,
      scopes,
      resource || null,
      String(ttlSeconds),
    ]
  );
  return code;
}

async function findAuthorizationCode(code) {
  const result = await pool.query(
    'SELECT * FROM oauth_authorization_codes WHERE code_hash = $1',
    [hashSecret(code)]
  );
  return result.rows[0] || null;
}

/**
 * Burns a code. Returns the row only if this call is the one that consumed it,
 * which is what makes replay detectable rather than merely unlikely.
 */
async function consumeAuthorizationCode(code) {
  const result = await pool.query(
    `UPDATE oauth_authorization_codes
        SET used_at = NOW()
      WHERE code_hash = $1 AND used_at IS NULL AND expires_at > NOW()
      RETURNING *`,
    [hashSecret(code)]
  );
  return result.rows[0] || null;
}

/* -------------------------------------------------------------------------- */
/* Tokens                                                                      */
/* -------------------------------------------------------------------------- */

async function insertToken({ token, type, grantId, clientId, userId, scopes, resource, ttlSeconds }) {
  await pool.query(
    `INSERT INTO oauth_tokens
       (token_hash, token_type, grant_id, client_id, user_id, scopes, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + ($8 || ' seconds')::interval)`,
    [hashSecret(token), type, grantId, clientId, userId, scopes, resource || null, String(ttlSeconds)]
  );
}

async function findToken(token) {
  const result = await pool.query('SELECT * FROM oauth_tokens WHERE token_hash = $1', [
    hashSecret(token),
  ]);
  return result.rows[0] || null;
}

/**
 * Verification path. Joined rather than a second round trip because this runs on
 * every single MCP request, and because the join is what guarantees the token's
 * owner still exists.
 */
async function findTokenWithUser(token) {
  const result = await pool.query(
    `SELECT t.*, u.email AS user_email, u.full_name AS user_name
       FROM oauth_tokens t
       JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1`,
    [hashSecret(token)]
  );
  return result.rows[0] || null;
}

async function revokeTokenById(id) {
  await pool.query('UPDATE oauth_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL', [
    id,
  ]);
}

/**
 * Takes down every token minted from one authorization code. Used when a
 * refresh token is revoked (RFC 7009 says the access tokens should go with it)
 * and when a code or a rotated-out refresh token is replayed, which is the
 * signature of a stolen credential.
 */
async function revokeGrant(grantId) {
  await pool.query(
    'UPDATE oauth_tokens SET revoked_at = NOW() WHERE grant_id = $1 AND revoked_at IS NULL',
    [grantId]
  );
}

async function findUserById(id) {
  const result = await pool.query('SELECT id, email, full_name FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

module.exports = {
  hashSecret,
  randomSecret,
  getClient,
  insertClient,
  createAuthorizationRequest,
  getAuthorizationRequest,
  resolveAuthorizationRequest,
  createAuthorizationCode,
  findAuthorizationCode,
  consumeAuthorizationCode,
  insertToken,
  findToken,
  findTokenWithUser,
  revokeTokenById,
  revokeGrant,
  findUserById,
};
