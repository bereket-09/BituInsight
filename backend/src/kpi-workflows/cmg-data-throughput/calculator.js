const {
  round,
  buildThroughputTimeSeries,
  formatThroughputGbps,
} = require('./timeSeries');

function aggregateByPeriodAndNode(records) {
  const map = new Map();

  for (const r of records) {
    const key = r.periodKey;
    if (!map.has(key)) {
      map.set(key, {
        date: new Date(r.date),
        periodKey: key,
        MDC1: 0,
        MDC2: 0,
        rowCount: 0,
      });
    }
    const bucket = map.get(key);
    bucket[r.cmgNode] += r.rowThroughputGbps;
    bucket.rowCount += 1;
  }

  return [...map.values()].sort((a, b) => a.date - b.date);
}

function calculate(transformed) {
  const { records } = transformed;
  const aggregatedPeriods = aggregateByPeriodAndNode(records);
  const timeSeries = buildThroughputTimeSeries(aggregatedPeriods);

  const primary = timeSeries.series.primary;
  const totalMdc1 = aggregatedPeriods.reduce((s, p) => s + p.MDC1, 0);
  const totalMdc2 = aggregatedPeriods.reduce((s, p) => s + p.MDC2, 0);
  const grandTotal = totalMdc1 + totalMdc2;

  const mdc1Share = grandTotal > 0 ? (totalMdc1 / grandTotal) * 100 : 0;
  const mdc2Share = grandTotal > 0 ? (totalMdc2 / grandTotal) * 100 : 0;

  const latest = primary[primary.length - 1];
  const avgTotal =
    primary.length > 0 ? primary.reduce((s, p) => s + p.total, 0) / primary.length : 0;

  const anomalies = detectSpikes(primary);
  const dailyPeaks = timeSeries.dailyPeaks || [];

  return {
    valueType: 'throughput',
    metrics: {
      kpiName: 'Data throughput',
      valueType: 'throughput',
      unit: 'Gbps',
      totalThroughputGbps: round(grandTotal),
      totalMdc1Gbps: round(totalMdc1),
      totalMdc2Gbps: round(totalMdc2),
      mdc1SharePct: round(mdc1Share, 2),
      mdc2SharePct: round(mdc2Share, 2),
      latestPeriod: latest?.label || 'N/A',
      latestTotalGbps: round(latest?.total || 0),
      latestMdc1Gbps: round(latest?.mdc1 || 0),
      latestMdc2Gbps: round(latest?.mdc2 || 0),
      averagePeriodGbps: round(avgTotal),
      peakPeriod: timeSeries.peak?.label || 'N/A',
      peakPeriodGbps: round(timeSeries.peak?.volume || timeSeries.peak?.total || 0),
      peakPeriodMdc1: round(timeSeries.peak?.mdc1 || 0),
      peakPeriodMdc2: round(timeSeries.peak?.mdc2 || 0),
      minPeriod: timeSeries.min?.label || 'N/A',
      minPeriodGbps: round(timeSeries.min?.volume || timeSeries.min?.total || 0),
      periodCount: aggregatedPeriods.length,
      dayCount: timeSeries.detected?.dayCount || dailyPeaks.length,
      rawRowCount: records.length,
      samCount: transformed.samNames?.length || 0,
      timeGranularity: timeSeries.detected.label,
      timeSpan: timeSeries.detected.spanLabel,
    },
    timeSeries,
    nodeSplit: [
      { label: 'MDC1', value: round(totalMdc1), percentage: round(mdc1Share, 2) },
      { label: 'MDC2', value: round(totalMdc2), percentage: round(mdc2Share, 2) },
    ],
    aggregatedPeriods,
    dailyPeaks,
    peaksByView: timeSeries.peaksByView,
    anomalies,
    rawRecordCount: records.length,
  };
}

function detectSpikes(series) {
  if (series.length < 4) return [];
  const values = series.map((p) => p.total);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  const threshold = mean + 2 * stdDev;

  return series
    .filter((p) => p.total > threshold)
    .map((p) => ({
      type: 'spike',
      period: p.label,
      message: `Throughput spike at ${p.label}: ${formatThroughputGbps(p.total)} (MDC1 ${formatThroughputGbps(p.mdc1)}, MDC2 ${formatThroughputGbps(p.mdc2)})`,
    }));
}

