const validator = require('./validator');
const transformer = require('./transformer');
const calculator = require('./calculator');
const charts = require('./charts');
const formatter = require('./formatter');
const { loadSource, SHEET_PATTERN } = require('./source');
const { exportTables } = require('./exportTables');

/** A SAAU export: a workbook carrying the "Data for SAAU" sheet. */
function matchesWorkbook(sheetNames) {
  return sheetNames.some((name) => SHEET_PATTERN.test(String(name || '')));
}

module.exports = {
  slug: 'saau',
  name: 'SAAU',
  description:
    'Simultaneously attached active users on the packet core — UTRAN, GERAN and E-UTRAN active bearers added together — for MDC1, MDC2 and the two combined at matching timestamps. A count, never a data volume.',
  version: '1.0.0',
  metadata: {
    category: 'Subscribers',
    technology: ['CMG', 'EPC', '2G', '3G', '4G'],
    reportType: 'periodic',
    icon: 'users',
    unit: 'bearers',
  },
  requiredColumns: validator.requiredColumns,
  chartDefinitions: charts.definitions,
  // Reads the SAAU sheet itself: the same workbook also carries the Total Data
  // Volume sheets, which belong to a separate KPI and a separate workflow.
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
