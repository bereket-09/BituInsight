const SERIES_COLORS = {
  volume2g3g: { line: '#FF6B35', fill: 'rgba(255, 107, 53, 0.12)', label: '2G+3G' },
  volume4g: { line: '#3B9EFF', fill: 'rgba(59, 158, 255, 0.12)', label: '4G' },
  total: { line: '#4ADE80', fill: 'rgba(74, 222, 128, 0.12)', label: 'Total' },
  contribution4g: { line: '#00D4AA', fill: 'rgba(0, 212, 170, 0.08)', label: '4G %' },
};

const GRANULARITY_THRESHOLDS = [
  { key: 'subhourly', maxMedianMs: 45 * 60 * 1000, label: 'Sub-hourly', bucket: 'native' },
  { key: 'hourly', maxMedianMs: 3 * 60 * 60 * 1000, label: 'Hourly', bucket: 'hour' },
  { key: 'daily', maxMedianMs: 36 * 60 * 60 * 1000, label: 'Daily', bucket: 'day' },
  { key: 'weekly', maxMedianMs: 10 * 24 * 60 * 60 * 1000, label: 'Weekly', bucket: 'week' },
  { key: 'monthly', maxMedianMs: Infinity, label: 'Monthly', bucket: 'month' },
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

function detectGranularity(sortedRecords) {
  if (sortedRecords.length < 2) {
    return { key: 'daily', label: 'Daily', bucket: 'day', medianIntervalMs: 86400000 };
  }

  const diffs = [];
  for (let i = 1; i < sortedRecords.length; i++) {
    diffs.push(sortedRecords[i].date.getTime() - sortedRecords[i - 1].date.getTime());
  }
  const med = median(diffs);

  for (const g of GRANULARITY_THRESHOLDS) {
    if (med <= g.maxMedianMs) {
      return { key: g.key, label: g.label, bucket: g.bucket, medianIntervalMs: med };
    }
  }
  return { key: 'monthly', label: 'Monthly', bucket: 'month', medianIntervalMs: med };
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
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
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
  if (bucket === 'day') {
    return d.toISOString().split('T')[0];
  }
  if (bucket === 'week') {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return start.toISOString().split('T')[0];
  }
  if (bucket === 'month') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return d.toISOString();
}

function aggregateRecords(records, bucket, granularityKey) {
  const map = new Map();

  for (const r of records) {
    const key = bucketKey(r.date, bucket);
    if (!map.has(key)) {
      map.set(key, {
        bucketKey: key,
        timestamp: r.date.toISOString(),
        date: new Date(r.date),
        volume2g3g: 0,
        volume4g: 0,
        total: 0,
        count: 0,
      });
    }
    const pt = map.get(key);
    pt.volume2g3g += r.volume2g3g;
    pt.volume4g += r.volume4g;
    pt.total += r.totalVolume;
    pt.count += 1;
    if (r.date > pt.date) pt.date = new Date(r.date);
    if (r.date < new Date(pt.timestamp)) pt.timestamp = r.date.toISOString();
  }

  return [...map.values()]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map((pt) => finalizePoint(pt, granularityKey));
}

function finalizePoint(pt, granularityKey) {
  const total = round(pt.total);
  const volume2g3g = round(pt.volume2g3g);
  const volume4g = round(pt.volume4g);
  return {
    timestamp: pt.timestamp,
    bucketKey: pt.bucketKey,
    label: formatPointLabel(pt.date, granularityKey),
    shortLabel: new Date(pt.timestamp).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    }),
    volume2g3g,
    volume4g,
    total,
    contribution4gPct: total > 0 ? round((volume4g / total) * 100, 1) : 0,
    contribution2g3gPct: total > 0 ? round((volume2g3g / total) * 100, 1) : 0,
  };
}

function buildNativeSeries(records, granularityKey) {
  return records.map((r) =>
    finalizePoint(
      {
        timestamp: r.date.toISOString(),
        bucketKey: r.date.toISOString(),
        date: r.date,
        volume2g3g: r.volume2g3g,
        volume4g: r.volume4g,
        total: r.totalVolume,
        count: 1,
      },
      granularityKey
    )
  );
}

function formatSpanLabel(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  if (s.toDateString() === e.toDateString()) return s.toLocaleDateString('en-GB', opts);
  return `${s.toLocaleDateString('en-GB', opts)} – ${e.toLocaleDateString('en-GB', opts)}`;
}

function findPeakPoint(series) {
  if (!series.length) return null;
  return series.reduce((best, pt) => (pt.total > best.total ? pt : best), series[0]);
}

