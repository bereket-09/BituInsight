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
    findings.push({
      id: 'data-quality',
      category: 'data-quality',
      severity: analysis.quality.grade === 'unreliable' ? 'critical' : 'major',
      title: 'Some data is missing or wrong',
      detail: `Only ${analysis.quality.coveragePct}% of the data arrived, so take the rest of this report with care.`,
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
      title: 'A few small gaps in the data',
      detail: `${analysis.quality.issues[0].message}.`,
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
        kind === 'spike'
          ? `Unusually high at ${worst.period}`
          : `Unusually low at ${worst.period}`,
      detail: `It was ${fmt(worst.value)}, but about ${fmt(worst.expected)} is normal.${
        group.length > 1 ? ` This happened ${group.length} times in total.` : ''
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
      title: `${shift.after >= shift.before ? 'Jumped up' : 'Dropped down'} at ${shift.at} and stayed there`,
      detail: `It went from about ${fmt(shift.before)} to about ${fmt(shift.after)}. Something in the network may have changed.`,
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
      title: `Same number repeated from ${worst.from} to ${worst.to}`,
      detail: `${worst.pointCount} readings in a row show exactly ${fmt(worst.value)}. The counter may be stuck.`,
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
      title: t.direction === 'rising' ? 'Going up over time' : 'Going down over time',
      detail: `It changed by ${signed(t.totalChangePct)} over ${t.spanDays} days.`,
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

    let detail = `At its busiest it uses ${cap.utilizationPct}% of the limit.`;
    if (cap.daysToSaturation) {
      detail += ` If this continues, it could hit the limit around ${cap.saturationDate}.`;
    }

    findings.push({
      id: 'capacity',
      category: 'capacity',
      severity,
      title:
        severity === 'info' ? 'Plenty of room left' : 'Getting close to the limit',
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
      title: `${b.dominant.label} is doing more of the work`,
      detail: `${b.dominant.label} carries ${b.dominant.sharePct}% and ${b.weakest.label} carries ${b.weakest.sharePct}%.`,
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
function composeNarrative(analysis, findings) {
  const scope = analysis.scope;

  const sentences = [];
  sentences.push(`This report covers ${scope.spanLabel}.`);

  const blocking = findings.filter((f) => f.severity === 'critical' || f.severity === 'major');
  if (blocking.length) {
    sentences.push(
      `${blocking.length === 1 ? 'One thing needs' : `${blocking.length} things need`} a look: ${blocking[0].title.toLowerCase()}.`
    );
  } else {
    sentences.push('Everything looks normal.');
  }

  const recommendations = [];
  for (const f of findings.slice(0, 4)) {
    if (f.category === 'data-quality' && f.severity !== 'minor') {
      recommendations.push('Export the data again before trusting these numbers.');
    } else if (f.category === 'anomaly' && f.id === 'anomaly-dip') {
      recommendations.push(`Check the network around ${f.evidence.worst.period}.`);
    } else if (f.category === 'anomaly' && f.id === 'anomaly-spike') {
      recommendations.push(`Check if the high traffic at ${f.evidence.worst.period} was expected.`);
    } else if (f.id === 'level-shift') {
      recommendations.push(`Check what changed in the network at ${f.evidence.at}.`);
    } else if (f.category === 'capacity' && f.severity !== 'info') {
      recommendations.push('Plan for more capacity soon.');
    }
  }

  return {
    source: 'deterministic',
    summary: sentences.join(' '),
    keyPoints: findings.slice(0, 3).map((f) => f.title),
    recommendations: [...new Set(recommendations)].slice(0, 2),
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
