const COLUMN_ALIASES = {
  date: ['period start time', 'date', 'datetime', 'time', 'period'],
  plmnName: ['plmn name', 'plmn', 'plmn_name', 'operator'],
};

function normalizeHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');
}

function buildRequiredColumns(metricColumnName) {
  return [
    { key: 'date', label: 'Period start time', aliases: COLUMN_ALIASES.date },
    { key: 'plmnName', label: 'PLMN Name', aliases: COLUMN_ALIASES.plmnName },
    {
      key: 'value',
      label: metricColumnName || 'Metric value',
      aliases: [normalizeHeader(metricColumnName)].filter(Boolean),
    },
  ];
}

function mapHeaders(headers, metricColumnName = null) {
  const metricCol = metricColumnName || (headers?.length >= 3 ? headers[2] : '');
  const requiredColumns = buildRequiredColumns(metricCol);
  const mapping = {};
  const normalizedHeaders = headers.map((h) => normalizeHeader(h));

  for (const col of requiredColumns) {
    if (col.key === 'value') {
      const metricNorm = normalizeHeader(metricCol);
      let idx = normalizedHeaders.findIndex(
        (h) => h === metricNorm || h.includes(metricNorm) || metricNorm.includes(h)
      );
      if (idx < 0 && headers.length >= 3) idx = 2;
      if (idx >= 0) mapping.value = { index: idx, header: headers[idx] };
      continue;
    }
    const idx = normalizedHeaders.findIndex((h) =>
      col.aliases.some((alias) => normalizeHeader(alias) === h || h.includes(normalizeHeader(alias)))
    );
    if (idx >= 0) mapping[col.key] = { index: idx, header: headers[idx] };
  }

  return mapping;
}

function mapHeadersDetailed(headers, metricColumnName = null) {
  const metricCol = metricColumnName || (headers?.length >= 3 ? headers[2] : '');
  return {
    mapping: mapHeaders(headers, metricCol),
    requiredColumns: buildRequiredColumns(metricCol),
  };
}

function isFieldCodeRow(row, valueIndex) {
  const val = row[valueIndex];
  if (val === null || val === undefined || val === '') return false;
  if (typeof val === 'number') return false;
  return /^[A-Z][A-Z0-9_]*$/.test(String(val).trim());
}

function filterDataRows(rows, mapping) {
  const idx = mapping.value?.index ?? 2;
  return rows.filter((row) => !isFieldCodeRow(row, idx));
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
  return !isNaN(new Date(value).getTime());
}

function validateStructure(headers, rows, metricColumnName = null) {
  if (!metricColumnName && headers?.length >= 3) {
    metricColumnName = headers[2];
  }
  const errors = [];
  const { mapping, requiredColumns } = mapHeadersDetailed(headers, metricColumnName);

  for (const col of requiredColumns) {
    if (!mapping[col.key]) {
      errors.push({
        type: 'missing_column',
        field: col.key,
        message: `Missing required column: ${col.label}`,
      });
    }
  }

  if (errors.length > 0) return { valid: false, errors, mapping: null, requiredColumns };

  const filtered = filterDataRows(rows, mapping);
  if (filtered.length === 0) {
    errors.push({ type: 'empty_file', message: 'No data rows found after header' });
    return { valid: false, errors, mapping: null, requiredColumns };
  }

  const sampleSize = Math.min(filtered.length, 30);
  for (let i = 0; i < sampleSize; i++) {
    const row = filtered[i];
    const rowNum = i + 3;
    const val = parseNumber(row[mapping.value.index]);
    if (val === null && row[mapping.value.index] !== '' && row[mapping.value.index] != null) {
      errors.push({
        type: 'invalid_type',
        row: rowNum,
        message: `Row ${rowNum}: Invalid number in "${mapping.value.header}"`,
      });
    }
    if (row[mapping.date.index] && !isValidDate(row[mapping.date.index])) {
      errors.push({
        type: 'invalid_type',
        row: rowNum,
        message: `Row ${rowNum}: Invalid date`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.slice(0, 15),
    mapping,
    requiredColumns,
    filteredRowCount: filtered.length,
  };
}

module.exports = {
  buildRequiredColumns,
  mapHeaders,
  mapHeadersDetailed,
  validateStructure,
  filterDataRows,
  parseNumber,
  requiredColumnCount: 3,
};
