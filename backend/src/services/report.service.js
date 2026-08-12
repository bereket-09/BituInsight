const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const config = require('../config');
const logger = require('../utils/logger');
const { processReport, validateReport, previewExcel } = require('./workflowEngine.service');
const { sendToTeams } = require('./teams.service');

async function getWorkflowIdBySlug(slug) {
  const result = await pool.query('SELECT id FROM kpi_workflows WHERE slug = $1', [slug]);
  if (result.rows.length === 0) throw new Error(`Workflow not found in database: ${slug}`);
  return result.rows[0].id;
}

async function createReport(userId, workflowSlug, fileInfo) {
  const workflowId = await getWorkflowIdBySlug(workflowSlug);
  const reportId = uuidv4();

  const fileResult = await pool.query(
    `INSERT INTO uploaded_files (id, user_id, workflow_id, original_filename, stored_path, file_size, mime_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      uuidv4(),
      userId,
      workflowId,
      fileInfo.originalname,
      fileInfo.path,
      fileInfo.size,
      fileInfo.mimetype,
    ]
  );

  const uploadedFile = fileResult.rows[0];

  const reportResult = await pool.query(
    `INSERT INTO processed_reports (id, user_id, workflow_id, uploaded_file_id, status)
     VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
    [reportId, userId, workflowId, uploadedFile.id]
  );

  return reportResult.rows[0];
}

async function updateReportStatus(reportId, status, extra = {}) {
  const sets = ['status = $2', 'updated_at = NOW()'];
  const values = [reportId, status];
  let idx = 3;

  if (extra.validation_errors !== undefined) {
    sets.push(`validation_errors = $${idx++}`);
    values.push(JSON.stringify(extra.validation_errors));
  }
  if (extra.summary !== undefined) {
    sets.push(`summary = $${idx++}`);
    values.push(JSON.stringify(extra.summary));
  }
  if (extra.report_data !== undefined) {
    sets.push(`report_data = $${idx++}`);
    values.push(JSON.stringify(extra.report_data));
  }
  if (extra.error_message !== undefined) {
    sets.push(`error_message = $${idx++}`);
    values.push(extra.error_message);
  }
  if (status === 'completed' || status === 'failed') {
    sets.push('completed_at = NOW()');
  }

  await pool.query(
    `UPDATE processed_reports SET ${sets.join(', ')} WHERE id = $1`,
    values
  );
}

async function saveMetrics(reportId, metrics) {
  const entries = Object.entries(metrics);
  for (const [key, value] of entries) {
    await pool.query(
      `INSERT INTO generated_metrics (report_id, metric_key, metric_value, metric_label, metric_type)
       VALUES ($1, $2, $3, $4, 'number')`,
      [reportId, key, typeof value === 'number' ? value : null, key.replace(/([A-Z])/g, ' $1').trim()]
    );
  }
}

