const { buildVolumeTimeSeries, buildHourProfile, statOf, round, formatTb, FIELDS, TB_DECIMALS } = require('./timeSeries');
const { MB_PER_TB } = require('./source');
const { SITES, siteKey } = require('../shared/netactNodes');
const { dayKey, mean } = require('../shared/siteTimeSeries');

/**
 * Everything the Total Data Volume dashboard reports.
 *
 * Volumes are terabytes throughout. Every figure here is derived from the
 * megabyte readings at full precision and rounded once, so a day's total is the
 * sum of its real hours rather than the sum of 24 rounded ones.
 */

const TB = (mb) => round(mb / MB_PER_TB, TB_DECIMALS);

/** Day totals straight from the records, so nothing is lost to rounding. */
function buildDayTotals(records) {
  const byDay = new Map();
  for (const r of records) {
    const key = dayKey(r.date);
    if (!byDay.has(key)) {
      byDay.set(key, { total: 0, volume2g3g: 0, volume4g: 0, mdc1: 0, mdc2: 0 });
    }
    const day = byDay.get(key);
    day.total += r.values.total;
    day.volume2g3g += r.values.volume2g3g;
    day.volume4g += r.values.volume4g;
    const site = siteKey(r.site);
    if (site && site in day) day[site] += r.values.total;
  }
  return byDay;
}

/**
 * One row per day: the average hour and the peak hour for each data centre and
 * for the two combined, plus the day's grand total.
 */
function buildDailyStats(daily, dayTotals) {
  return daily.map((d) => {
    const raw = dayTotals.get(dayKey(new Date(d.timestamp))) || {};
    return {
      day: d.label,
      dayKey: d.bucketKey,
      hours: d.hours,
      completeHours: d.completeHours,
      partialHours: d.partialHours,
      avgMdc1: d.mdc1,
      avgMdc2: d.mdc2,
      avgTotal: d.total,
      peakMdc1: d.peakMDC1,
      peakMdc1At: d.peakMDC1At,
      peakMdc2: d.peakMDC2,
      peakMdc2At: d.peakMDC2At,
      peakTotal: d.peakTotal,
      peakAt: d.peakAt,
      peakHourOfDay: d.peakHourOfDay,
      peakHourMdc1: d.peakHourMDC1,
      peakHourMdc2: d.peakHourMDC2,
      avg2g3g: d.volume2g3g,
      avg4g: d.volume4g,
      dayTotal: TB(raw.total || 0),
      dayTotalMdc1: TB(raw.mdc1 || 0),
      dayTotalMdc2: TB(raw.mdc2 || 0),
    };
  });
}

/**
 * Each CMG on its own, so one data centre carrying the week is visible.
 *
 * Totals count every reading the node made; the average is taken over the hours
 * both data centres reported, so it is the same figure the MDC1 / MDC2 series
 * shows rather than a second, slightly different one.
 */
function buildNodeStats(records, completeTimestamps) {
  const byNode = new Map();
  for (const r of records) {
    if (!byNode.has(r.node)) {
      byNode.set(r.node, { node: r.node, site: r.site, hours: [], whole: [], sum: 0, sum2g3g: 0, sum4g: 0 });
    }
    const row = byNode.get(r.node);
    row.hours.push(r.values.total);
    if (completeTimestamps.has(r.date.getTime())) row.whole.push(r.values.total);
    row.sum += r.values.total;
    row.sum2g3g += r.values.volume2g3g;
    row.sum4g += r.values.volume4g;
  }

  const rows = [...byNode.values()]
    .sort((a, b) => String(a.site).localeCompare(String(b.site)) || a.node.localeCompare(b.node))
    .map((row) => ({
      node: row.node,
      site: row.site,
      readings: row.hours.length,
      peak: TB(Math.max(...row.hours)),
      average: TB(mean(row.whole.length ? row.whole : row.hours)),
      total: TB(row.sum),
      total2g3g: TB(row.sum2g3g),
      total4g: TB(row.sum4g),
    }));

  const grand = rows.reduce((s, r) => s + r.total, 0);
  rows.forEach((r) => {
    r.sharePct = grand > 0 ? round((r.total / grand) * 100, 1) : 0;
  });
  return rows;
}

