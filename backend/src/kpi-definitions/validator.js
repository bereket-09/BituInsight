/**
 * Strict validator for database-defined KPI workflow definitions.
 *
 * This is the security boundary for imports. A definition reaches it as JSON that
 * an external AI wrote and a human pasted; nothing upstream is trusted. The rules:
 *
 *   1. Reject unknown fields everywhere. A definition with an extra key is either
 *      written against a different schema version or is probing for one — either
 *      way we would rather fail loudly than silently ignore half of it.
 *   2. Bound every string and every array (see limits.js).
 *   3. Every operation name is checked against a closed enum, and every operation's
 *      arguments are validated by an op-specific rule. There is no escape hatch,
 *      no "raw" field, no expression string. Nothing in a definition is ever
 *      passed to eval/new Function/require — the interpreter dispatches on the
 *      op name through a fixed switch.
 *   4. Cross-references are resolved at validation time (a metric may only name a
 *      field that some earlier stage declares), so the interpreter never has to
 *      guess at runtime.
 *
 * Errors are returned, not thrown, as { path, message, expected } so the import UI
 * can point at the offending line. Validation is exhaustive within a stage but
 * stops descending into a branch whose shape is already wrong, to avoid emitting
 * fifty cascading errors from one missing object.
 *
 * Trade-off: this is hand-written rather than an off-the-shelf JSON Schema
 * validator (ajv). Reasons — no new production dependency; error messages that
 * name the actual problem ("metric 'x' references unknown field 'y'") instead of
 * "should match some schema in anyOf"; and cross-reference checks that JSON Schema
 * cannot express at all. The cost is that schema/workflow-definition.schema.json
 * must be kept in step with this file by hand. Both carry the same SCHEMA_VERSION.
 */
const L = require('./limits');

const SCHEMA_VERSION = '1.0';
const SUPPORTED_SCHEMA_VERSIONS = ['1.0'];

const COLUMN_TYPES = ['date', 'number', 'string'];
const HEADER_MATCH_MODES = ['exact', 'contains', 'loose'];
const FIELD_TYPES = ['number', 'string', 'date'];
const DERIVED_OPS = [
  'sum',
  'difference',
  'product',
  'ratio',
  'scale',
  'constant',
  'coalesce',
  'classify',
  'datePart',
];
const CLASSIFY_MATCHES = ['contains', 'equals', 'startsWith', 'endsWith'];
const DATE_PARTS = ['year', 'month', 'day', 'hour', 'weekday', 'dateKey', 'isoString'];
const AGGREGATES = ['sum', 'avg', 'max', 'min'];
const METRIC_OPS = [
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'countDistinct',
  'first',
  'last',
  'sharePct',
  'peakLabel',
  'peakValue',
  'minLabel',
  'minValue',
  'latestLabel',
  'latestValue',
  'constant',
  'builtin',
];
const METRIC_SOURCES = ['series', 'records'];
const BUILTIN_REFS = [
  'granularityKey',
  'granularityLabel',
  'periodLabel',
  'spanLabel',
  'spanStart',
  'spanEnd',
  'pointCount',
  'dayCount',
  'recordCount',
  'streamCount',
];
const CHART_TYPES = ['line', 'area', 'bar', 'doughnut', 'pie'];
const CHART_SOURCES = ['series', 'split'];
const FORMATS = ['number', 'integer', 'percent', 'text', 'throughput', 'bytes', 'compact'];
const TRENDS = ['up', 'down', 'neutral'];
const GRANULARITIES = ['auto', 'native', 'hourly', 'daily', 'weekly', 'monthly'];
const GRANULARITY_KEYS = ['subhourly', 'hourly', 'daily', 'weekly', 'monthly'];
const TOTAL_MODES = ['valueField', 'streams'];
const SPAN_FORMATS = ['short', 'numeric'];
const ANOMALY_METHODS = ['stddev'];
const ANOMALY_DIRECTIONS = ['above', 'below', 'both'];
const TARGET_DIRECTIONS = ['max', 'min'];

/** Collects errors with a path prefix so callers get `metrics[3].field`. */
class Ctx {
  constructor() {
    this.errors = [];
  }

  add(path, message, expected) {
    this.errors.push(expected === undefined ? { path, message } : { path, message, expected });
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Reject any key we do not know about. `Object.keys` on a JSON.parse result also
 * surfaces a literal "__proto__" key when it was quoted in the source text, which
 * is exactly the case we want to catch.
 */
function rejectUnknown(ctx, path, obj, allowed) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      ctx.add(
        path ? `${path}.${key}` : key,
        `Unknown field "${key}" is not part of schemaVersion ${SCHEMA_VERSION}`,
        `one of: ${allowed.join(', ')}`
      );
    }
  }
}

function expectObject(ctx, path, value, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) ctx.add(path, 'Required object is missing', 'an object');
    return null;
  }
  if (!isPlainObject(value)) {
    ctx.add(path, `Expected an object, received ${Array.isArray(value) ? 'an array' : typeof value}`, 'an object');
    return null;
  }
  return value;
}

function expectArray(ctx, path, value, { required = false, min = 0, max = 0 } = {}) {
  if (value === undefined || value === null) {
    if (required) ctx.add(path, 'Required array is missing', `an array of ${min}–${max} items`);
    return null;
  }
  if (!Array.isArray(value)) {
    ctx.add(path, `Expected an array, received ${typeof value}`, 'an array');
    return null;
  }
  if (value.length < min) {
    ctx.add(path, `Array has ${value.length} item(s), fewer than the minimum`, `at least ${min} item(s)`);
    return null;
  }
  if (value.length > max) {
    ctx.add(path, `Array has ${value.length} item(s), more than allowed`, `at most ${max} item(s)`);
    return null;
  }
  return value;
}

