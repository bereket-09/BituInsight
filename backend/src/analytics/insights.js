const { round } = require('./stats');

const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2, info: 3 };

function makeFormatter(unit) {
  return (value) => {
    if (!Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    const decimals = abs >= 100 ? 0 : abs >= 1 ? 2 : 3;
    const text = value.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return unit ? `${text} ${unit}` : text;
  };
}

function signed(pct) {
  return `${pct > 0 ? '+' : ''}${pct}%`;
}

/**
 * Turn the raw analysis into ranked, human-readable findings.
 *
 * Every finding carries its evidence so a reader can check the claim rather than
 * take it on trust — and so the narrative layer never has to invent numbers.
 */
function buildFindings(analysis, options = {}) {
  const fmt = makeFormatter(options.unit);
  const findings = [];

  // --- Data quality comes first: it qualifies everything below it ----------
  if (analysis.quality.grade === 'unreliable' || analysis.quality.grade === 'degraded') {
    findings.push({
      id: 'data-quality',
      category: 'data-quality',
      severity: analysis.quality.grade === 'unreliable' ? 'critical' : 'major',
      title: `Data quality is ${analysis.quality.grade} (${analysis.quality.score}/100)`,
      detail: `${analysis.quality.coveragePct}% of expected data points are present. ${analysis.quality.issues
        .map((i) => i.message)
        .join('. ')}. Treat the findings below as provisional.`,
      evidence: {
        score: analysis.quality.score,
        coveragePct: analysis.quality.coveragePct,
        issues: analysis.quality.issues.map((i) => i.message),
      },
    });
  } else if (analysis.quality.issues.length) {
    findings.push({
      id: 'data-quality-minor',
      category: 'data-quality',
      severity: 'minor',
      title: `Minor data-quality issues (${analysis.quality.score}/100)`,
      detail: analysis.quality.issues.map((i) => i.message).join('. '),
      evidence: { score: analysis.quality.score, issues: analysis.quality.issues.map((i) => i.message) },
    });
  }

  // --- Point anomalies, grouped so 40 spikes don't become 40 findings ------
  const spikes = analysis.anomalies.points.filter((a) => a.type === 'spike');
  const dips = analysis.anomalies.points.filter((a) => a.type === 'dip');

  for (const [kind, group] of [['spike', spikes], ['dip', dips]]) {
    if (!group.length) continue;
    const worst = group[0];
    const topSeverity = group.some((a) => a.severity === 'critical')
      ? 'critical'
      : group.some((a) => a.severity === 'major')
        ? 'major'
        : 'minor';

    findings.push({
      id: `anomaly-${kind}`,
      category: 'anomaly',
      severity: topSeverity,
      title:
        group.length === 1
          ? `${kind === 'spike' ? 'Traffic spike' : 'Traffic dip'} at ${worst.period}`
          : `${group.length} ${kind}s detected, worst at ${worst.period}`,
      detail: `${worst.period} recorded ${fmt(worst.value)} against an expected ${fmt(worst.expected)} for ${worst.comparedTo} (${signed(worst.deviationPct)}, ${worst.score}σ).${
        group.length > 1 ? ` ${group.length - 1} further ${kind}${group.length > 2 ? 's' : ''} in the same period.` : ''
      }`,
      evidence: {
        count: group.length,
        worst,
        all: group.slice(0, 10),
      },
    });
  }

  // --- Level shift ---------------------------------------------------------
  if (analysis.anomalies.levelShift) {
    const shift = analysis.anomalies.levelShift;
    findings.push({
      id: 'level-shift',
      category: 'anomaly',
      severity: shift.severity,
      title: `Sustained level shift ${shift.direction} at ${shift.at}`,
      detail: `The series moved from around ${fmt(shift.before)} to ${fmt(shift.after)} (${signed(shift.changePct)}) and stayed there. A step change like this usually points to a configuration change, a node entering or leaving service, or rerouted traffic rather than demand.`,
      evidence: shift,
    });
  }

  // --- Flatlines -----------------------------------------------------------
  if (analysis.anomalies.flatlines.length) {
    const worst = analysis.anomalies.flatlines[0];
    findings.push({
      id: 'flatline',
      category: 'data-quality',
      severity: worst.severity,
      title: `Flatlined values from ${worst.from} to ${worst.to}`,
      detail: `${worst.pointCount} consecutive periods report exactly ${fmt(worst.value)}. On a live counter this normally means a stuck measurement or a padded export rather than genuinely constant traffic.`,
      evidence: { runs: analysis.anomalies.flatlines },
    });
  }

  // --- Trend ---------------------------------------------------------------
  if (analysis.trend.available && analysis.trend.direction !== 'flat') {
    const t = analysis.trend;
    findings.push({
      id: 'trend',
      category: 'trend',
      severity: Math.abs(t.slopePerDayPct) >= 5 ? 'major' : 'minor',
      title: `${t.direction === 'rising' ? 'Rising' : 'Falling'} trend of ${signed(t.slopePerDayPct)} per day`,
      detail: `Over ${t.spanDays} days the series moved ${signed(t.totalChangePct)} overall (${fmt(t.slopePerDay)} per day, r² ${t.r2}, ${t.confidence} confidence). Fitted on ${t.basis}.`,
      evidence: t,
    });
  }

  // --- Capacity ------------------------------------------------------------
  const cap = analysis.capacity;
  if (cap.available && cap.threshold) {
    let severity = 'info';
    if (cap.utilizationPct >= 90) severity = 'critical';
    else if (cap.utilizationPct >= 75) severity = 'major';
    else if (cap.utilizationPct >= 60) severity = 'minor';

    let detail = `Busy-period load (95th percentile) is ${fmt(cap.planningPeak)} against a ${fmt(cap.threshold)} threshold — ${cap.utilizationPct}% utilized, ${cap.headroomPct}% headroom.`;
    if (cap.daysToSaturation) {
      detail += ` At the current growth rate the threshold is reached in about ${cap.daysToSaturation} days (${cap.saturationDate}), ${cap.saturationConfidence} confidence.`;
    }

    findings.push({
      id: 'capacity',
      category: 'capacity',
      severity,
      title:
        severity === 'info'
          ? `Comfortable headroom (${cap.headroomPct}% free)`
          : `Capacity at ${cap.utilizationPct}% of threshold`,
      detail,
      evidence: cap,
    });
  }

  // --- Node / stream imbalance --------------------------------------------
  if (analysis.balance && analysis.balance.imbalanced) {
    const b = analysis.balance;
    findings.push({
      id: 'imbalance',
      category: 'distribution',
      severity: b.skewPct >= 30 ? 'major' : 'minor',
      title: `Load skewed toward ${b.dominant.label} (${b.dominant.sharePct}%)`,
      detail: `${b.dominant.label} carries ${b.dominant.sharePct}% against ${b.weakest.label} at ${b.weakest.sharePct}% — a ${b.skewPct} point gap from an even split. Worth checking whether the split is intentional.`,
      evidence: b,
    });
  }

  return findings.sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );
}

