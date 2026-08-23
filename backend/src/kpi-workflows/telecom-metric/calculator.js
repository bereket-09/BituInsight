const { buildTimeSeries } = require('../traffic-volume/timeSeries');
const { resolveThreshold } = require('./constants');

function detectValueType(records, kpiName) {
  const name = (kpiName || '').toLowerCase();
  if (name.includes('peak') || name.includes('user') || name.includes('attach') && name.includes('peak')) {
    return 'count';
  }
  if (name.includes('sr') || name.includes('ratio') || name.includes('success')) {
    return 'percent';
  }
  const vals = records.map((r) => r.value);
  const max = Math.max(...vals);
  if (max <= 100 && vals.every((v) => v >= 0 && v <= 100)) return 'percent';
  return 'count';
}

function calculate(transformed, context = {}) {
  const { records } = transformed;
  const kpiName = context.kpiName || 'KPI Metric';
  const valueType = detectValueType(records, kpiName);

  const values = records.map((r) => r.value);
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = values.length ? sum / values.length : 0;
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;

  const recordsForTs = records.map((r) => ({
    date: r.date,
    volume2g3g: 0,
    volume4g: 0,
    totalVolume: r.value,
    plmnName: r.plmnName,
  }));

  // A percentage is an average, not a total: summing 96 samples of a 99% KPI
  // into a daily bucket produced 9504. valueType is already known here, so the
  // bucketed views are built with the right operation instead of being corrected
  // afterwards by every consumer.
  const timeSeriesRaw = buildTimeSeries(recordsForTs, {
    aggregate: valueType === 'percent' ? 'avg' : 'sum',
  });
  const primary = timeSeriesRaw.series.primary.map((p) => ({
    ...p,
    value: p.total,
    label: p.label,
  }));

  const timeSeries = {
    ...timeSeriesRaw,
    series: {
      ...timeSeriesRaw.series,
      primary,
    },
  };

  const peak = primary.reduce((best, p) => (p.value > best.value ? p : best), primary[0] || { value: 0 });
  const minPt = primary.reduce((best, p) => (p.value < best.value ? p : best), primary[0] || { value: 0 });

  const threshold = valueType === 'percent' ? resolveThreshold(context) : null;

  const anomalies = [];
  if (valueType === 'percent' && threshold != null) {
    const belowThreshold = primary.filter((p) => p.value < threshold);
    if (belowThreshold.length > 0) {
      anomalies.push({
        type: 'threshold',
        message: `${belowThreshold.length} period(s) below ${threshold}% target`,
      });
    }
  }

  const unit = valueType === 'percent' ? '%' : '';

  return {
    metrics: {
      kpiName,
      valueType,
      threshold,
      average: round(avg),
      minimum: round(min),
      maximum: round(max),
      latest: round(values[values.length - 1] || 0),
      recordCount: records.length,
      peakPeriod: peak?.label || 'N/A',
      peakValue: round(peak?.value || 0),
      minPeriod: minPt?.label || 'N/A',
      minValue: round(minPt?.value || 0),
      unit,
    },
    timeSeries,
    valueType,
    threshold,
    anomalies,
    rawRecordCount: records.length,
  };
}

function generateSummary(calculated, transformed, context = {}) {
  const { metrics, anomalies, timeSeries } = calculated;
  const kpiName = context.kpiName || metrics.kpiName;
  const det = timeSeries?.detected || {};
  const fmt = (v) => (metrics.valueType === 'percent' ? `${v}%` : formatCount(v));

  return {
    title: `${kpiName} KPI Report`,
    generatedAt: new Date().toISOString(),
    plmnNames: transformed.plmnNames,
    kpiName,
    sheetName: context.sheetName,
    timeContext: {
      granularity: det.label,
      span: det.spanLabel,
      points: det.pointCount,
    },
    threshold: calculated.threshold,
    highlights: [
      { label: 'Time span', value: det.spanLabel || '—', trend: 'neutral' },
      { label: 'Granularity', value: det.label || '—', trend: 'neutral' },
      ...(calculated.threshold != null
        ? [{ label: 'Target threshold', value: `${calculated.threshold}%`, trend: 'neutral' }]
        : []),
      { label: 'Average', value: fmt(metrics.average), trend: 'neutral' },
      { label: 'Latest', value: fmt(metrics.latest), trend: 'neutral' },
      { label: 'Peak', value: `${metrics.peakPeriod} (${fmt(metrics.peakValue)})`, trend: 'up' },
      { label: 'Minimum', value: `${metrics.minPeriod} (${fmt(metrics.minValue)})`, trend: 'down' },
      { label: 'Data points', value: String(metrics.recordCount), trend: 'neutral' },
    ],
    anomalies,
    narrative:
      `${kpiName}: ${metrics.recordCount} readings (${det.label}) over ${det.spanLabel}. ` +
      `Average ${fmt(metrics.average)}, peak ${fmt(metrics.maximum)} at ${metrics.peakPeriod}.`,
  };
}

function round(val, d = 2) {
  return Math.round(val * 10 ** d) / 10 ** d;
}

function formatCount(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v * 100) / 100);
}

module.exports = { calculate, generateSummary, detectValueType };
