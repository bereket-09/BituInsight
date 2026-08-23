-- Database-defined KPI workflows.
--
-- Until now a new KPI meant a new folder under src/kpi-workflows/ and a redeploy.
-- This table lets a workflow arrive as data: an AI chat produces a JSON definition,
-- a human imports it through the UI, our validator accepts or rejects it, and the
-- generic interpreter runs it. No code path is generated and nothing is executed —
-- the definition is only ever read as data.
--
-- `definition` holds the whole JSON document (identity, source expectations,
-- transforms, metrics, charts, presentation). Keeping it as one JSONB column rather
-- than shredding it into a dozen tables is deliberate: the document is validated as
-- a unit, versioned as a unit, and never queried field-by-field, so normalising it
-- would buy nothing and make schema evolution a migration every time.
--
-- `source` distinguishes a definition mirroring a built-in code module (documentation
-- and a starting point for authors) from one a user imported. Built-ins never win a
-- name clash: the registry resolves code modules first.
--
-- Idempotent, like every migration here.

CREATE TABLE IF NOT EXISTS workflow_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    schema_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    definition JSONB NOT NULL,
    source VARCHAR(20) NOT NULL DEFAULT 'imported',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- An enum type would need its own idempotent guard and a migration to extend, so
-- the allowed values live in a CHECK constraint instead. Added separately (rather
-- than inline) so re-running against an existing table also installs it.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'workflow_definitions_source_check'
    ) THEN
        ALTER TABLE workflow_definitions
            ADD CONSTRAINT workflow_definitions_source_check
            CHECK (source IN ('builtin', 'imported'));
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_active
    ON workflow_definitions (is_active) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_slug
    ON workflow_definitions (slug);

-- Reports already reference kpi_workflows(id), so an imported definition must also
-- have a kpi_workflows row before a user can upload against it. The import service
-- writes both in one transaction; this column simply records the link for anyone
-- reading the catalogue table directly.
ALTER TABLE kpi_workflows ADD COLUMN IF NOT EXISTS definition_id UUID
    REFERENCES workflow_definitions(id) ON DELETE SET NULL;
