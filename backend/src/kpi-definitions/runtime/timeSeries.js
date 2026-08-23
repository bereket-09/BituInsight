/**
 * Generic time-series builder for database-defined workflows.
 *
 * This is a direct generalisation of the two hand-written builders
 * (traffic-volume/timeSeries.js and cmg-data-throughput/timeSeries.js). Those two
 * are 90% the same code with different field names hard-coded into it; here the
 * field names come from the definition and everything else is shared.
 *
 * The output shape is the union of what the two produce, so every downstream
 * consumer — the analytics core (which wants `{timestamp, label, total}`), the
 * chart builder, the PPTX exporter, the React views — keeps working unchanged:
 *
 *   {
 *     detected: { key, granularity, label, bucket, medianIntervalMs, pointCount,
 *                 spanStart, spanEnd, spanLabel, periodLabel, dayCount },
 *     series:  { native, hourly, daily, weekly, monthly, primary },
 *     availableSpans: { auto, options: [...] },
 *     peak, min, peaksByView, dailyPeaks, colors
 *   }
 *
 * Two deliberate deviations from the hand-written modules, both documented in the
 * report notes:
 *   - `native` aggregates rows that share an identical timestamp. cmg already did
 *     this (its calculator pre-aggregated by periodKey); traffic-volume did not, so
 *     a file with several PLMN rows per timestamp produced duplicate native points
 *     there. Bucketed views and every metric are unaffected because they aggregate
 *     anyway.
 *   - the granularity ladder always includes `monthly` (cmg's stopped at weekly).
 *     A cmg-shaped file never reaches monthly cadence, so the primary series is
 *     identical; the extra view is simply available if a slower feed ever arrives.
 */
const { round } = require('./format');

const GRANULARITY_THRESHOLDS = [
  { key: 'subhourly', maxMedianMs: 45 * 60 * 1000, label: 'Sub-hourly', bucket: 'native' },
  { key: 'hourly', maxMedianMs: 3 * 60 * 60 * 1000, label: 'Hourly', bucket: 'hour' },
  { key: 'daily', maxMedianMs: 36 * 60 * 60 * 1000, label: 'Daily', bucket: 'day' },
  { key: 'weekly', maxMedianMs: 10 * 24 * 60 * 60 * 1000, label: 'Weekly', bucket: 'week' },
  { key: 'monthly', maxMedianMs: Infinity, label: 'Monthly', bucket: 'month' },
];

const GRANULARITY_TO_VIEW = {
  native: 'native',
  hour: 'hourly',
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
};

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Apply the definition's label overrides. The two hand-written builders label the
 * same cadence differently ("15-minute" vs "Sub-hourly") and both strings appear in
 * user-visible report copy, so the definition gets to name them.
 */
function applyLabels(g, labels) {
  if (!labels || !labels[g.key]) return g;
  return { ...g, label: labels[g.key] };
}

function detectGranularity(sortedPoints, override, labels) {
  if (override && override !== 'auto') {
    const forced = GRANULARITY_THRESHOLDS.find((g) => GRANULARITY_TO_VIEW[g.bucket] === override || g.key === override);
    if (forced) return applyLabels({ ...forced, medianIntervalMs: 0, forced: true }, labels);
  }
  if (sortedPoints.length < 2) {
    return applyLabels({ key: 'daily', label: 'Daily', bucket: 'day', medianIntervalMs: 86400000 }, labels);
  }
  const diffs = [];
  for (let i = 1; i < sortedPoints.length; i++) {
    diffs.push(sortedPoints[i].date.getTime() - sortedPoints[i - 1].date.getTime());
  }
  const med = median(diffs);
  for (const g of GRANULARITY_THRESHOLDS) {
    if (med <= g.maxMedianMs) {
      return applyLabels({ key: g.key, label: g.label, bucket: g.bucket, medianIntervalMs: med }, labels);
    }
  }
  return applyLabels({ key: 'monthly', label: 'Monthly', bucket: 'month', medianIntervalMs: med }, labels);
}

function getWeekNumber(d) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7);
}