function expectString(ctx, path, value, { required = false, maxLength = L.MAX_TEXT, pattern = null, enumOf = null, minLength = 1 } = {}) {
  if (value === undefined || value === null) {
    if (required) ctx.add(path, 'Required string is missing', enumOf ? `one of: ${enumOf.join(', ')}` : 'a string');
    return null;
  }
  if (typeof value !== 'string') {
    ctx.add(path, `Expected a string, received ${Array.isArray(value) ? 'an array' : typeof value}`, 'a string');
    return null;
  }
  if (value.length < minLength) {
    ctx.add(path, 'String is empty', `at least ${minLength} character(s)`);
    return null;
  }
  if (value.length > maxLength) {
    ctx.add(path, `String is ${value.length} characters long, which exceeds the limit`, `at most ${maxLength} characters`);
    return null;
  }
  if (enumOf && !enumOf.includes(value)) {
    ctx.add(path, `Value "${truncate(value)}" is not allowed`, `one of: ${enumOf.join(', ')}`);
    return null;
  }
  if (pattern && !pattern.test(value)) {
    ctx.add(path, `Value "${truncate(value)}" has the wrong format`, `a string matching ${pattern}`);
    return null;
  }
  return value;
}

function expectNumber(ctx, path, value, { required = false, min = -1e15, max = 1e15, integer = false } = {}) {
  if (value === undefined || value === null) {
    if (required) ctx.add(path, 'Required number is missing', 'a finite number');
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    ctx.add(path, `Expected a finite number, received ${JSON.stringify(value)}`, 'a finite number');
    return null;
  }
  if (integer && !Number.isInteger(value)) {
    ctx.add(path, `Expected a whole number, received ${value}`, 'an integer');
    return null;
  }
  if (value < min || value > max) {
    ctx.add(path, `Value ${value} is out of range`, `a number between ${min} and ${max}`);
    return null;
  }
  return value;
}

function expectBoolean(ctx, path, value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    ctx.add(path, `Expected true or false, received ${JSON.stringify(value)}`, 'a boolean');
    return fallback;
  }
  return value;
}

/** Identifiers name fields, streams and metrics. They become object keys, so they are locked down hard. */
function expectIdent(ctx, path, value, { required = true } = {}) {
  const s = expectString(ctx, path, value, { required, maxLength: 40, pattern: L.IDENT_PATTERN });
  if (s === null) return null;
  if (L.RESERVED_IDENTIFIERS.has(s)) {
    ctx.add(path, `"${s}" is a reserved name and cannot be used as an identifier`, 'a name that is not a JavaScript object built-in');
    return null;
  }
  return s;
}

function truncate(s, n = 60) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/* ------------------------------------------------------------------ stages */

function validateIdentity(ctx, def) {
  expectString(ctx, 'schemaVersion', def.schemaVersion, { required: true, enumOf: SUPPORTED_SCHEMA_VERSIONS });
  expectString(ctx, 'slug', def.slug, { required: true, maxLength: 63, pattern: L.SLUG_PATTERN });
  expectString(ctx, 'name', def.name, { required: true, maxLength: L.MAX_NAME });
  expectString(ctx, 'description', def.description, { maxLength: L.MAX_DESCRIPTION });
  if (def.version !== undefined) {
    expectString(ctx, 'version', def.version, { maxLength: 12, pattern: L.VERSION_PATTERN });
  }

  const meta = expectObject(ctx, 'metadata', def.metadata);
  if (meta) {
    rejectUnknown(ctx, 'metadata', meta, ['category', 'technology', 'reportType', 'icon', 'unit']);
    expectString(ctx, 'metadata.category', meta.category, { maxLength: L.MAX_LABEL });
    expectString(ctx, 'metadata.reportType', meta.reportType, { maxLength: L.MAX_LABEL });
    expectString(ctx, 'metadata.icon', meta.icon, { maxLength: 40 });
    expectString(ctx, 'metadata.unit', meta.unit, { maxLength: 20 });
    const tech = meta.technology === undefined ? null : expectArray(ctx, 'metadata.technology', meta.technology, { max: L.MAX_TECHNOLOGY });
    if (tech) tech.forEach((t, i) => expectString(ctx, `metadata.technology[${i}]`, t, { required: true, maxLength: L.MAX_LABEL }));
  }
}

/** @returns {Map<string, string>} column key -> declared type */
function validateSource(ctx, def) {
  const columnTypes = new Map();
  const source = expectObject(ctx, 'source', def.source, { required: true });
  if (!source) return columnTypes;

  rejectUnknown(ctx, 'source', source, ['sheet', 'headerMatch', 'skipFieldCodeRows', 'columns']);

  const sheet = expectObject(ctx, 'source.sheet', source.sheet);
  if (sheet) {
    rejectUnknown(ctx, 'source.sheet', sheet, ['namePatterns', 'headerRowIndex', 'dataStartRowIndex']);
    const pats = sheet.namePatterns === undefined ? null : expectArray(ctx, 'source.sheet.namePatterns', sheet.namePatterns, { max: L.MAX_SHEET_PATTERNS });
    if (pats) pats.forEach((p, i) => expectString(ctx, `source.sheet.namePatterns[${i}]`, p, { required: true, maxLength: L.MAX_ALIAS }));
    expectNumber(ctx, 'source.sheet.headerRowIndex', sheet.headerRowIndex, { min: 0, max: L.MAX_ROW_INDEX, integer: true });
    expectNumber(ctx, 'source.sheet.dataStartRowIndex', sheet.dataStartRowIndex, { min: 0, max: L.MAX_ROW_INDEX, integer: true });
  }

  const hm = expectObject(ctx, 'source.headerMatch', source.headerMatch);
  if (hm) {
    rejectUnknown(ctx, 'source.headerMatch', hm, ['mode', 'stripParentheses', 'normalizeWhitespace']);
    expectString(ctx, 'source.headerMatch.mode', hm.mode, { enumOf: HEADER_MATCH_MODES });
    expectBoolean(ctx, 'source.headerMatch.stripParentheses', hm.stripParentheses, false);
    expectBoolean(ctx, 'source.headerMatch.normalizeWhitespace', hm.normalizeWhitespace, true);
  }

  expectBoolean(ctx, 'source.skipFieldCodeRows', source.skipFieldCodeRows, true);

  const columns = expectArray(ctx, 'source.columns', source.columns, { required: true, min: 1, max: L.MAX_COLUMNS });
  if (!columns) return columnTypes;

  columns.forEach((col, i) => {
    const p = `source.columns[${i}]`;
    if (!expectObject(ctx, p, col, { required: true })) return;
    rejectUnknown(ctx, p, col, ['key', 'label', 'type', 'required', 'aliases']);

    const key = expectIdent(ctx, `${p}.key`, col.key);
    expectString(ctx, `${p}.label`, col.label, { required: true, maxLength: L.MAX_LABEL });
    const type = expectString(ctx, `${p}.type`, col.type, { required: true, enumOf: COLUMN_TYPES });
    expectBoolean(ctx, `${p}.required`, col.required, true);

    const aliases = expectArray(ctx, `${p}.aliases`, col.aliases, { required: true, min: 1, max: L.MAX_ALIASES_PER_COLUMN });
    if (aliases) {
      aliases.forEach((a, j) => expectString(ctx, `${p}.aliases[${j}]`, a, { required: true, maxLength: L.MAX_ALIAS }));
    }

    if (key) {
      if (columnTypes.has(key)) {
        ctx.add(`${p}.key`, `Duplicate column key "${key}"`, 'a key unique across source.columns');
      } else if (type) {
        columnTypes.set(key, type);
      }
    }
  });

  return columnTypes;
}

