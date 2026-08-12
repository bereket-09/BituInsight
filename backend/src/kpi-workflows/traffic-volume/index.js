const validator = require('./validator');
const transformer = require('./transformer');
const calculator = require('./calculator');
const charts = require('./charts');
const formatter = require('./formatter');

module.exports = {
  slug: 'traffic-volume',
  name: 'Traffic Volume KPI',
  description:
    'Analyzes 2G/3G and 4G data volume trends, peak hours, and technology contribution percentages.',
  version: '1.0.0',
  metadata: {
    category: 'Traffic',
    technology: ['2G', '3G', '4G'],
    reportType: 'daily',
    icon: 'activity',
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
