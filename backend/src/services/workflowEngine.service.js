const { getWorkflow } = require('../kpi-workflows/registry');
const { parseExcelFile } = require('./excelParser.service');
const { generateAllCharts } = require('./chart.service');
const { analyze } = require('../analytics');
const { generateNarrative } = require('./llmInsight.service');
const logger = require('../utils/logger');

const TELECOM_METRIC_SLUG = 'telecom-metric';

/**
 * Per-workflow hints for the analytics core: which series field carries the value,
 * how to label it, and which sub-streams to compare against each other.
 */
const ANALYTICS_PROFILES = {
  'traffic-volume': {
    unit: '',
    streams: [
      { key: 'volume4g', label: '4G' },
      { key: 'volume2g3g', label: '2G+3G' },
    ],
  },
  'cmg-data-throughput': {
    unit: 'Gbps',
    streams: [
      { key: 'mdc1', label: 'MDC1' },
      { key: 'mdc2', label: 'MDC2' },
    ],
  },
  'telecom-metric': { unit: '', streams: null },
};

/**
 * Run the statistical analysis and the executive narrative over a calculated
 * result. Isolated behind try/catch: intelligence is additive, and a failure here
 * must never cost the user their report.
 */
async function buildIntelligence(workflowSlug, calculated, transformed, context = {}) {
  try {
    const primary = calculated?.timeSeries?.series?.primary;
    if (!Array.isArray(primary) || primary.length < 3) return null;

    const profile = ANALYTICS_PROFILES[workflowSlug] || { unit: '', streams: null };
    const analysis = analyze(primary, {
      kpiName: context.kpiName || calculated?.metrics?.kpiName || 'KPI',
      unit: context.unit || calculated?.metrics?.unit || profile.unit,
      streams: profile.streams,
      threshold: context.threshold,
      rawRowCount: transformed?.records?.length,
    });

    if (!analysis.available) return analysis;

    analysis.narrative = await generateNarrative(analysis, {
      kpiName: context.kpiName || calculated?.metrics?.kpiName,
      workflowName: workflowSlug,
      sheetName: context.sheetName,
    });

    logger.info('Intelligence layer complete', {
      workflow: workflowSlug,
      findings: analysis.findings.length,
      dataQuality: analysis.quality.score,
      narrativeSource: analysis.narrative.source,
    });

    return analysis;
  } catch (err) {
    logger.warn('Intelligence layer failed — report continues without it', {
      workflow: workflowSlug,
      error: err.message,
    });
    return null;
  }
}

function getParseOptions(workflowSlug, userOptions = {}) {
  const workflow = getWorkflow(workflowSlug);
  return {
    autoDetect: userOptions.autoDetect !== false,
    sheetName: userOptions.sheetName,
    sheetIndex: userOptions.sheetIndex != null ? parseInt(userOptions.sheetIndex, 10) : undefined,
    headerRowIndex:
      userOptions.headerRowIndex != null ? parseInt(userOptions.headerRowIndex, 10) : undefined,
    dataStartRowIndex:
      userOptions.dataStartRowIndex != null ? parseInt(userOptions.dataStartRowIndex, 10) : undefined,
    workflowValidator: workflow.validator,
    metricColumnName: userOptions.metricColumnName,
  };
}

function resolveMetricColumn(parsed, workflowContext = {}) {
  if (workflowContext.metricColumnName) return workflowContext.metricColumnName;
  if (parsed.headers?.length >= 3) return parsed.headers[2];
  return 'Metric value';
}

async function previewExcel(filePath, workflowSlug) {
  const workflow = getWorkflow(workflowSlug);
  const { getWorkbookPreview } = require('./excelParser.service');
  return getWorkbookPreview(filePath, workflow.validator);
}