/** Validates one derived-field operation. Each op has its own closed key set. */
function validateDerivedOp(ctx, path, entry, known) {
  const op = expectString(ctx, `${path}.op`, entry.op, { required: true, enumOf: DERIVED_OPS });
  if (!op) return null;

  const numericRef = (refPath, value) => {
    const id = expectIdent(ctx, refPath, value);
    if (id && !known.has(id)) {
      ctx.add(refPath, `References unknown field "${id}"`, `one of the fields declared earlier: ${[...known].slice(0, 12).join(', ')}`);
      return null;
    }
    return id;
  };

  const checkDivisor = (entry) => {
    if (entry.divisor === undefined) return;
    const d = expectNumber(ctx, `${path}.divisor`, entry.divisor, { min: -1e9, max: 1e9 });
    if (d === 0) ctx.add(`${path}.divisor`, 'Divisor is zero', 'a non-zero number');
  };

  const operandList = (key, min, max) => {
    const arr = expectArray(ctx, `${path}.${key}`, entry[key], { required: true, min, max });
    if (arr) arr.forEach((f, i) => numericRef(`${path}.${key}[${i}]`, f));
    return arr;
  };

  switch (op) {
    case 'sum':
      rejectUnknown(ctx, path, entry, ['name', 'op', 'fields', 'scale', 'divisor']);
      operandList('fields', 1, L.MAX_DERIVED_OPERANDS);
      if (entry.scale !== undefined) expectNumber(ctx, `${path}.scale`, entry.scale, { min: -1e9, max: 1e9 });
      // `divisor` exists alongside `scale` because x/1000 and x*0.001 are not the
      // same floating-point operation, and a unit conversion written one way must
      // not silently produce different last digits than the same conversion written
      // the other way.
      checkDivisor(entry);
      return 'number';
    case 'difference':
      rejectUnknown(ctx, path, entry, ['name', 'op', 'fields']);
      operandList('fields', 2, 2);
      return 'number';
    case 'product':
      rejectUnknown(ctx, path, entry, ['name', 'op', 'fields', 'scale', 'divisor']);
      operandList('fields', 2, 8);
      if (entry.scale !== undefined) expectNumber(ctx, `${path}.scale`, entry.scale, { min: -1e9, max: 1e9 });
      checkDivisor(entry);
      return 'number';
    case 'ratio':
      rejectUnknown(ctx, path, entry, ['name', 'op', 'numerator', 'denominator', 'asPercent', 'scale']);
      numericRef(`${path}.numerator`, entry.numerator);
      numericRef(`${path}.denominator`, entry.denominator);
      expectBoolean(ctx, `${path}.asPercent`, entry.asPercent, false);
      if (entry.scale !== undefined) expectNumber(ctx, `${path}.scale`, entry.scale, { min: -1e9, max: 1e9 });
      return 'number';
    case 'scale':
      rejectUnknown(ctx, path, entry, ['name', 'op', 'field', 'factor', 'divisor']);
      numericRef(`${path}.field`, entry.field);
      if (entry.factor !== undefined || entry.divisor === undefined) {
        expectNumber(ctx, `${path}.factor`, entry.factor, { required: true, min: -1e9, max: 1e9 });
      }
      checkDivisor(entry);
      return 'number';
    case 'constant': {
      rejectUnknown(ctx, path, entry, ['name', 'op', 'value']);
      if (typeof entry.value === 'string') {
        expectString(ctx, `${path}.value`, entry.value, { maxLength: L.MAX_TEXT });
        return 'string';
      }
      expectNumber(ctx, `${path}.value`, entry.value, { required: true });
      return 'number';
    }
    case 'coalesce': {
      rejectUnknown(ctx, path, entry, ['name', 'op', 'fields', 'treatZeroAsMissing', 'fallback']);
      operandList('fields', 1, 8);
      expectBoolean(ctx, `${path}.treatZeroAsMissing`, entry.treatZeroAsMissing, false);
      const fb = entry.fallback === undefined ? null : expectObject(ctx, `${path}.fallback`, entry.fallback);
      if (fb) {
        // The fallback is deliberately restricted to non-recursive ops: one level of
        // nesting keeps the interpreter's evaluation depth constant and removes any
        // chance of a definition being a self-referential bomb.
        const fbOp = expectString(ctx, `${path}.fallback.op`, fb.op, { required: true, enumOf: ['sum', 'constant', 'scale'] });
        if (fbOp === 'sum') {
          rejectUnknown(ctx, `${path}.fallback`, fb, ['op', 'fields', 'scale', 'divisor']);
          const arr = expectArray(ctx, `${path}.fallback.fields`, fb.fields, { required: true, min: 1, max: L.MAX_DERIVED_OPERANDS });
          if (arr) arr.forEach((f, i) => numericRef(`${path}.fallback.fields[${i}]`, f));
          if (fb.scale !== undefined) expectNumber(ctx, `${path}.fallback.scale`, fb.scale, { min: -1e9, max: 1e9 });
        } else if (fbOp === 'scale') {
          rejectUnknown(ctx, `${path}.fallback`, fb, ['op', 'field', 'factor']);
          numericRef(`${path}.fallback.field`, fb.field);
          expectNumber(ctx, `${path}.fallback.factor`, fb.factor, { required: true, min: -1e9, max: 1e9 });
        } else if (fbOp === 'constant') {
          rejectUnknown(ctx, `${path}.fallback`, fb, ['op', 'value']);
          expectNumber(ctx, `${path}.fallback.value`, fb.value, { required: true });
        }
      }
      return 'number';
    }
    case 'classify': {
      rejectUnknown(ctx, path, entry, ['name', 'op', 'field', 'rules', 'default', 'caseInsensitive', 'dropRowIfNull', 'unclassifiedMessage']);
      numericRef(`${path}.field`, entry.field);
      expectBoolean(ctx, `${path}.caseInsensitive`, entry.caseInsensitive, true);
      expectBoolean(ctx, `${path}.dropRowIfNull`, entry.dropRowIfNull, false);
      if (entry.default !== undefined && entry.default !== null) {
        expectString(ctx, `${path}.default`, entry.default, { maxLength: L.MAX_LABEL });
      }
      expectString(ctx, `${path}.unclassifiedMessage`, entry.unclassifiedMessage, { maxLength: L.MAX_TEXT });
      const rules = expectArray(ctx, `${path}.rules`, entry.rules, { required: true, min: 1, max: L.MAX_CLASSIFY_RULES });
      if (rules) {
        rules.forEach((r, i) => {
          const rp = `${path}.rules[${i}]`;
          if (!expectObject(ctx, rp, r, { required: true })) return;
          rejectUnknown(ctx, rp, r, ['match', 'text', 'value']);
          // Note: no regex. Untrusted patterns are a ReDoS vector, and the four
          // literal predicates below cover every classification the code
          // workflows perform today.
          expectString(ctx, `${rp}.match`, r.match, { required: true, enumOf: CLASSIFY_MATCHES });
          expectString(ctx, `${rp}.text`, r.text, { required: true, maxLength: L.MAX_LABEL });
          expectString(ctx, `${rp}.value`, r.value, { required: true, maxLength: L.MAX_LABEL });
        });
      }
      return 'string';
    }
    case 'datePart':
      rejectUnknown(ctx, path, entry, ['name', 'op', 'field', 'part']);
      numericRef(`${path}.field`, entry.field);
      expectString(ctx, `${path}.part`, entry.part, { required: true, enumOf: DATE_PARTS });
      return entry.part === 'dateKey' || entry.part === 'isoString' ? 'string' : 'number';
    default:
      return null;
  }
}

