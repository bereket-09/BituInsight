/**
 * Hard bounds for an imported workflow definition.
 *
 * Every bound exists because a definition is untrusted input: it arrives as JSON
 * produced by an external AI chat and pasted into our import UI by a human who
 * almost certainly did not read it line by line. The validator refuses anything
 * outside these bounds rather than trying to be helpful, because a definition
 * that is merely "large" is indistinguishable from one that is hostile — a
 * 50,000-entry alias list is a denial of service against the header matcher just
 * as surely as it is a typo.
 *
 * Trade-off: these numbers are deliberately generous relative to the three
 * hand-written workflows (which use at most 5 columns, 20 metrics, 4 charts) but
 * still small enough that the worst-case interpreter cost stays linear and tiny.
 * Raise them here, in one place, if a real KPI ever needs more.
 */
module.exports = {
  // Identity
  SLUG_PATTERN: /^[a-z0-9][a-z0-9-]{1,62}$/,
  VERSION_PATTERN: /^\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  IDENT_PATTERN: /^[A-Za-z][A-Za-z0-9_]{0,39}$/,
  CHART_ID_PATTERN: /^[a-z0-9][a-z0-9-]{1,62}$/,
  HEX_COLOR_PATTERN: /^#[0-9a-fA-F]{6}$/,
  // rgba()/hex fills, tightly bounded — no url(), no expression()
  FILL_PATTERN: /^(#[0-9a-fA-F]{6}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d{1,3})\s*)?\))$/,

  MAX_NAME: 120,
  MAX_LABEL: 80,
  MAX_DESCRIPTION: 1000,
  MAX_TEXT: 300,
  MAX_TEMPLATE: 4000,
  MAX_ALIAS: 120,

  MAX_COLUMNS: 40,
  MAX_ALIASES_PER_COLUMN: 24,
  MAX_SHEET_PATTERNS: 12,
  MAX_FIELDS: 40,
  MAX_DERIVED: 40,
  MAX_DERIVED_OPERANDS: 12,
  MAX_CLASSIFY_RULES: 24,
  MAX_STREAMS: 8,
  MAX_METRICS: 60,
  MAX_CHARTS: 12,
  MAX_CHART_SERIES: 8,
  MAX_HIGHLIGHTS: 16,
  MAX_FACTS: 20,
  MAX_TECHNOLOGY: 12,

  MAX_ROW_INDEX: 1000,
  MAX_ROUND: 6,
  MAX_DEFINITION_BYTES: 256 * 1024,

  /**
   * Keys that must never appear as a field/metric/stream identifier. IDENT_PATTERN
   * already forbids `__proto__` (leading underscore) but `constructor` and
   * `prototype` match it, and the interpreter writes fields onto plain records.
   * Cheaper to blacklist than to reason about every Object.assign downstream.
   */
  RESERVED_IDENTIFIERS: new Set(['constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty']),
};
