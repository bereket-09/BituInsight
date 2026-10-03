const validator = require('./validator');
const transformer = require('./transformer');
const calculator = require('./calculator');
const charts = require('./charts');
const formatter = require('./formatter');
const { loadSource } = require('./source');

/** A Peak Attach Users export: any "Data for PEAK_ATTACH_…" sheet. */
function matchesWorkbook(sheetNames) {
  return sheetNames.some((name) => /^data for peak.attach/i.test(String(name || '')));
}

module.exports = {
  slug: 'peak-attached-users',
  name: 'Peak Attached Users',
  description:
    'Users attached to the core per hour across 2G, 3G and 4G, added across every CMM and split by MDC1 and MDC2, with VLR subscribers and BHCA alongside. Days and weeks show their average and peak hour.',
  version: '1.0.0',
  metadata: {
    category: 'Subscribers',
    technology: ['CMM', 'MSC', '2G', '3G', '4G'],
    reportType: 'periodic',
    icon: 'users',
    unit: 'users',
  },
  requiredColumns: validator.requiredColumns,
  chartDefinitions: charts.definitions,
  // Reads every "Data for …" sheet itself rather than one sheet the engine picks.
  loadSource,
  // Lets the upload page send this export here instead of to CMM workbook mode.
  matchesWorkbook,
  validator,
  transformer,
  calculator,
  charts,
  formatter,
  generateSummary: calculator.generateSummary,
};
