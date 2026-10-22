-- Performance & Snappy Querying Indexes
-- Optimized for high-throughput telecom report history, dashboard aggregations, and workbook lookups.

-- 1. Fast User + Creation time index for processed reports (eliminates in-memory sorting)
CREATE INDEX IF NOT EXISTS idx_processed_reports_user_created
  ON processed_reports (user_id, created_at DESC);

-- 2. Partial index for standalone KPI reports (where workbook_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_processed_reports_user_standalone_created
  ON processed_reports (user_id, created_at DESC)
  WHERE workbook_id IS NULL;

-- 3. Fast User + Creation time index for CMM workbook uploads
CREATE INDEX IF NOT EXISTS idx_workbook_uploads_user_created
  ON workbook_uploads (user_id, created_at DESC);

-- 4. Fast Child KPI lookup within workbooks
CREATE INDEX IF NOT EXISTS idx_processed_reports_workbook_user
  ON processed_reports (workbook_id, user_id)
  WHERE workbook_id IS NOT NULL;

-- 5. Fast Status-based counting and filtering
CREATE INDEX IF NOT EXISTS idx_processed_reports_user_status
  ON processed_reports (user_id, status);

CREATE INDEX IF NOT EXISTS idx_workbook_uploads_user_status
  ON workbook_uploads (user_id, status);

-- 6. Workflow-based aggregation index
CREATE INDEX IF NOT EXISTS idx_processed_reports_user_workflow
  ON processed_reports (user_id, workflow_id);

-- 7. Uploaded files fast user lookup
CREATE INDEX IF NOT EXISTS idx_uploaded_files_user
  ON uploaded_files (user_id);

-- 8. Metrics & Charts fast retrieval
CREATE INDEX IF NOT EXISTS idx_generated_metrics_report_key
  ON generated_metrics (report_id, metric_key);

CREATE INDEX IF NOT EXISTS idx_generated_charts_report_type
  ON generated_charts (report_id, chart_type);
