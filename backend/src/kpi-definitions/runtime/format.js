/**
 * Value formatting and template interpolation for database-defined workflows.
 *
 * The code workflows each carry their own formatter (formatVolume, formatThroughputGbps).
 * A definition cannot ship a function, so it picks a named format instead. The set is
 * deliberately small: these are the shapes the existing reports actually render.
 *
 * Interpolation is plain token substitution over a pre-built value map. It never
 * evaluates anything — an unknown token renders as an em dash rather than throwing,
 * because a cosmetic gap in a narrative should not fail a report.
 */

function round(val, decimals = 2) {
  if (!Number.isFinite(val)) return 0;
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

/** Mirrors traffic-volume/calculator.js formatBytes. */
function formatBytesLike(gb) {
  const n = Number(gb);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)} PB`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} TB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)} GB`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)} TB`;
  return n.toFixed(2);
}

/** Mirrors cmg-data-throughput/timeSeries.js formatThroughputGbps (unit-aware). */
function formatThroughputLike(value, unit = 'Gbps') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (unit === 'Gbps' && n >= 1000) return `${(n / 1000).toFixed(2)} Tbps`;
  return `${n.toFixed(2)}${unit ? ` ${unit}` : ''}`;
}

function formatCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

/**
 * @param {*} value
 * @param {string} format  one of number|integer|percent|text|throughput|bytes|compact
 * @param {string} unit    appended for number/throughput
 */
function formatValue(value, format = 'number', unit = '') {
  if (value === null || value === undefined) return '—';
  switch (format) {
    case 'text':
      return String(value);
    case 'integer': {
      const n = Number(value);
      return Number.isFinite(n) ? String(Math.round(n)) : String(value);
    }
    case 'percent': {
      const n = Number(value);
      return Number.isFinite(n) ? `${round(n, 2)}%` : String(value);
    }
    case 'throughput':
      return formatThroughputLike(value, unit || 'Gbps');
    case 'bytes':
      return formatBytesLike(value);
    case 'compact':
      return formatCompact(value);
    case 'number':
    default: {
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      const base = String(round(n, 2));
      return unit ? `${base} ${unit}` : base;
    }
  }
}

/**
 * Replace `{token}` with values[token]. Unknown tokens become '—' rather than being
 * left as literal braces, which would look like a bug in the rendered report.
 */
function interpolate(template, values) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{([A-Za-z][A-Za-z0-9_]{0,39})\}/g, (match, token) => {
    const v = values[token];
    return v === undefined || v === null ? '—' : String(v);
  });
}

module.exports = {
  round,
  formatValue,
  formatBytesLike,
  formatThroughputLike,
  formatCompact,
  interpolate,
};
