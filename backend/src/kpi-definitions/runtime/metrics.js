/**
 * Metric evaluation and anomaly detection for database-defined workflows.
 *
 * Metrics are named aggregations. Each one names an op from a closed set, a source
 * (`series` = the aggregated primary points, `records` = the transformed rows) and
 * a field. That is enough to reproduce every metric the three code workflows
 * compute, and it stays a data-driven fold — no expression parsing, no user code.
 *
 * A caveat worth stating: `sum` over `series` equals `sum` over `records` only
 * while series.aggregate is "sum". Under avg/max/min the two differ, which is a
 * feature (peak-of-peaks vs mean-of-rows) but a sharp edge, so definitions should
 * be explicit about `over`.
 */
const { round } = require('./format');

/**
 * Sum a field at full precision when the series carries hidden raw bucket values,
 * falling back to the displayed numbers for record-level sums.
 */
function exactSum(rows, field) {
  let total = 0;
  for (const r of rows) {
    const raw = r.__raw;
    const v = raw && raw[field] !== undefined ? raw[field] : Number(r[field]);
    if (Number.isFinite(v)) total += v;
  }
  return total;
}

function numbersOf(rows, field) {
  const out = [];
  for (const r of rows) {
    const v = Number(r[field]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

function evaluateMetric(spec, ctx) {
  const { series, records, detected } = ctx;
  const rows = spec.over === 'records' ? records : series;
  const decimals = spec.round === undefined ? 2 : spec.round;

  switch (spec.op) {
    case 'sum':
      // Field list: total each field first, then add the totals (see validator note).
      if (Array.isArray(spec.fields)) {
        return round(spec.fields.reduce((acc, f) => acc + exactSum(rows, f), 0), decimals);
      }
      return round(exactSum(rows, spec.field), decimals);
    case 'avg': {
      const vals = numbersOf(rows, spec.field);
      return vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length, decimals) : 0;
    }
    case 'min': {
      const vals = numbersOf(rows, spec.field);
      return vals.length ? round(Math.min(...vals), decimals) : 0;
    }
    case 'max': {
      const vals = numbersOf(rows, spec.field);
      return vals.length ? round(Math.max(...vals), decimals) : 0;
    }
    case 'count':
      return rows.length;
    case 'countDistinct': {
      const seen = new Set();
      for (const r of rows) {
        const v = r[spec.field];
        if (v !== null && v !== undefined && v !== '') seen.add(String(v));
      }
      return seen.size;
    }
    case 'first': {
      const v = rows[0]?.[spec.field];
      return typeof v === 'number' ? round(v, decimals) : (v ?? null);
    }
    case 'last': {
      const v = rows[rows.length - 1]?.[spec.field];
      return typeof v === 'number' ? round(v, decimals) : (v ?? null);
    }
    case 'sharePct': {
      const part = exactSum(rows, spec.field);
      const whole = exactSum(rows, spec.ofField || 'total');
      return whole > 0 ? round((part / whole) * 100, decimals) : 0;
    }
    case 'peakLabel':
      return ctx.peak?.label ?? 'N/A';
    case 'peakValue':
      return round(Number(ctx.peak?.[spec.field || 'total']) || 0, decimals);
    case 'minLabel':
      return ctx.min?.label ?? 'N/A';
    case 'minValue':
      return round(Number(ctx.min?.[spec.field || 'total']) || 0, decimals);
    case 'latestLabel':
      return series[series.length - 1]?.label ?? 'N/A';
    case 'latestValue':
      return round(Number(series[series.length - 1]?.[spec.field || 'total']) || 0, decimals);
    case 'constant':
      return spec.value;
    case 'builtin':
      switch (spec.ref) {
        case 'granularityKey':
          return detected.key;
        case 'granularityLabel':
          return detected.label;
        case 'periodLabel':
          return detected.periodLabel;
        case 'spanLabel':
          return detected.spanLabel;
        case 'spanStart':
          return detected.spanStart ?? null;
        case 'spanEnd':
          return detected.spanEnd ?? null;
        case 'pointCount':
          return detected.pointCount;
        case 'dayCount':
          return detected.dayCount;
        case 'recordCount':
          return records.length;
        case 'streamCount':
          return ctx.streams.length;
        default:
          return null;
      }
    default:
      return null;
  }
}

function evaluateMetrics(specs, ctx) {
  const metrics = {};
  for (const spec of specs) {
    const value = evaluateMetric(spec, ctx);
    if (spec.internal) {
      // Computed so highlights and narratives can interpolate it, but kept out
      // of the emitted metrics: the built-in workflows expose this only as
      // time-series context, so emitting it broke exact parity and wrote a
      // descriptive-only row to generated_metrics on every report.
      Object.defineProperty(metrics, spec.key, {
        value,
        enumerable: false,
        writable: false,
        configurable: true,
      });
      continue;
    }
    metrics[spec.key] = value;
  }
  return metrics;
}

/**
 * Standard-deviation spike detection, identical in method to the hand-written
 * detectors (mean + sigma * population stddev) so a converted workflow reports the
 * same anomalies. Only 'stddev' is supported; anything cleverer belongs in the
 * analytics layer, which already runs over every workflow's primary series.
 */
function detectAnomalies(series, spec, formatPointValue) {
  if (!spec) return [];
  const field = spec.field || 'total';
  const minPoints = spec.minPoints || 3;
  if (!Array.isArray(series) || series.length < minPoints) return [];

  const values = series.map((p) => Number(p[field]) || 0);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  const sigma = spec.sigma === undefined ? 2 : spec.sigma;
  const upper = mean + sigma * stdDev;
  const lower = mean - sigma * stdDev;
  const direction = spec.direction || 'above';

  return series
    .filter((p) => {
      const v = Number(p[field]) || 0;
      if (direction === 'above') return v > upper;
      if (direction === 'below') return v < lower;
      return v > upper || v < lower;
    })
    .map((p) => ({
      type: spec.type || 'spike',
      period: p.label,
      label: p.label,
      timestamp: p.timestamp,
      value: p[field],
      volume: p[field],
      message: formatPointValue(spec.messageTemplate, p),
    }));
}

module.exports = { evaluateMetrics, evaluateMetric, detectAnomalies };
