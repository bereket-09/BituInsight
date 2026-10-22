const {
  buildSaauTimeSeries,
  buildHourProfile,
  statOf,
  round,
  formatCount,
  FIELDS,
  COUNT_DECIMALS,
} = require('./timeSeries');
const { SITES, siteKey } = require('../shared/netactNodes');
const { mean } = require('../shared/siteTimeSeries');

/**
 * Everything the SAAU dashboard reports.
 *
 * SAAU is a count of simultaneously active bearers. It is never summed across
 * hours and never converted to a data unit: a day reports its average hour and
 * its busiest hour, and every figure here is a plain bearer count.
 */

/** One row per day: average and peak for each data centre and the two combined. */
function buildDailyStats(daily) {
  return daily.map((d) => ({
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
    avgUtran: d.utran,
    avgGeran: d.geran,
    avgEutran: d.eutran,
  }));
}

/**
 * Each CMG on its own peak and average, so one lopsided node is visible.
 *
 * The peak looks at every reading; averages are taken over the hours both data
 * centres reported, so a node's average here matches its MDC series.
 */
function buildNodeStats(records, completeTimestamps) {
  const byNode = new Map();
  for (const r of records) {
    if (!byNode.has(r.node)) {
      byNode.set(r.node, { node: r.node, site: r.site, totals: [], all: [], whole: [] });
    }
    const row = byNode.get(r.node);
    row.totals.push(r.values.total);
    row.all.push(r.values);
    if (completeTimestamps.has(r.date.getTime())) row.whole.push(r.values);
  }

  const rows = [...byNode.values()]
    .sort((a, b) => String(a.site).localeCompare(String(b.site)) || a.node.localeCompare(b.node))
    .map((row) => {
      const source = row.whole.length ? row.whole : row.all;
      const avgOf = (field) => round(mean(source.map((v) => v[field])), COUNT_DECIMALS);
      return {
        node: row.node,
        site: row.site,
        readings: row.totals.length,
        peak: Math.max(...row.totals),
        average: avgOf('total'),
        avgUtran: avgOf('utran'),
        avgGeran: avgOf('geran'),
        avgEutran: avgOf('eutran'),
      };
    });

  const allAvg = rows.reduce((s, r) => s + r.average, 0);
  rows.forEach((r) => {
    r.sharePct = allAvg > 0 ? round((r.average / allAvg) * 100, 1) : 0;
  });
  return rows;
}

function calculate(transformed) {
  const { records, nodes = [], sites = [] } = transformed;
  const timeSeries = buildSaauTimeSeries(records);
  const hourly = timeSeries.series.native;
  const daily = timeSeries.series.daily;
  const dailyStats = buildDailyStats(daily);

  const combined = statOf(hourly, 'total', COUNT_DECIMALS);
  const mdc1 = statOf(hourly, 'mdc1', COUNT_DECIMALS);
  const mdc2 = statOf(hourly, 'mdc2', COUNT_DECIMALS);

  const avgTotal = combined.average;
  const share = (field) =>
    avgTotal > 0 ? round((mean(hourly.map((p) => p[field])) / avgTotal) * 100, 1) : 0;

  const partialHours = hourly.filter((p) => !p.complete).length;
  const completeTimestamps = new Set(
    hourly.filter((p) => p.complete).map((p) => new Date(p.timestamp).getTime())
  );
  const latest = hourly[hourly.length - 1];

  return {
    valueType: 'count',
    metrics: {
      kpiName: 'SAAU',
      valueType: 'count',
      // SAAU is a count. The unit stays empty on purpose — no TB, no bytes.
      unit: '',
      unitLabel: 'bearers',
      peakTotal: combined.peak,
      peakPeriod: combined.peakAt,
      averageHourly: avgTotal,
      lowestTotal: combined.min,
      lowestPeriod: combined.minAt,
      averageDailyAverage: dailyStats.length ? round(mean(dailyStats.map((d) => d.avgTotal)), COUNT_DECIMALS) : 0,
      averageDailyPeak: dailyStats.length ? round(mean(dailyStats.map((d) => d.peakTotal)), COUNT_DECIMALS) : 0,
      highestDailyPeak: dailyStats.length ? Math.max(...dailyStats.map((d) => d.peakTotal)) : 0,
      busiestDay: dailyStats.length
        ? dailyStats.reduce((b, d) => (d.peakTotal > b.peakTotal ? d : b), dailyStats[0]).day
        : 'N/A',
      mdc1,
      mdc2,
      mdc1SharePct: share('mdc1'),
      mdc2SharePct: share('mdc2'),
      utran: statOf(hourly, 'utran', COUNT_DECIMALS),
      geran: statOf(hourly, 'geran', COUNT_DECIMALS),
      eutran: statOf(hourly, 'eutran', COUNT_DECIMALS),
      shareUtranPct: share('utran'),
      shareGeranPct: share('geran'),
      shareEutranPct: share('eutran'),
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
      formulaNote: 'SAAU = maxNumberOfActiveUtranBearers + maxNumberOfActiveGeranBearers + maxNumberOfActiveEutranBearers',
    },
    timeSeries,
    dailyStats,
    hourProfile: buildHourProfile(hourly, FIELDS, COUNT_DECIMALS),
    nodeStats: buildNodeStats(records, completeTimestamps),
    nodeSplit: SITES.map((site) => ({ label: site, percentage: share(siteKey(site)) })),
    technologySplit: [
      { label: '2G (GERAN)', percentage: share('geran') },
      { label: '3G (UTRAN)', percentage: share('utran') },
      { label: '4G (E-UTRAN)', percentage: share('eutran') },
    ],
    anomalies: [],
    rawRecordCount: records.length,
  };
}

