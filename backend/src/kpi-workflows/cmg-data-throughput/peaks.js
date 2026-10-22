const {
  normalizePoints,
  detectCadence,
  buildBaseline,
} = require('../../analytics/seasonality');
const { detectPointAnomalies } = require('../../analytics/anomalies');
const { quantile, round } = require('../../analytics/stats');

/**
 * Throughput peaks, for event annotation.
 *
 * Why this is not just the anomaly detector
 * -----------------------------------------
 * ../../analytics/anomalies.js answers "is this point unusual for this hour of
 * day?" — a seasonality-aware robust z-score behind a materiality gate. That is
 * the right question for incident detection and the wrong one on its own here.
 *
 * The customer is asking which high points might coincide with a match. A
 * Saturday evening match lands squarely in the evening busy hour, which is
 * exactly the shape the seasonal baseline has learned to expect, so the surge
 * can be the highest throughput of the day and still score nowhere near an
 * anomaly. Conversely the anomaly detector reports dips, which are never peaks.
 *
 * So a peak here is the union of two things, each kept labelled:
 *
 *   'spike'      — a point the analytics layer flagged as an upward anomaly.
 *                  Reused wholesale: same baseline, same robust z, same
 *                  materiality gate, same severities. Nothing re-implemented.
 *   'daily-high' — the highest point of a calendar day, when it clears the
 *                  series' 75th percentile. This is the "notable high point"
 *                  the anomaly detector will not give you: the busy hour. The
 *                  quantile gate keeps a quiet day's unremarkable maximum out,
 *                  so a flat week does not produce seven "peaks".
 *
 * A point that is both carries both reasons.
 */

/** A day's maximum has to clear this quantile of the whole series to count. */
const HIGH_POINT_QUANTILE = 0.75;

/** Enough to annotate; past this the list stops being readable. Highest first. */
const MAX_PEAKS = 20;

/** Below this the series is too short for a baseline worth trusting. */
const MIN_POINTS = 6;

function localDayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/** Each calendar day's highest point, local time to agree with the labels. */
function dailyMaxima(points) {
  const byDay = new Map();
  for (const p of points) {
    const key = localDayKey(p.date);
    const best = byDay.get(key);
    if (!best || p.value > best.value) byDay.set(key, p);
  }
  return [...byDay.values()];
}

/**
 * @param {Array} series  `calculated.timeSeries.series.primary`
 * @returns {Object} { available, points: [...peaks], basis }
 */
function detectPeaks(series) {
  const points = normalizePoints(series, 'total');
  if (points.length < MIN_POINTS) {
    return {
      available: false,
      reason: `Not enough time-series points to detect peaks (minimum ${MIN_POINTS})`,
      points: [],
    };
  }

  const cadence = detectCadence(points);
  const baseline = buildBaseline(points, cadence);
  const values = points.map((p) => p.value);
  const highGate = quantile(values, HIGH_POINT_QUANTILE);

  // The original series points carry the MDC split, which normalizePoints drops.
  const sourceByTimestamp = new Map((series || []).map((p) => [p.timestamp, p]));

  const peaks = new Map();
  const addReason = (point, reason, extra = {}) => {
    const existing = peaks.get(point.timestamp);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      Object.assign(existing, extra);
      return;
    }

    const source = sourceByTimestamp.get(point.timestamp) || {};
    const expected = baseline.expectedFor(point);
    const deviationPct =
      expected.center !== 0 ? ((point.value - expected.center) / expected.center) * 100 : 0;

    peaks.set(point.timestamp, {
      timestamp: point.timestamp,
      // The window the annotation layer tests events against: this bucket.
      windowEnd: new Date(
        new Date(point.timestamp).getTime() + (cadence.intervalMs || 0)
      ).toISOString(),
      label: point.label,
      value: round(point.value),
      mdc1: source.mdc1 ?? null,
      mdc2: source.mdc2 ?? null,
      expected: round(expected.center),
      deviationPct: round(deviationPct, 1),
      comparedTo: baseline.describeFor(point),
      severity: null,
      score: null,
      reasons: [reason],
      ...extra,
    });
  };

  // 1. Upward anomalies, straight from the analytics layer.
  for (const anomaly of detectPointAnomalies(points, baseline)) {
    if (anomaly.type !== 'spike') continue;
    const point = points.find((p) => p.timestamp === anomaly.timestamp);
    if (!point) continue;
    addReason(point, 'spike', { severity: anomaly.severity, score: anomaly.score });
  }

  // 2. Busy-hour high points the seasonal baseline considers normal.
  for (const point of dailyMaxima(points)) {
    if (point.value < highGate) continue;
    addReason(point, 'daily-high');
  }

  const ranked = [...peaks.values()].sort((a, b) => b.value - a.value).slice(0, MAX_PEAKS);
  ranked.forEach((peak, i) => {
    peak.rank = i + 1;
  });

  return {
    available: true,
    points: ranked.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
    basis: {
      baselineProfile: baseline.profileLabel,
      cadenceLabel: cadence.label,
      cadenceMs: cadence.intervalMs,
      highGate: round(highGate),
      highGateQuantile: HIGH_POINT_QUANTILE,
      pointCount: points.length,
    },
  };
}

module.exports = { detectPeaks, HIGH_POINT_QUANTILE, MAX_PEAKS, MIN_POINTS };
