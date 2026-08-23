/**
 * Row -> record transformation for database-defined workflows.
 *
 * Takes the raw sheet rows plus the header mapping produced by source.js and
 * applies the definition's `transform` stage: pick columns into named fields,
 * coerce their types, then evaluate derived fields in declaration order.
 *
 * There is no expression evaluator here by design. Every derived value comes from
 * a fixed switch on a validated op name; a definition can only choose which of
 * those operations runs and which already-declared fields it reads. Nothing in a
 * definition ever becomes code.
 */
const { parseNumber } = require('./source');

function toDate(value) {
  if (value instanceof Date) return value;
  return new Date(value);
}

function num(record, field) {
  const v = record[field];
  const n = typeof v === 'number' ? v : parseNumber(v);
  return Number.isFinite(n) ? n : 0;
}

function isMissing(value, treatZeroAsMissing) {
  if (value === null || value === undefined || value === '') return true;
  if (treatZeroAsMissing && Number(value) === 0) return true;
  return false;
}

/** Apply the optional scale/divisor tail shared by sum, product and scale. */
function applyScaling(value, spec) {
  let v = value;
  if (spec.scale !== undefined) v *= spec.scale;
  // Division is kept as division rather than folded into a reciprocal multiply:
  // /1000 and *0.001 disagree in the last bits, and unit conversions are exactly
  // where that shows up in a report total.
  if (spec.divisor !== undefined && spec.divisor !== 0) v /= spec.divisor;
  return v;
}

function evalSimple(record, spec) {
  switch (spec.op) {
    case 'sum':
      return applyScaling(spec.fields.reduce((s, f) => s + num(record, f), 0), spec);
    case 'scale':
      return applyScaling(num(record, spec.field) * (spec.factor === undefined ? 1 : spec.factor), spec);
    case 'constant':
      return spec.value;
    default:
      return null;
  }
}

function applyClassify(record, spec) {
  const ci = spec.caseInsensitive !== false;
  const raw = record[spec.field];
  const s = String(raw === null || raw === undefined ? '' : raw);
  const hay = ci ? s.toUpperCase() : s;

  for (const rule of spec.rules) {
    const needle = ci ? rule.text.toUpperCase() : rule.text;
    if (
      (rule.match === 'equals' && hay === needle) ||
      (rule.match === 'contains' && hay.includes(needle)) ||
      (rule.match === 'startsWith' && hay.startsWith(needle)) ||
      (rule.match === 'endsWith' && hay.endsWith(needle))
    ) {
      return rule.value;
    }
  }
  return spec.default === undefined ? null : spec.default;
}

function applyDatePart(record, spec) {
  const d = toDate(record[spec.field]);
  if (isNaN(d.getTime())) return null;
  switch (spec.part) {
    case 'year':
      return d.getFullYear();
    case 'month':
      return d.getMonth() + 1;
    case 'day':
      return d.getDate();
    case 'hour':
      return d.getHours();
    case 'weekday':
      return d.getDay();
    case 'dateKey':
      return d.toISOString().split('T')[0];
    case 'isoString':
      return d.toISOString();
    default:
      return null;
  }
}

function applyDerived(record, spec) {
  switch (spec.op) {
    case 'sum':
    case 'scale':
    case 'constant':
      return evalSimple(record, spec);
    case 'difference':
      return num(record, spec.fields[0]) - num(record, spec.fields[1]);
    case 'product':
      return applyScaling(spec.fields.reduce((p, f) => p * num(record, f), 1), spec);
    case 'ratio': {
      const d = num(record, spec.denominator);
      if (d === 0) return 0;
      let r = num(record, spec.numerator) / d;
      if (spec.asPercent) r *= 100;
      if (spec.scale !== undefined) r *= spec.scale;
      return r;
    }
    case 'coalesce': {
      for (const f of spec.fields) {
        if (!isMissing(record[f], spec.treatZeroAsMissing)) {
          const n = typeof record[f] === 'number' ? record[f] : parseNumber(record[f]);
          if (Number.isFinite(n)) return n;
        }
      }
      return spec.fallback ? evalSimple(record, spec.fallback) : 0;
    }
    case 'classify':
      return applyClassify(record, spec);
    case 'datePart':
      return applyDatePart(record, spec);
    default:
      return null;
  }
}

/**
 * @param {Object} def       validated definition
 * @returns {{ transform: Function }} transformer module matching the code-workflow contract
 */
function createTransformer(def) {
  const columns = def.source.columns;
  const fieldSpecs = def.transform.fields || [];
  const derivedSpecs = def.transform.derived || [];
  const timestampField = def.transform.timestampField;
  const entityField = def.transform.entityField || null;

  /**
   * @param {Array<Array>} rows     sheet data rows
   * @param {Object} mapping        { columnKey: { index, header } }
   */
  function transform(rows, mapping) {
    // Row numbering matches what the code workflows report: the sheet row a user
    // would see, derived from the declared data start row.
    const rowOffset = (def.source.sheet?.dataStartRowIndex ?? 1) + 1;
    const records = [];
    let droppedInvalidDate = 0;
    let droppedByRule = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // Null-prototype record: a definition can only write validated identifiers,
      // but starting from a bare object means even a bug here cannot touch
      // Object.prototype.
      const record = Object.create(null);

      for (const col of columns) {
        const m = mapping[col.key];
        const cell = m ? row[m.index] : undefined;
        if (col.type === 'number') record[col.key] = parseNumber(cell, { emptyAsZero: true });
        else if (col.type === 'date') record[col.key] = cell;
        else record[col.key] = cell === null || cell === undefined ? '' : String(cell).trim();
      }

      const date = toDate(record[timestampField]);
      if (isNaN(date.getTime())) {
        droppedInvalidDate++;
        continue;
      }

      let drop = false;
      for (const f of fieldSpecs) {
        let v = record[f.from];
        if (f.type === 'number') {
          const n = parseNumber(v);
          v = n === null ? (f.default === undefined ? null : f.default) : n;
        } else if (f.type === 'date') {
          const d = toDate(v);
          v = isNaN(d.getTime()) ? (f.default === undefined ? null : f.default) : d;
        } else {
          v = v === null || v === undefined || v === '' ? (f.default === undefined ? null : f.default) : String(v).trim();
        }
        if (v === null && f.dropRowIfNull) {
          drop = true;
          break;
        }
        record[f.name] = v;
      }
      if (drop) {
        droppedByRule++;
        continue;
      }

      for (const d of derivedSpecs) {
        const v = applyDerived(record, d);
        if (v === null && d.dropRowIfNull) {
          drop = true;
          break;
        }
        record[d.name] = v;
      }
      if (drop) {
        droppedByRule++;
        continue;
      }

      record.rowIndex = rowOffset + i;
      record.__date = date;
      record.date = date;
      records.push(record);
    }

    records.sort((a, b) => a.__date - b.__date);

    const entityNames = entityField
      ? [...new Set(records.map((r) => r[entityField]).filter((v) => v !== null && v !== undefined && v !== '' && v !== '—'))]
      : [];

    return {
      records,
      entityField,
      entityNames,
      // Legacy alias: report_data.transformed.plmnNames is read by existing views.
      plmnNames: entityNames,
      dropped: { invalidDate: droppedInvalidDate, byRule: droppedByRule },
      dateRange: {
        start: records[0]?.__date,
        end: records[records.length - 1]?.__date,
      },
    };
  }

  return { transform };
}

module.exports = { createTransformer, applyDerived };