/** @returns {Set<string>} every field name available on a transformed record */
function validateTransform(ctx, def, columnTypes) {
  // Source columns are readable as fields from the start: a definition that uses a
  // column as-is should not have to restate it in transform.fields.
  const known = new Set(columnTypes.keys());
  // Separate set so that re-declaring a column under the same name is allowed while
  // two transform entries sharing a name is not.
  const declared = new Set();
  const transform = expectObject(ctx, 'transform', def.transform, { required: true });
  if (!transform) return known;

  rejectUnknown(ctx, 'transform', transform, ['timestampField', 'entityField', 'fields', 'derived']);

  const tsField = expectIdent(ctx, 'transform.timestampField', transform.timestampField);
  if (tsField && !columnTypes.has(tsField)) {
    ctx.add('transform.timestampField', `References unknown source column "${tsField}"`, `one of: ${[...columnTypes.keys()].join(', ')}`);
  } else if (tsField && columnTypes.get(tsField) !== 'date') {
    ctx.add('transform.timestampField', `Source column "${tsField}" is declared as type "${columnTypes.get(tsField)}"`, 'a source column with type "date"');
  }

  const fields = transform.fields === undefined ? [] : expectArray(ctx, 'transform.fields', transform.fields, { max: L.MAX_FIELDS });
  if (fields) {
    fields.forEach((f, i) => {
      const p = `transform.fields[${i}]`;
      if (!expectObject(ctx, p, f, { required: true })) return;
      rejectUnknown(ctx, p, f, ['name', 'from', 'type', 'default', 'dropRowIfNull']);

      const name = expectIdent(ctx, `${p}.name`, f.name);
      const from = expectIdent(ctx, `${p}.from`, f.from);
      if (from && !columnTypes.has(from)) {
        ctx.add(`${p}.from`, `References unknown source column "${from}"`, `one of: ${[...columnTypes.keys()].join(', ')}`);
      }
      expectString(ctx, `${p}.type`, f.type, { required: true, enumOf: FIELD_TYPES });
      expectBoolean(ctx, `${p}.dropRowIfNull`, f.dropRowIfNull, false);
      if (f.default !== undefined && f.default !== null) {
        if (typeof f.default === 'string') expectString(ctx, `${p}.default`, f.default, { maxLength: L.MAX_LABEL });
        else expectNumber(ctx, `${p}.default`, f.default);
      }
      if (name) {
        if (declared.has(name)) ctx.add(`${p}.name`, `Duplicate field name "${name}"`, 'a name unique across transform.fields and transform.derived');
        else declared.add(name);
        known.add(name);
      }
    });
  }

  // entityField names the "who" column (PLMN, SAM, site). Its distinct values are
  // listed on the summary; it is validated after fields so it may name a derived one.
  const deferredEntityCheck = transform.entityField;

  const derived = transform.derived === undefined ? [] : expectArray(ctx, 'transform.derived', transform.derived, { max: L.MAX_DERIVED });
  if (derived) {
    derived.forEach((d, i) => {
      const p = `transform.derived[${i}]`;
      if (!expectObject(ctx, p, d, { required: true })) return;
      const name = expectIdent(ctx, `${p}.name`, d.name);
      // Operands may only reference fields declared *earlier*: the interpreter
      // evaluates derived entries top to bottom in one pass, so forward references
      // would silently read undefined. Rejecting them here makes the order explicit.
      validateDerivedOp(ctx, p, d, known);
      if (name) {
        if (declared.has(name)) ctx.add(`${p}.name`, `Duplicate field name "${name}"`, 'a name unique across transform.fields and transform.derived');
        else declared.add(name);
        known.add(name);
      }
    });
  }

  if (deferredEntityCheck !== undefined) {
    const ef = expectIdent(ctx, 'transform.entityField', deferredEntityCheck);
    if (ef && !known.has(ef) && !columnTypes.has(ef)) {
      ctx.add('transform.entityField', `References unknown field "${ef}"`, `one of: ${[...known, ...columnTypes.keys()].slice(0, 12).join(', ')}`);
    }
  }

  return known;
}

