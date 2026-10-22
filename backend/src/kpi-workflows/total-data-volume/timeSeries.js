const { buildSiteTimeSeries, buildHourProfile, statOf, round } = require('../shared/siteTimeSeries');
const { MB_PER_TB } = require('./source');

/**
 * Data volume in terabytes, per data centre and combined.
 *
 * Volume is a quantity carried, so hours inside a day *can* be added — but the
 * customer asked for the daily average hour and the daily peak hour, which is
 * what the shared builder produces. The day's grand total is reported separately
 * by the calculator, from the unrounded hourly figures.
 */

const FIELDS = ['volume2g3g', 'volume4g', 'total'];
const TB_DECIMALS = 2;

const SERIES_COLORS = {
  volume2g3g: { line: '#FF6B35', fill: 'rgba(255, 107, 53, 0.3)', label: '2G+3G' },
  volume4g: { line: '#3B9EFF', fill: 'rgba(59, 158, 255, 0.3)', label: '4G' },
  mdc1: { line: '#3B9EFF', fill: 'rgba(59, 158, 255, 0.15)', label: 'MDC1' },
  mdc2: { line: '#FF6B35', fill: 'rgba(255, 107, 53, 0.15)', label: 'MDC2' },
  total: { line: '#4ADE80', fill: 'rgba(74, 222, 128, 0.12)', label: 'Combined' },
  peakTotal: { line: '#4ADE80', label: 'Peak hour' },
  hours: { line: '#8B949E', label: 'Hours in day' },
};

function buildVolumeTimeSeries(records) {
  const timeSeries = buildSiteTimeSeries(records, {
    fields: FIELDS,
    // The one place megabytes become terabytes.
    // A day of traffic is its hours added up, not a typical hour.
    dailyAggregate: 'sum',
    scale: 1 / MB_PER_TB,
    decimals: TB_DECIMALS,
  });
  timeSeries.colors = SERIES_COLORS;
  timeSeries.unit = 'TB';
  return timeSeries;
}

/** 87.2065 → "87.21 TB"; 1842.3 → "1,842.30 TB". */
function formatTb(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TB`;
}

module.exports = {
  FIELDS,
  TB_DECIMALS,
  SERIES_COLORS,
  buildVolumeTimeSeries,
  buildHourProfile,
  statOf,
  round,
  formatTb,
};
