-- Core Insight Telecom KPI Analytics Platform
-- PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- KPI Workflows (registry synced from code modules)
CREATE TABLE kpi_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    metadata JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uploaded Excel files
CREATE TABLE uploaded_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL REFERENCES kpi_workflows(id),
    original_filename VARCHAR(500) NOT NULL,
    stored_path VARCHAR(1000) NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    mime_type VARCHAR(100),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE report_status AS ENUM (
    'pending',
    'validating',
    'processing',
    'completed',
    'failed'
);

-- Processed reports
CREATE TABLE processed_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL REFERENCES kpi_workflows(id),
    uploaded_file_id UUID REFERENCES uploaded_files(id) ON DELETE SET NULL,
    workbook_id UUID,
    sheet_name VARCHAR(255),
    kpi_name VARCHAR(255),
    status report_status NOT NULL DEFAULT 'pending',
    validation_errors JSONB DEFAULT '[]',
    summary JSONB DEFAULT '{}',
    report_data JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_processed_reports_user ON processed_reports(user_id);
CREATE INDEX idx_processed_reports_status ON processed_reports(status);
CREATE INDEX idx_processed_reports_workflow ON processed_reports(workflow_id);
CREATE INDEX idx_processed_reports_created ON processed_reports(created_at DESC);

-- CMM multi-sheet workbook uploads
CREATE TABLE workbook_uploads (
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

CREATE INDEX idx_workbook_uploads_user ON workbook_uploads(user_id);

ALTER TABLE processed_reports
    ADD CONSTRAINT fk_processed_reports_workbook
    FOREIGN KEY (workbook_id) REFERENCES workbook_uploads(id) ON DELETE CASCADE;

CREATE INDEX idx_processed_reports_workbook ON processed_reports(workbook_id);

-- Generated metrics per report
CREATE TABLE generated_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES processed_reports(id) ON DELETE CASCADE,
    metric_key VARCHAR(100) NOT NULL,
    metric_value NUMERIC,
    metric_label VARCHAR(255),
    metric_type VARCHAR(50) NOT NULL DEFAULT 'number',
    unit VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_generated_metrics_report ON generated_metrics(report_id);

-- Generated charts per report
CREATE TABLE generated_charts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES processed_reports(id) ON DELETE CASCADE,
    chart_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_generated_charts_report ON generated_charts(report_id);

-- Teams delivery logs
CREATE TYPE teams_delivery_status AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE teams_delivery_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES processed_reports(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    webhook_url VARCHAR(1000),
    status teams_delivery_status NOT NULL DEFAULT 'pending',
    response_body TEXT,
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teams_delivery_report ON teams_delivery_logs(report_id);

-- Default admin user is created by backend seed script on startup
