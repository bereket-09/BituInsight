/**
 * Time series for a success-ratio KPI.
 *
 * A success ratio is a percentage, so it is **averaged** into a bucket, never
 * added: summing four quarter-hours of a 98% KPI gives 392, which is the exact
 * failure this builder exists to avoid. `traffic-volume/timeSeries.js` gained an
 * `aggregate: 'avg'` mode for the same reason; this builder needs more than that
 * one knob, because the customer also asked for per-node, per-data-centre and
 * combined figures, so it averages in two stages.
 *
 * The two stages, and why:
 *
 *  1. **Node → bucket.** A node's hourly (or daily) figure is the simple mean of
 *     that node's raw readings inside the bucket. Every reading covers an equal
 *     slice of wall-clock time, so a simple mean is the right one.
 *  2. **Node → data centre → combined.** A data centre's figure is the mean of
 *     its nodes' bucket figures; the combined figure is the mean of every node's
 *     bucket figure. Each node counts once.
 *
 * Stage 2 is deliberately *not* a count-weighted mean over the raw readings.
 * Weighting by reading count weights a node by how complete its data is, which
 * means nothing: the workbook carries no call-attempt or request denominators,
 * so there is no traffic weight available to use instead. Equal weight per node
 * also makes "per data centre is an average across that centre's nodes" exactly
 * true, and keeps a node that missed a period from quietly losing influence.
 *
 * Missing data is a gap, never a zero. A node with no reading in a bucket is
 * absent from that bucket's mean rather than contributing 0 — one MSS in the CS
 * export is short a period, and zero-filling it would drag an hour's figure down
 * by a quarter of its own value.
 */

const SERIES_COLORS = {
  combined: { line: '#00B140', fill: 'rgba(0, 177, 64, 0.14)', label: 'Combined' },
  total: { line: '#00B140', fill: 'rgba(0, 177, 64, 0.14)', label: 'Combined' },
  mdc1: { line: '#3B9EFF', fill: 'rgba(59, 158, 255, 0.14)', label: 'MDC1' },
  mdc2: { line: '#FF6B35', fill: 'rgba(255, 107, 53, 0.14)', label: 'MDC2' },
};

/** Node line colours, assigned in order so a node keeps its colour across charts. */
const NODE_COLORS = ['#3B9EFF', '#FF6B35', '#A78BFA', '#FBBF24', '#F472B6', '#4ADE80', '#22D3EE', '#FB7185'];

