/**
 * Time series for attached users.
 *
 * Attached users is a headcount at a moment, not a volume, so it is never added
 * up across time. Within one hour the four nodes are added together (that is how
 * many users the core holds at that hour). Across hours — a day, a week — each
 * bucket reports both its average and its peak hour; summing 24 hourly
 * headcounts would describe nobody.
 */

const SERIES_COLORS = {
  users2g: { line: '#A78BFA', fill: 'rgba(167, 139, 250, 0.35)', label: '2G' },
  users3g: { line: '#3B9EFF', fill: 'rgba(59, 158, 255, 0.35)', label: '3G' },
  users4g: { line: '#4ADE80', fill: 'rgba(74, 222, 128, 0.35)', label: '4G' },
  mdc1: { line: '#3B9EFF', fill: 'rgba(59, 158, 255, 0.15)', label: 'MDC1' },
  mdc2: { line: '#FF6B35', fill: 'rgba(255, 107, 53, 0.15)', label: 'MDC2' },
  total: { line: '#E6EDF3', fill: 'rgba(230, 237, 243, 0.08)', label: 'Total attached' },
  vlr: { line: '#FBBF24', fill: 'rgba(251, 191, 36, 0.15)', label: 'VLR subscribers' },
  bhca: { line: '#F472B6', fill: 'rgba(244, 114, 182, 0.15)', label: 'BHCA (Erlang)' },
  // Daily and weekly rows also carry their peak hour; these name those columns.
  peakTotal: { line: '#4ADE80', label: 'Peak hour (attached)' },
  peakVlr: { line: '#FBBF24', label: 'Peak VLR' },
  peakBhca: { line: '#F472B6', label: 'Peak BHCA' },
  hours: { line: '#8B949E', label: 'Hours in day' },
};

/** Fields carried by every point. The first five are the attach breakdown. */
const FIELDS = ['users2g', 'users3g', 'users4g', 'mdc1', 'mdc2', 'total', 'vlr', 'bhca'];

function round(val, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

function localDayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function bucketKey(date, bucket) {
  const d = new Date(date);
  if (bucket === 'day') return localDayKey(d);
  if (bucket === 'week') {
    return localDayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()));
  }
  return `${localDayKey(d)} ${d.getHours()}`;
}

