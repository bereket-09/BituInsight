const { loadSuccessRatioWorkbook, DATA_SHEET } = require('./source');
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
    // Lets the upload page route this export here instead of CMM workbook mode.
    matchesWorkbook,
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
