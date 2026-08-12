const COLUMN_ALIASES = {
  period: [
    'period start time',
    'period start',
    'start time',
    'time period',
    'date',
    'datetime',
  ],
  samName: ['sam name', 'sam', 'sam_name'],
  cmgName: ['cmg name', 'cmg', 'cmg_name'],
  dlMbps: [
    'dlmaxmbps',
    'dl max mbps',
    'dlmaxmbps (dlmaxmbps)',
    'dlmaxmbps (dlmaxmbps)',
    'dlmax mbps',
    'dl throughput',
  ],
  ulMbps: [
    'ulmaxmbps',
    'ul max mbps',
    'ulmaxmbps (ulmaxmbps)',
    'ulmaxmbps (ulmaxmbps)',
    'ulmax mbps',
    'ul throughput',
  ],
};

const requiredColumns = [
  { key: 'period', label: 'Period start time', aliases: COLUMN_ALIASES.period },
  { key: 'cmgName', label: 'CMG name', aliases: COLUMN_ALIASES.cmgName },
  { key: 'dlMbps', label: 'DL max Mbps', aliases: COLUMN_ALIASES.dlMbps },
  { key: 'ulMbps', label: 'UL max Mbps', aliases: COLUMN_ALIASES.ulMbps },
];

const requiredColumnCount = 4;

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .replace(/\([^)]*\)/g, '')
    .trim();
}

function mapHeaders(headers) {
  const mapping = {};
  const normalizedHeaders = headers.map((h) => normalizeHeader(h));

  for (const col of requiredColumns) {
    const idx = normalizedHeaders.findIndex((h) =>
      col.aliases.some((alias) => {
        const a = normalizeHeader(alias);
        return h === a || h.includes(a) || a.includes(h);
      })
    );
    if (idx >= 0) {
      mapping[col.key] = { index: idx, header: headers[idx] };
    }
  }

  return mapping;
}

function isPreferredSheet(sheetName) {
  const n = String(sheetName || '').toLowerCase();
  return (
    n.includes('data for') ||
    n.includes('throughput') ||
    n.includes('cmg') ||
    n.includes('ulpackets') ||
    n.includes('dlpackets')
  );
}

function filterDataRows(rows, mapping) {
  if (!mapping) return rows;
  const numericIndices = ['dlMbps', 'ulMbps']
    .filter((k) => mapping[k])
    .map((k) => mapping[k].index);

  return rows.filter((row) => !isFieldCodeRow(row, numericIndices));
}

function isFieldCodeRow(row, numericColumnIndices) {
  const FIELD_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
  let codeLike = 0;
  let checked = 0;
  for (const idx of numericColumnIndices) {
    const val = row[idx];
    if (val === null || val === undefined || val === '') continue;
    checked++;
    const str = String(val).trim();
    if (FIELD_CODE_PATTERN.test(str)) codeLike++;
    else if (typeof val === 'number' || !isNaN(parseFloat(String(val).replace(/,/g, '')))) {
      return false;
    }
  }
  return checked > 0 && codeLike === checked;
}

function validateStructure(headers, rows) {
  const errors = [];
  const mapping = mapHeaders(headers);

  for (const col of requiredColumns) {
    if (!mapping[col.key]) {
      errors.push({
        type: 'missing_column',
        field: col.key,
        message: `Missing required column: ${col.label}`,
        expected: col.aliases[0],
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, mapping: null };
  }

  if (!rows || rows.length === 0) {
    errors.push({ type: 'empty_file', message: 'Excel file contains no data rows' });
    return { valid: false, errors, mapping: null };
  }

  const filteredRows = filterDataRows(rows, mapping);
  if (filteredRows.length === 0) {
    errors.push({
      type: 'empty_file',
      message: 'No data rows found after header (field-code row was skipped)',
    });
    return { valid: false, errors, mapping };
  }

  const dataErrors = validateDataTypes(filteredRows, mapping);
  errors.push(...dataErrors);

  const unknownNodes = new Set();
  const sample = filteredRows.slice(0, Math.min(filteredRows.length, 200));
  for (const row of sample) {
    const node = extractCmgNode(row[mapping.cmgName.index]);
    if (!node) unknownNodes.add(String(row[mapping.cmgName.index] || '').slice(0, 40));
  }
  if (unknownNodes.size > 0 && unknownNodes.size === sample.length) {
    errors.push({
      type: 'invalid_data',
      message:
        'Could not detect MDC1 or MDC2 from CMG name column. Expected values like …@MDC1-NK-CMG-CP01',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    mapping,
    filteredRowCount: filteredRows.length,
  };
}

function extractCmgNode(cmgName) {
  const s = String(cmgName || '').toUpperCase();
  if (s.includes('MDC1')) return 'MDC1';
  if (s.includes('MDC2')) return 'MDC2';
  return null;
}

function validateDataTypes(rows, mapping, startRowOffset = 3) {
  const errors = [];
  const sampleSize = Math.min(rows.length, 50);

  for (let i = 0; i < sampleSize; i++) {
    const row = rows[i];
    const rowNum = startRowOffset + i;

    const dl = parseNumber(row[mapping.dlMbps.index]);
    const ul = parseNumber(row[mapping.ulMbps.index]);

    if (dl === null && row[mapping.dlMbps.index] !== '' && row[mapping.dlMbps.index] != null) {
      errors.push({
        type: 'invalid_type',
        row: rowNum,
        column: mapping.dlMbps.header,
        message: `Row ${rowNum}: Invalid number in DL column`,
      });
    }
    if (ul === null && row[mapping.ulMbps.index] !== '' && row[mapping.ulMbps.index] != null) {
      errors.push({
        type: 'invalid_type',
        row: rowNum,
        column: mapping.ulMbps.header,
        message: `Row ${rowNum}: Invalid number in UL column`,
      });
    }

    const dateVal = row[mapping.period.index];
    if (dateVal && !isValidDate(dateVal)) {
      errors.push({
        type: 'invalid_type',
        row: rowNum,
        column: mapping.period.header,
        message: `Row ${rowNum}: Invalid period date`,
      });
    }
  }

  return errors.slice(0, 20);
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const cleaned = String(value).replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function isValidDate(value) {
  if (value instanceof Date && !isNaN(value)) return true;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

module.exports = {
  requiredColumns,
  requiredColumnCount,
  mapHeaders,
  validateStructure,
  filterDataRows,
  parseNumber,
  extractCmgNode,
  isPreferredSheet,
};
