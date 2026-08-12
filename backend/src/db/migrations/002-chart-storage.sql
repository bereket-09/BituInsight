-- Store chart images in the database rather than on the filesystem.
--
-- A serverless filesystem does not survive the request that wrote to it, so a PNG
-- written during upload is gone by the time a download or PPTX export runs. Holding
-- the bytes alongside the chart row makes them durable, keeps them transactional
-- with the report, and lets them cascade-delete with it.
--
-- file_path stays for local and Docker runs, but is no longer required.

ALTER TABLE generated_charts ADD COLUMN IF NOT EXISTS image_data BYTEA;
ALTER TABLE generated_charts ADD COLUMN IF NOT EXISTS image_bytes INTEGER;
ALTER TABLE generated_charts ALTER COLUMN file_path DROP NOT NULL;
