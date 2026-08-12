-- Workbook multi-KPI support (run on existing DBs)

CREATE TABLE IF NOT EXISTS workbook_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_filename VARCHAR(500) NOT NULL,
    stored_path VARCHAR(1000) NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    sheet_count INT NOT NULL DEFAULT 0,
    kpi_count INT NOT NULL DEFAULT 0,
    status report_status NOT NULL DEFAULT 'pending',
    summary JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workbook_uploads_user ON workbook_uploads(user_id);

ALTER TABLE processed_reports
    ADD COLUMN IF NOT EXISTS workbook_id UUID REFERENCES workbook_uploads(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sheet_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS kpi_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_processed_reports_workbook ON processed_reports(workbook_id);
