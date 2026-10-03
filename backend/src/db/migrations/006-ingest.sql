-- Automatic imports.
--
-- NetAct mails its scheduled exports to a person's inbox. A Power Automate flow
-- (or any other sender) forwards each attachment to POST /api/ingest/files, and
-- the portal works out which KPI it is and processes it with no one signed in.
--
-- ingest_keys: machine credentials for that endpoint. Each belongs to a user, and
-- what it imports appears in that user's reports. Only a SHA-256 hash is kept;
-- the key itself is shown once, when it is created. key_prefix is the first few
-- characters, so a person can tell their keys apart in Settings.
--
-- ingest_events: one row per file received, whatever happened to it. content_hash
-- lets a re-sent email be recognised instead of producing a second report.
--
-- Idempotent, like every migration here.

CREATE TABLE IF NOT EXISTS ingest_keys (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ingest_keys_user ON ingest_keys(user_id);

CREATE TABLE IF NOT EXISTS ingest_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_id UUID REFERENCES ingest_keys(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  content_hash TEXT NOT NULL,
  -- received | processed | duplicate | rejected | failed
  status TEXT NOT NULL,
  workflow_slug TEXT,
  report_id UUID,
  workbook_id UUID,
  message TEXT,
  -- Where the file came from: sender, subject, received time, mail message id.
  source JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ingest_events_user_created ON ingest_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_events_hash ON ingest_events(user_id, content_hash);
