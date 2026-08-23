const SERIES_COLORS = {
  mdc1: { line: '#3B9EFF', fill: 'rgba(59, 158, 255, 0.15)', label: 'MDC1' },
  mdc2: { line: '#FF6B35', fill: 'rgba(255, 107, 53, 0.15)', label: 'MDC2' },
  total: { line: '#4ADE80', fill: 'rgba(74, 222, 128, 0.12)', label: 'Total' },
};

const GRANULARITY_THRESHOLDS = [
  { key: 'subhourly', maxMedianMs: 45 * 60 * 1000, label: '15-minute', bucket: 'native' },
  { key: 'hourly', maxMedianMs: 3 * 60 * 60 * 1000, label: 'Hourly', bucket: 'hour' },
  { key: 'daily', maxMedianMs: 36 * 60 * 60 * 1000, label: 'Daily', bucket: 'day' },
  { key: 'weekly', maxMedianMs: Infinity, label: 'Weekly', bucket: 'week' },
];

function round(val, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function detectGranularity(sortedPoints) {
  if (sortedPoints.length < 2) {
    return { key: 'daily', label: 'Daily', bucket: 'day', medianIntervalMs: 86400000 };
  }
  const diffs = [];
  for (let i = 1; i < sortedPoints.length; i++) {
    diffs.push(new Date(sortedPoints[i].date).getTime() - new Date(sortedPoints[i - 1].date).getTime());
  }
  const med = median(diffs);
  for (const g of GRANULARITY_THRESHOLDS) {
    if (med <= g.maxMedianMs) return { ...g, medianIntervalMs: med };
  }
  return { key: 'weekly', label: 'Weekly', bucket: 'week', medianIntervalMs: med };
}

function formatPointLabel(date, granularityKey) {
  const d = new Date(date);
  if (granularityKey === 'hourly' || granularityKey === 'subhourly') {
    return d.toLocaleString('en-GB', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (granularityKey === 'daily') {
    return d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  if (granularityKey === 'weekly') {
    return `W${getWeekNumber(d)} ${d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}`;
  }
  return d.toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getWeekNumber(d) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
}

function bucketKey(date, bucket) {
  const d = new Date(date);
  if (bucket === 'native') return d.toISOString();
  if (bucket === 'hour') {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
  }
  if (bucket === 'day') return d.toISOString().split('T')[0];
  if (bucket === 'week') {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return start.toISOString().split('T')[0];
  }
  return d.toISOString();
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

function periodsToPoints(aggregatedPeriods) {
  return aggregatedPeriods.map((p) => ({
    date: new Date(p.date),
    timestamp: new Date(p.date).toISOString(),
    mdc1: round(p.MDC1),
    mdc2: round(p.MDC2),
    total: round(p.MDC1 + p.MDC2),
  }));
}

function finalizePoint(pt, granularityKey) {
  const total = round(pt.total);
  const mdc1 = round(pt.mdc1);
  const mdc2 = round(pt.mdc2);
  return {
    timestamp: pt.timestamp,
    bucketKey: pt.bucketKey,
    label: formatPointLabel(pt.date, granularityKey),
    mdc1,
    mdc2,
    total,
    value: total,
    mdc1SharePct: total > 0 ? round((mdc1 / total) * 100, 1) : 0,
  };
}

function aggregateCmgPoints(points, bucket, granularityKey) {
  const map = new Map();
  for (const p of points) {
    const key = bucketKey(p.date, bucket);
    if (!map.has(key)) {
      map.set(key, {
        bucketKey: key,
        timestamp: p.timestamp,
        date: new Date(p.date),
        mdc1: 0,
        mdc2: 0,
        total: 0,
      });
    }
    const pt = map.get(key);
    pt.mdc1 += p.mdc1;
    pt.mdc2 += p.mdc2;
    pt.total += p.total;
    if (p.date > pt.date) pt.date = new Date(p.date);
    if (p.date < new Date(pt.timestamp)) pt.timestamp = p.timestamp;
  }
  return [...map.values()]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map((pt) => finalizePoint(pt, granularityKey));
}

function buildNativeSeries(points, granularityKey) {
  return points.map((p) =>
    finalizePoint(
      {
        bucketKey: p.timestamp,
        timestamp: p.timestamp,
        date: p.date,
        mdc1: p.mdc1,
        mdc2: p.mdc2,
        total: p.total,
      },
      granularityKey
    )
  );
}

function findPeakPoint(series) {
  if (!series?.length) return null;
  const peak = series.reduce((best, pt) => (pt.total > best.total ? pt : best), series[0]);
  return {
    label: peak.label,
    timestamp: peak.timestamp,
    mdc1: peak.mdc1,
    mdc2: peak.mdc2,
    total: peak.total,
    volume: peak.total,
  };
}

function findMinPoint(series) {
  if (!series?.length) return null;
  const min = series.reduce((best, pt) => (pt.total < best.total ? pt : best), series[0]);
  return { label: min.label, timestamp: min.timestamp, total: min.total, volume: min.total };
}

function buildDailyPeaks(nativeSeries) {
  const byDay = new Map();
  for (const p of nativeSeries) {
    const dayKey = p.timestamp.slice(0, 10);
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(p);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, points]) => {
      const peak = points.reduce((best, pt) => (pt.total > best.total ? pt : best), points[0]);
      return {
        dayKey,
        dayLabel: new Date(dayKey).toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        periodLabel: peak.label,
        timestamp: peak.timestamp,
        mdc1: peak.mdc1,
        mdc2: peak.mdc2,
        total: peak.total,
      };
    });
}

function buildAvailableSpans(sorted, detected, buckets) {
  const options = [];
  if (sorted.length > 0) {
    options.push({
      id: 'native',
      label: `15-minute (${sorted.length} periods)`,
      granularity: detected.key,
      pointCount: sorted.length,
    });
  }
  if (buckets.hourly.length > 1 && buckets.hourly.length !== sorted.length) {
    options.push({
      id: 'hourly',
      label: `Hourly (${buckets.hourly.length} periods)`,
      granularity: 'hourly',
      pointCount: buckets.hourly.length,
    });
  }
  if (buckets.daily.length > 0) {
    options.push({
      id: 'daily',
      label: `Daily (${buckets.daily.length} days)`,
      granularity: 'daily',
      pointCount: buckets.daily.length,
    });
  }
  if (buckets.weekly.length > 1) {
    options.push({
      id: 'weekly',
      label: `Weekly (${buckets.weekly.length} weeks)`,
      granularity: 'weekly',
      pointCount: buckets.weekly.length,
    });
  }

  const autoId =
    detected.bucket === 'hour'
      ? 'hourly'
      : detected.bucket === 'day'
        ? 'daily'
        : detected.bucket === 'week'
          ? 'weekly'
          : 'native';

  return { auto: autoId, options };
}

function buildThroughputTimeSeries(aggregatedPeriods) {
  const sorted = periodsToPoints(aggregatedPeriods).sort((a, b) => a.date - b.date);
  const detected = detectGranularity(sorted);

  const native = buildNativeSeries(sorted, detected.key);
  const hourly = aggregateCmgPoints(sorted, 'hour', 'hourly');
  const daily = aggregateCmgPoints(sorted, 'day', 'daily');
  const weekly = aggregateCmgPoints(sorted, 'week', 'weekly');

  let primary = native;
  if (detected.bucket === 'hour') primary = hourly.length ? hourly : native;
  else if (detected.bucket === 'day') primary = daily.length ? daily : native;
  else if (detected.bucket === 'week') primary = weekly.length ? weekly : daily;

  const dailyPeaks = buildDailyPeaks(native);
  const spanStart = sorted[0]?.timestamp;
  const spanEnd = sorted[sorted.length - 1]?.timestamp;

  const seriesByView = { native, hourly, daily, weekly };
  const peaksByView = {
    native: findPeakPoint(native),
    hourly: findPeakPoint(hourly),
    daily: findPeakPoint(daily),
    weekly: findPeakPoint(weekly),
  };

  return {
    detected: {
      key: detected.key,
      label: detected.label,
      bucket: detected.bucket,
      medianIntervalMs: detected.medianIntervalMs,
      pointCount: primary.length,
      spanStart,
      spanEnd,
      spanLabel: spanStart && spanEnd ? formatSpanLabel(spanStart, spanEnd) : '—',
      periodLabel: detected.label.toLowerCase(),
      dayCount: dailyPeaks.length,
    },
    series: {
      native,
      hourly,
      daily,
      weekly,
      primary,
    },
    availableSpans: buildAvailableSpans(sorted, detected, { hourly, daily, weekly }),
    peak: findPeakPoint(primary),
    min: findMinPoint(primary),
    peaksByView,
    dailyPeaks,
    colors: SERIES_COLORS,
  };
}

function formatThroughputGbps(gbps) {
  const n = Number(gbps);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(2)} Tbps`;
  return `${n.toFixed(2)} Gbps`;
}

module.exports = {
  SERIES_COLORS,
  round,
  buildThroughputTimeSeries,
  formatThroughputGbps,
  formatPointLabel,
};