function calculate(transformed) {
  const { records, nodes = [], sites = [] } = transformed;
  const timeSeries = buildVolumeTimeSeries(records);
  const hourly = timeSeries.series.native;
  const daily = timeSeries.series.daily;

  const dayTotals = buildDayTotals(records);
  const dailyStats = buildDailyStats(daily, dayTotals);

  const combined = statOf(hourly, 'total', TB_DECIMALS);
  const mdc1 = statOf(hourly, 'mdc1', TB_DECIMALS);
  const mdc2 = statOf(hourly, 'mdc2', TB_DECIMALS);

  const grandTotalMb = records.reduce((s, r) => s + r.values.total, 0);
  const totalBySite = Object.fromEntries(
    SITES.map((site) => [
      siteKey(site),
      records.filter((r) => r.site === site).reduce((s, r) => s + r.values.total, 0),
    ])
  );

  // The site split compares the two average hours rather than the two recorded
  // totals: an hour one data centre missed would otherwise count against it.
  const avgSum = mdc1.average + mdc2.average;
  const siteShare = (site) => (avgSum > 0 ? round((site.average / avgSum) * 100, 1) : 0);

  const share = (field) =>
    grandTotalMb > 0
      ? round((records.reduce((s, r) => s + (r.values[field] || 0), 0) / grandTotalMb) * 100, 1)
      : 0;

  const partialHours = hourly.filter((p) => !p.complete).length;
  const completeTimestamps = new Set(
    hourly.filter((p) => p.complete).map((p) => new Date(p.timestamp).getTime())
  );
  const latest = hourly[hourly.length - 1];

  return {
    valueType: 'volume',
    metrics: {
      kpiName: 'Total data volume',
      valueType: 'volume',
      unit: 'TB',
      // Combined — MDC1 + MDC2 at the same hour, never two separate aggregates.
      peakTotal: combined.peak,
      peakPeriod: combined.peakAt,
      averageHourly: combined.average,
      lowestTotal: combined.min,
      lowestPeriod: combined.minAt,
      grandTotal: TB(grandTotalMb),
      averageDailyTotal: dailyStats.length ? round(mean(dailyStats.map((d) => d.dayTotal)), TB_DECIMALS) : 0,
      averageDailyPeak: dailyStats.length ? round(mean(dailyStats.map((d) => d.peakTotal)), TB_DECIMALS) : 0,
      highestDailyPeak: dailyStats.length ? Math.max(...dailyStats.map((d) => d.peakTotal)) : 0,
      busiestDay: dailyStats.length
        ? dailyStats.reduce((b, d) => (d.dayTotal > b.dayTotal ? d : b), dailyStats[0]).day
        : 'N/A',
      mdc1,
      mdc2,
      mdc1Total: TB(totalBySite.mdc1 || 0),
      mdc2Total: TB(totalBySite.mdc2 || 0),
      mdc1SharePct: siteShare(mdc1),
      mdc2SharePct: siteShare(mdc2),
      share4gPct: share('volume4g'),
      share2g3gPct: share('volume2g3g'),
      total4g: TB(records.reduce((s, r) => s + r.values.volume4g, 0)),
      total2g3g: TB(records.reduce((s, r) => s + r.values.volume2g3g, 0)),
      latestPeriod: latest?.label || 'N/A',
      latestTotal: latest?.total ?? 0,
      nodes,
      nodeCount: nodes.length,
      sites,
      siteCount: sites.length,
      periodCount: hourly.length,
      dayCount: daily.length,
      partialHours,
      rawRowCount: records.length,
      timeGranularity: timeSeries.detected.label,
      timeSpan: timeSeries.detected.spanLabel,
      conversionNote: 'Megabytes from the export divided by 1024² (1,048,576) to give terabytes.',
    },
    timeSeries,
    dailyStats,
    hourProfile: buildHourProfile(hourly, FIELDS, TB_DECIMALS),
    nodeStats: buildNodeStats(records, completeTimestamps),
    nodeSplit: [
      { label: 'MDC1', percentage: siteShare(mdc1) },
      { label: 'MDC2', percentage: siteShare(mdc2) },
    ],
    technologySplit: [
      { label: '2G+3G', percentage: share('volume2g3g') },
      { label: '4G', percentage: share('volume4g') },
    ],
    anomalies: [],
    rawRecordCount: records.length,
  };
}