/** @returns {{ streamKeys: string[], pointFields: Set<string> }} */
function validateSeries(ctx, def, knownFields) {
  const result = { streamKeys: [], pointFields: new Set(['total', 'value']) };
  const series = expectObject(ctx, 'series', def.series, { required: true });
  if (!series) return result;

  rejectUnknown(ctx, 'series', series, [
    'valueField',
    'aggregate',
    'totalMode',
    'streams',
    'granularity',
    'granularityLabels',
    'spanFormat',
    'includeDailyPeaks',
    'splitOutputKey',
    'totalColor',
    'totalFill',
  ]);

  const valueField = expectIdent(ctx, 'series.valueField', series.valueField);
  if (valueField && !knownFields.has(valueField)) {
    ctx.add('series.valueField', `References unknown field "${valueField}"`, `one of the transform fields: ${[...knownFields].slice(0, 12).join(', ')}`);
  }

  expectString(ctx, 'series.aggregate', series.aggregate, { enumOf: AGGREGATES });
  const totalMode = expectString(ctx, 'series.totalMode', series.totalMode, { enumOf: TOTAL_MODES });
  expectString(ctx, 'series.spanFormat', series.spanFormat, { enumOf: SPAN_FORMATS });

  const gl = expectObject(ctx, 'series.granularityLabels', series.granularityLabels);
  if (gl) {
    rejectUnknown(ctx, 'series.granularityLabels', gl, GRANULARITY_KEYS);
    for (const k of GRANULARITY_KEYS) {
      if (gl[k] !== undefined) expectString(ctx, `series.granularityLabels.${k}`, gl[k], { maxLength: L.MAX_LABEL });
    }
  }
  expectString(ctx, 'series.granularity', series.granularity, { enumOf: GRANULARITIES });
  expectBoolean(ctx, 'series.includeDailyPeaks', series.includeDailyPeaks, true);
  if (series.splitOutputKey !== undefined) expectIdent(ctx, 'series.splitOutputKey', series.splitOutputKey);
  if (series.totalColor !== undefined) expectString(ctx, 'series.totalColor', series.totalColor, { maxLength: 40, pattern: L.HEX_COLOR_PATTERN });
  if (series.totalFill !== undefined) expectString(ctx, 'series.totalFill', series.totalFill, { maxLength: 40, pattern: L.FILL_PATTERN });

  const streams = series.streams === undefined ? [] : expectArray(ctx, 'series.streams', series.streams, { max: L.MAX_STREAMS });
  if (streams) {
    streams.forEach((s, i) => {
      const p = `series.streams[${i}]`;
      if (!expectObject(ctx, p, s, { required: true })) return;
      rejectUnknown(ctx, p, s, ['key', 'label', 'from', 'color', 'fill', 'sharePctField']);

      const key = expectIdent(ctx, `${p}.key`, s.key);
      expectString(ctx, `${p}.label`, s.label, { required: true, maxLength: L.MAX_LABEL });
      if (s.color !== undefined) expectString(ctx, `${p}.color`, s.color, { maxLength: 40, pattern: L.HEX_COLOR_PATTERN });
      if (s.fill !== undefined) expectString(ctx, `${p}.fill`, s.fill, { maxLength: 40, pattern: L.FILL_PATTERN });

      const from = expectObject(ctx, `${p}.from`, s.from, { required: true });
      if (from) {
        rejectUnknown(ctx, `${p}.from`, from, ['field', 'equals']);
        const f = expectIdent(ctx, `${p}.from.field`, from.field);
        if (f && !knownFields.has(f)) {
          ctx.add(`${p}.from.field`, `References unknown field "${f}"`, `one of the transform fields: ${[...knownFields].slice(0, 12).join(', ')}`);
        }
        if (from.equals !== undefined) {
          // `equals` means: this stream is a *slice* of series.valueField selected by
          // the value of `field`. Without it, `field` itself carries the stream value.
          expectString(ctx, `${p}.from.equals`, from.equals, { maxLength: L.MAX_LABEL });
          if (!valueField) {
            ctx.add(`${p}.from.equals`, 'A stream selected by value requires series.valueField to be set', 'series.valueField naming the numeric field to split');
          }
        }
      }

      let sharePctField = null;
      if (s.sharePctField !== undefined) sharePctField = expectIdent(ctx, `${p}.sharePctField`, s.sharePctField);

      if (key) {
        if (result.streamKeys.includes(key)) {
          ctx.add(`${p}.key`, `Duplicate stream key "${key}"`, 'a key unique across series.streams');
        } else {
          result.streamKeys.push(key);
          result.pointFields.add(key);
          result.pointFields.add(sharePctField || `${key}SharePct`);
        }
      }
    });
  }

  if (totalMode === 'streams' && result.streamKeys.length === 0) {
    ctx.add('series.totalMode', 'totalMode "streams" needs streams to add together', 'at least one entry in series.streams, or totalMode "valueField"');
  }

  if (!valueField && result.streamKeys.length === 0) {
    ctx.add('series', 'A series needs something to measure', 'either series.valueField or at least one entry in series.streams');
  }

  return result;
}

