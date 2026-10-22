/**
 * Validation for a success-ratio workbook.
 *
 * The workflow reads its own sheets (see ./source.js), so the "rows" validated
 * here are the engine's records rather than one sheet's cells. The upload
 * preview still scores sheets by header, which is what `requiredColumns` and
 * `mapHeaders` are for.
 */

const requiredColumns = [
  {
    key: 'period',
    label: 'Period start time',
    aliases: ['period start time', 'start time', 'time period'],
  },
  {
    key: 'entity',
    label: 'Node name',
    aliases: ['cmm name', 'msc name', 'sps name', 'cmg name', 'hss name', 'name'],
  },
  { key: 'value', label: 'Success ratio', aliases: ['sr', 'success ratio', 'succ_rate', 'cssr'] },
];

const requiredColumnCount = requiredColumns.length;

function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');
}

function mapHeaders(headers) {
  const normalized = (headers || []).map(normalize);
  const mapping = {};
  for (const col of requiredColumns) {
    const idx = normalized.findIndex((h) => col.aliases.some((a) => h.includes(normalize(a))));
    if (idx >= 0) mapping[col.key] = { index: idx, header: headers[idx] };
  }
  return mapping;
}

/**
 * A success ratio should sit between 0 and 100, but it is not clamped there.
 * Two real PS counters exceed 100 slightly (Gx reaches 100.013) and one reaches
 * 108 in a quarter hour with almost no attempts, because the numerator and the
 * denominator are collected over marginally different windows. Those are the
 * counter's own figures and the report shows them; what must never happen is a
 * bucket far above 100 because its readings were added instead of averaged.
 */
const IMPLAUSIBLE_PERCENT = 1000;

function createValidator(config = {}) {
  const domain = config.domainLabel || 'success ratio';
  const sheetHint = config.sheetHint || 'Data for <KPI>';

  function isPreferredSheet(sheetName) {
    const name = String(sheetName || '');
    return /^data\s+for\b/i.test(name);
  }

  function validateStructure(headers, records) {
    const errors = [];
    const rows = Array.isArray(records) ? records : [];
    const kpiIds = new Set(rows.map((r) => r.kpiId));

    if (!rows.length) {
      errors.push({
        type: 'empty_file',
        message:
          `No usable data found. Expected "${sheetHint}" sheets from the ${domain} export, ` +
          'each with a period column, a node column and a percentage column.',
      });
      return { valid: false, errors, mapping: { kpiIds: [] }, filteredRowCount: 0 };
    }

    const unsited = rows.filter((r) => !r.site).length;
    if (unsited === rows.length) {
      errors.push({
        type: 'invalid_data',
        message:
          'Could not tell MDC1 from MDC2 in the node names, so no per data centre view is ' +
          'possible. Expected names such as MDC1NMSS01 or …@mdc1-nk-cmm-ta01.',
      });
    }

    const absurd = rows.filter((r) => Math.abs(r.value) > IMPLAUSIBLE_PERCENT).length;
    if (absurd) {
      errors.push({
        type: 'invalid_data',
        message:
          `${absurd} reading${absurd === 1 ? '' : 's'} are far outside the range of a percentage. ` +
          'This column does not look like a success ratio.',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      mapping: { kpiIds: [...kpiIds] },
      filteredRowCount: rows.length,
    };
  }

  return {
    requiredColumns,
    requiredColumnCount,
    mapHeaders,
    isPreferredSheet,
    validateStructure,
  };
}

module.exports = { createValidator, requiredColumns, requiredColumnCount, mapHeaders };
