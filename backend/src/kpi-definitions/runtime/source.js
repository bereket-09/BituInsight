/**
 * Header mapping and structural validation for database-defined workflows.
 *
 * Implements the same interface the Excel parser already expects from a code
 * workflow's `validator` module — requiredColumns, requiredColumnCount, mapHeaders,
 * isPreferredSheet, filterDataRows, validateStructure — so excelParser.service.js
 * needs no changes at all to drive a definition-backed workflow.
 *
 * The three matching modes exist because the two hand-written validators disagree:
 * traffic-volume matches an alias as a substring of the header, while cmg also
 * matches in the other direction and strips "(…)" suffixes from exported column
 * names like "dlMaxMbps (dlMaxMbps)". Rather than pick a winner and change one
 * workflow's behaviour, the definition declares which it wants.
 */

function normalizeHeader(header, opts) {
  let s = String(header === null || header === undefined ? '' : header).trim().toLowerCase();
  if (opts.normalizeWhitespace !== false) s = s.replace(/[_\s]+/g, ' ');
  if (opts.stripParentheses) s = s.replace(/\([^)]*\)/g, '');
  return s.trim();
}

function aliasMatches(headerNorm, aliasNorm, mode) {
  if (!headerNorm || !aliasNorm) return false;
  if (mode === 'exact') return headerNorm === aliasNorm;
  if (mode === 'loose') {
    return headerNorm === aliasNorm || headerNorm.includes(aliasNorm) || aliasNorm.includes(headerNorm);
  }
  // 'contains' (default): the header contains the alias, matching traffic-volume.
  return headerNorm === aliasNorm || headerNorm.includes(aliasNorm);
}