function validateMetrics(ctx, def, knownFields, seriesInfo) {
  const metricKeys = new Set();
  const metrics = expectArray(ctx, 'metrics', def.metrics, { required: true, min: 1, max: L.MAX_METRICS });
  if (!metrics) return metricKeys;

  metrics.forEach((m, i) => {
    const p = `metrics[${i}]`;
    if (!expectObject(ctx, p, m, { required: true })) return;
    rejectUnknown(ctx, p, m, ['key', 'label', 'op', 'over', 'field', 'fields', 'ofField', 'value', 'ref', 'round', 'format', 'unit', 'internal']);

    const key = expectIdent(ctx, `${p}.key`, m.key);
    expectString(ctx, `${p}.label`, m.label, { maxLength: L.MAX_LABEL });
    const op = expectString(ctx, `${p}.op`, m.op, { required: true, enumOf: METRIC_OPS });
    const over = m.over === undefined ? 'series' : expectString(ctx, `${p}.over`, m.over, { enumOf: METRIC_SOURCES });
    if (m.round !== undefined) expectNumber(ctx, `${p}.round`, m.round, { min: 0, max: L.MAX_ROUND, integer: true });
    if (m.format !== undefined) expectString(ctx, `${p}.format`, m.format, { enumOf: FORMATS });
    if (m.unit !== undefined) expectString(ctx, `${p}.unit`, m.unit, { maxLength: 20 });

    const fieldUniverse = over === 'records' ? knownFields : seriesInfo.pointFields;
    const checkField = (name, value, { required = true } = {}) => {
      if (value === undefined && !required) return;
      const id = expectIdent(ctx, `${p}.${name}`, value, { required });
      if (id && !fieldUniverse.has(id)) {
        ctx.add(
          `${p}.${name}`,
          `References "${id}", which is not available on ${over === 'records' ? 'a transformed record' : 'a series point'}`,
          `one of: ${[...fieldUniverse].slice(0, 12).join(', ')}`
        );
      }
    };

    switch (op) {
      case 'sum':
        // `sum` accepts either one field or a list. The list form totals each field
        // separately and then adds the totals — which is not the same floating-point
        // operation as adding row by row, and is how a "combined" metric over
        // partitioned streams should be computed.
        if (m.fields !== undefined) {
          if (m.field !== undefined) {
            ctx.add(`${p}.fields`, 'A metric may specify "field" or "fields", not both', 'exactly one of them');
          }
          const list = expectArray(ctx, `${p}.fields`, m.fields, { required: true, min: 1, max: L.MAX_STREAMS });
          if (list) list.forEach((f, j) => checkField(`fields[${j}]`, f));
        } else {
          checkField('field', m.field);
        }
        break;
      case 'avg':
      case 'min':
      case 'max':
      case 'first':
      case 'last':
      case 'countDistinct':
        checkField('field', m.field);
        break;
      case 'count':
        break;
      case 'sharePct':
        checkField('field', m.field);
        if (m.ofField !== undefined) checkField('ofField', m.ofField);
        break;
      case 'peakLabel':
      case 'peakValue':
      case 'minLabel':
      case 'minValue':
      case 'latestLabel':
      case 'latestValue':
        if (m.field !== undefined) checkField('field', m.field);
        if (over === 'records') {
          ctx.add(`${p}.over`, `Operation "${op}" only makes sense over the aggregated series`, '"series" (or omit "over")');
        }
        break;
      case 'constant':
        if (typeof m.value === 'string') expectString(ctx, `${p}.value`, m.value, { maxLength: L.MAX_TEXT });
        else expectNumber(ctx, `${p}.value`, m.value, { required: true });
        break;
      case 'builtin':
        expectString(ctx, `${p}.ref`, m.ref, { required: true, enumOf: BUILTIN_REFS });
        break;
      default:
        break;
    }

    if (key) {
      if (metricKeys.has(key)) ctx.add(`${p}.key`, `Duplicate metric key "${key}"`, 'a key unique across metrics');
      else metricKeys.add(key);
    }
  });

  return metricKeys;
}

function validateCharts(ctx, def, seriesInfo) {
  const charts = def.charts === undefined ? [] : expectArray(ctx, 'charts', def.charts, { max: L.MAX_CHARTS });
  if (!charts) return;

  const ids = new Set();
  charts.forEach((c, i) => {
    const p = `charts[${i}]`;
    if (!expectObject(ctx, p, c, { required: true })) return;
    rejectUnknown(ctx, p, c, ['id', 'type', 'title', 'description', 'source', 'series', 'appendGranularity', 'stacked', 'tension', 'fillArea']);

    const id = expectString(ctx, `${p}.id`, c.id, { required: true, maxLength: 63, pattern: L.CHART_ID_PATTERN });
    const type = expectString(ctx, `${p}.type`, c.type, { required: true, enumOf: CHART_TYPES });
    expectString(ctx, `${p}.title`, c.title, { required: true, maxLength: L.MAX_NAME });
    expectString(ctx, `${p}.description`, c.description, { maxLength: L.MAX_TEXT });
    const source = c.source === undefined ? 'series' : expectString(ctx, `${p}.source`, c.source, { enumOf: CHART_SOURCES });
    expectBoolean(ctx, `${p}.appendGranularity`, c.appendGranularity, false);
    expectBoolean(ctx, `${p}.stacked`, c.stacked, false);
    expectBoolean(ctx, `${p}.fillArea`, c.fillArea, type === 'area');
    if (c.tension !== undefined) expectNumber(ctx, `${p}.tension`, c.tension, { min: 0, max: 1 });

    if (source === 'split') {
      // A split chart draws the stream totals; it has no per-point series list.
      if (c.series !== undefined) {
        ctx.add(`${p}.series`, 'A chart with source "split" draws the stream totals and takes no series list', 'omit "series" when source is "split"');
      }
      if (seriesInfo.streamKeys.length === 0) {
        ctx.add(`${p}.source`, 'A chart with source "split" needs streams to split by', 'at least one entry in series.streams');
      }
      return;
    }

    const list = expectArray(ctx, `${p}.series`, c.series, { required: true, min: 1, max: L.MAX_CHART_SERIES });
    if (list) {
      list.forEach((s, j) => {
        const sp = `${p}.series[${j}]`;
        if (!expectObject(ctx, sp, s, { required: true })) return;
        rejectUnknown(ctx, sp, s, ['field', 'label', 'color', 'fill', 'stack', 'fillArea']);
        const f = expectIdent(ctx, `${sp}.field`, s.field);
        if (f && !seriesInfo.pointFields.has(f)) {
          ctx.add(`${sp}.field`, `References "${f}", which is not a field on a series point`, `one of: ${[...seriesInfo.pointFields].join(', ')}`);
        }
        expectString(ctx, `${sp}.label`, s.label, { maxLength: L.MAX_LABEL });
        if (s.color !== undefined) expectString(ctx, `${sp}.color`, s.color, { maxLength: 40, pattern: L.HEX_COLOR_PATTERN });
        if (s.fill !== undefined) expectString(ctx, `${sp}.fill`, s.fill, { maxLength: 40, pattern: L.FILL_PATTERN });
        expectString(ctx, `${sp}.stack`, s.stack, { maxLength: 40 });
        expectBoolean(ctx, `${sp}.fillArea`, s.fillArea, false);
      });
    }

    if (id) {
      if (ids.has(id)) ctx.add(`${p}.id`, `Duplicate chart id "${id}"`, 'an id unique across charts');
      else ids.add(id);
    }
  });
}