async function saveCharts(reportId, charts) {
  const saved = [];
  for (const chart of charts) {
    const result = await pool.query(
      `INSERT INTO generated_charts (report_id, chart_type, title, file_path, config)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [reportId, chart.chartType, chart.title, chart.filePath, JSON.stringify(chart.config)]
    );
    saved.push(result.rows[0]);
  }
  return saved;
}

function extractParseOptions(body = {}) {
  return {
    sheetName: body.sheetName || undefined,
    sheetIndex: body.sheetIndex,
    headerRowIndex: body.headerRowIndex,
    dataStartRowIndex: body.dataStartRowIndex,
    autoDetect: body.autoDetect !== 'false' && body.autoDetect !== false,
  };
}

async function previewReportFile(workflowSlug, filePath) {
  return previewExcel(filePath, workflowSlug);
}

async function processReportAsync(reportId, workflowSlug, filePath, parseOptions = {}) {
  setImmediate(async () => {
    try {
      await updateReportStatus(reportId, 'validating');

      const validation = await validateReport(workflowSlug, filePath, parseOptions);
      if (!validation.valid) {
        await updateReportStatus(reportId, 'failed', {
          validation_errors: validation.errors,
          error_message: 'Validation failed',
        });
        return;
      }

      await updateReportStatus(reportId, 'processing');
      const workflowContext = parseOptions.workflowContext || {};
      const result = await processReport(workflowSlug, filePath, reportId, parseOptions, workflowContext);

      if (!result.success) {
        await updateReportStatus(reportId, 'failed', {
          validation_errors: result.validationErrors,
          error_message: 'Processing failed',
        });
        return;
      }

      await saveMetrics(reportId, result.metrics);
      const savedCharts = await saveCharts(reportId, result.charts);

      const reportJsonPath = path.join(config.reportsDir, `${reportId}.json`);
      if (!fs.existsSync(config.reportsDir)) fs.mkdirSync(config.reportsDir, { recursive: true });
      fs.writeFileSync(
        reportJsonPath,
        JSON.stringify({ summary: result.summary, reportData: result.reportData }, null, 2)
      );

      await updateReportStatus(reportId, 'completed', {
        summary: result.summary,
        report_data: { ...result.reportData, charts: savedCharts.map((c) => ({ id: c.id, title: c.title, type: c.chart_type })) },
      });

      logger.info('Report processing completed', { reportId });
    } catch (err) {
      logger.error('Report processing failed', { reportId, error: err.message });
      await updateReportStatus(reportId, 'failed', { error_message: err.message });
    }
  });
}

async function getReportById(reportId, userId) {
  const result = await pool.query(
    `SELECT pr.*, kw.slug as workflow_slug, kw.name as workflow_name,
            uf.original_filename, uf.file_size
     FROM processed_reports pr
     JOIN kpi_workflows kw ON pr.workflow_id = kw.id
     LEFT JOIN uploaded_files uf ON pr.uploaded_file_id = uf.id
     WHERE pr.id = $1 AND pr.user_id = $2`,
    [reportId, userId]
  );
  if (result.rows.length === 0) return null;

  const report = result.rows[0];

  const metricsResult = await pool.query(
    'SELECT * FROM generated_metrics WHERE report_id = $1 ORDER BY metric_key',
    [reportId]
  );

  const chartsResult = await pool.query(
    'SELECT * FROM generated_charts WHERE report_id = $1 ORDER BY created_at',
    [reportId]
  );

  const teamsResult = await pool.query(
    'SELECT * FROM teams_delivery_logs WHERE report_id = $1 ORDER BY created_at DESC LIMIT 5',
    [reportId]
  );

  return {
    ...report,
    metrics: metricsResult.rows,
    charts: chartsResult.rows,
    teamsDeliveries: teamsResult.rows,
  };
}

async function listReports(userId, { page = 1, limit = 20, status, workflowSlug } = {}) {
  const offset = (page - 1) * limit;
  const conditions = ['pr.user_id = $1'];
  const values = [userId];
  let idx = 2;

  if (status) {
    conditions.push(`pr.status = $${idx++}`);
    values.push(status);
  }
  if (workflowSlug) {
    conditions.push(`kw.slug = $${idx++}`);
    values.push(workflowSlug);
  }

  const where = conditions.join(' AND ');
  values.push(limit, offset);

  const result = await pool.query(
    `SELECT pr.*, kw.slug as workflow_slug, kw.name as workflow_name,
            uf.original_filename
     FROM processed_reports pr
     JOIN kpi_workflows kw ON pr.workflow_id = kw.id
     LEFT JOIN uploaded_files uf ON pr.uploaded_file_id = uf.id
     WHERE ${where}
     ORDER BY pr.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    values
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM processed_reports pr
     JOIN kpi_workflows kw ON pr.workflow_id = kw.id
     WHERE ${where}`,
    values.slice(0, -2)
  );

  return {
    reports: result.rows,
    total: parseInt(countResult.rows[0].count, 10),
    page,
    limit,
  };
}

async function sendReportToTeams(reportId, userId, webhookUrl) {
  const report = await getReportById(reportId, userId);
  if (!report) throw new Error('Report not found');
  if (report.status !== 'completed') throw new Error('Report is not completed');

  const workflow = require('../kpi-workflows/registry').getWorkflow(report.workflow_slug);
  const calculated = report.report_data?.calculated || report.report_data;
  const summary = report.summary;
  const message = workflow.formatter.formatTeamsMessage(
    summary,
    calculated || { metrics: {}, anomalies: [] },
    reportId
  );

  const chartPaths = report.charts.map((c) => c.file_path);

  const logId = uuidv4();
  await pool.query(
    `INSERT INTO teams_delivery_logs (id, report_id, user_id, webhook_url, status)
     VALUES ($1, $2, $3, $4, 'pending')`,
    [logId, reportId, userId, webhookUrl || null]
  );

  try {
    const result = await sendToTeams(webhookUrl, message, chartPaths);
    await pool.query(
      `UPDATE teams_delivery_logs SET status = 'sent', response_body = $1, sent_at = NOW() WHERE id = $2`,
      [result.responseBody, logId]
    );
    return { success: true, logId };
  } catch (err) {
    await pool.query(
      `UPDATE teams_delivery_logs SET status = 'failed', error_message = $1 WHERE id = $2`,
      [err.message, logId]
    );
    throw err;
  }
}

async function getDashboardStats(userId) {
  const stats = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'completed') as completed,
       COUNT(*) FILTER (WHERE status = 'failed') as failed,
       COUNT(*) FILTER (WHERE status IN ('pending','validating','processing')) as in_progress,
       COUNT(*) as total
     FROM processed_reports WHERE user_id = $1`,
    [userId]
  );

  const workbookStats = await pool.query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'completed') as completed,
       COUNT(*) FILTER (WHERE status = 'failed') as failed,
       COUNT(*) FILTER (WHERE status IN ('pending','processing')) as in_progress
     FROM workbook_uploads WHERE user_id = $1`,
    [userId]
  );

  const kpiInWorkbooks = await pool.query(
    `SELECT COUNT(*)::int as count
     FROM processed_reports WHERE user_id = $1 AND workbook_id IS NOT NULL`,
    [userId]
  );

  const recent = await pool.query(
    `SELECT pr.id, pr.status, pr.created_at, uf.original_filename, pr.workbook_id,
            pr.kpi_name, kw.name as workflow_name, kw.slug as workflow_slug
     FROM processed_reports pr
     JOIN kpi_workflows kw ON pr.workflow_id = kw.id
     LEFT JOIN uploaded_files uf ON pr.uploaded_file_id = uf.id
     WHERE pr.user_id = $1 AND pr.workbook_id IS NULL
     ORDER BY pr.created_at DESC LIMIT 5`,
    [userId]
  );

  const recentWorkbooks = await pool.query(
    `SELECT wu.id, wu.original_filename, wu.status, wu.created_at,
            COUNT(pr.id)::int as kpi_count,
            COUNT(pr.id) FILTER (WHERE pr.status = 'completed')::int as completed_kpis
     FROM workbook_uploads wu
     LEFT JOIN processed_reports pr ON pr.workbook_id = wu.id
     WHERE wu.user_id = $1
     GROUP BY wu.id
     ORDER BY wu.created_at DESC LIMIT 5`,
    [userId]
  );

  const workflowUsage = await pool.query(
    `SELECT kw.slug, kw.name, COUNT(pr.id) as count
     FROM processed_reports pr
     JOIN kpi_workflows kw ON pr.workflow_id = kw.id
     WHERE pr.user_id = $1
     GROUP BY kw.slug, kw.name
     ORDER BY count DESC`,
    [userId]
  );

  return {
    stats: stats.rows[0],
    workbookStats: workbookStats.rows[0],
    kpiInWorkbooks: kpiInWorkbooks.rows[0]?.count || 0,
    recentReports: recent.rows,
    recentWorkbooks: recentWorkbooks.rows,
    workflowUsage: workflowUsage.rows,
  };
}

module.exports = {
  createReport,
  processReportAsync,
  getReportById,
  listReports,
  sendReportToTeams,
  getDashboardStats,
  validateReport: (slug, path, opts) => validateReport(slug, path, opts),
  previewReportFile,
  extractParseOptions,
};