function formatPointLabel(date, granularityKey) {
  const d = new Date(date);
  if (granularityKey === 'hourly' || granularityKey === 'subhourly') {
    return d.toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  if (granularityKey === 'daily') {
    return d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  if (granularityKey === 'weekly') {
    return `W${getWeekNumber(d)} ${d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}`;
  }
  if (granularityKey === 'monthly') {
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  }
  return d.toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function bucketKey(date, bucket) {
  const d = new Date(date);
  if (bucket === 'native') return d.toISOString();
  if (bucket === 'hour') return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
  if (bucket === 'day') return d.toISOString().split('T')[0];
  if (bucket === 'week') {
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    return start.toISOString().split('T')[0];
  }
  if (bucket === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return d.toISOString();
}

/**
 * Two span styles, because the two hand-written builders disagree:
 *   'short'   -> "8 May 2026 – 11 May 2026"        (traffic-volume)
 *   'numeric' -> "08/05/2026 – 11/05/2026"          (cmg-data-throughput)
 * The definition picks one via series.spanFormat.
 */
function formatSpanLabel(start, end, style = 'short') {
  if (!start || !end) return '—';
  const s = new Date(start);
  const e = new Date(end);
  if (style === 'numeric') {
    if (s.toDateString() === e.toDateString()) {
      return s.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }
    return `${s.toLocaleDateString('en-GB')} – ${e.toLocaleDateString('en-GB')}`;
  }
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  if (s.toDateString() === e.toDateString()) return s.toLocaleDateString('en-GB', opts);
  return `${s.toLocaleDateString('en-GB', opts)} – ${e.toLocaleDateString('en-GB', opts)}`;
}

/** Accumulator honouring the definition's aggregate op. `avg` needs the count. */
function accumulate(target, key, value, aggregate) {
  if (!Number.isFinite(value)) return;
  if (aggregate === 'max') target[key] = target[key] === undefined ? value : Math.max(target[key], value);
  else if (aggregate === 'min') target[key] = target[key] === undefined ? value : Math.min(target[key], value);
  else target[key] = (target[key] || 0) + value;
}

/**
 * Turn transformed records into raw per-record points carrying `total` plus one
 * numeric field per declared stream.
 */
function recordsToRawPoints(records, spec) {
  const { valueField, streams } = spec;
  return records
    .map((r) => {
      const date = r.__date instanceof Date ? r.__date : new Date(r.__date);
      if (!(date instanceof Date) || isNaN(date.getTime())) return null;

      const point = { date, timestamp: date.toISOString() };
      let streamSum = 0;
      let anyStream = false;

      for (const s of streams) {
        let v;
        if (s.from.equals !== undefined) {
          // Slice mode: the row belongs to this stream when its selector matches.
          const selector = r[s.from.field];
          v = String(selector === undefined || selector === null ? '' : selector) === s.from.equals
            ? Number(r[valueField]) || 0
            : 0;
        } else {
          v = Number(r[s.from.field]) || 0;
        }
        point[s.key] = v;
        streamSum += v;
        anyStream = true;
      }

      if (valueField !== undefined && valueField !== null) {
        point.total = Number(r[valueField]) || 0;
      } else {
        point.total = anyStream ? streamSum : 0;
      }
      return point;
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
}

function finalizePoint(bucket, granularityKey, spec) {
  const { streams, aggregate } = spec;
  const divisor = aggregate === 'avg' && bucket.__count > 0 ? bucket.__count : 1;

  // totalMode decides where a bucket's `total` comes from:
  //   'valueField' — accumulate the measured field row by row (independent streams)
  //   'streams'    — add the finished stream buckets together (streams partition the
  //                  value field, so summing them is both the correct total and the
  //                  arithmetic the hand-written cmg module performs, down to the
  //                  floating-point accumulation order)
  const rawStreams = streams.map((s) => (bucket[s.key] || 0) / divisor);
  const total =
    spec.totalMode === 'streams'
      ? round(rawStreams.reduce((a, b) => a + b, 0))
      : round((bucket.total || 0) / divisor);

  const out = {
    timestamp: bucket.timestamp,
    bucketKey: bucket.bucketKey,
    label: formatPointLabel(bucket.date, granularityKey),
    shortLabel: new Date(bucket.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    total,
    value: total,
    count: bucket.__count,
  };

  const raw = { total: spec.totalMode === 'streams' ? rawStreams.reduce((a, b) => a + b, 0) : (bucket.total || 0) / divisor };

  streams.forEach((s, i) => {
    const v = round(rawStreams[i]);
    out[s.key] = v;
    out[s.sharePctField] = total > 0 ? round((v / total) * 100, 1) : 0;
    raw[s.key] = rawStreams[i];
  });

  // Full-precision bucket values, hidden from enumeration so they never reach JSON,
  // report_data or the API. Metrics that *sum* over the series read these instead of
  // the displayed 2-decimal values: adding 288 rounded numbers compounds the error
  // (~0.15 Gbps in 33,466 on the CMG sample), which is exactly how the hand-written
  // calculators behave — they total the unrounded periods and round once at the end.
  // Single-point reads (peak, latest, min) keep using the displayed value, where
  // rounding cannot compound.
  Object.defineProperty(out, '__raw', { value: raw, enumerable: false });

  return out;
}

function aggregatePoints(points, bucket, granularityKey, spec) {
  const map = new Map();

  for (const p of points) {
    const key = bucketKey(p.date, bucket);
    if (!map.has(key)) {
      map.set(key, { bucketKey: key, timestamp: p.timestamp, date: new Date(p.date), __count: 0 });
    }
    const acc = map.get(key);
    accumulate(acc, 'total', p.total, spec.aggregate);
    for (const s of spec.streams) accumulate(acc, s.key, p[s.key], spec.aggregate);
    acc.__count += 1;
    if (p.date > acc.date) acc.date = new Date(p.date);
    if (p.date < new Date(acc.timestamp)) acc.timestamp = p.timestamp;
  }

  return [...map.values()]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map((b) => finalizePoint(b, granularityKey, spec));
}

/** Peak/min carry the superset of both hand-written shapes (`total` and `volume`). */
function extremePoint(series, comparator) {
  if (!series || !series.length) return null;
  const best = series.reduce((acc, pt) => (comparator(pt.total, acc.total) ? pt : acc), series[0]);
  return { ...best, volume: best.total };
}

function buildDailyPeaks(series, spec) {
  const byDay = new Map();
  for (const p of series) {
    const dayKey = p.timestamp.slice(0, 10);
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(p);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, points]) => {
      const peak = points.reduce((best, pt) => (pt.total > best.total ? pt : best), points[0]);
      const entry = {
        dayKey,
        dayLabel: new Date(dayKey).toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        periodLabel: peak.label,
        timestamp: peak.timestamp,
        total: peak.total,
      };
      for (const s of spec.streams) entry[s.key] = peak[s.key];
      return entry;
    });
}

function buildAvailableSpans(nativeCount, detected, views) {
  const options = [];
  if (nativeCount > 0) {
    options.push({ id: 'native', label: `Raw (${nativeCount} points)`, granularity: detected.key, pointCount: nativeCount });
  }
  if (views.hourly.length > 1 && views.hourly.length !== nativeCount) {
    options.push({ id: 'hourly', label: `Hourly (${views.hourly.length} points)`, granularity: 'hourly', pointCount: views.hourly.length });
  }
  if (views.daily.length > 0) {
    options.push({ id: 'daily', label: `Daily (${views.daily.length} points)`, granularity: 'daily', pointCount: views.daily.length });
  }
  if (views.weekly.length > 1) {
    options.push({ id: 'weekly', label: `Weekly (${views.weekly.length} points)`, granularity: 'weekly', pointCount: views.weekly.length });
  }
  if (views.monthly.length > 1) {
    options.push({ id: 'monthly', label: `Monthly (${views.monthly.length} points)`, granularity: 'monthly', pointCount: views.monthly.length });
  }
  return { auto: GRANULARITY_TO_VIEW[detected.bucket] || 'native', options };
}

/**
 * @param {Array<Object>} records  transformed records, each carrying `__date`
 * @param {Object} spec  { valueField, aggregate, streams:[{key,label,from,sharePctField,color,fill}],
 *                         granularity, includeDailyPeaks, colors }
 */
function buildSeries(records, spec) {
  const raw = recordsToRawPoints(records, spec);
  const detected = detectGranularity(raw, spec.granularity, spec.granularityLabels);

  const native = aggregatePoints(raw, 'native', detected.key, spec);
  const hourly = aggregatePoints(raw, 'hour', 'hourly', spec);
  const daily = aggregatePoints(raw, 'day', 'daily', spec);
  const weekly = aggregatePoints(raw, 'week', 'weekly', spec);
  const monthly = aggregatePoints(raw, 'month', 'monthly', spec);

  const views = { native, hourly, daily, weekly, monthly };
  let primary = views[GRANULARITY_TO_VIEW[detected.bucket]] || native;
  if (!primary.length) primary = native;

  const dailyPeaks = spec.includeDailyPeaks === false ? [] : buildDailyPeaks(native, spec);
  const spanStart = raw[0]?.timestamp;
  const spanEnd = raw[raw.length - 1]?.timestamp;

  return {
    detected: {
      key: detected.key,
      granularity: detected.key,
      label: detected.label,
      bucket: detected.bucket,
      medianIntervalMs: detected.medianIntervalMs,
      pointCount: primary.length,
      spanStart,
      spanEnd,
      spanLabel: spanStart && spanEnd ? formatSpanLabel(spanStart, spanEnd, spec.spanFormat) : '—',
      periodLabel: detected.label === 'Daily' ? 'day' : detected.label.toLowerCase(),
      dayCount: dailyPeaks.length,
    },
    series: { ...views, primary },
    availableSpans: buildAvailableSpans(native.length, detected, views),
    peak: extremePoint(primary, (a, b) => a > b),
    min: extremePoint(primary, (a, b) => a < b),
    peaksByView: {
      native: extremePoint(native, (a, b) => a > b),
      hourly: extremePoint(hourly, (a, b) => a > b),
      daily: extremePoint(daily, (a, b) => a > b),
      weekly: extremePoint(weekly, (a, b) => a > b),
      monthly: extremePoint(monthly, (a, b) => a > b),
    },
    dailyPeaks,
    colors: spec.colors,
  };
}

module.exports = {
  buildSeries,
  detectGranularity,
  formatPointLabel,
  formatSpanLabel,
  bucketKey,
};
