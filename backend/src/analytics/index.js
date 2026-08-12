const { normalizePoints, detectCadence, buildBaseline, buildDailyShape, DAY } = require('./seasonality');
const { detectPointAnomalies, detectLevelShift, detectFlatlines } = require('./anomalies');
const { analyzeTrend, forecast } = require('./trend');
const { analyzeCapacity } = require('./capacity');
const { analyzeQuality } = require('./quality');
const { buildFindings, composeNarrative, toNarrativeBrief } = require('./insights');
const { round, sum } = require('./stats');

function describeSpan(points) {
  if (!points.length) return 'no data';
  const spanMs = points[points.length - 1].date - points[0].date;
  const days = spanMs / DAY;
  if (days < 1) return `${round(spanMs / (60 * 60 * 1000), 1)} hours`;
  if (days < 14) return `${round(days, 1)} days`;
  if (days < 60) return `${round(days / 7, 1)} weeks`;
  return `${round(days / 30.44, 1)} months`;
}

/**
 * Share-of-total across named streams (MDC1 vs MDC2, 4G vs 2G/3G, …).
 * Flags a split that is materially off an even share.
 */
function analyzeBalance(series, streams) {
  if (!Array.isArray(streams) || streams.length < 2) return null;

  const totals = streams.map((s) => ({
    key: s.key,
    label: s.label,
    total: sum(series.map((p) => Number(p[s.key]) || 0)),
  }));

  const grandTotal = sum(totals.map((t) => t.total));
  if (grandTotal <= 0) return null;

  const withShare = totals
    .map((t) => ({ ...t, total: round(t.total), sharePct: round((t.total / grandTotal) * 100, 1) }))
    .sort((a, b) => b.sharePct - a.sharePct);

  const evenShare = 100 / streams.length;
  const dominant = withShare[0];
  const weakest = withShare[withShare.length - 1];
  const skewPct = round(dominant.sharePct - evenShare, 1);

  return {
    streams: withShare,
    dominant,
    weakest,
    evenShare: round(evenShare, 1),
    skewPct,
    imbalanced: skewPct >= 15,
  };
}

/**
 * Run the full analytics pass over a workflow time series.
 *
 * @param {Array}  series   Primary series points ({ timestamp, label, total, ... }).
 * @param {Object} options
 * @param {string} options.valueKey   Field holding the value (default 'total').
 * @param {string} options.unit       Display unit, e.g. 'Gbps'.
 * @param {string} options.kpiName    Human name of the KPI.
 * @param {number} options.threshold  Optional capacity threshold.
 * @param {Array}  options.streams    Optional [{ key, label }] for share analysis.
 * @param {number} options.rawRowCount Source row count, for quality checks.
 */
function analyze(series, options = {}) {
  const points = normalizePoints(series, options.valueKey || 'total');

  if (points.length < 3) {
    return {
      available: false,
      reason: 'Not enough time-series points to analyze (minimum 3)',
      pointCount: points.length,
      findings: [],
      narrative: null,
    };
  }

  const cadence = detectCadence(points);
  const baseline = buildBaseline(points, cadence);
  const dailyShape = buildDailyShape(points, cadence);
  const quality = analyzeQuality(points, cadence, options.rawRowCount);
  const trend = analyzeTrend(points, cadence);
  const projection = forecast(trend, options.forecastHorizon || 7);
  const capacity = analyzeCapacity(points, trend, options);
  const balance = analyzeBalance(series, options.streams);

  const analysis = {
    available: true,
    scope: {
      pointCount: points.length,
      from: points[0].timestamp,
      to: points[points.length - 1].timestamp,
      fromLabel: points[0].label,
      toLabel: points[points.length - 1].label,
      spanLabel: describeSpan(points),
      cadenceLabel: cadence.label,
      cadenceMs: cadence.intervalMs,
    },
    baseline: {
      profile: baseline.profileId,
      profileLabel: baseline.profileLabel,
      center: round(baseline.global.center),
      spread: round(baseline.global.spread),
      buckets: [...baseline.buckets.values()].map((b) => ({
        key: b.key,
        label: b.label,
        center: round(b.center),
        spread: round(b.spread),
        samples: b.count,
      })),
    },
    anomalies: {
      points: detectPointAnomalies(points, baseline),
      levelShift: detectLevelShift(points, baseline),
      flatlines: detectFlatlines(points),
    },
    trend,
    forecast: projection,
    capacity,
    quality,
    dailyShape,
    balance,
  };

  const findings = buildFindings(analysis, options);
  const narrative = composeNarrative(analysis, findings, options);

  // Internal regression handles are useful during computation but shouldn't be
  // persisted into the report JSON.
  delete analysis.trend._fit;
  delete analysis.trend._stepMs;
  delete analysis.trend._lastIndex;
  delete analysis.trend._lastDate;

  return {
    ...analysis,
    findings,
    narrative,
    brief: toNarrativeBrief(analysis, findings, options),
  };
}

module.exports = { analyze, analyzeBalance };
