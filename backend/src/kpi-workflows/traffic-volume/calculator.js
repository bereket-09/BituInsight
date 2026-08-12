const { buildTimeSeries, formatVolume } = require('./timeSeries');

function calculate(transformed) {
  const { records } = transformed;
  const timeSeries = buildTimeSeries(records);
  const primary = timeSeries.series.primary;

  const totalVolume = records.reduce((sum, r) => sum + r.totalVolume, 0);
  const total2g3g = records.reduce((sum, r) => sum + r.volume2g3g, 0);
  const total4g = records.reduce((sum, r) => sum + r.volume4g, 0);

  const contribution4g = totalVolume > 0 ? (total4g / totalVolume) * 100 : 0;
  const contribution2g3g = totalVolume > 0 ? (total2g3g / totalVolume) * 100 : 0;

  const anomalies = detectAnomaliesOnSeries(primary);

  const peak = timeSeries.peak;
  const minPt = timeSeries.min;

  return {
    metrics: {
      totalVolume: round(totalVolume),
      totalDailyVolume: round(totalVolume),
      total2g3g: round(total2g3g),
      total4g: round(total4g),
      contribution4gPct: round(contribution4g, 2),
      contribution2g3gPct: round(contribution2g3g, 2),
      peakPeriod: peak?.label || 'N/A',
      peakPeriodVolume: round(peak?.volume || 0),
      peakHour: peak?.label || 'N/A',
      peakHourVolume: round(peak?.volume || 0),
      minTrafficPeriod: minPt?.label || 'N/A',
      minTrafficHourVolume: round(minPt?.volume || 0),
      minTrafficHour: minPt?.label || 'N/A',
      recordCount: records.length,
      plmnCount: transformed.plmnNames.length,
      timeGranularity: timeSeries.detected.label,
      timeSpan: timeSeries.detected.spanLabel,
      dataPoints: timeSeries.detected.pointCount,
    },
    timeSeries,
    hourlyTrend: timeSeries.series.hourly,
    dailyTrend: timeSeries.series.daily,
    technologySplit: [
      { label: '2G+3G', value: round(total2g3g), percentage: round(contribution2g3g, 2) },
      { label: '4G', value: round(total4g), percentage: round(contribution4g, 2) },
    ],
    anomalies,
    rawRecordCount: records.length,
  };
}

function detectAnomaliesOnSeries(series) {
  if (series.length < 3) return [];
  const values = series.map((p) => p.total);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
  const threshold = mean + 2 * stdDev;

  return series
    .filter((p) => p.total > threshold)
    .map((p) => ({
      type: 'spike',
      hour: p.label,
      period: p.label,
      volume: p.total,
      message: `Traffic spike at ${p.label}: ${formatVolume(p.total)}`,
    }));
}

function generateSummary(calculated, transformed) {
  const { metrics, anomalies, timeSeries } = calculated;
  const det = timeSeries?.detected || {};

  return {
    title: 'Traffic Volume KPI Report',
    generatedAt: new Date().toISOString(),
    plmnNames: transformed.plmnNames,
    dateRange: transformed.dateRange,
    timeContext: {
      granularity: det.label,
      span: det.spanLabel,
      points: det.pointCount,
    },
    highlights: [
      { label: 'Time span', value: det.spanLabel || '—', trend: 'neutral' },
      { label: 'Granularity', value: det.label || 'Auto', trend: 'neutral' },
      { label: 'Total volume', value: formatBytes(metrics.totalVolume), trend: 'neutral' },
      { label: '4G share', value: `${metrics.contribution4gPct}%`, trend: metrics.contribution4gPct > 50 ? 'up' : 'down' },
      { label: `Peak ${det.periodLabel || 'period'}`, value: metrics.peakPeriod, trend: 'up' },
      { label: 'Peak volume', value: formatBytes(metrics.peakPeriodVolume), trend: 'up' },
      { label: 'Data points', value: String(metrics.recordCount), trend: 'neutral' },
    ],
    anomalies,
    narrative:
      `Analyzed ${metrics.recordCount} records (${det.label} resolution) over ${det.spanLabel}. ` +
      `Total volume ${formatBytes(metrics.totalVolume)} — 4G ${metrics.contribution4gPct}%, 2G/3G ${metrics.contribution2g3gPct}%. ` +
      `Peak at ${metrics.peakPeriod} (${formatBytes(metrics.peakPeriodVolume)}).`,
  };
}

function round(val, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

function formatBytes(gb) {
  if (gb >= 1e12) return `${(gb / 1e12).toFixed(2)} PB`;
  if (gb >= 1e9) return `${(gb / 1e9).toFixed(2)} TB`;
  if (gb >= 1e6) return `${(gb / 1e6).toFixed(2)} GB`;
  if (gb >= 1000) return `${(gb / 1000).toFixed(2)} TB`;
  return `${gb.toFixed(2)}`;
}

module.exports = {
  calculate,
  generateSummary,
  formatBytes,
};
