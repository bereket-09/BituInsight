const { SITES } = require('../shared/netactNodes');

/**
 * This workflow reads its own sheet (see ./source.js), so the rows it validates
 * are already-parsed records rather than raw cells.
 */

// Preview scoring: point the upload preview at the Total Data Volume data sheet.
const requiredColumns = [
  { key: 'period', label: 'Period start time', aliases: ['period start time', 'start time', 'time period'] },
  { key: 'node', label: 'CMG name', aliases: ['cmg name', 'node name'] },
  { key: 'total', label: 'Total data volume', aliases: ['total data volume', 'cmg_3b'] },
];
const requiredColumnCount = requiredColumns.length;

function normalize(text) {
  return String(text || '').trim().toLowerCase().replace(/[_\s]+/g, ' ');
}

function mapHeaders(headers) {
  const normalized = headers.map(normalize);
  const mapping = {};
  for (const col of requiredColumns) {
    const idx = normalized.findIndex((h) => col.aliases.some((a) => h.includes(normalize(a))));
    if (idx >= 0) mapping[col.key] = { index: idx, header: headers[idx] };
  }
  return mapping;
}

function isPreferredSheet(sheetName) {
  return /^data for total data volume/i.test(String(sheetName || ''));
}

function validateStructure(headers, records) {
  const errors = [];

  if (!records?.length) {
    errors.push({
      type: 'empty_file',
      message:
        'No usable rows found. This workflow expects a "Data for Total Data Volume" sheet with Period start time, CMG name and Total data volume columns.',
    });
  } else {
    const sites = new Set(records.map((r) => r.site).filter(Boolean));
    if (!sites.size) {
      errors.push({
        type: 'invalid_data',
        message: `Could not tell ${SITES.join(' from ')} in the CMG names. Expected names like 10.43.3.64@MDC1-NK-CMG-CP01.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    mapping: { sites: [...new Set((records || []).map((r) => r.site).filter(Boolean))] },
    filteredRowCount: records?.length || 0,
  };
}

module.exports = {
  requiredColumns,
  requiredColumnCount,
  mapHeaders,
  isPreferredSheet,
  validateStructure,
};
