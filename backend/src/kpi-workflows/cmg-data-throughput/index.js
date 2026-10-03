const validator = require('./validator');
const transformer = require('./transformer');
const calculator = require('./calculator');
const charts = require('./charts');
const formatter = require('./formatter');

/** A CMG throughput audit export: a CMG throughput sheet or a ul/dl packets data sheet. */
function matchesWorkbook(sheetNames) {
  return sheetNames.some((raw) => {
    const name = String(raw || '');
    return (/cmg/i.test(name) && /throughput/i.test(name)) || /^data for (ul|dl)packets/i.test(name);
  });
}

module.exports = {
  slug: 'cmg-data-throughput',
  name: 'CMG Data Throughput',
  description:
    'Measures combined CMG downlink + uplink capacity (Gbps), split by MDC1 and MDC2, summed per time period from PGW export data.',
  version: '1.0.0',
  metadata: {
    category: 'Throughput',
    technology: ['CMG', 'PGW'],
    reportType: 'periodic',
    icon: 'activity',
    unit: 'Gbps',
  },
  requiredColumns: validator.requiredColumns,
  chartDefinitions: charts.definitions,
  validator,
  transformer,
  calculator,
  charts,
  formatter,
  matchesWorkbook,
  generateSummary: calculator.generateSummary,
};
