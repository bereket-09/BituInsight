const { buildSiteTimeSeries, buildHourProfile, statOf, round } = require('../shared/siteTimeSeries');

/**
 * SAAU series, per data centre and combined.
 *
 * SAAU is a count of simultaneously active bearers, unit "[#]". There is no unit
 * conversion here and there must never be one: scale is 1 and the figures are
 * whole bearers. Hours are never added across a day — a day reports its average
 * hour and its busiest hour, because 24 hourly headcounts added together would
 * describe nobody.
 */

const FIELDS = ['utran', 'geran', 'eutran', 'total'];
const COUNT_DECIMALS = 0;

const SERIES_COLORS = {
  eutran: { line: '#4ADE80', fill: 'rgba(74, 222, 128, 0.3)', label: '4G (E-UTRAN)' },
  utran: { line: '#3B9EFF', fill: 'rgba(59, 158, 255, 0.3)', label: '3G (UTRAN)' },
  geran: { line: '#A78BFA', fill: 'rgba(167, 139, 250, 0.3)', label: '2G (GERAN)' },
  mdc1: { line: '#3B9EFF', fill: 'rgba(59, 158, 255, 0.15)', label: 'MDC1' },
  mdc2: { line: '#FF6B35', fill: 'rgba(255, 107, 53, 0.15)', label: 'MDC2' },
  total: { line: '#4ADE80', fill: 'rgba(74, 222, 128, 0.12)', label: 'Combined SAAU' },
  peakTotal: { line: '#4ADE80', label: 'Peak hour' },
  hours: { line: '#8B949E', label: 'Hours in day' },
};

function buildSaauTimeSeries(records) {
  const timeSeries = buildSiteTimeSeries(records, {
    fields: FIELDS,
    // A count. No unit conversion applies to SAAU.
    scale: 1,
    decimals: COUNT_DECIMALS,
  });
  timeSeries.colors = SERIES_COLORS;
  timeSeries.unit = '';
  return timeSeries;
}

/** 3486752 → "3.49M", 23456 → "23.5K". Bearers, never bytes. */
function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString('en-US', { maximumFractionDigits: abs >= 100 ? 0 : 1 });
}

module.exports = {
  FIELDS,
  COUNT_DECIMALS,
  SERIES_COLORS,
  buildSaauTimeSeries,
  buildHourProfile,
  statOf,
  round,
  formatCount,
};