/** Templates may only interpolate `{token}` where token is a known metric or point field. */
function validateTemplate(ctx, path, value, allowedTokens, maxLength) {
  const s = expectString(ctx, path, value, { maxLength });
  if (s === null) return;
  const tokens = s.match(/\{[^}]*\}/g) || [];
  for (const raw of tokens) {
    const token = raw.slice(1, -1);
    if (!L.IDENT_PATTERN.test(token) || !allowedTokens.has(token)) {
      ctx.add(path, `Template refers to "${raw}", which is not a known value`, `tokens drawn from: ${[...allowedTokens].slice(0, 12).join(', ')}…`);
    }
  }
}

function validatePresentation(ctx, def, metricKeys) {
  const pres = expectObject(ctx, 'presentation', def.presentation);
  if (!pres) return;
  rejectUnknown(ctx, 'presentation', pres, ['title', 'kpiName', 'subtitle', 'highlights', 'narrativeTemplate', 'narrativeLongTemplate', 'teams']);

  expectString(ctx, 'presentation.title', pres.title, { maxLength: L.MAX_NAME });
  expectString(ctx, 'presentation.kpiName', pres.kpiName, { maxLength: L.MAX_NAME });
  expectString(ctx, 'presentation.subtitle', pres.subtitle, { maxLength: L.MAX_TEXT });

  const highlights = pres.highlights === undefined ? null : expectArray(ctx, 'presentation.highlights', pres.highlights, { max: L.MAX_HIGHLIGHTS });
  if (highlights) {
    highlights.forEach((h, i) => {
      const p = `presentation.highlights[${i}]`;
      if (!expectObject(ctx, p, h, { required: true })) return;
      rejectUnknown(ctx, p, h, ['label', 'metric', 'format', 'unit', 'trend']);
      // A highlight label may itself interpolate metrics ("Peak {periodLabel}"),
      // which is how the cmg report titles its peak row.
      validateTemplate(ctx, `${p}.label`, h.label, metricKeys, L.MAX_LABEL);
      const metric = expectIdent(ctx, `${p}.metric`, h.metric);
      if (metric && !metricKeys.has(metric)) {
        ctx.add(`${p}.metric`, `References unknown metric "${metric}"`, `one of the declared metrics: ${[...metricKeys].slice(0, 12).join(', ')}`);
      }
      if (h.format !== undefined) expectString(ctx, `${p}.format`, h.format, { enumOf: FORMATS });
      if (h.unit !== undefined) expectString(ctx, `${p}.unit`, h.unit, { maxLength: 20 });
      if (h.trend !== undefined) expectString(ctx, `${p}.trend`, h.trend, { enumOf: TRENDS });
    });
  }

  validateTemplate(ctx, 'presentation.narrativeTemplate', pres.narrativeTemplate, metricKeys, L.MAX_TEMPLATE);
  validateTemplate(ctx, 'presentation.narrativeLongTemplate', pres.narrativeLongTemplate, metricKeys, L.MAX_TEMPLATE);

  const teams = expectObject(ctx, 'presentation.teams', pres.teams);
  if (teams) {
    rejectUnknown(ctx, 'presentation.teams', teams, ['themeColor', 'activityTitle', 'facts']);
    if (teams.themeColor !== undefined) {
      expectString(ctx, 'presentation.teams.themeColor', teams.themeColor, { maxLength: 8, pattern: /^[0-9a-fA-F]{6}$/ });
    }
    expectString(ctx, 'presentation.teams.activityTitle', teams.activityTitle, { maxLength: L.MAX_NAME });
    const facts = teams.facts === undefined ? null : expectArray(ctx, 'presentation.teams.facts', teams.facts, { max: L.MAX_FACTS });
    if (facts) {
      facts.forEach((f, i) => {
        const p = `presentation.teams.facts[${i}]`;
        if (!expectObject(ctx, p, f, { required: true })) return;
        rejectUnknown(ctx, p, f, ['name', 'metric', 'format', 'unit']);
        expectString(ctx, `${p}.name`, f.name, { required: true, maxLength: L.MAX_LABEL });
        const metric = expectIdent(ctx, `${p}.metric`, f.metric);
        if (metric && !metricKeys.has(metric)) {
          ctx.add(`${p}.metric`, `References unknown metric "${metric}"`, `one of the declared metrics: ${[...metricKeys].slice(0, 12).join(', ')}`);
        }
        if (f.format !== undefined) expectString(ctx, `${p}.format`, f.format, { enumOf: FORMATS });
        if (f.unit !== undefined) expectString(ctx, `${p}.unit`, f.unit, { maxLength: 20 });
      });
    }
  }
}