function findMinPoint(series) {
  if (!series.length) return null;
  return series.reduce((best, pt) => (pt.total < best.total ? pt : best), series[0]);
}

function detectAnomaliesOnSeries(series) {
  if (series.length < 3) return [];
  const values = series.map((p) => p.total);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  const threshold = mean + 2 * stdDev;

  return series
    .filter((p) => p.total > threshold)
    .map((p) => ({
      type: 'spike',
      period: p.label,
      volume: p.total,
      message: `Traffic spike at ${p.label}: ${formatVolume(p.total)}`,
    }));
}

function formatVolume(gb) {
  if (gb >= 1e9) return `${(gb / 1e9).toFixed(2)} B`;
  if (gb >= 1e6) return `${(gb / 1e6).toFixed(2)} M`;
  if (gb >= 1000) return `${(gb / 1000).toFixed(2)} T`;
  return `${gb.toFixed(2)} G`;
}

function buildTimeSeries(records) {
  const sorted = [...records].sort((a, b) => a.date - b.date);
  const detected = detectGranularity(sorted);

  const native = buildNativeSeries(sorted, detected.key);
  const byHour = aggregateRecords(sorted, 'hour', 'hourly');
  const byDay = aggregateRecords(sorted, 'day', 'daily');
  const byWeek = aggregateRecords(sorted, 'week', 'weekly');
  const byMonth = aggregateRecords(sorted, 'month', 'monthly');

  let primarySeries = native;
  if (detected.bucket === 'hour') primarySeries = byHour.length ? byHour : native;
  else if (detected.bucket === 'day') primarySeries = byDay.length ? byDay : native;
  else if (detected.bucket === 'week') primarySeries = byWeek.length ? byWeek : byDay;
  else if (detected.bucket === 'month') primarySeries = byMonth.length ? byMonth : byDay;

  const spanStart = sorted[0]?.date?.toISOString();
  const spanEnd = sorted[sorted.length - 1]?.date?.toISOString();
  const peak = findPeakPoint(primarySeries);
  const minPt = findMinPoint(primarySeries);

  return {
    detected: {
      granularity: detected.key,
      label: detected.label,
      bucket: detected.bucket,
      medianIntervalMs: detected.medianIntervalMs,
      pointCount: primarySeries.length,
      spanStart,
      spanEnd,
      spanLabel: spanStart && spanEnd ? formatSpanLabel(spanStart, spanEnd) : '—',
      periodLabel: detected.label === 'Daily' ? 'day' : detected.label.toLowerCase(),
    },
    series: {
      native,
      hourly: byHour,
      daily: byDay,
      weekly: byWeek,
      monthly: byMonth,
      primary: primarySeries,
    },
    availableSpans: buildAvailableSpans(sorted, detected, { native, byHour, byDay, byWeek, byMonth }),
    peak: peak
      ? { label: peak.label, volume: peak.total, timestamp: peak.timestamp }
      : null,
    min: minPt ? { label: minPt.label, volume: minPt.total, timestamp: minPt.timestamp } : null,
    colors: SERIES_COLORS,
  };
}

function buildAvailableSpans(sorted, detected, buckets) {
  const spans = [];
  if (sorted.length > 0) {
    spans.push({
      id: 'native',
      label: `Raw (${sorted.length} points)`,
      granularity: detected.key,
      pointCount: sorted.length,
    });
  }
  if (buckets.byHour.length > 1 && buckets.byHour.length !== sorted.length) {
    spans.push({ id: 'hourly', label: `Hourly (${buckets.byHour.length} points)`, granularity: 'hourly', pointCount: buckets.byHour.length });
  }
  if (buckets.byDay.length > 0) {
    spans.push({ id: 'daily', label: `Daily (${buckets.byDay.length} points)`, granularity: 'daily', pointCount: buckets.byDay.length });
  }
  if (buckets.byWeek.length > 1) {
    spans.push({ id: 'weekly', label: `Weekly (${buckets.byWeek.length} points)`, granularity: 'weekly', pointCount: buckets.byWeek.length });
  }
  if (buckets.byMonth.length > 1) {
    spans.push({ id: 'monthly', label: `Monthly (${buckets.byMonth.length} points)`, granularity: 'monthly', pointCount: buckets.byMonth.length });
  }

  const autoId =
    detected.bucket === 'hour'
      ? 'hourly'
      : detected.bucket === 'day'
        ? 'daily'
        : detected.bucket === 'week'
          ? 'weekly'
          : detected.bucket === 'month'
            ? 'monthly'
            : 'native';

  return { auto: autoId, options: spans };
}

module.exports = {
  SERIES_COLORS,
  buildTimeSeries,
  formatVolume,
  aggregateRecords,
};
