-- OAuth 2.1 authorization server.
--
-- Until now the only way to give an AI assistant access to Core Insight was the
-- stdio MCP server, which needs a raw DATABASE_URL on the operator's machine.
-- That hands out the whole database to get read-only KPI access, and it cannot
-- work at all for a hosted assistant that has no shell to run a process in.
--
-- These four tables let the assistant go through the front door instead: it
-- registers itself, redirects the person to Core Insight, the person signs in
-- with their normal account and approves, and the assistant receives a token
-- scoped to that one person. No database credential ever leaves the server.
--
-- Two deliberate choices about what is stored:
--
--   * Access and refresh tokens are kept only as SHA-256 hashes. A dump of this
--     table is therefore not a set of working credentials. The same goes for
--     authorization codes. Client secrets are the exception and are stored as
--     issued, because the SDK's token endpoint authenticates a client by
--     comparing the presented secret with the stored one.
--
--   * A pending authorization request is a row rather than a signed cookie or a
--     JWT in the URL. The consent screen is a separate page load, possibly after
--     a sign-in detour, and the request must survive that without the client's
--     PKCE challenge or state passing through the browser's address bar twice.
--
-- Idempotent, like every migration here.

-- Clients that registered themselves through RFC 7591 dynamic registration.
-- `metadata` holds the complete OAuthClientInformationFull document the SDK
-- hands back; the mirrored columns exist so lookups and the consent screen do
-- not have to dig through JSON.
CREATE TABLE IF NOT EXISTS oauth_clients (
    client_id TEXT PRIMARY KEY,
    client_secret TEXT,
    client_id_issued_at BIGINT,
    client_secret_expires_at BIGINT,
    client_name TEXT,
    client_uri TEXT,
    redirect_uris JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- An authorization request that has reached the consent screen but has not yet
-- been approved or denied. Short-lived; `resolved_at` makes it single-use so a
-- replayed consent POST cannot mint a second code.
CREATE TABLE IF NOT EXISTS oauth_authorization_requests (
    id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    code_challenge_method TEXT NOT NULL DEFAULT 'S256',
    scopes TEXT[] NOT NULL DEFAULT '{}',
    state TEXT,
    resource TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    outcome TEXT
);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_requests_expiry
    ON oauth_authorization_requests (expires_at);

-- Issued authorization codes. Stored as a hash, single use via `used_at`, and
-- bound to the client, the redirect URI and the PKCE challenge they were issued
-- for. `grant_id` ties the code to every token later minted from it, so
-- revoking one refresh token can take the whole grant down with it.
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
    code_hash TEXT PRIMARY KEY,
    grant_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    code_challenge_method TEXT NOT NULL DEFAULT 'S256',
    scopes TEXT[] NOT NULL DEFAULT '{}',
    resource TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_codes_grant
    ON oauth_authorization_codes (grant_id);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_codes_expiry
    ON oauth_authorization_codes (expires_at);

-- Access and refresh tokens, again by hash only. One row per issued token;
-- refresh rotation revokes the old row and inserts a new one under the same
-- grant_id.
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_hash TEXT NOT NULL UNIQUE,
    token_type TEXT NOT NULL,
    grant_id UUID NOT NULL,
    client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    resource TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_grant ON oauth_tokens (grant_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user ON oauth_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_tokens_expiry ON oauth_tokens (expires_at);

-- CHECK constraints are added separately rather than inline so that re-running
-- this file against an already-created table still installs them. Same reason
-- an enum type is avoided: extending one would need its own migration.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'oauth_tokens_type_check'
    ) THEN
        ALTER TABLE oauth_tokens
            ADD CONSTRAINT oauth_tokens_type_check
            CHECK (token_type IN ('access', 'refresh'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'oauth_authorization_requests_outcome_check'
    ) THEN
        ALTER TABLE oauth_authorization_requests
            ADD CONSTRAINT oauth_authorization_requests_outcome_check
            CHECK (outcome IS NULL OR outcome IN ('approved', 'denied'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'oauth_authorization_codes_challenge_method_check'
    ) THEN
        ALTER TABLE oauth_authorization_codes
            ADD CONSTRAINT oauth_authorization_codes_challenge_method_check
            CHECK (code_challenge_method = 'S256');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'oauth_authorization_requests_challenge_method_check'
    ) THEN
        ALTER TABLE oauth_authorization_requests
            ADD CONSTRAINT oauth_authorization_requests_challenge_method_check
            CHECK (code_challenge_method = 'S256');
    END IF;
END
$$;