/**
 * Deterministic executive narrative built purely from the numbers.
 *
 * This is the baseline output, and it is also what the report falls back to when
 * the Claude narrative layer is unavailable — so a report is never left without
 * a written summary.
 */
function composeNarrative(analysis, findings, options = {}) {
  const fmt = makeFormatter(options.unit);
  const kpi = options.kpiName || 'KPI';
  const scope = analysis.scope;

  const sentences = [];
  sentences.push(
    `${kpi} across ${scope.spanLabel} at ${scope.cadenceLabel} resolution (${scope.pointCount} periods). Typical level ${fmt(analysis.capacity.typical)}, busy-period peak ${fmt(analysis.capacity.planningPeak)}.`
  );

  const blocking = findings.filter((f) => f.severity === 'critical' || f.severity === 'major');
  if (blocking.length) {
    sentences.push(
      `${blocking.length} item${blocking.length > 1 ? 's' : ''} need attention: ${blocking.map((f) => f.title.toLowerCase()).join('; ')}.`
    );
  } else if (findings.length) {
    sentences.push('Nothing severe: only minor observations in this period.');
  } else {
    sentences.push('No anomalies, trend, or data-quality issues detected in this period.');
  }

  if (analysis.trend.available && analysis.trend.direction !== 'flat') {
    sentences.push(
      `The series is ${analysis.trend.direction} at ${signed(analysis.trend.slopePerDayPct)} per day (${analysis.trend.confidence} confidence).`
    );
  }

  const recommendations = [];
  for (const f of findings.slice(0, 4)) {
    if (f.category === 'data-quality' && f.severity !== 'minor') {
      recommendations.push('Re-run the NetAct export for this period before acting on the numbers.');
    } else if (f.category === 'anomaly' && f.id === 'anomaly-dip') {
      recommendations.push(`Check node and link health around ${f.evidence.worst.period}.`);
    } else if (f.category === 'anomaly' && f.id === 'anomaly-spike') {
      recommendations.push(`Confirm whether the load at ${f.evidence.worst.period} was expected.`);
    } else if (f.id === 'level-shift') {
      recommendations.push(`Correlate the step change at ${f.evidence.at} against the change log.`);
    } else if (f.category === 'capacity' && f.severity !== 'info') {
      recommendations.push('Start capacity planning — busy-period utilization is above the comfort band.');
    } else if (f.category === 'trend' && f.severity === 'major') {
      recommendations.push('Extend the observation window to confirm the trend before committing to capacity changes.');
    }
  }

  return {
    source: 'deterministic',
    summary: sentences.join(' '),
    keyPoints: findings.slice(0, 5).map((f) => f.title),
    recommendations: [...new Set(recommendations)].slice(0, 4),
  };
}