function buildInsight(metrics, det) {
  return {
    subtitle: 'Simultaneously attached active users on the packet core, by data centre and combined',
    formula: {
      title: 'Per hour, per CMG',
      expression: 'SAAU = UTRAN + GERAN + E-UTRAN active bearers',
      result: 'bearers',
      note: 'A count, not a volume. Combined is MDC1 + MDC2 at the same period start time; hours are averaged across a day, never added.',
    },
    pipeline: [
      {
        step: 1,
        title: 'Read the SAAU sheet',
        detail: `${metrics.rawRowCount.toLocaleString()} rows · ${metrics.nodeCount} CMG${metrics.nodeCount === 1 ? '' : 's'}`,
        icon: 'database',
      },
      {
        step: 2,
        title: 'Add the three bearer counters',
        detail: 'UTRAN + GERAN + E-UTRAN per CMG per hour',
        icon: 'calculator',
      },
      {
        step: 3,
        title: 'Pair sites and summarise',
        detail: `${metrics.periodCount} hours · ${metrics.dayCount} days of averages and peaks`,
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
    { label: 'Peak SAAU', value: formatCount(metrics.peakTotal), sub: metrics.peakPeriod, trend: 'up' },
    { label: 'Average SAAU', value: formatCount(metrics.averageHourly), sub: 'average hour, combined', trend: 'neutral' },
    { label: 'Average daily peak', value: formatCount(metrics.averageDailyPeak), sub: 'busiest hour of a typical day', trend: 'neutral' },
    { label: 'MDC1 average', value: formatCount(metrics.mdc1.average), sub: `peak ${formatCount(metrics.mdc1.peak)}`, trend: 'neutral' },
    { label: 'MDC2 average', value: formatCount(metrics.mdc2.average), sub: `peak ${formatCount(metrics.mdc2.peak)}`, trend: 'neutral' },
    { label: 'MDC1 share', value: `${metrics.mdc1SharePct}%`, trend: 'neutral' },
    { label: 'MDC2 share', value: `${metrics.mdc2SharePct}%`, trend: 'neutral' },
    { label: '4G bearer share', value: `${metrics.shareEutranPct}%`, trend: 'neutral' },
    { label: '3G bearer share', value: `${metrics.shareUtranPct}%`, trend: 'neutral' },
    { label: '2G bearer share', value: `${metrics.shareGeranPct}%`, trend: 'neutral' },
  ];

  return {
    title: 'SAAU Report',
    kpiName: 'SAAU',
    generatedAt: new Date().toISOString(),
    dateRange: transformed.dateRange,
    timeContext: { granularity: det.label, span: det.spanLabel, points: det.pointCount },
    insight: buildInsight(metrics, det),
    highlights,
    anomalies: [],
    narrative:
      `SAAU peaked at ${formatCount(metrics.peakTotal)} active bearers (${metrics.peakPeriod}) and averaged ` +
      `${formatCount(metrics.averageHourly)} over ${det.spanLabel || 'the period'}. ` +
      `MDC1 holds ${metrics.mdc1SharePct}% and MDC2 ${metrics.mdc2SharePct}%; ` +
      `E-UTRAN bearers are ${metrics.shareEutranPct}% of the total.`,
  };
}

module.exports = { calculate, generateSummary, formatCount };
