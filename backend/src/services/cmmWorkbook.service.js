const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');
const pool = require('../db/pool');
const config = require('../config');
const logger = require('../utils/logger');
const { readSheetRows } = require('./excelParser.service');
const { validateStructure } = require('../kpi-workflows/telecom-metric/validator');
const { TELECOM_METRIC_SLUG, validateReport, processReport } = require('./workflowEngine.service');
const { DEFAULT_THRESHOLD_PERCENT, isUnset } = require('../kpi-workflows/telecom-metric/constants');
const chartStorage = require('./chartStorage.service');
const sourceFile = require('./sourceFile.service');

const CMM_HEADER_ROW = 0;
const CMM_DATA_START_ROW = 2;

function clampThreshold(value) {
  // Zero is a valid target; the floor is 0, not 1. Unset is checked first because
  // Number(null) and Number('') are both 0 and would look like a deliberate zero.
  if (isUnset(value)) return DEFAULT_THRESHOLD_PERCENT;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_THRESHOLD_PERCENT;
  return Math.min(100, Math.max(0, Math.round(n * 10) / 10));
}

function parseWorkbookThresholds(options = {}) {
  const defaultThreshold = clampThreshold(
    options.defaultThreshold ?? DEFAULT_THRESHOLD_PERCENT
  );
  let kpiThresholds = {};
  if (options.kpiThresholds) {
    try {
      const raw =
        typeof options.kpiThresholds === 'string'
          ? JSON.parse(options.kpiThresholds)
          : options.kpiThresholds;
      for (const [key, val] of Object.entries(raw || {})) {
        kpiThresholds[key] = clampThreshold(val);
      }
    } catch {
      /* ignore invalid JSON */
    }
  }
  return { defaultThreshold, kpiThresholds };
}

function resolveKpiThreshold(kpiMeta, thresholdConfig) {
  const { defaultThreshold, kpiThresholds } = thresholdConfig;
  return (
    kpiThresholds[kpiMeta.kpiName] ??
    kpiThresholds[kpiMeta.sheetName] ??
    kpiMeta.threshold ??
    defaultThreshold
  );
}

function isDataSheet(sheetName) {
  return /^data\s/i.test(String(sheetName || '').trim());
}

function kpiNameFromSheet(sheetName) {
  const name = String(sheetName || '').trim();
  const match = name.match(/^data\s+for\s+(.+)$/i);
  return match ? match[1].trim() : name.replace(/^data\s+/i, '').trim();
}

