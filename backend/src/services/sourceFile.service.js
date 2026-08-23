const fs = require('fs');
const path = require('path');
const config = require('../config');
const pool = require('../db/pool');
const logger = require('../utils/logger');

/**
 * Access to the originally uploaded workbook.
 *
 * Reprocessing (changing a KPI threshold, for example) needs the source file
 * again, but the upload directory is /tmp on a serverless host and does not
 * survive the invocation that wrote it. The bytes are therefore kept in Postgres
 * and rehydrated on demand.
 *
 * Disk stays the fast path: when the file is still there, nothing is read from
 * the database.
 */

/** Read an uploaded file from disk so it can be persisted. */
function readIfPresent(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) return fs.readFileSync(filePath);
  } catch (err) {
    logger.warn('Could not read uploaded file for retention', {
      filePath,
      error: err.message,
    });
  }
  return null;
}

/**
 * Write bytes back to a usable path. Returns the path, or null when nothing can
 * be written (in which case the caller has no source file at all).
 */
function materialize(buffer, preferredPath) {
  if (!buffer) return null;

  const target =
    preferredPath || path.join(config.uploadDir, `rehydrated-${Date.now()}.xlsx`);

  try {
    const dir = path.dirname(target);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(target, buffer);
    return target;
  } catch (err) {
    logger.error('Could not restore source file to disk', {
      target,
      error: err.message,
    });
    return null;
  }
}

/**
 * Resolve a usable path to a workbook's source file.
 * Falls back to the stored bytes when the path is gone, which is the normal
 * case on a serverless host after a cold start.
 */
async function resolveWorkbookFile(workbookId, storedPath) {
  if (storedPath && fs.existsSync(storedPath)) return storedPath;

  const { rows } = await pool.query(
    'SELECT file_data FROM workbook_uploads WHERE id = $1',
    [workbookId]
  );
  const buffer = rows[0] && rows[0].file_data;

  if (!buffer) {
    throw new Error(
      'The original upload is no longer available, so this KPI cannot be reprocessed. Upload the workbook again to change its thresholds.'
    );
  }

  logger.info('Restored workbook source file from database', { workbookId });
  return materialize(buffer, storedPath);
}

/** Persist the bytes of an upload so it can be reprocessed later. */
async function retainWorkbookFile(workbookId, filePath) {
  const buffer = readIfPresent(filePath);
  if (!buffer) return false;
  await pool.query('UPDATE workbook_uploads SET file_data = $2 WHERE id = $1', [
    workbookId,
    buffer,
  ]);
  return true;
}

module.exports = {
  resolveWorkbookFile,
  retainWorkbookFile,
  materialize,
  readIfPresent,
};