function formatLabel(date, bucket) {
  const d = new Date(date);
  if (bucket === 'day') {
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  if (bucket === 'week') {
    return `Week of ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  }
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatSpanLabel(start, end) {
  if (!start || !end) return '—';
  const s = new Date(start);
  const e = new Date(end);
  if (s.toDateString() === e.toDateString()) {
    return s.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  return `${s.toLocaleDateString('en-GB')} – ${e.toLocaleDateString('en-GB')}`;
}

/**
 * One point per hour: every node's reading for that hour, added together.
 * `records` are { date, measure, site, value } from the source.
 */
function buildHourlyPoints(records) {
  const byHour = new Map();
  for (const r of records) {
    const key = bucketKey(r.date, 'hour');
    if (!byHour.has(key)) {
      const date = new Date(r.date);
      date.setMinutes(0, 0, 0);
      byHour.set(key, { date, users2g: 0, users3g: 0, users4g: 0, mdc1: 0, mdc2: 0, vlr: 0, bhca: 0 });
    }
    const pt = byHour.get(key);
    pt[r.measure] += r.value;
    // The MDC split is of attached users only; VLR and BHCA are voice counters.
    if (r.measure.startsWith('users')) {
      if (r.site === 'MDC1') pt.mdc1 += r.value;
      else if (r.site === 'MDC2') pt.mdc2 += r.value;
    }
  }

  return [...byHour.values()]
    .sort((a, b) => a.date - b.date)
    .map((pt) => {
      const total = pt.users2g + pt.users3g + pt.users4g;
      return finalize(
        {
          ...pt,
          total,
          timestamp: pt.date.toISOString(),
          bucketKey: bucketKey(pt.date, 'hour'),
          label: formatLabel(pt.date, 'hour'),
        },
        null
      );
    });
}

function finalize(pt, peak) {
  const out = {
    timestamp: pt.timestamp,
    bucketKey: pt.bucketKey,
    label: pt.label,
  };
  for (const f of FIELDS) out[f] = round(pt[f] || 0, f === 'bhca' ? 1 : 0);
  out.value = out.total;
  out.users4gSharePct = out.total > 0 ? round((out.users4g / out.total) * 100, 1) : 0;
  out.mdc1SharePct = out.total > 0 ? round((out.mdc1 / out.total) * 100, 1) : 0;
  if (peak) {
    out.peakTotal = peak.total;
    out.peakAt = peak.label;
    out.peakVlr = peak.vlr;
    out.peakBhca = peak.bhca;
    out.hours = peak.hours;
  }
  return out;
}

/**
 * Days or weeks: each field is the average of the hourly values in the bucket,
 * and the bucket also names its peak hour.
 */
function buildBuckets(hourly, bucket) {
  const groups = new Map();
  for (const p of hourly) {
    const key = bucketKey(p.timestamp, bucket);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, points]) => {
      const avg = {};
      for (const f of FIELDS) avg[f] = points.reduce((s, p) => s + p[f], 0) / points.length;
      const peakPoint = points.reduce((best, p) => (p.total > best.total ? p : best), points[0]);
      const start = new Date(points[0].timestamp);
      const bucketStart =
        bucket === 'week'
          ? new Date(start.getFullYear(), start.getMonth(), start.getDate() - start.getDay())
          : new Date(start.getFullYear(), start.getMonth(), start.getDate());
      return finalize(
        {
          ...avg,
          timestamp: points[0].timestamp,
          bucketKey: key,
          label: formatLabel(bucketStart, bucket),
        },
        {
          total: peakPoint.total,
          label: peakPoint.label,
          vlr: Math.max(...points.map((p) => p.vlr)),
          bhca: Math.max(...points.map((p) => p.bhca)),
          hours: points.length,
        }
      );
    });
}

function findPeak(series, field = 'total') {
  if (!series?.length) return null;
  const peak = series.reduce((best, p) => (p[field] > best[field] ? p : best), series[0]);
  return { ...peak, volume: peak[field] };
}

function findMin(series, field = 'total') {
  if (!series?.length) return null;
  const min = series.reduce((best, p) => (p[field] < best[field] ? p : best), series[0]);
  return { ...min, volume: min[field] };
}

function buildAttachTimeSeries(records) {
  const hourly = buildHourlyPoints(records);
  const daily = buildBuckets(hourly, 'day');
  const weekly = daily.length > 7 ? buildBuckets(hourly, 'week') : [];

  const spanStart = hourly[0]?.timestamp;
  const spanEnd = hourly[hourly.length - 1]?.timestamp;

  const options = [
    { id: 'native', label: `Hourly (${hourly.length} hours)`, granularity: 'hourly', pointCount: hourly.length },
  ];
  if (daily.length > 1) {
    options.push({ id: 'daily', label: `Daily average (${daily.length} days)`, granularity: 'daily', pointCount: daily.length });
  }
  if (weekly.length > 1) {
    options.push({ id: 'weekly', label: `Weekly average (${weekly.length} weeks)`, granularity: 'weekly', pointCount: weekly.length });
  }

  return {
    detected: {
      key: 'hourly',
      label: 'Hourly',
      bucket: 'hour',
      pointCount: hourly.length,
      spanStart,
      spanEnd,
      spanLabel: formatSpanLabel(spanStart, spanEnd),
      periodLabel: 'hour',
      dayCount: daily.length,
    },
    series: { native: hourly, daily, weekly, primary: hourly },
    availableSpans: { auto: 'native', options },
    peak: findPeak(hourly),
    min: findMin(hourly),
    peaksByView: { native: findPeak(hourly), daily: findPeak(daily, 'peakTotal'), weekly: findPeak(weekly, 'peakTotal') },
    dailyPeaks: daily.map((d) => ({
      dayLabel: d.label,
      periodLabel: d.peakAt,
      total: d.peakTotal,
      average: d.total,
    })),
    colors: SERIES_COLORS,
  };
}

/** 1234567 → "1.23M", 23456 → "23.5K". */
function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString('en-US', { maximumFractionDigits: abs >= 100 ? 0 : 1 });
}

module.exports = { SERIES_COLORS, FIELDS, round, buildAttachTimeSeries, formatCount };
