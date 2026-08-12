const COLUMN_ALIASES = {
  date: ['date', 'datetime', 'time', 'period', 'period start time', 'period start', 'start time'],
  plmnName: ['plmn name', 'plmn', 'plmn_name', 'operator'],
  volume2g3g: [
    '2g+3g data volume',
    '2g 3g data volume',
    '2g+3g volume',
    'datavolume_2g_3g',
    '2g3g volume',
  ],
  volume4g: ['4g data volume', '4g volume', 'datavolume_four_g', 'datavolume_4g'],
  totalVolume: ['total data volume', 'total volume', 'total', 'datavolume_total'],
};

const requiredColumns = [
  { key: 'date', label: 'Date', aliases: COLUMN_ALIASES.date },
  { key: 'plmnName', label: 'PLMN Name', aliases: COLUMN_ALIASES.plmnName },
  { key: 'volume2g3g', label: '2G+3G data volume', aliases: COLUMN_ALIASES.volume2g3g },
  { key: 'volume4g', label: '4G data volume', aliases: COLUMN_ALIASES.volume4g },
  { key: 'totalVolume', label: 'Total data volume', aliases: COLUMN_ALIASES.totalVolume },
];

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');
}

function mapHeaders(headers) {
  const mapping = {};
  const normalizedHeaders = headers.map((h) => normalizeHeader(h));

  for (const col of requiredColumns) {
    const idx = normalizedHeaders.findIndex((h) =>
      col.aliases.some((alias) => normalizeHeader(alias) === h || h.includes(normalizeHeader(alias)))
    );
    if (idx >= 0) {
      mapping[col.key] = { index: idx, header: headers[idx] };
    }
  }

  return mapping;
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
    errors.push({
      type: 'empty_file',
      message: 'Excel file contains no data rows',
    });
    return { valid: false, errors, mapping: null };
  }

  const filteredRows = filterDataRows(rows, mapping);
  if (filteredRows.length === 0) {
    errors.push({
      type: 'empty_file',
      message: 'No data rows found after header (field-code rows were skipped)',
    });
    return { valid: false, errors, mapping };
  }

  const dataErrors = validateDataTypes(filteredRows, mapping);
  errors.push(...dataErrors);

  return {
    valid: errors.length === 0,
    errors,
    mapping,
    filteredRowCount: filteredRows.length,
  };
}

function filterDataRows(rows, mapping) {
  if (!mapping) return rows;
  const numericIndices = ['volume2g3g', 'volume4g', 'totalVolume']
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
    else if (typeof val === 'number' || !isNaN(parseFloat(String(val).replace(/,/g, '')))) return false;
  }
  return checked > 0 && codeLike === checked;
}

function validateDataTypes(rows, mapping, startRowOffset = 2) {
  const errors = [];
  const filtered = filterDataRows(rows, mapping);
  const sampleSize = Math.min(filtered.length, 50);

  for (let i = 0; i < sampleSize; i++) {
    const row = filtered[i];
    const rowNum = startRowOffset + i;

    const vol2g3g = parseNumber(row[mapping.volume2g3g.index]);
    const vol4g = parseNumber(row[mapping.volume4g.index]);
    const total = parseNumber(row[mapping.totalVolume.index]);

    if (vol2g3g === null && row[mapping.volume2g3g.index] !== '' && row[mapping.volume2g3g.index] != null) {
      errors.push({
        type: 'invalid_type',
        row: rowNum,
        column: mapping.volume2g3g.header,
        message: `Row ${rowNum}: Invalid number in "${mapping.volume2g3g.header}"`,
      });
    }

    if (vol4g === null && row[mapping.volume4g.index] !== '' && row[mapping.volume4g.index] != null) {
      errors.push({
        type: 'invalid_type',
        row: rowNum,
        column: mapping.volume4g.header,
        message: `Row ${rowNum}: Invalid number in "${mapping.volume4g.header}"`,
      });
    }

    if (total === null && row[mapping.totalVolume.index] !== '' && row[mapping.totalVolume.index] != null) {
      errors.push({
        type: 'invalid_type',
        row: rowNum,
        column: mapping.totalVolume.header,
        message: `Row ${rowNum}: Invalid number in "${mapping.totalVolume.header}"`,
      });
    }

    const dateVal = row[mapping.date.index];
    if (dateVal && !isValidDate(dateVal)) {
      errors.push({
        type: 'invalid_type',
        row: rowNum,
        column: mapping.date.header,
        message: `Row ${rowNum}: Invalid date in "${mapping.date.header}"`,
      });
    }
  }

  return errors.slice(0, 20);
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
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
  mapHeaders,
  validateStructure,
  filterDataRows,
  parseNumber,
};
