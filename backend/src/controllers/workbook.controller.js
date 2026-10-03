const fs = require('fs');
const cmmWorkbook = require('../services/cmmWorkbook.service');
const { generateWorkbookPptx } = require('../services/pptxExport.service');
const { countCmmDataSheets } = require('../services/excelParser.service');
const { findWorkflowForWorkbook } = require('../kpi-workflows/registry');

async function previewWorkbook(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const dataSheetCount = await countCmmDataSheets(req.file.path);
    const preview = await cmmWorkbook.previewWorkbook(req.file.path);
    const suggestedWorkflow = findWorkflowForWorkbook(preview.sheetNames || []);

    if (req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      fileName: req.file.originalname,
      fileSize: req.file.size,
      // Only steer someone into workbook mode when it can do something with the
      // file, and never when a dedicated workflow was built for this export.
      suggestWorkbookMode: dataSheetCount >= 2 && preview.validCount > 0 && !suggestedWorkflow,
      suggestedWorkflow,
      dataSheetCount,
      ...preview,
    });
  } catch (err) {
    next(err);
  }
}

async function uploadWorkbook(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const thresholdOptions = {
      defaultThreshold: req.body.defaultThreshold,
      kpiThresholds: req.body.kpiThresholds,
    };
    const { workbook, preview } = await cmmWorkbook.createWorkbookUpload(
      req.user.id,
      req.file,
      thresholdOptions
    );
    await cmmWorkbook.processWorkbookAsync(
      workbook.id,
      req.user.id,
      req.file.path,
      req.file,
      cmmWorkbook.parseWorkbookThresholds(thresholdOptions)
    );

    res.status(202).json({
      message: 'CMM workbook accepted — processing all Data sheets',
      workbookId: workbook.id,
      status: 'pending',
      preview: {
        dataSheetCount: preview.dataSheetCount,
        validCount: preview.validCount,
        invalidCount: preview.invalidCount,
        kpis: preview.kpis,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getWorkbook(req, res, next) {
  try {
    const workbook = await cmmWorkbook.getWorkbookById(req.params.id, req.user.id);
    if (!workbook) return res.status(404).json({ error: 'Workbook not found' });
    res.json({ workbook });
  } catch (err) {
    next(err);
  }
}

async function listWorkbooks(req, res, next) {
  try {
    const { page, limit } = req.query;
    const result = await cmmWorkbook.listWorkbooks(req.user.id, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function updateKpiThreshold(req, res, next) {
  try {
    const { threshold } = req.body;
    if (threshold == null) {
      return res.status(400).json({ error: 'threshold is required' });
    }
    const result = await cmmWorkbook.updateKpiThreshold(
      req.params.workbookId,
      req.params.reportId,
      req.user.id,
      threshold
    );
    res.json({ message: 'KPI reprocessed with new threshold', ...result });
  } catch (err) {
    err.status = err.message.includes('not found') ? 404 : 400;
    next(err);
  }
}

async function exportWorkbookPptx(req, res, next) {
  try {
    const options = {
      reportIds: req.body?.reportIds,
      thresholds: req.body?.thresholds,
      defaultThreshold: req.body?.defaultThreshold,
      theme: req.body?.theme === 'light' ? 'light' : 'dark',
    };
    const { buffer, fileName } = await generateWorkbookPptx(
      req.params.id,
      req.user.id,
      options
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    if (err.message === 'Workbook not found') {
      return res.status(404).json({ error: err.message });
    }
    if (err.message.includes('No completed KPI')) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
}

module.exports = {
  previewWorkbook,
  uploadWorkbook,
  getWorkbook,
  listWorkbooks,
  updateKpiThreshold,
  exportWorkbookPptx,
};