function buildInsight(metrics, det) {
  return {
    subtitle: 'Data volume carried by the packet core each hour, split by data centre and combined',
    formula: {
      title: 'Per hour',
      expression: 'Combined = MDC1 + MDC2 at the same period start time',
      result: 'TB',
      note: 'The export reports megabytes; every figure here is MB ÷ 1024² (1,048,576) to give terabytes.',
    },
    pipeline: [
      {
        step: 1,
        title: 'Read the data sheet',
        detail: `${metrics.rawRowCount.toLocaleString()} rows · ${metrics.nodeCount} CMG${metrics.nodeCount === 1 ? '' : 's'}`,
        icon: 'database',
      },
      {
        step: 2,
        title: 'Pair the data centres per hour',
        detail: `${metrics.periodCount} hours · MDC1 + MDC2 at matching timestamps`,
        icon: 'calculator',
      },
      {
        step: 3,
        title: 'Convert and summarise',
        detail: `MB ÷ 1024² → TB · ${metrics.dayCount} days of averages and peaks`,
        icon: 'layers',
      },
    ],
    scope: {
      timeSpan: det.spanLabel || '—',
      granularity: 'Hourly',
      periodCount: metrics.periodCount,
      dayCount: metrics.dayCount,
      dayLabel: `${metrics.dayCount} day${metrics.dayCount === 1 ? '' : 's'}`,
      rawRows: metrics.rawRowCount,
      nodes: metrics.nodes,
    },
  };
}

function generateSummary(calculated, transformed) {
  const { metrics, timeSeries } = calculated;
  const det = timeSeries?.detected || {};

  const highlights = [
    { label: 'Time span', value: det.spanLabel || '—', trend: 'neutral' },
    { label: 'Total data volume', value: formatTb(metrics.grandTotal), sub: 'MDC1 and MDC2 together', trend: 'neutral' },
    { label: 'Peak hour', value: formatTb(metrics.peakTotal), sub: metrics.peakPeriod, trend: 'up' },
    { label: 'Average hour', value: formatTb(metrics.averageHourly), trend: 'neutral' },
    { label: 'Average day', value: formatTb(metrics.averageDailyTotal), sub: 'combined daily total', trend: 'neutral' },
    { label: 'Average daily peak', value: formatTb(metrics.averageDailyPeak), sub: 'busiest hour of a typical day', trend: 'neutral' },
    { label: 'MDC1 average hour', value: formatTb(metrics.mdc1.average), sub: `peak ${formatTb(metrics.mdc1.peak)}`, trend: 'neutral' },
    { label: 'MDC2 average hour', value: formatTb(metrics.mdc2.average), sub: `peak ${formatTb(metrics.mdc2.peak)}`, trend: 'neutral' },
    { label: 'MDC1 share', value: `${metrics.mdc1SharePct}%`, trend: 'neutral' },
    { label: 'MDC2 share', value: `${metrics.mdc2SharePct}%`, trend: 'neutral' },
    { label: '4G share', value: `${metrics.share4gPct}%`, trend: 'neutral' },
    { label: '2G+3G share', value: `${metrics.share2g3gPct}%`, trend: 'neutral' },
  ];

  return {
    title: 'Total Data Volume Report',
    kpiName: 'Total data volume',
    generatedAt: new Date().toISOString(),
    dateRange: transformed.dateRange,
    timeContext: { granularity: det.label, span: det.spanLabel, points: det.pointCount },
    insight: buildInsight(metrics, det),
    highlights,
    anomalies: [],
    narrative:
      `The core carried ${formatTb(metrics.grandTotal)} over ${det.spanLabel || 'the period'}, ` +
      `peaking at ${formatTb(metrics.peakTotal)} in the hour of ${metrics.peakPeriod}. ` +
      `MDC1 carried ${metrics.mdc1SharePct}% and MDC2 ${metrics.mdc2SharePct}%; ` +
      `4G accounts for ${metrics.share4gPct}% of the volume.`,
  };
}

module.exports = { calculate, generateSummary, formatTb };