async function validateReport(workflowSlug, filePath, parseOptions = {}, workflowContext = {}) {
  const workflow = getWorkflow(workflowSlug);
  const options = getParseOptions(workflowSlug, parseOptions);
  const parsed = await parseExcelFile(filePath, options);
  const metricColumnName = resolveMetricColumn(parsed, workflowContext);
  const validation = workflow.validator.validateStructure(
    parsed.headers,
    parsed.dataRows,
    metricColumnName
  );

  return {
    workflow: workflow.slug,
    valid: validation.valid,
    errors: validation.errors,
    rowCount: validation.filteredRowCount ?? parsed.dataRows.length,
    headers: parsed.headers,
    sheetName: parsed.sheetName,
    kpiName: workflowContext.kpiName,
    metricColumnName,
    headerRowIndex: parsed.headerRowIndex,
    dataStartRowIndex: parsed.dataStartRowIndex,
    parseMeta: {
      sheetName: parsed.sheetName,
      headerRow: parsed.headerRowIndex + 1,
      dataStartRow: parsed.dataStartRowIndex + 1,
    },
  };
}

async function processReport(workflowSlug, filePath, reportId, parseOptions = {}, workflowContext = {}) {
  const workflow = getWorkflow(workflowSlug);
  logger.info('Starting KPI workflow processing', {
    workflow: workflowSlug,
    reportId,
    kpi: workflowContext.kpiName,
  });

  const options = getParseOptions(workflowSlug, {
    ...parseOptions,
    metricColumnName: workflowContext.metricColumnName || parseOptions.metricColumnName,
  });
  const parsed = await parseExcelFile(filePath, options);
  const metricColumnName = resolveMetricColumn(parsed, workflowContext);
  const validation = workflow.validator.validateStructure(
    parsed.headers,
    parsed.dataRows,
    metricColumnName
  );

  if (!validation.valid) {
    return {
      success: false,
      validationErrors: validation.errors,
    };
  }

  const transformed = workflow.transformer.transform(parsed.dataRows, validation.mapping);
  const calculated = workflow.calculator.calculate(transformed, {
    ...workflowContext,
    kpiName: workflowContext.kpiName || metricColumnName,
    metricColumnName,
  });
  const summary = workflow.generateSummary(calculated, transformed, {
    ...workflowContext,
    kpiName: workflowContext.kpiName || metricColumnName,
    sheetName: workflowContext.sheetName || parsed.sheetName,
  });

  summary.parseMeta = {
    sheetName: parsed.sheetName,
    headerRow: parsed.headerRowIndex + 1,
    dataStartRow: parsed.dataStartRowIndex + 1,
    rowsProcessed: parsed.dataRows.length,
    metricColumnName,
  };

  const intelligence = await buildIntelligence(workflowSlug, calculated, transformed, {
    ...workflowContext,
    kpiName: workflowContext.kpiName || metricColumnName,
    sheetName: workflowContext.sheetName || parsed.sheetName,
  });

  if (intelligence) {
    summary.intelligence = {
      available: intelligence.available,
      scope: intelligence.scope,
      findings: intelligence.findings,
      narrative: intelligence.narrative,
      dataQuality: intelligence.quality,
      trend: intelligence.trend,
      forecast: intelligence.forecast,
      capacity: intelligence.capacity,
      dailyShape: intelligence.dailyShape,
      balance: intelligence.balance,
    };
    // The narrative is what most surfaces (Teams card, PPTX, history list) show,
    // so promote it over the workflow's own template string.
    if (intelligence.narrative?.summary) {
      summary.narrative = intelligence.narrative.summary;
    }
  }

  const chartConfigs = workflow.charts.getChartConfigs(calculated, {
    ...workflowContext,
    kpiName: workflowContext.kpiName || metricColumnName,
  });
  const generatedCharts = await generateAllCharts(chartConfigs, reportId);

  const reportData = {
    transformed: {
      plmnNames: transformed.plmnNames,
      dateRange: transformed.dateRange,
      recordCount: transformed.records.length,
    },
    calculated,
    tables: {
      timeSeries: calculated.timeSeries,
    },
    intelligence: intelligence || null,
    parseMeta: summary.parseMeta,
  };

  return {
    success: true,
    summary,
    reportData,
    metrics: calculated.metrics,
    charts: generatedCharts,
    teamsMessage: workflow.formatter.formatTeamsMessage(summary, calculated, reportId),
  };
}

module.exports = {
  previewExcel,
  validateReport,
  processReport,
  TELECOM_METRIC_SLUG,
};
