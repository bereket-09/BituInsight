const fs = require('fs');
const path = require('path');
const reportService = require('../services/report.service');
const historyService = require('../services/history.service');
const { generateReportPptx } = require('../services/pptxExport.service');
const chartStorage = require('../services/chartStorage.service');
const pool = require('../db/pool');

function parseOptionsFromRequest(body) {
  return reportService.extractParseOptions(body);
}

async function previewFile(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const { workflowSlug } = req.body;
    if (!workflowSlug) {
      return res.status(400).json({ error: 'workflowSlug is required' });
    }

    const preview = await reportService.previewReportFile(workflowSlug, req.file.path);

    if (req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      fileName: req.file.originalname,
      fileSize: req.file.size,
      ...preview,
    });
  } catch (err) {
    next(err);
  }
}

async function uploadAndProcess(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { workflowSlug } = req.body;
    if (!workflowSlug) {
      return res.status(400).json({ error: 'workflowSlug is required' });
    }

    const parseOptions = parseOptionsFromRequest(req.body);
    const report = await reportService.createReport(req.user.id, workflowSlug, req.file);
    await reportService.processReportAsync(report.id, workflowSlug, req.file.path, parseOptions);

    res.status(202).json({
      message: 'Report upload accepted and processing started',
      reportId: report.id,
      status: 'pending',
    });
  } catch (err) {
    next(err);
  }
}

async function validateOnly(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { workflowSlug } = req.body;
    if (!workflowSlug) {
      return res.status(400).json({ error: 'workflowSlug is required' });
    }

    const parseOptions = parseOptionsFromRequest(req.body);
    const result = await reportService.validateReport(workflowSlug, req.file.path, parseOptions);

    if (req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getReport(req, res, next) {
  try {
    const report = await reportService.getReportById(req.params.id, req.user.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json({ report });
  } catch (err) {
    next(err);
  }
}

async function listReports(req, res, next) {
  try {
    const { page, limit, status, workflowSlug, grouped } = req.query;
    const useGrouped = grouped !== 'false';

    if (useGrouped) {
      const result = await historyService.listGroupedHistory(req.user.id, {
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 15,
        status,
        workflowSlug,
      });
      return res.json(result);
    }

    const result = await reportService.listReports(req.user.id, {
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 20,
      status,
      workflowSlug,
    });
    res.json({
      ...result,
      reports: result.reports.map(historyService.enrichReportListItem),
    });
  } catch (err) {
    next(err);
  }
}

async function sendToTeams(req, res, next) {
  try {
    const { webhookUrl } = req.body;
    const result = await reportService.sendReportToTeams(
      req.params.id,
      req.user.id,
      webhookUrl
    );
    res.json({ message: 'Report sent to Microsoft Teams', ...result });
  } catch (err) {
    err.status = err.message.includes('not found') ? 404 : 400;
    next(err);
  }
}

async function downloadChart(req, res, next) {
  try {
    const chart = await chartStorage.loadChartImage(
      req.params.chartId,
      req.params.id,
      req.user.id
    );

    if (!chart) {
      return res.status(404).json({ error: 'Chart not found' });
    }

    // Chart titles carry en/em dashes and other non-ASCII punctuation, which are
    // illegal in an HTTP header and make the response throw rather than download.
    const filename = `${(chart.title || 'chart')
      .normalize('NFKD')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 100) || 'chart'}.png`;

    // Stored bytes are the durable copy and are preferred everywhere.
    if (chart.image_data) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(chart.image_data);
    }

    // Charts generated before image storage existed still live on disk.
    if (chart.file_path && fs.existsSync(chart.file_path)) {
      return res.download(chart.file_path, filename);
    }

    return res.status(404).json({ error: 'Chart image is no longer available' });
  } catch (err) {
    next(err);
  }
}

async function downloadReport(req, res, next) {
  try {
    const report = await reportService.getReportById(req.params.id, req.user.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (report.status !== 'completed') {
      return res.status(400).json({ error: 'Report is not yet completed' });
    }

    const exportData = {
      id: report.id,
      workflow: report.workflow_name,
      status: report.status,
      summary: report.summary,
      metrics: report.metrics,
      reportData: report.report_data,
      charts: report.charts.map((c) => ({ id: c.id, title: c.title, type: c.chart_type })),
      generatedAt: report.completed_at,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report-${report.id}.json"`
    );
    res.send(JSON.stringify(exportData, null, 2));
  } catch (err) {
    next(err);
  }
}

async function getDashboard(req, res, next) {
  try {
    const stats = await reportService.getDashboardStats(req.user.id);
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

async function exportReportPptx(req, res, next) {
  try {
    const options = {
      threshold: req.body?.threshold,
      defaultThreshold: req.body?.defaultThreshold,
      theme: req.body?.theme === 'light' ? 'light' : 'dark',
    };
    const { buffer, fileName } = await generateReportPptx(
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
    if (err.message.includes('Report not found')) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
}

module.exports = {
  previewFile,
  uploadAndProcess,
  validateOnly,
  getReport,
  listReports,
  sendToTeams,
  downloadChart,
  downloadReport,
  exportReportPptx,
  getDashboard,
};
