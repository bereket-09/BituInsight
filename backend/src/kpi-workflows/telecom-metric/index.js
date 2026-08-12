const validator = require('./validator');
const transformer = require('./transformer');
const calculator = require('./calculator');
const charts = require('./charts');
const formatter = require('./formatter');

module.exports = {
  slug: 'telecom-metric',
  name: 'Telecom CMM Metric',
  description: 'Generic single-metric telecom KPI from CMM export sheets (Data for ...)',
  version: '1.0.0',
  metadata: { category: 'CMM', source: 'workbook' },
  requiredColumns: validator.buildRequiredColumns('Metric'),
  chartDefinitions: charts.definitions,
  validator,
  transformer,
  calculator,
  charts,
  formatter,
  generateSummary: (calculated, transformed, context) =>
    calculator.generateSummary(calculated, transformed, context),
};
