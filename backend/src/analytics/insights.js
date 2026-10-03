const { round } = require('./stats');

const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2, info: 3 };

function makeFormatter(unit) {
  return (value) => {
    if (!Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    // Whole numbers read fastest; keep a decimal only where it carries meaning.
    const decimals = abs >= 10 ? 0 : abs >= 1 ? 1 : 2;
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
    const issues = analysis.quality.issues.map((i) => i.message).join('; ');
    findings.push({
      id: 'data-quality',
      category: 'data-quality',
      severity: analysis.quality.grade === 'unreliable' ? 'critical' : 'major',
      title: `Data is ${analysis.quality.grade}: only ${analysis.quality.coveragePct}% of expected readings arrived`,
      detail: `For ${analysis.scope.spanLabel} at ${analysis.scope.cadenceLabel.toLowerCase()} intervals we expected a reading every interval, and ${analysis.quality.coveragePct}% of them are present${
        issues ? ` (${issues})` : ''
      }. Missing readings can hide dips or peaks, so treat the findings below as provisional until the export is complete.`,
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
      title: 'Small gaps in the data',
      detail: `${analysis.quality.issues.map((i) => i.message).join('; ')}. This is small enough that the rest of the analysis still holds.`,
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
    const higher = kind === 'spike';
    const gap = deviationText(worst, higher);

    findings.push({
      id: `anomaly-${kind}`,
      category: 'anomaly',
      severity: topSeverity,
      title:
        group.length === 1
          ? `${higher ? 'Spike' : 'Dip'} at ${worst.period}: ${gap}`
          : `${group.length} ${higher ? 'spikes' : 'dips'}, the largest at ${worst.period} (${gap})`,
      detail: `At ${worst.period} the value was ${fmt(worst.value)}. The normal level ${describeComparison(worst.comparedTo)} is about ${fmt(worst.expected)}, so this reading was ${gap} — well outside the usual ups and downs.${
        group.length > 1
          ? ` ${group.length - 1} other ${higher ? 'spike' : 'dip'}${group.length > 2 ? 's' : ''} like this appear in the same report.`
          : ''
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
    const up = shift.after >= shift.before;
    findings.push({
      id: 'level-shift',
      category: 'anomaly',
      severity: shift.severity,
      title: `Stepped ${up ? 'up' : 'down'} ${Math.abs(shift.changePct)}% at ${shift.at} and stayed there`,
      detail: `Before ${shift.at} the level sat around ${fmt(shift.before)}; after it, around ${fmt(shift.after)} (${signed(shift.changePct)}). Because it moved in one step and did not drift back, it usually points to a configuration change, a node entering or leaving service, or rerouted traffic rather than a change in demand.`,
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
      title: `Stuck value from ${worst.from} to ${worst.to}`,
      detail: `${worst.pointCount} readings in a row are exactly ${fmt(worst.value)}. Live traffic always moves a little, so an identical value this many times usually means the counter stopped updating or the export filled the gap — not that traffic was really constant.`,
      evidence: { runs: analysis.anomalies.flatlines },
    });
  }

  // --- Trend ---------------------------------------------------------------
  if (analysis.trend.available && analysis.trend.direction !== 'flat') {
    const t = analysis.trend;
    const change = t.changeFromStartPct ?? t.totalChangePct;
    findings.push({
      id: 'trend',
      category: 'trend',
      severity: Math.abs(t.slopePerDayPct) >= 5 ? 'major' : 'minor',
      title: `${t.direction === 'rising' ? 'Rising' : 'Falling'} ${Math.abs(change)}% over ${t.spanDays} days`,
      detail: `Looking past the daily ups and downs, the typical level moved from about ${fmt(t.startLevel)} at the start of the report to about ${fmt(t.endLevel)} at the end (${signed(change)}). That is roughly ${fmt(Math.abs(t.slopePerDay))} ${t.direction === 'rising' ? 'more' : 'less'} each day. ${confidenceSentence(t.confidence)}`,
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

    let detail = `In its busiest moments (the top 5% of readings) the load reaches ${fmt(cap.planningPeak)}. Against the ${fmt(cap.threshold)} limit set for this KPI that is ${cap.utilizationPct}% used, leaving ${cap.headroomPct}% spare.`;
    if (cap.daysToSaturation) {
      detail += ` If the current growth continues, it reaches the limit in about ${cap.daysToSaturation} days (around ${cap.saturationDate}).`;
    }

    findings.push({
      id: 'capacity',
      category: 'capacity',
      severity,
      title:
        severity === 'info'
          ? `Comfortable headroom: busiest load uses ${cap.utilizationPct}% of the limit`
          : `Busiest load uses ${cap.utilizationPct}% of the limit`,
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
      title: `${b.dominant.label} carries ${b.dominant.sharePct}% of the load`,
      detail: `${b.dominant.label} handles ${b.dominant.sharePct}% of the total and ${b.weakest.label} handles ${b.weakest.sharePct}%. An even split would be ${round(100 / (b.streams?.length || 2))}% each, so ${b.dominant.label} is ${b.skewPct} points over its share. Worth confirming the split is intentional — if ${b.dominant.label} fails, more traffic depends on it.`,
      evidence: b,
    });
  }

  return findings.sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );
}

/** "about 3× the normal level" reads faster than "205.9% above normal". */
function deviationText(anomaly, higher) {
  const pct = Math.abs(anomaly.deviationPct);
  if (higher && pct >= 100 && anomaly.expected > 0) {
    return `about ${round(anomaly.value / anomaly.expected, 1)}× the normal level`;
  }
  return `${Math.round(pct)}% ${higher ? 'above' : 'below'} normal`;
}

/** "at 21:00 on other days", "on other Mondays", or "across the whole report". */
function describeComparison(comparedTo) {
  if (!comparedTo || comparedTo === 'series baseline') return 'across the whole report';
  if (/^\d{2}:00$/.test(comparedTo)) return `at ${comparedTo} on other days`;
  return `on other ${comparedTo}s`;
}

function confidenceSentence(confidence) {
  if (confidence === 'high') return 'The direction is consistent across the period, so it is a real trend rather than noise.';
  if (confidence === 'moderate') return 'The direction is fairly consistent, but day-to-day swings are large, so watch it a little longer before acting.';
  return 'Day-to-day swings are large compared with the change, so treat this as a hint rather than a firm trend.';
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
  const kpi = options.kpiName || 'This KPI';
  const scope = analysis.scope;
  const cap = analysis.capacity;
  const t = analysis.trend;

  const sentences = [];
  sentences.push(
    `${kpi} over ${scope.spanLabel} (${scope.pointCount} ${scope.cadenceLabel.toLowerCase()} readings) usually sits around ${fmt(cap.typical)}, rising to about ${fmt(cap.planningPeak)} at its busiest${
      cap.peakToTypicalRatio ? ` — ${round(cap.peakToTypicalRatio, 1)}× the usual level` : ''
    }.`
  );

  if (t.available && t.direction !== 'flat') {
    const change = t.changeFromStartPct ?? t.totalChangePct;
    sentences.push(
      `Over the period it ${t.direction === 'rising' ? 'grew' : 'fell'} from about ${fmt(t.startLevel)} to about ${fmt(t.endLevel)} (${signed(change)}).`
    );
  } else if (t.available) {
    sentences.push('There is no clear upward or downward trend across the period.');
  }

  const blocking = findings.filter((f) => f.severity === 'critical' || f.severity === 'major');
  if (blocking.length) {
    sentences.push(
      `${blocking.length === 1 ? 'One item needs' : `${blocking.length} items need`} attention: ${blocking.map((f) => f.title.charAt(0).toLowerCase() + f.title.slice(1)).join('; ')}.`
    );
  } else if (findings.length) {
    sentences.push('Nothing serious stands out — only minor observations.');
  } else {
    sentences.push('No unusual spikes, dips, trend changes or data gaps were found.');
  }

  const recommendations = [];
  for (const f of findings.slice(0, 4)) {
    if (f.category === 'data-quality' && f.severity !== 'minor') {
      recommendations.push('Re-export this period from NetAct before acting on the numbers — too many readings are missing.');
    } else if (f.category === 'anomaly' && f.id === 'anomaly-dip') {
      recommendations.push(`Check node and link health around ${f.evidence.worst.period}, when traffic fell well below normal.`);
    } else if (f.category === 'anomaly' && f.id === 'anomaly-spike') {
      recommendations.push(`Confirm whether the load at ${f.evidence.worst.period} was expected (an event, a campaign, a reroute).`);
    } else if (f.id === 'level-shift') {
      recommendations.push(`Check the change log around ${f.evidence.at} — the level stepped and stayed there.`);
    } else if (f.category === 'capacity' && f.severity !== 'info') {
      recommendations.push('Start capacity planning — the busiest periods are close to the limit.');
    } else if (f.category === 'trend' && f.severity === 'major') {
      recommendations.push('Keep watching for another week to confirm the trend before changing capacity.');
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
          spanDays: analysis.trend.spanDays,
          startLevel: analysis.trend.startLevel,
          endLevel: analysis.trend.endLevel,
          changeFromStartPct: analysis.trend.changeFromStartPct,
          changePerDay: analysis.trend.slopePerDay,
          consistency: analysis.trend.confidence,
        }
      : null,
    projection: analysis.forecast.available
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