function slugFromKpi(kpiName) {
  return kpiName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function loadWorkbookSheets(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook.worksheets.map((ws, index) => ({
    index,
    name: ws.name,
    worksheet: ws,
    rowCount: ws.rowCount,
  }));
}

function analyzeSheet(worksheet, sheetIndex = 0) {
  const allRows = readSheetRows(worksheet, 500);
  const headers = (allRows[CMM_HEADER_ROW] || []).map((h) => String(h ?? '').trim());
  const metricColumnName = headers[2] || '';
  const kpiName = kpiNameFromSheet(worksheet.name);
  const dataRows = allRows
    .slice(CMM_DATA_START_ROW)
    .filter((row) => row && row.some((c) => c !== null && c !== undefined && c !== ''));

  const validation = validateStructure(headers, dataRows, metricColumnName);

  let granularity = 'unknown';
  if (dataRows.length >= 2) {
    const d1 = new Date(dataRows[0][0]);
    const d2 = new Date(dataRows[1][0]);
    if (!isNaN(d1) && !isNaN(d2)) {
      const diffH = Math.abs(d2 - d1) / 3600000;
      if (diffH <= 0.5) granularity = '15-min';
      else if (diffH <= 25) granularity = 'daily';
      else granularity = 'other';
    }
  }

  return {
    sheetName: worksheet.name,
    sheetIndex,
    kpiName,
    kpiSlug: slugFromKpi(kpiName),
    metricColumnName,
    valid: validation.valid,
    errors: validation.errors || [],
    rowCount: validation.filteredRowCount ?? dataRows.length,
    granularity,
    headers,
  };
}

async function previewWorkbook(filePath) {
  const sheetsMeta = await loadWorkbookSheets(filePath);
  const allSheets = sheetsMeta.map(({ worksheet, index }) => analyzeSheet(worksheet, index));
  const dataSheets = allSheets.filter((s) => isDataSheet(s.sheetName));
  const ignoredSheets = allSheets
    .filter((s) => !isDataSheet(s.sheetName))
    .map((s) => s.sheetName);

  const validKpis = dataSheets.filter((s) => s.valid);
  const invalidKpis = dataSheets.filter((s) => !s.valid);

  return {
    fileName: path.basename(filePath),
    totalSheets: allSheets.length,
    dataSheetCount: dataSheets.length,
    ignoredSheetCount: ignoredSheets.length,
    validCount: validKpis.length,
    invalidCount: invalidKpis.length,
    kpis: dataSheets,
    validKpis,
    invalidKpis,
    ignoredSheets: ignoredSheets.slice(0, 30),
  };
}

async function getWorkflowId() {
  const result = await pool.query('SELECT id FROM kpi_workflows WHERE slug = $1', [TELECOM_METRIC_SLUG]);
  if (result.rows.length === 0) throw new Error(`Workflow not found: ${TELECOM_METRIC_SLUG}`);
  return result.rows[0].id;
}

async function createWorkbookUpload(userId, fileInfo, thresholdOptions = {}) {
  const workbookId = uuidv4();
  const preview = await previewWorkbook(fileInfo.path);
  const thresholdConfig = parseWorkbookThresholds(thresholdOptions);

  const result = await pool.query(
    `INSERT INTO workbook_uploads (
       id, user_id, original_filename, stored_path, file_size,
       sheet_count, kpi_count, status, summary
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
     RETURNING *`,
    [
      workbookId,
      userId,
      fileInfo.originalname,
      fileInfo.path,
      fileInfo.size,
      preview.totalSheets,
      preview.validCount,
      JSON.stringify({
        preview,
        validCount: preview.validCount,
        invalidCount: preview.invalidCount,
        defaultThreshold: thresholdConfig.defaultThreshold,
        kpiThresholds: thresholdConfig.kpiThresholds,
      }),
    ]
  );

  const workbook = result.rows[0];

  // Keep the bytes so a later threshold change does not depend on /tmp still
  // holding the upload — on a serverless host it will not.
  await sourceFile.retainWorkbookFile(workbook.id, fileInfo.path);

  return { workbook, preview, thresholdConfig };
}

async function createChildReport(userId, workflowId, workbookId, fileInfo, kpiMeta) {
  const reportId = uuidv4();

  const fileResult = await pool.query(
    `INSERT INTO uploaded_files (id, user_id, workflow_id, original_filename, stored_path, file_size, mime_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      uuidv4(),
      userId,
      workflowId,
      `${fileInfo.originalname} — ${kpiMeta.sheetName}`,
      fileInfo.path,
      fileInfo.size,
      fileInfo.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]
  );

  const reportResult = await pool.query(
    `INSERT INTO processed_reports (
       id, user_id, workflow_id, uploaded_file_id, status,
       workbook_id, sheet_name, kpi_name
     ) VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7) RETURNING *`,
    [
      reportId,
      userId,
      workflowId,
      fileResult.rows[0].id,
      workbookId,
      kpiMeta.sheetName,
      kpiMeta.kpiName,
    ]
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

  await pool.query(`UPDATE processed_reports SET ${sets.join(', ')} WHERE id = $1`, values);
}

async function saveMetrics(reportId, metrics) {
  for (const [key, value] of Object.entries(metrics)) {
    await pool.query(
      `INSERT INTO generated_metrics (report_id, metric_key, metric_value, metric_label, metric_type)
       VALUES ($1, $2, $3, $4, 'number')`,
      [reportId, key, typeof value === 'number' ? value : null, key.replace(/([A-Z])/g, ' $1').trim()]
    );
  }
}

/**
 * Persist a workbook KPI's charts through the shared storage layer so the image
 * bytes are kept, not just a filesystem path that will not survive the request.
 * Replaces any previous set for the report.
 */
async function saveCharts(reportId, charts) {
  return chartStorage.replaceReportCharts(reportId, charts);
}

async function processSingleKpiReport(reportId, filePath, kpiMeta, thresholdConfig = {}) {
  const threshold = resolveKpiThreshold(kpiMeta, thresholdConfig);
  const parseOptions = {
    sheetName: kpiMeta.sheetName,
    headerRowIndex: CMM_HEADER_ROW,
    dataStartRowIndex: CMM_DATA_START_ROW,
    autoDetect: false,
    metricColumnName: kpiMeta.metricColumnName,
  };
  const workflowContext = {
    kpiName: kpiMeta.kpiName,
    sheetName: kpiMeta.sheetName,
    metricColumnName: kpiMeta.metricColumnName,
    threshold,
  };

  try {
    await updateReportStatus(reportId, 'validating');
    const validation = await validateReport(TELECOM_METRIC_SLUG, filePath, parseOptions, workflowContext);
    if (!validation.valid) {
      await updateReportStatus(reportId, 'failed', {
        validation_errors: validation.errors,
        error_message: 'Validation failed',
      });
      return { success: false, errors: validation.errors };
    }

    await updateReportStatus(reportId, 'processing');
    const result = await processReport(
      TELECOM_METRIC_SLUG,
      filePath,
      reportId,
      parseOptions,
      workflowContext
    );

    if (!result.success) {
      await updateReportStatus(reportId, 'failed', {
        validation_errors: result.validationErrors,
        error_message: 'Processing failed',
      });
      return { success: false };
    }

    await saveMetrics(reportId, result.metrics);
    const savedCharts = await saveCharts(reportId, result.charts);

    const reportJsonPath = path.join(config.reportsDir, `${reportId}.json`);
    if (!fs.existsSync(config.reportsDir)) fs.mkdirSync(config.reportsDir, { recursive: true });
    fs.writeFileSync(
      reportJsonPath,
      JSON.stringify({ summary: result.summary, reportData: result.reportData }, null, 2)
    );

    const summaryWithThreshold = { ...result.summary, threshold };

    await updateReportStatus(reportId, 'completed', {
      summary: summaryWithThreshold,
      report_data: {
        ...result.reportData,
        calculated: { ...result.reportData.calculated, threshold },
        charts: savedCharts.map((c) => ({ id: c.id, title: c.title, type: c.chart_type })),
      },
    });

    return { success: true };
  } catch (err) {
    logger.error('KPI report failed', { reportId, kpi: kpiMeta.kpiName, error: err.message });
    await updateReportStatus(reportId, 'failed', { error_message: err.message });
    return { success: false, error: err.message };
  }
}

async function runWorkbookPipeline(workbookId, userId, filePath, fileInfo, thresholdConfig = {}) {
  try {
    await pool.query(
      `UPDATE workbook_uploads SET status = 'processing' WHERE id = $1`,
      [workbookId]
    );

    const wbRow = await pool.query(`SELECT summary FROM workbook_uploads WHERE id = $1`, [
      workbookId,
    ]);
    const wbSummary = wbRow.rows[0]?.summary || {};
    const mergedThresholds = parseWorkbookThresholds({
      defaultThreshold: wbSummary.defaultThreshold ?? thresholdConfig.defaultThreshold,
      kpiThresholds: { ...thresholdConfig.kpiThresholds, ...wbSummary.kpiThresholds },
    });

    const preview = await previewWorkbook(filePath);
    const workflowId = await getWorkflowId();
    const toProcess = preview.validKpis;

    const childReports = [];
    for (const kpi of toProcess) {
      const report = await createChildReport(userId, workflowId, workbookId, fileInfo, kpi);
      childReports.push({ report, kpi });
    }

    let completed = 0;
    let failed = 0;

    for (const { report, kpi } of childReports) {
      const outcome = await processSingleKpiReport(
        report.id,
        filePath,
        kpi,
        mergedThresholds
      );
      if (outcome.success) completed++;
      else failed++;
    }

    const finalStatus = failed === toProcess.length ? 'failed' : 'completed';
    await pool.query(
      `UPDATE workbook_uploads SET
         status = $2,
         kpi_count = $3,
         summary = $4,
         completed_at = NOW()
       WHERE id = $1`,
      [
        workbookId,
        finalStatus,
        completed,
        JSON.stringify({
          preview,
          completed,
          failed,
          total: toProcess.length,
          defaultThreshold: mergedThresholds.defaultThreshold,
          kpiThresholds: mergedThresholds.kpiThresholds,
        }),
      ]
    );

    logger.info('Workbook processing finished', { workbookId, completed, failed });
  } catch (err) {
    logger.error('Workbook processing failed', { workbookId, error: err.message });
    await pool.query(
      `UPDATE workbook_uploads SET status = 'failed', summary = $2, completed_at = NOW() WHERE id = $1`,
      [workbookId, JSON.stringify({ error: err.message })]
    );
  }
}

/**
 * Same constraint as single reports: a serverless function is frozen once it
 * responds, so deferring this work would strand the workbook mid-processing.
 * Runs inline there, in the background on a long-lived server.
 *
 * A workbook fans out to one full KPI pipeline per sheet, so a large one can
 * approach the platform's function time limit — failing loudly beats a workbook
 * that silently never finishes.
 */
async function processWorkbookAsync(workbookId, userId, filePath, fileInfo, thresholdConfig = {}) {
  if (config.processInline) {
    await runWorkbookPipeline(workbookId, userId, filePath, fileInfo, thresholdConfig);
    return;
  }
  setImmediate(() =>
    runWorkbookPipeline(workbookId, userId, filePath, fileInfo, thresholdConfig)
  );
}

async function getWorkbookById(workbookId, userId) {
  const wbResult = await pool.query(
    `SELECT * FROM workbook_uploads WHERE id = $1 AND user_id = $2`,
    [workbookId, userId]
  );
  if (wbResult.rows.length === 0) return null;

  const workbook = wbResult.rows[0];
  const reportsResult = await pool.query(
    `SELECT pr.id, pr.status, pr.sheet_name, pr.kpi_name, pr.summary, pr.error_message,
            pr.validation_errors, pr.created_at, pr.completed_at,
            kw.slug as workflow_slug
     FROM processed_reports pr
     JOIN kpi_workflows kw ON pr.workflow_id = kw.id
     WHERE pr.workbook_id = $1 AND pr.user_id = $2
     ORDER BY pr.sheet_name`,
    [workbookId, userId]
  );

  const summary = workbook.summary || {};
  const preview = summary.preview || {};

  const thresholdConfig = parseWorkbookThresholds({
    defaultThreshold: summary.defaultThreshold,
    kpiThresholds: summary.kpiThresholds,
  });

  return {
    ...workbook,
    defaultThreshold: thresholdConfig.defaultThreshold,
    kpiThresholds: thresholdConfig.kpiThresholds,
    kpis: reportsResult.rows.map((r) => ({
      reportId: r.id,
      sheetName: r.sheet_name,
      kpiName: r.kpi_name,
      status: r.status,
      errorMessage: r.error_message,
      validationErrors: r.validation_errors,
      summary: r.summary,
      threshold:
        r.summary?.threshold ??
        resolveKpiThreshold(
          { kpiName: r.kpi_name, sheetName: r.sheet_name },
          thresholdConfig
        ),
      completedAt: r.completed_at,
      listSummary: buildKpiListSummary(r),
    })),
    preview,
    stats: {
      total: reportsResult.rows.length,
      completed: reportsResult.rows.filter((r) => r.status === 'completed').length,
      failed: reportsResult.rows.filter((r) => r.status === 'failed').length,
      inProgress: reportsResult.rows.filter((r) =>
        ['pending', 'validating', 'processing'].includes(r.status)
      ).length,
    },
  };
}

function buildKpiListSummary(report) {
  const summary = report.summary || {};
  const highlights = summary.highlights || [];
  const find = (label) => highlights.find((h) => h.label === label)?.value;
  return {
    average: find('Average'),
    latest: find('Latest'),
    peak: find('Peak'),
    granularity: summary.timeContext?.granularity,
    span: summary.timeContext?.span,
  };
}

async function listWorkbooks(userId, { page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const result = await pool.query(
    `SELECT * FROM workbook_uploads
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM workbook_uploads WHERE user_id = $1`,
    [userId]
  );
  return {
    workbooks: result.rows,
    total: parseInt(countResult.rows[0].count, 10),
    page,
    limit,
  };
}

async function updateKpiThreshold(workbookId, reportId, userId, threshold) {
  const wbResult = await pool.query(
    `SELECT * FROM workbook_uploads WHERE id = $1 AND user_id = $2`,
    [workbookId, userId]
  );
  if (wbResult.rows.length === 0) throw new Error('Workbook not found');

  const reportResult = await pool.query(
    `SELECT * FROM processed_reports WHERE id = $1 AND workbook_id = $2 AND user_id = $3`,
    [reportId, workbookId, userId]
  );
  if (reportResult.rows.length === 0) throw new Error('KPI report not found');

  const wb = wbResult.rows[0];
  const report = reportResult.rows[0];
  const clamped = clampThreshold(threshold);
  const wbSummary = wb.summary || {};
  const kpiThresholds = { ...(wbSummary.kpiThresholds || {}), [report.kpi_name]: clamped };

  await pool.query(
    `UPDATE workbook_uploads SET summary = $2 WHERE id = $1`,
    [
      workbookId,
      JSON.stringify({
        ...wbSummary,
        kpiThresholds,
      }),
    ]
  );

  // The upload directory does not persist on a serverless host, so recover the
  // file from its stored bytes when the path no longer resolves.
  const sourcePath = await sourceFile.resolveWorkbookFile(workbookId, wb.stored_path);

  const kpiMeta = {
    sheetName: report.sheet_name,
    kpiName: report.kpi_name,
    metricColumnName: wbSummary.preview?.kpis?.find((k) => k.kpiName === report.kpi_name)
      ?.metricColumnName,
    threshold: clamped,
  };

  if (!kpiMeta.metricColumnName) {
    const preview = await previewWorkbook(sourcePath);
    const found = preview.kpis.find((k) => k.kpiName === report.kpi_name);
    kpiMeta.metricColumnName = found?.metricColumnName || report.kpi_name;
  }

  await pool.query(`DELETE FROM generated_metrics WHERE report_id = $1`, [reportId]);
  await pool.query(`DELETE FROM generated_charts WHERE report_id = $1`, [reportId]);

  const thresholdConfig = parseWorkbookThresholds({
    defaultThreshold: wbSummary.defaultThreshold,
    kpiThresholds,
  });

  const outcome = await processSingleKpiReport(
    reportId,
    sourcePath,
    kpiMeta,
    thresholdConfig
  );

  return { success: outcome.success, threshold: clamped };
}

module.exports = {
  isDataSheet,
  kpiNameFromSheet,
  previewWorkbook,
  createWorkbookUpload,
  processWorkbookAsync,
  getWorkbookById,
  listWorkbooks,
  updateKpiThreshold,
  parseWorkbookThresholds,
  clampThreshold,
};
