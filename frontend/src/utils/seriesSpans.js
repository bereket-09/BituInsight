/**
 * Time-span (granularity) helpers for report explorers and data tables.
 *
 * The backend already emits every bucketed view of a series — native, hourly,
 * daily, weekly, monthly — plus an `availableSpans` descriptor naming the ones
 * that carry data and how many points each holds. Nothing here recomputes those:
 * `getSpanViews` surfaces what the report already contains.
 *
 * This used to re-derive the views for percentage KPIs as means, because the
 * series builder only summed into buckets and a day of ~99% availability came
 * back as 9,504. The builder now takes an aggregate mode and averages those
 * KPIs at source, and existing reports were backfilled, so the browser no longer
 * corrects anything.
 */

export const SPAN_IDS = ['native', 'hourly', 'daily', 'weekly', 'monthly'];

/** "Hourly (72 periods)" -> "Hourly". The count is shown separately. */
export function spanShortName(option) {
  if (!option) return '';
  const raw = String(option.label ?? option.id ?? '');
  const stripped = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return stripped || String(option.id ?? '');
}

/** Local calendar day of an ISO timestamp, as `YYYY-MM-DD` — matches `<input type="date">`. */
export function localDateKey(timestamp) {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function weekNumber(d) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
}

/** Mirrors the label styles the backend builders produce, so views read alike. */
function formatBucketLabel(date, spanId) {
  const d = new Date(date);
  if (spanId === 'hourly' || spanId === 'native') {
    return d.toLocaleString('en-GB', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (spanId === 'daily') {
    return d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  if (spanId === 'weekly') {
    return `W${weekNumber(d)} ${d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}`;
  }
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

/** Local-time bucket key. Local throughout, so a bucket never straddles midnight twice. */
function bucketKeyFor(date, bucket) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  if (bucket === 'hour') {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`;
  }
  if (bucket === 'day') return localDateKey(date);
  if (bucket === 'week') {
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
    return localDateKey(start);
  }
  if (bucket === 'month') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  return new Date(date).toISOString();
}

function numericStreamKeys(point) {
  return Object.keys(point).filter(
    (key) =>
      !META_KEYS.has(key) && !key.endsWith('Pct') && typeof point[key] === 'number'
  );
}

/**
 * The spans this report can actually show, and the points behind each.
 *
 * @param {Object} timeSeries  a report's `calculated.timeSeries`

 * @returns {{auto: string, options: Array, series: Object}}
 */
export function getSpanViews(timeSeries) {
  const raw = timeSeries?.series;
  if (!raw) return { auto: 'native', options: [], series: {} };

  const native = raw.native || raw.primary || [];

  const series = {};
  for (const id of SPAN_IDS) {
    if (id === 'native') series.native = native;
    else series[id] = raw[id] || [];
  }

  // The descriptor decides which spans are worth offering.
  const declared = timeSeries.availableSpans?.options || [];
  const auto = timeSeries.availableSpans?.auto || 'native';

  const options = [];
  for (const id of SPAN_IDS) {
    const points = series[id] || [];
    if (!points.length) continue;
    const declaredOption = declared.find((opt) => opt.id === id);
    // Older reports predate the descriptor; the series they carry is still a span.
    if (!declaredOption && id !== 'native') continue;
    options.push({
      id,
      name: spanShortName(declaredOption) || DEFAULT_SPAN_NAMES[id],
      pointCount: points.length,
      isAuto: id === auto,
    });
  }

  const fallbackAuto = options.some((opt) => opt.id === auto) ? auto : options[0]?.id || 'native';
  return { auto: fallbackAuto, options, series };
}

const DEFAULT_SPAN_NAMES = {
  native: 'Raw',
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/** Inclusive filter on the local calendar day, matching `<input type="date">` values. */
export function filterSeriesByDate(series, from, to) {
  if (!from && !to) return series || [];
  return (series || []).filter((point) => {
    const day = localDateKey(point.timestamp);
    if (!day) return true;
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}

/** The local-day bounds of a series, for the date inputs' min/max. */
export function seriesDateBounds(series) {
  if (!series?.length) return { min: '', max: '' };
  let min = null;
  let max = null;
  for (const point of series) {
    const day = localDateKey(point.timestamp);
    if (!day) continue;
    if (min === null || day < min) min = day;
    if (max === null || day > max) max = day;
  }
  return { min: min || '', max: max || '' };
}

const META_KEYS = new Set([
  'timestamp',
  'bucketKey',
  'label',
  'shortLabel',
  'value',
  'total',
  'count',
  'date',
]);

// Share fields the hand-written builders name differently from `<stream>SharePct`.
const SHARE_ALIASES = {
  volume4g: 'contribution4gPct',
  volume2g3g: 'contribution2g3gPct',
};

function prettifyKey(key) {
  return key
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

/** Format one figure for display. CSV keeps the raw number instead. */
export function formatSeriesValue(value, unit) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (unit === '%') return `${n.toFixed(2)}%`;
  if (unit === 'Gbps') {
    if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(2)} Tbps`;
    return `${n.toFixed(2)} Gbps`;
  }
  if (unit) return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/**
 * Work out the columns for a series from the points themselves, so a workflow
 * defined in the database (whose stream keys are not known here) exports every
 * stream it carries rather than the total alone.
 *
 * @returns {Array<{key, label, unit, kind, colorKey}>}
 */
export function deriveSeriesColumns(series, options = {}) {
  const { colors, unit, valueLabel = 'Value', percentOnly = false } = options;
  const first = series?.[0];
  if (!first) return [];

  if (percentOnly) {
    return [{ key: 'value', label: valueLabel, unit: '%', kind: 'value' }];
  }

  const streams = numericStreamKeys(first).filter((key) =>
    // A stream that is zero for every point is not a stream this KPI measures;
    // telecom-metric reuses the traffic-volume builder and leaves both of its
    // volume fields at zero.
    series.some((point) => Number(point[key]) !== 0)
  );

  const columns = streams.map((key) => ({
    key,
    label: colors?.[key]?.label || prettifyKey(key),
    unit,
    kind: 'stream',
    colorKey: key,
  }));

  if ('total' in first || 'value' in first) {
    columns.push({
      key: 'total' in first ? 'total' : 'value',
      label: streams.length ? 'Total' : valueLabel,
      unit,
      kind: 'total',
      colorKey: streams.length ? 'total' : undefined,
    });
  }

  for (const key of streams) {
    const shareField = [`${key}SharePct`, SHARE_ALIASES[key]].find(
      (candidate) => candidate && candidate in first
    );
    if (shareField) {
      columns.push({
        key: shareField,
        label: `${colors?.[key]?.label || prettifyKey(key)} share`,
        unit: '%',
        kind: 'share',
      });
    }
  }

  return columns;
}

/**
 * Read one column's figure off a point. `value` and `total` are the same number
 * under two names across the builders, and only some views carry both.
 */
export function readCell(point, column) {
  if (!point || !column) return undefined;
  if (column.key === 'value') return point.value ?? point.total;
  if (column.key === 'total') return point.total ?? point.value;
  return point[column.key];
}