function validateAnomaliesAndTarget(ctx, def, seriesInfo) {
  const an = expectObject(ctx, 'anomalies', def.anomalies);
  if (an) {
    rejectUnknown(ctx, 'anomalies', an, ['method', 'sigma', 'direction', 'minPoints', 'field', 'type', 'format', 'messageTemplate']);
    if (an.format !== undefined) expectString(ctx, 'anomalies.format', an.format, { enumOf: FORMATS });
    expectString(ctx, 'anomalies.method', an.method, { enumOf: ANOMALY_METHODS });
    if (an.sigma !== undefined) expectNumber(ctx, 'anomalies.sigma', an.sigma, { min: 0.5, max: 6 });
    if (an.direction !== undefined) expectString(ctx, 'anomalies.direction', an.direction, { enumOf: ANOMALY_DIRECTIONS });
    if (an.minPoints !== undefined) expectNumber(ctx, 'anomalies.minPoints', an.minPoints, { min: 2, max: 1000, integer: true });
    expectString(ctx, 'anomalies.type', an.type, { maxLength: L.MAX_LABEL });
    if (an.field !== undefined) {
      const f = expectIdent(ctx, 'anomalies.field', an.field);
      if (f && !seriesInfo.pointFields.has(f)) {
        ctx.add('anomalies.field', `References "${f}", which is not a field on a series point`, `one of: ${[...seriesInfo.pointFields].join(', ')}`);
      }
    }
    // Anomaly messages interpolate point fields plus the point's label.
    const tokens = new Set([...seriesInfo.pointFields, 'label', 'timestamp']);
    validateTemplate(ctx, 'anomalies.messageTemplate', an.messageTemplate, tokens, L.MAX_TEXT);
  }

  const target = expectObject(ctx, 'target', def.target);
  if (target) {
    rejectUnknown(ctx, 'target', target, ['value', 'unit', 'direction', 'label']);
    expectNumber(ctx, 'target.value', target.value, { required: true });
    expectString(ctx, 'target.unit', target.unit, { maxLength: 20 });
    expectString(ctx, 'target.label', target.label, { maxLength: L.MAX_LABEL });
    if (target.direction !== undefined) expectString(ctx, 'target.direction', target.direction, { enumOf: TARGET_DIRECTIONS });
  }
}

/* -------------------------------------------------------------------- entry */

/**
 * Validate a workflow definition.
 *
 * @param {unknown} raw  Parsed JSON (never a string — callers parse first so that
 *                       a syntax error is reported separately from a schema error).
 * @returns {{ valid: boolean, errors: Array<{path:string,message:string,expected?:string}> }}
 */
function validateDefinition(raw) {
  const ctx = new Ctx();

  if (typeof raw === 'string') {
    ctx.add('', 'Definition was passed as a string; parse it as JSON first', 'a parsed JSON object');
    return { valid: false, errors: ctx.errors };
  }
  if (!isPlainObject(raw)) {
    ctx.add('', `Definition must be a JSON object, received ${Array.isArray(raw) ? 'an array' : typeof raw}`, 'a JSON object');
    return { valid: false, errors: ctx.errors };
  }

  // Size check before anything else: an oversized document is rejected without
  // walking it, so a pathological input cannot make the validator itself expensive.
  let serialized;
  try {
    serialized = JSON.stringify(raw);
  } catch (err) {
    ctx.add('', `Definition could not be serialized (${err.message}); it is probably cyclic`, 'plain JSON data');
    return { valid: false, errors: ctx.errors };
  }
  if (Buffer.byteLength(serialized, 'utf8') > L.MAX_DEFINITION_BYTES) {
    ctx.add('', `Definition is ${Buffer.byteLength(serialized, 'utf8')} bytes, which is too large`, `at most ${L.MAX_DEFINITION_BYTES} bytes`);
    return { valid: false, errors: ctx.errors };
  }

  rejectUnknown(ctx, '', raw, [
    'schemaVersion',
    'slug',
    'name',
    'description',
    'version',
    'metadata',
    'source',
    'transform',
    'series',
    'metrics',
    'charts',
    'presentation',
    'anomalies',
    'target',
  ]);

  validateIdentity(ctx, raw);
  const columnTypes = validateSource(ctx, raw);

  // Column keys are readable as fields too — a definition that maps a column
  // straight through does not need a redundant transform.fields entry.
  const knownFields = validateTransform(ctx, raw, columnTypes);
  for (const key of columnTypes.keys()) knownFields.add(key);

  const seriesInfo = validateSeries(ctx, raw, knownFields);
  const metricKeys = validateMetrics(ctx, raw, knownFields, seriesInfo);
  validateCharts(ctx, raw, seriesInfo);
  validatePresentation(ctx, raw, metricKeys);
  validateAnomaliesAndTarget(ctx, raw, seriesInfo);

  return { valid: ctx.errors.length === 0, errors: ctx.errors };
}

/** Render errors as a single human-readable block (logs, API messages, CLI). */
function formatErrors(errors) {
  return errors
    .map((e) => {
      const at = e.path ? `${e.path}: ` : '';
      const expected = e.expected ? ` — expected ${e.expected}` : '';
      return `${at}${e.message}${expected}`;
    })
    .join('\n');
}

module.exports = {
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  validateDefinition,
  formatErrors,
  // exported for the schema doc + tests to stay in step with the runtime rules
  vocabularies: {
    COLUMN_TYPES,
    HEADER_MATCH_MODES,
    FIELD_TYPES,
    DERIVED_OPS,
    CLASSIFY_MATCHES,
    DATE_PARTS,
    AGGREGATES,
    METRIC_OPS,
    METRIC_SOURCES,
    BUILTIN_REFS,
    CHART_TYPES,
    CHART_SOURCES,
    FORMATS,
    TRENDS,
    GRANULARITIES,
    TOTAL_MODES,
    SPAN_FORMATS,
    ANOMALY_METHODS,
    ANOMALY_DIRECTIONS,
    TARGET_DIRECTIONS,
  },
};