/**
 * Compact, numbers-only view of the analysis. This is what gets sent to the
 * narrative model — no raw rows, no customer data, just the derived findings.
 */
function toNarrativeBrief(analysis, findings, options = {}) {
  return {
    kpi: options.kpiName || 'KPI',
    unit: options.unit || null,
    scope: analysis.scope,
    level: {
      typical: analysis.capacity.typical,
      busyPeriodPeak: analysis.capacity.planningPeak,
      observedPeak: analysis.capacity.observedPeak,
      peakToTypicalRatio: analysis.capacity.peakToTypicalRatio,
      threshold: analysis.capacity.threshold,
      utilizationPct: analysis.capacity.utilizationPct ?? null,
      headroomPct: analysis.capacity.headroomPct,
      daysToSaturation: analysis.capacity.daysToSaturation,
    },
    trend: analysis.trend.available
      ? {
          direction: analysis.trend.direction,
          perDayPct: analysis.trend.slopePerDayPct,
          totalChangePct: analysis.trend.totalChangePct,
          r2: analysis.trend.r2,
          confidence: analysis.trend.confidence,
        }
      : null,
    forecast: analysis.forecast.available
      ? {
          horizon: analysis.forecast.horizon,
          unitLabel: analysis.forecast.unitLabel,
          last: analysis.forecast.projections[analysis.forecast.projections.length - 1],
        }
      : null,
    dataQuality: {
      score: analysis.quality.score,
      grade: analysis.quality.grade,
      coveragePct: analysis.quality.coveragePct,
      issues: analysis.quality.issues.map((i) => i.message),
    },
    busyHour: analysis.dailyShape
      ? { busiest: analysis.dailyShape.busiest, quietest: analysis.dailyShape.quietest }
      : null,
    balance: analysis.balance || null,
    findings: findings.map((f) => ({
      severity: f.severity,
      category: f.category,
      title: f.title,
      detail: f.detail,
    })),
  };
}

module.exports = {
  buildFindings,
  composeNarrative,
  toNarrativeBrief,
  makeFormatter,
  round,
};