const SPANS = [
  { id: 'native', bucket: 'raw', name: 'Raw' },
  { id: 'hourly', bucket: 'hour', name: 'Hourly' },
  { id: 'daily', bucket: 'day', name: 'Daily' },
  { id: 'weekly', bucket: 'week', name: 'Weekly' },
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function round(value, decimals = 3) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * The start of the bucket a reading belongs to.
 *
 * The raw bucket floors onto the KPI's own cadence grid, which is what makes an
 * offset KPI behave: CSSR reports at :01, :03, :11 and :13 past each quarter
 * hour depending on the MSS, and all four land in the same 15-minute bucket
 * instead of being dropped or scattered across four of them. Every offset a UTC
 * zone can have is a whole number of 15 minutes, so epoch flooring and local
 * time agree on where the grid sits.
 */
function bucketStart(date, bucket, cadenceMs) {
  if (bucket === 'raw') return new Date(Math.floor(date.getTime() / cadenceMs) * cadenceMs);
  const d = new Date(date);
  if (bucket === 'hour') return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
  if (bucket === 'week') return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function bucketKeyOf(start, bucket) {
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  if (bucket === 'day' || bucket === 'week') return day;
  if (bucket === 'hour') return `${day}T${pad(start.getHours())}`;
  return `${day}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
}

function formatLabel(start, bucket) {
  if (bucket === 'day') {
    return start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  if (bucket === 'week') {
    return `Week of ${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  }
  return start.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSpanLabel(start, end) {
  if (!start || !end) return '—';
  const s = new Date(start);
  const e = new Date(end);
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  if (s.toDateString() === e.toDateString()) return s.toLocaleDateString('en-GB', opts);
  return `${s.toLocaleDateString('en-GB', opts)} – ${e.toLocaleDateString('en-GB', opts)}`;
}

/** How many readings one node is expected to contribute to a bucket. */
function expectedPerNode(bucket, cadenceMs) {
  if (bucket === 'raw') return 1;
  if (bucket === 'hour') return Math.max(1, Math.round(HOUR_MS / cadenceMs));
  if (bucket === 'day') return Math.max(1, Math.round(DAY_MS / cadenceMs));
  return Math.max(1, Math.round((7 * DAY_MS) / cadenceMs));
}

/**
 * Bucket one KPI's readings, averaging node → data centre → combined.
 *
 * @param {Array}  samples    [{ date, node, site, value }]
 * @param {string} bucket     'raw' | 'hour' | 'day' | 'week'
 * @param {Object} options    { cadenceMs, nodes: [{ node, site }] }
 */
function buildPoints(samples, bucket, { cadenceMs, nodes }) {
  const nodeSites = new Map(nodes.map((n) => [n.node, n.site]));
  const sites = [...new Set(nodes.map((n) => n.site).filter(Boolean))].sort();
  const perNodeExpected = expectedPerNode(bucket, cadenceMs);
  const buckets = new Map();

  for (const sample of samples) {
    const start = bucketStart(sample.date, bucket, cadenceMs);
    const key = start.getTime();
    let entry = buckets.get(key);
    if (!entry) {
      entry = { start, nodes: new Map() };
      buckets.set(key, entry);
    }
    let acc = entry.nodes.get(sample.node);
    if (!acc) {
      acc = { sum: 0, count: 0, min: Infinity, max: -Infinity };
      entry.nodes.set(sample.node, acc);
    }
    // Stage 1: the node's own readings, summed only so they can be divided.
    acc.sum += sample.value;
    acc.count += 1;
    if (sample.value < acc.min) acc.min = sample.value;
    if (sample.value > acc.max) acc.max = sample.value;
  }

  return [...buckets.values()]
    .sort((a, b) => a.start - b.start)
    .map((entry) => {
      const nodeValues = {};
      let readings = 0;
      for (const [node, acc] of entry.nodes) {
        nodeValues[node] = round(acc.sum / acc.count);
        readings += acc.count;
      }

      // Stage 2a: each data centre is the mean of its own nodes, nothing else.
      const siteValues = {};
      for (const site of sites) {
        const present = nodes
          .filter((n) => n.site === site && nodeValues[n.node] != null)
          .map((n) => nodeValues[n.node]);
        siteValues[site] = round(mean(present));
      }

      // Stage 2b: combined is the mean of every node that reported.
      const reporting = Object.values(nodeValues);
      const combined = round(mean(reporting));

      return {
        timestamp: entry.start.toISOString(),
        bucketKey: bucketKeyOf(entry.start, bucket),
        label: formatLabel(entry.start, bucket),
        shortLabel: entry.start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        // `total` is what the analytics layer and the shared data table read.
        total: combined,
        value: combined,
        mdc1: siteValues.MDC1 ?? null,
        mdc2: siteValues.MDC2 ?? null,
        // An object, so the generic column deriver leaves it out of the table.
        nodeValues,
        // Says how complete the bucket is. Never used to fill a value in: a
        // short bucket reports the mean of what arrived, and this is how the
        // report admits that fewer readings stood behind it.
        coverage: {
          readings,
          expected: nodes.length * perNodeExpected,
          nodesReporting: reporting.length,
        },
      };
    });
}

function extremeBy(points, pick) {
  if (!points?.length) return null;
  const withValue = points.filter((p) => p.total != null);
  if (!withValue.length) return null;
  return withValue.reduce((best, p) => (pick(p.total, best.total) ? p : best), withValue[0]);
}

function summarise(point) {
  if (!point) return null;
  return { label: point.label, timestamp: point.timestamp, value: point.total, total: point.total };
}

/**
 * Every bucketed view of one KPI, plus the descriptor the explorers read.
 *
 * `includeRaw` is off for the per-KPI payload of a multi-KPI report: 22 KPIs
 * times 672 raw points is a report nobody can load, and the customer asked for
 * hourly and daily figures. The report's primary KPI keeps its raw series.
 *
 * `includePrimary` is likewise off for the others. `series.primary` is the same
 * array as `series.hourly`, and JSON.stringify writes a shared reference twice —
 * on 22 KPIs that alias alone doubles the stored report.
 */
function buildSuccessRatioSeries(
  samples,
  { cadenceMs, nodes, includeRaw = true, includePrimary = true } = {}
) {
  const sorted = [...samples].sort((a, b) => a.date - b.date);
  const resolvedNodes =
    nodes && nodes.length
      ? nodes
      : [...new Set(sorted.map((s) => s.node))].map((node) => ({
          node,
          site: sorted.find((s) => s.node === node)?.site || null,
        }));
  const step = cadenceMs || 15 * 60 * 1000;
  const opts = { cadenceMs: step, nodes: resolvedNodes };

  const hourly = buildPoints(sorted, 'hour', opts);
  const daily = buildPoints(sorted, 'day', opts);
  const native = includeRaw ? buildPoints(sorted, 'raw', opts) : [];
  const weekly = daily.length > 7 ? buildPoints(sorted, 'week', opts) : [];

  const spanStart = sorted[0]?.date?.toISOString() || null;
  const spanEnd = sorted[sorted.length - 1]?.date?.toISOString() || null;

  const built = { native, hourly, daily, weekly };
  const options = [];
  for (const span of SPANS) {
    const points = built[span.id];
    if (!points.length) continue;
    if (span.id === 'weekly' && points.length < 2) continue;
    options.push({
      id: span.id,
      label: `${span.name} (${points.length} point${points.length === 1 ? '' : 's'})`,
      granularity: span.id,
      pointCount: points.length,
    });
  }

  const lowest = extremeBy(hourly, (v, best) => v < best);
  const highest = extremeBy(hourly, (v, best) => v > best);

  return {
    detected: {
      key: 'hourly',
      granularity: 'hourly',
      label: 'Hourly',
      bucket: 'hour',
      cadenceMs: step,
      pointCount: hourly.length,
      spanStart,
      spanEnd,
      spanLabel: formatSpanLabel(spanStart, spanEnd),
      periodLabel: 'hour',
      dayCount: daily.length,
    },
    series: includePrimary
      ? { native, hourly, daily, weekly, primary: hourly }
      : { native, hourly, daily, weekly },
    // 'hourly' rather than 'native': the customer asked for hourly and daily.
    availableSpans: { auto: 'hourly', options },
    peak: summarise(highest),
    min: summarise(lowest),
    worst: summarise(lowest),
    best: summarise(highest),
    colors: SERIES_COLORS,
  };
}

/** A percentage, shown the way a NOC reads one. */
function formatPercent(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(decimals)}%`;
}

module.exports = {
  SERIES_COLORS,
  NODE_COLORS,
  SPANS,
  buildSuccessRatioSeries,
  buildPoints,
  bucketStart,
  expectedPerNode,
  formatPercent,
  formatSpanLabel,
  round,
  mean,
};
