const { round } = require('./stats');

/**
 * Data-quality assessment of the series itself, independent of what the numbers say.
 *
 * This matters because every downstream finding inherits the quality of the export:
 * a "20% traffic drop" on a day with a four-hour collection gap is a reporting
 * artefact, not a network event, and the report should say so.
 */
function analyzeQuality(points, cadence, rawRowCount) {
  const issues = [];

  if (!points.length) {
    return {
      score: 0,
      grade: 'unusable',
      coveragePct: 0,
      pointCount: 0,
      issues: [{ type: 'empty', severity: 'critical', message: 'No usable data points' }],
    };
  }

  const spanMs = points[points.length - 1].date - points[0].date;

  // --- Collection gaps -----------------------------------------------------
  const gaps = [];
  if (cadence.intervalMs > 0) {
    const tolerance = cadence.intervalMs * 1.5;
    for (let i = 1; i < points.length; i += 1) {
      const delta = points[i].date - points[i - 1].date;
      if (delta > tolerance) {
        gaps.push({
          from: points[i - 1].label,
          to: points[i].label,
          missingPoints: Math.max(1, Math.round(delta / cadence.intervalMs) - 1),
          durationHours: round(delta / (60 * 60 * 1000), 1),
        });
      }
    }
  }

  const expectedPoints =
    cadence.intervalMs > 0 ? Math.round(spanMs / cadence.intervalMs) + 1 : points.length;
  const coveragePct = expectedPoints > 0 ? Math.min(100, (points.length / expectedPoints) * 100) : 100;

  if (gaps.length) {
    const missing = gaps.reduce((s, g) => s + g.missingPoints, 0);
    issues.push({
      type: 'collection_gap',
      severity: coveragePct < 90 ? 'major' : 'minor',
      message: `${gaps.length} collection gap${gaps.length > 1 ? 's' : ''} — about ${missing} expected data point${missing > 1 ? 's' : ''} missing`,
      detail: gaps.slice(0, 5),
    });
  }

  // --- Duplicate timestamps ------------------------------------------------
  const seen = new Set();
  let duplicates = 0;
  for (const p of points) {
    if (seen.has(p.timestamp)) duplicates += 1;
    else seen.add(p.timestamp);
  }
  if (duplicates > 0) {
    issues.push({
      type: 'duplicate_timestamp',
      severity: 'minor',
      message: `${duplicates} duplicate timestamp${duplicates > 1 ? 's' : ''} in the series`,
    });
  }

  // --- Impossible and empty values ----------------------------------------
  const negatives = points.filter((p) => p.value < 0).length;
  if (negatives > 0) {
    issues.push({
      type: 'negative_value',
      severity: 'major',
      message: `${negatives} negative value${negatives > 1 ? 's' : ''} — counters should never go below zero`,
    });
  }

  const zeros = points.filter((p) => p.value === 0).length;
  const zeroPct = (zeros / points.length) * 100;
  if (zeroPct >= 10) {
    issues.push({
      type: 'zero_heavy',
      severity: zeroPct >= 40 ? 'major' : 'minor',
      message: `${round(zeroPct, 1)}% of periods report exactly zero`,
    });
  }

  // --- Rows discarded during parsing --------------------------------------
  if (Number.isFinite(rawRowCount) && rawRowCount > 0 && points.length > 0) {
    // Only meaningful when the series is one point per row; aggregated series
    // legitimately have far fewer points than rows.
    if (points.length > rawRowCount) {
      issues.push({
        type: 'row_mismatch',
        severity: 'minor',
        message: 'More series points than source rows — check the aggregation step',
      });
    }
  }

  // --- Score ---------------------------------------------------------------
  const penalties = {
    critical: 40,
    major: 20,
    minor: 8,
  };
  let score = 100;
  for (const issue of issues) score -= penalties[issue.severity] || 0;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade;
  if (score >= 90) grade = 'good';
  else if (score >= 70) grade = 'acceptable';
  else if (score >= 40) grade = 'degraded';
  else grade = 'unreliable';

  return {
    score,
    grade,
    coveragePct: round(coveragePct, 1),
    pointCount: points.length,
    expectedPoints,
    gapCount: gaps.length,
    gaps: gaps.slice(0, 10),
    issues,
  };
}

module.exports = { analyzeQuality };