function buildInsight(metrics, det, transformed) {
  const dayLabel =
    metrics.dayCount === 1 ? '1 day' : metrics.dayCount > 1 ? `${metrics.dayCount} days` : null;

  return {
    subtitle: 'Combined downlink + uplink CMG capacity, grouped by MDC1 and MDC2',
    formula: {
      title: 'Per CMG row',
      expression: '(DL max Mbps + UL max Mbps) ÷ 1000',
      result: 'Gbps',
      note: 'Node parsed from CMG name (e.g. @MDC1-NK-CMG-CP01 → MDC1)',
    },
    pipeline: [
      {
        step: 1,
        title: 'Import rows',
        detail: `${(metrics.rawRowCount || 0).toLocaleString()} CMG measurements`,
        icon: 'database',
      },
      {
        step: 2,
        title: 'Convert & classify',
        detail: 'Mbps → Gbps · assign MDC1 or MDC2',
        icon: 'calculator',
      },
      {
        step: 3,
        title: 'Sum per period',
        detail: `${metrics.periodCount} ${det.periodLabel || 'periods'} in view`,
        icon: 'layers',
      },
    ],
    scope: {
      timeSpan: det.spanLabel || '—',
      granularity: det.label || '—',
      periodCount: metrics.periodCount,
      dayCount: metrics.dayCount,
      dayLabel,
      rawRows: metrics.rawRowCount,
      samCount: metrics.samCount,
      samNames: transformed.samNames || [],
    },
    snapshot: {
      total: formatThroughputGbps(metrics.totalThroughputGbps),
      mdc1: formatThroughputGbps(metrics.totalMdc1Gbps),
      mdc2: formatThroughputGbps(metrics.totalMdc2Gbps),
      mdc1SharePct: metrics.mdc1SharePct,
      mdc2SharePct: metrics.mdc2SharePct,
      latestPeriod: metrics.latestPeriod,
      latestTotal: formatThroughputGbps(metrics.latestTotalGbps),
      peakPeriod: metrics.peakPeriod,
      peakTotal: formatThroughputGbps(metrics.peakPeriodGbps),
      averagePeriod: formatThroughputGbps(metrics.averagePeriodGbps),
    },
  };
}

function generateSummary(calculated, transformed) {
  const { metrics, anomalies, timeSeries } = calculated;
  const det = timeSeries?.detected || {};
  const insight = buildInsight(metrics, det, transformed);

  const narrativeShort =
    `${metrics.periodCount} periods · ${insight.snapshot.total} combined ` +
    `(MDC1 ${insight.snapshot.mdc1}, MDC2 ${insight.snapshot.mdc2}). ` +
    `Latest ${metrics.latestPeriod}: ${insight.snapshot.latestTotal}.`;

  return {
    title: 'CMG Data Throughput KPI Report',
    kpiName: 'Data throughput',
    generatedAt: new Date().toISOString(),
    samNames: transformed.samNames,
    dateRange: transformed.dateRange,
    timeContext: {
      granularity: det.label,
      span: det.spanLabel,
      points: det.pointCount,
    },
    insight,
    highlights: [
      { label: 'Time span', value: det.spanLabel || '—', trend: 'neutral' },
      { label: 'Periods', value: String(metrics.periodCount), trend: 'neutral' },
      { label: 'Raw rows', value: String(metrics.rawRowCount), trend: 'neutral' },
      {
        label: 'Total throughput',
        value: formatThroughputGbps(metrics.totalThroughputGbps),
        trend: 'neutral',
      },
      {
        label: 'MDC1 total',
        value: formatThroughputGbps(metrics.totalMdc1Gbps),
        trend: 'neutral',
      },
      {
        label: 'MDC2 total',
        value: formatThroughputGbps(metrics.totalMdc2Gbps),
        trend: 'neutral',
      },
      {
        label: 'MDC1 share',
        value: `${metrics.mdc1SharePct}%`,
        trend: metrics.mdc1SharePct >= 50 ? 'up' : 'down',
      },
      { label: 'Latest period', value: metrics.latestPeriod, trend: 'neutral' },
      {
        label: 'Latest total',
        value: formatThroughputGbps(metrics.latestTotalGbps),
        trend: 'up',
      },
      { label: `Peak ${det.periodLabel || 'period'}`, value: metrics.peakPeriod, trend: 'up' },
      {
        label: 'Peak throughput',
        value: formatThroughputGbps(metrics.peakPeriodGbps),
        trend: 'up',
      },
    ],
    anomalies,
    narrative: narrativeShort,
    narrativeLong:
      `This report sums CMG downlink and uplink max rates into Gbps, split across MDC1 and MDC2 for each time period. ` +
      `Coverage: ${det.spanLabel || '—'} (${metrics.periodCount} buckets, ${det.label || 'native'} resolution). ` +
      `Totals — MDC1 ${formatThroughputGbps(metrics.totalMdc1Gbps)}, MDC2 ${formatThroughputGbps(metrics.totalMdc2Gbps)}, ` +
      `combined ${formatThroughputGbps(metrics.totalThroughputGbps)}. ` +
      `Peak at ${metrics.peakPeriod}: ${formatThroughputGbps(metrics.peakPeriodGbps)}.`,
  };
}

module.exports = {
  calculate,
  generateSummary,
  formatThroughputGbps,
};
