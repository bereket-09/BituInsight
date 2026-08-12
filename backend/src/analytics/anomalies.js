const { median, robustScore, round } = require('./stats');

/**
 * Robust-z thresholds. Tuned so a normal busy hour on a seasonal baseline stays
 * clean while a genuine incident lands at major or critical.
 */
/**
 * A point must clear BOTH a statistical bar (robust z) and a materiality bar
 * (relative deviation). Without the second gate, a bucket that happens to be very
 * tight turns a 9% wobble into a "major" incident — statistically unusual, but
 * not something anyone should be paged about.
 */
const THRESHOLDS = [
  { severity: 'critical', minScore: 5, minDeviationPct: 30 },
  { severity: 'major', minScore: 3.5, minDeviationPct: 15 },
  { severity: 'minor', minScore: 2.5, minDeviationPct: 10 },
];

function severityFor(absScore, absDeviationPct) {
  const hit = THRESHOLDS.find(
    (t) => absScore >= t.minScore && absDeviationPct >= t.minDeviationPct
  );
  return hit ? hit.severity : null;
}

const SEVERITY_RANK = { critical: 3, major: 2, minor: 1 };

/**
 * Point anomalies measured against the seasonal baseline, so a spike is only a
 * spike relative to what that hour of day normally looks like.
 * Detects dips as well as spikes — a node outage reads as a dip, never a spike.
 */
function detectPointAnomalies(points, baseline) {
  if (points.length < 4) return [];

  const anomalies = [];

  for (const point of points) {
    const expected = baseline.expectedFor(point);
    const score = robustScore(
      point.value,
      expected.center,
      expected.spread,
      expected.fallbackSpread
    );
    const absScore = Math.abs(score);
    const deviationPct =
      expected.center !== 0 ? ((point.value - expected.center) / expected.center) * 100 : 0;

    const severity = severityFor(absScore, Math.abs(deviationPct));
    if (!severity) continue;

    anomalies.push({
      type: score > 0 ? 'spike' : 'dip',
      severity,
      period: point.label,
      timestamp: point.timestamp,
      value: round(point.value),
      expected: round(expected.center),
      deviationPct: round(deviationPct, 1),
      score: round(absScore, 2),
      comparedTo: baseline.describeFor(point),
    });
  }

  return anomalies.sort((a, b) => b.score - a.score);
}

/**
 * Sustained level shift: the series settles at a materially different level and
 * stays there. Distinct from a spike — this is the signature of a config change,
 * a node being taken out of service, or traffic being rerouted.
 *
 * Walks candidate split points and keeps the largest shift that clears the bar.
 */
function detectLevelShift(points, baseline) {
  const MIN_SEGMENT = 6;
  if (points.length < MIN_SEGMENT * 2) return null;

  const values = points.map((p) => p.value);
  const overallMedian = median(values);
  if (overallMedian === 0) return null;

  // Work on deseasonalized residuals. On raw values a strong daily cycle looks
  // like a permanent step every morning — the nightly trough vs the daytime plateau
  // is a 200%+ "shift" that is simply the shape of a normal day.
  const residuals = points.map((p) => p.value - baseline.expectedFor(p).center);

  let best = null;

  for (let split = MIN_SEGMENT; split <= residuals.length - MIN_SEGMENT; split += 1) {
    const residualBefore = median(residuals.slice(0, split));
    const residualAfter = median(residuals.slice(split));

    // Express the step against the overall level so it stays interpretable —
    // residuals centre on zero, so a percentage of them means nothing.
    const changePct = ((residualAfter - residualBefore) / overallMedian) * 100;
    if (Math.abs(changePct) < 25) continue;

    if (!best || Math.abs(changePct) > Math.abs(best.changePct)) {
      best = {
        type: 'level_shift',
        severity: Math.abs(changePct) >= 50 ? 'major' : 'minor',
        at: points[split].label,
        timestamp: points[split].timestamp,
        before: round(median(values.slice(0, split))),
        after: round(median(values.slice(split))),
        changePct: round(changePct, 1),
        direction: changePct > 0 ? 'up' : 'down',
        basis: 'seasonally adjusted',
      };
    }
  }

  return best;
}

/**
 * Runs of identical consecutive values. On a live counter this almost always means
 * a stuck probe or a padded export rather than genuinely constant traffic.
 */
function detectFlatlines(points) {
  const MIN_RUN = 4;
  const runs = [];
  let start = 0;

  for (let i = 1; i <= points.length; i += 1) {
    const sameAsPrevious = i < points.length && points[i].value === points[start].value;
    if (sameAsPrevious) continue;

    const runLength = i - start;
    if (runLength >= MIN_RUN) {
      runs.push({
        type: 'flatline',
        severity: points[start].value === 0 ? 'major' : 'minor',
        from: points[start].label,
        to: points[i - 1].label,
        value: round(points[start].value),
        pointCount: runLength,
      });
    }
    start = i;
  }

  return runs;
}

module.exports = {
  detectPointAnomalies,
  detectLevelShift,
  detectFlatlines,
  SEVERITY_RANK,
};
