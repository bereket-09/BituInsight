const { loadSuccessRatioWorkbook, readSuccessRatioWorksheets, DATA_SHEET } = require('./source');
const { createValidator } = require('./validator');
const transformer = require('./transformer');
const { createCalculator } = require('./calculator');
const charts = require('./charts');
const { createFormatter } = require('./formatter');

/**
 * Factory for a "workbook full of success-ratio KPIs" workflow.
 *
 * The PS and the CS exports are the same problem: many percentage KPIs, each
 * reported per node, each needing its own hourly and daily averages at node,
 * data-centre and combined level. One engine, configured twice — see
 * ../ps-kpis-sr and ../cs-kpis-sr.
 *
 * @param {Object} config
 * @param {string} config.slug
 * @param {string} config.name
 * @param {string} config.description
 * @param {string} config.domainLabel     e.g. 'Packet Core Success Ratios'
 * @param {string} config.kpiGroupLabel   e.g. 'PS success-ratio KPIs'
 * @param {RegExp} config.coverSheet      identifies the workbook from its sheets
 * @param {Object} config.metadata        category / technology / icon
 */
function createSuccessRatioWorkflow(config) {
  const validator = createValidator(config);
  const calculator = createCalculator(config);
  const formatter = createFormatter(config);

  function matchesWorkbook(sheetNames) {
    const names = (sheetNames || []).map((n) => String(n || ''));
    if (!names.some((n) => DATA_SHEET.test(n))) return false;
    return names.some((n) => config.coverSheet.test(n.trim()));
  }

  /**
   * The KPI inventory the workbook upload page lists and the workbook pipeline
   * fans out over — one row per "Data for …" sheet, each carrying this
   * workflow's slug so the workbook creates a report *of this workflow* rather
   * than a telecom-metric one.
   *
   * Reads the worksheets the caller already loaded; a success-ratio workbook is
   * megabytes and nothing is gained by opening it twice.
   */
  function listWorkbookKpis(worksheets) {
    const kpis = [];
    const skipped = [];

    for (const worksheet of worksheets || []) {
      const name = String(worksheet.name || '');
      if (!DATA_SHEET.test(name)) continue;

      const read = readSuccessRatioWorksheets([worksheet]);
      const meta = read.kpis[0];
      if (!meta) {
        skipped.push(name);
        kpis.push({
          sheetName: name,
          kpiName: name.replace(DATA_SHEET, '').trim() || name,
          kpiSlug: null,
          workflowSlug: config.slug,
          metricColumnName: null,
          valid: false,
          errors: [
            {
              type: 'empty_file',
              message:
                'No readable success-ratio data on this sheet: a period column, a node column ' +
                'and a percentage column are all needed.',
            },
          ],
          rowCount: 0,
          granularity: 'unknown',
          headers: [],
        });
        continue;
      }

      const check = validator.validateStructure(read.headers, read.dataRows);
      kpis.push({
        sheetName: meta.sheetName,
        kpiName: meta.kpiName,
        kpiSlug: meta.id,
        workflowSlug: config.slug,
        // The value column's own header is the KPI; the sheet name is truncated.
        metricColumnName: meta.kpiName,
        valid: check.valid,
        errors: check.errors || [],
        rowCount: meta.sampleCount,
        granularity: meta.cadenceLabel,
        headers: read.headers,
        entityHeader: meta.entityHeader,
        nodeCount: meta.nodes.length,
        sites: meta.sites,
      });
    }

    return { kpis, skippedSheets: skipped };
  }

  return {
    slug: config.slug,
    name: config.name,
    description: config.description,
    version: '1.0.0',
    metadata: {
      category: 'Success ratio',
      reportType: 'periodic',
      unit: '%',
      ...config.metadata,
    },
    requiredColumns: validator.requiredColumns,
    chartDefinitions: charts.definitions,
    // Reads every "Data for …" sheet itself rather than the one sheet the
    // engine would otherwise pick.
    loadSource: loadSuccessRatioWorkbook,
    // Lets the upload page recognise this export.
    matchesWorkbook,
    // One upload, one report per KPI — the workbook treatment, routed to this
    // workflow rather than telecom-metric. See services/cmmWorkbook.service.js.
    workbookMode: true,
    listWorkbookKpis,
    analyticsProfile: {
      unit: '%',
      streams: [
        { key: 'mdc1', label: 'MDC1' },
        { key: 'mdc2', label: 'MDC2' },
      ],
    },
    validator,
    transformer,
    calculator,
    charts,
    formatter,
    generateSummary: calculator.generateSummary,
  };
}

module.exports = { createSuccessRatioWorkflow };
