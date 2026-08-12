const pool = require('../db/pool');
const logger = require('../utils/logger');

/**
 * Persistence for generated chart images.
 *
 * Images live in Postgres because the deployment target has no durable filesystem.
 * They are small (~70 KB each, ~4 per report) and cascade-delete with their report,
 * so they cost far less than the operational weight of a separate object store.
 *
 * Every generation replaces the previous set for that report rather than adding to
 * it, so re-processing the same report cannot accumulate orphaned blobs.
 */

/** Charts older than this lose their image bytes; the row and its metadata stay. */
const DEFAULT_RETENTION_DAYS = parseInt(process.env.CHART_RETENTION_DAYS, 10) || 90;

/**
 * Replace the stored charts for a report in one transaction.
 * Returns the saved rows without their blobs.
 */
async function replaceReportCharts(reportId, charts) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const previous = await client.query(
      'DELETE FROM generated_charts WHERE report_id = $1 RETURNING id',
      [reportId]
    );

    const saved = [];
    for (const chart of charts) {
      const buffer = chart.buffer || null;
      const result = await client.query(
        `INSERT INTO generated_charts
           (report_id, chart_type, title, file_path, config, image_data, image_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, report_id, chart_type, title, file_path, config, image_bytes, created_at`,
        [
          reportId,
          chart.chartType,
          chart.title,
          chart.filePath,
          JSON.stringify(chart.config),
          buffer,
          buffer ? buffer.length : null,
        ]
      );
      saved.push(result.rows[0]);
    }

    await client.query('COMMIT');

    if (previous.rowCount > 0) {
      logger.info('Replaced previously stored charts', {
        reportId,
        removed: previous.rowCount,
        stored: saved.length,
      });
    }

    return saved;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Fetch one chart's image bytes, scoped to the owning user. */
async function loadChartImage(chartId, reportId, userId) {
  const { rows } = await pool.query(
    `SELECT gc.id, gc.title, gc.file_path, gc.image_data
     FROM generated_charts gc
     JOIN processed_reports pr ON gc.report_id = pr.id
     WHERE gc.id = $1 AND pr.id = $2 AND pr.user_id = $3`,
    [chartId, reportId, userId]
  );
  return rows[0] || null;
}

/** All stored images for a report, keyed by chart id. Used by the PPTX exporter. */
async function loadReportChartImages(reportId) {
  const { rows } = await pool.query(
    `SELECT id, title, chart_type, image_data, file_path
     FROM generated_charts
     WHERE report_id = $1 AND image_data IS NOT NULL
     ORDER BY created_at`,
    [reportId]
  );
  return rows;
}

/**
 * Drop image bytes for charts past the retention window, keeping the rows so
 * historical reports still list what was generated. Called opportunistically
 * after a store, so the database self-maintains without a scheduler.
 */
async function pruneExpiredChartImages(retentionDays = DEFAULT_RETENTION_DAYS) {
  try {
    const { rowCount } = await pool.query(
      `UPDATE generated_charts
       SET image_data = NULL, image_bytes = NULL
       WHERE image_data IS NOT NULL
         AND created_at < NOW() - ($1 || ' days')::INTERVAL`,
      [String(retentionDays)]
    );
    if (rowCount > 0) {
      logger.info('Pruned expired chart images', { rowCount, retentionDays });
    }
    return rowCount;
  } catch (err) {
    // Housekeeping must never fail the request that triggered it.
    logger.warn('Chart image prune failed', { error: err.message });
    return 0;
  }
}

/** Total bytes currently held, for monitoring growth. */
async function chartStorageStats() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS charts,
            COUNT(image_data)::int AS with_image,
            COALESCE(SUM(image_bytes), 0)::bigint AS total_bytes
     FROM generated_charts`
  );
  return rows[0];
}

module.exports = {
  replaceReportCharts,
  loadChartImage,
  loadReportChartImages,
  pruneExpiredChartImages,
  chartStorageStats,
  DEFAULT_RETENTION_DAYS,
};
