-- Keep the uploaded workbook alongside its record.
--
-- Changing a KPI threshold re-runs that sheet, which needs the original Excel.
-- The file was only ever on disk, and a serverless instance does not keep /tmp
-- between invocations — so after a redeploy or a cold start the threshold edit
-- failed with the source file missing. Storing the bytes makes reprocessing
-- independent of which machine happens to serve the request.
--
-- stored_path is retained as the fast path for local and Docker installs.

ALTER TABLE workbook_uploads ADD COLUMN IF NOT EXISTS file_data BYTEA;
ALTER TABLE workbook_uploads ALTER COLUMN stored_path DROP NOT NULL;

ALTER TABLE uploaded_files ADD COLUMN IF NOT EXISTS file_data BYTEA;
ALTER TABLE uploaded_files ALTER COLUMN stored_path DROP NOT NULL;