function parseNumber(value, { emptyAsZero = false } = {}) {
  if (value === null || value === undefined || value === '') return emptyAsZero ? 0 : null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const cleaned = String(value).replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function isValidDate(value) {
  if (value instanceof Date) return !isNaN(value.getTime());
  const d = new Date(value);
  return !isNaN(d.getTime());
}

/**
 * Nokia/Ericsson exports put a row of ALL-CAPS field codes directly under the
 * header row. Both code workflows drop it the same way; kept verbatim here.
 */
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

/**
 * Build the validator object for one definition.
 * @param {Object} def  a definition already through validateDefinition()
 */
function createSourceValidator(def) {
  const source = def.source || {};
  const matchOpts = {
    mode: source.headerMatch?.mode || 'contains',
    stripParentheses: source.headerMatch?.stripParentheses === true,
    normalizeWhitespace: source.headerMatch?.normalizeWhitespace !== false,
  };
  const columns = source.columns || [];
  const requiredColumns = columns.map((c) => ({
    key: c.key,
    label: c.label,
    aliases: c.aliases,
    type: c.type,
    required: c.required !== false,
  }));
  const requiredColumnCount = requiredColumns.filter((c) => c.required).length;
  const sheetPatterns = (source.sheet?.namePatterns || []).map((p) => p.toLowerCase());

  // Classification rules with dropRowIfNull are structural: if nothing classifies,
  // every row is dropped and the report would come out empty. Surface that as a
  // validation error instead, the way cmg's hand-written validator does.
  const gatingClassifiers = (def.transform?.derived || []).filter(
    (d) => d.op === 'classify' && d.dropRowIfNull === true
  );

  function mapHeaders(headers) {
    const mapping = {};
    const list = Array.isArray(headers) ? headers : [];
    const normalized = list.map((h) => normalizeHeader(h, matchOpts));

    for (const col of requiredColumns) {
      const idx = normalized.findIndex((h) =>
        col.aliases.some((alias) => aliasMatches(h, normalizeHeader(alias, matchOpts), matchOpts.mode))
      );
      if (idx >= 0) mapping[col.key] = { index: idx, header: list[idx] };
    }
    return mapping;
  }

  function numericIndices(mapping) {
    return requiredColumns
      .filter((c) => c.type === 'number' && mapping[c.key])
      .map((c) => mapping[c.key].index);
  }

  function filterDataRows(rows, mapping) {
    if (!mapping || source.skipFieldCodeRows === false) return rows;
    const indices = numericIndices(mapping);
    if (!indices.length) return rows;
    return rows.filter((row) => !isFieldCodeRow(row, indices));
  }

  function isPreferredSheet(sheetName) {
    if (!sheetPatterns.length) return false;
    const n = String(sheetName || '').toLowerCase();
    return sheetPatterns.some((p) => n.includes(p));
  }

  function classifierMatches(rawValue, classifier) {
    const ci = classifier.caseInsensitive !== false;
    const s = String(rawValue === null || rawValue === undefined ? '' : rawValue);
    const hay = ci ? s.toUpperCase() : s;
    for (const rule of classifier.rules) {
      const needle = ci ? rule.text.toUpperCase() : rule.text;
      if (rule.match === 'equals' && hay === needle) return true;
      if (rule.match === 'contains' && hay.includes(needle)) return true;
      if (rule.match === 'startsWith' && hay.startsWith(needle)) return true;
      if (rule.match === 'endsWith' && hay.endsWith(needle)) return true;
    }
    return classifier.default !== undefined && classifier.default !== null;
  }

  function validateDataTypes(rows, mapping, startRowOffset) {
    const errors = [];
    const sampleSize = Math.min(rows.length, 50);

    for (let i = 0; i < sampleSize; i++) {
      const row = rows[i];
      const rowNum = startRowOffset + i;

      for (const col of requiredColumns) {
        const cell = mapping[col.key] ? row[mapping[col.key].index] : undefined;
        if (cell === '' || cell === null || cell === undefined) continue;

        if (col.type === 'number' && parseNumber(cell) === null) {
          errors.push({
            type: 'invalid_type',
            row: rowNum,
            column: mapping[col.key].header,
            message: `Row ${rowNum}: Invalid number in "${mapping[col.key].header}"`,
          });
        } else if (col.type === 'date' && !isValidDate(cell)) {
          errors.push({
            type: 'invalid_type',
            row: rowNum,
            column: mapping[col.key].header,
            message: `Row ${rowNum}: Invalid date in "${mapping[col.key].header}"`,
          });
        }
      }
    }

    return errors.slice(0, 20);
  }

  function validateStructure(headers, rows) {
    const errors = [];
    const mapping = mapHeaders(headers);

    for (const col of requiredColumns) {
      if (col.required && !mapping[col.key]) {
        errors.push({
          type: 'missing_column',
          field: col.key,
          message: `Missing required column: ${col.label}`,
          expected: col.aliases[0],
        });
      }
    }
    if (errors.length > 0) return { valid: false, errors, mapping: null };

    if (!rows || rows.length === 0) {
      return {
        valid: false,
        errors: [{ type: 'empty_file', message: 'Excel file contains no data rows' }],
        mapping: null,
      };
    }

    const filteredRows = filterDataRows(rows, mapping);
    if (filteredRows.length === 0) {
      return {
        valid: false,
        errors: [
          { type: 'empty_file', message: 'No data rows found after header (field-code rows were skipped)' },
        ],
        mapping,
      };
    }

    const dataStartRow = (source.sheet?.dataStartRowIndex ?? 1) + 1;
    errors.push(...validateDataTypes(filteredRows, mapping, dataStartRow));

    for (const classifier of gatingClassifiers) {
      const sourceColumn = classifier.field;
      const mapped = mapping[sourceColumn];
      if (!mapped) continue;
      const sample = filteredRows.slice(0, Math.min(filteredRows.length, 200));
      const unmatched = sample.filter((row) => !classifierMatches(row[mapped.index], classifier));
      if (sample.length > 0 && unmatched.length === sample.length) {
        errors.push({
          type: 'invalid_data',
          field: classifier.name,
          message:
            classifier.unclassifiedMessage ||
            `Could not classify any row from column "${mapped.header}" into ${classifier.rules
              .map((r) => r.value)
              .join(' or ')}`,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      mapping,
      filteredRowCount: filteredRows.length,
    };
  }

  return {
    requiredColumns,
    requiredColumnCount,
    mapHeaders,
    filterDataRows,
    isPreferredSheet,
    validateStructure,
    parseNumber,
  };
}

module.exports = { createSourceValidator, normalizeHeader, parseNumber, isFieldCodeRow };
