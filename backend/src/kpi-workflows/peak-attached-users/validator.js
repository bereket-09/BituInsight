const { ATTACH_KEYS } = require('./source');

/**
 * The workflow reads its own sheets (see ./source.js), so the "headers" it
 * validates are the value columns it found and the "rows" are its records.
 */

// Preview scoring: point the upload preview at an attach data sheet.
const requiredColumns = [
  { key: 'period', label: 'Period start time', aliases: ['period start time', 'start time', 'time period'] },
  { key: 'node', label: 'CMM or MSC name', aliases: ['cmm name', 'msc name'] },
  { key: 'value', label: 'Attached users', aliases: ['peak_attach', 'peak attach'] },
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
  return /data for peak.attach/i.test(String(sheetName || ''));
}

function validateStructure(headers, records) {
  const errors = [];
  const measures = new Set((records || []).map((r) => r.measure));
  const attachFound = ATTACH_KEYS.filter((k) => measures.has(k));

  if (!records?.length) {
    errors.push({
      type: 'empty_file',
      message:
        'No usable data found. Expected "Data for PEAK_ATTACH_…" sheets (2G GB, 3G IU, 4G LTE attached users) from the Peak Attach Users export.',
    });
  } else if (!attachFound.length) {
    errors.push({
      type: 'missing_column',
      message:
        'No attached-user sheets found. Expected at least one of PEAK_ATTACH_GB_USERS, PEAK_ATTACH_IU_USERS or PEAK_ATTACH_LTE_USERS.',
    });
  }

  const unsited = (records || []).filter((r) => r.measure.startsWith('users') && !r.site);
  if (records?.length && unsited.length === records.filter((r) => r.measure.startsWith('users')).length && unsited.length) {
    errors.push({
      type: 'invalid_data',
      message: 'Could not tell MDC1 from MDC2 in the CMM names. Expected names like …@mdc1-nk-cmm-ta01.',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    mapping: { measures: [...measures] },
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
