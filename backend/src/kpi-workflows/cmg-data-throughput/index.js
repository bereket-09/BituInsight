const validator = require('./validator');
const transformer = require('./transformer');
const calculator = require('./calculator');
const charts = require('./charts');
const formatter = require('./formatter');

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
  generateSummary: calculator.generateSummary,
};
