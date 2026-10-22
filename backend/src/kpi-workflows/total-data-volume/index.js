const validator = require('./validator');
const transformer = require('./transformer');
const calculator = require('./calculator');
const charts = require('./charts');
const formatter = require('./formatter');
const { loadSource, SHEET_PATTERN } = require('./source');
const { exportTables } = require('./exportTables');

/** A Total Data Volume export: a workbook carrying the "Data for Total Data Volume" sheet. */
function matchesWorkbook(sheetNames) {
  return sheetNames.some((name) => SHEET_PATTERN.test(String(name || '')));
}

module.exports = {
  slug: 'total-data-volume',
  name: 'Total Data Volume',
  description:
    'Data volume carried by the packet core each hour in terabytes, for MDC1, MDC2 and the two combined at matching timestamps. Days show their total, their average hour and their busiest hour.',
  version: '1.0.0',
  metadata: {
    category: 'Traffic',
    technology: ['CMG', 'EPC', '2G', '3G', '4G'],
    reportType: 'periodic',
    icon: 'database',
    unit: 'TB',
  },
  requiredColumns: validator.requiredColumns,
  chartDefinitions: charts.definitions,
  // Reads the Total Data Volume sheet itself: the same workbook also carries the
  // SAAU sheets, which belong to a separate KPI and a separate workflow.
  loadSource,
  matchesWorkbook,
  exportTables,
  validator,
  transformer,
  calculator,
  charts,
  formatter,
  generateSummary: calculator.generateSummary,
};
