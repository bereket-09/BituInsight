const { buildAttachTimeSeries, formatCount, round } = require('./timeSeries');
const { MEASURES } = require('./source');

const LABELS = Object.fromEntries(MEASURES.map((m) => [m.key, m.label]));
/** Table order: biggest technology first, voice counters last. */
const ORDER = ['users4g', 'users3g', 'users2g', 'vlr', 'bhca'];

function mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/** Overall peak, average and lowest of one field across the hourly series. */
function stat(hourly, field) {
  const values = hourly.map((p) => p[field]);
  if (!values.length) return { peak: 0, peakAt: 'N/A', average: 0, min: 0, minAt: 'N/A' };
  const peakPoint = hourly.reduce((b, p) => (p[field] > b[field] ? p : b), hourly[0]);
  const minPoint = hourly.reduce((b, p) => (p[field] < b[field] ? p : b), hourly[0]);
  return {
    peak: peakPoint[field],
    peakAt: peakPoint.label,
    average: round(mean(values), field === 'bhca' ? 1 : 0),
    min: minPoint[field],
    minAt: minPoint.label,
  };
}

/** Per day: the average hour and the peak hour, for each measure. */
function buildDailyStats(hourly, daily) {
  return daily.map((d) => {
    const hours = hourly.filter((p) => p.label && localDay(p.timestamp) === localDay(d.timestamp));
    const peakOf = (f) => (hours.length ? Math.max(...hours.map((p) => p[f])) : 0);
    return {
      day: d.label,
      hours: hours.length,
      avgTotal: d.total,
      peakTotal: d.peakTotal,
      peakAt: d.peakAt,
      avg4g: d.users4g,
      peak4g: peakOf('users4g'),
      avg3g: d.users3g,
      avg2g: d.users2g,
      avgVlr: d.vlr,
      peakVlr: peakOf('vlr'),
      avgBhca: d.bhca,
      peakBhca: peakOf('bhca'),
    };
  });
}

function localDay(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Each CMM / MSC: its own peak and average, so one weak node is visible. */
function buildNodeStats(records) {
  const byNode = new Map();
  for (const r of records) {
    const key = `${r.measure}|${r.node}`;
    if (!byNode.has(key)) byNode.set(key, { measure: r.measure, node: r.node, site: r.site, values: [] });
    byNode.get(key).values.push(r.value);
  }
  return [...byNode.values()]
    .map((n) => ({
      measure: n.measure,
      measureLabel: LABELS[n.measure],
      node: n.node,
      site: n.site,
      peak: round(Math.max(...n.values), n.measure === 'bhca' ? 1 : 0),
      average: round(mean(n.values), n.measure === 'bhca' ? 1 : 0),
      readings: n.values.length,
    }))
    .sort((a, b) => ORDER.indexOf(a.measure) - ORDER.indexOf(b.measure) || a.node.localeCompare(b.node));
}

/** The shape of a typical day: the average of each hour of day across the report. */
function buildHourProfile(hourly) {
  const byHour = new Map();
  for (const p of hourly) {
    const hour = new Date(p.timestamp).getHours();
    if (!byHour.has(hour)) byHour.set(hour, []);
    byHour.get(hour).push(p);
  }
  return [...byHour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, points]) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      avgTotal: round(mean(points.map((p) => p.total))),
      avg4g: round(mean(points.map((p) => p.users4g))),
      avg3g: round(mean(points.map((p) => p.users3g))),
      avg2g: round(mean(points.map((p) => p.users2g))),
      avgBhca: round(mean(points.map((p) => p.bhca)), 1),
    }));
}

/**
 * One row per node with every measure side by side, for the per-node grid.
 * A CMM's total is its own 2G + 3G + 4G per hour, so its peak is the busiest
 * hour of that sum — not the sum of three peaks that may fall in different hours.
 */
function buildNodeMatrix(records) {
  const cmm = new Map();
  const msc = new Map();
  const statOf = (values, decimals = 0) =>
    values.length ? { peak: round(Math.max(...values), decimals), avg: round(mean(values), decimals) } : null;

  for (const r of records) {
    const isAttach = r.measure.startsWith('users');
    const map = isAttach ? cmm : msc;
    if (!map.has(r.node)) map.set(r.node, { node: r.node, site: r.site, values: {}, hourTotals: new Map() });
    const row = map.get(r.node);
    (row.values[r.measure] ||= []).push(r.value);
    if (isAttach) {
      const hour = r.date.getTime();
      row.hourTotals.set(hour, (row.hourTotals.get(hour) || 0) + r.value);
    }
  }

  const bySite = (a, b) => String(a.site).localeCompare(String(b.site)) || a.node.localeCompare(b.node);
  const cmmRows = [...cmm.values()].sort(bySite).map((row) => ({
    node: row.node,
    site: row.site,
    users4g: statOf(row.values.users4g || []),
    users3g: statOf(row.values.users3g || []),
    users2g: statOf(row.values.users2g || []),
    total: statOf([...row.hourTotals.values()]),
  }));
  const allAvg = cmmRows.reduce((sum, r) => sum + (r.total?.avg || 0), 0);
  cmmRows.forEach((r) => {
    r.sharePct = allAvg > 0 ? round(((r.total?.avg || 0) / allAvg) * 100, 1) : 0;
  });

  const mscRows = [...msc.values()].sort(bySite).map((row) => ({
    node: row.node,
    site: row.site,
    vlr: statOf(row.values.vlr || []),
    bhca: statOf(row.values.bhca || [], 1),
  }));

  return { cmm: cmmRows, msc: mscRows };
}

function calculate(transformed) {
  const { records, measuresFound, cmmNodes = [], mscNodes = [] } = transformed;
  const timeSeries = buildAttachTimeSeries(records);
  const hourly = timeSeries.series.native;
  const daily = timeSeries.series.daily;

  const total = stat(hourly, 'total');
  const avgTotal = total.average;
  const share = (field) => (avgTotal > 0 ? round((mean(hourly.map((p) => p[field])) / avgTotal) * 100, 1) : 0);
  const dailyStats = buildDailyStats(hourly, daily);
  const avgDailyPeak = dailyStats.length ? round(mean(dailyStats.map((d) => d.peakTotal))) : 0;

  const vlr = stat(hourly, 'vlr');
  const bhca = stat(hourly, 'bhca');
  const latest = hourly[hourly.length - 1];

  return {
    valueType: 'count',
    metrics: {
      kpiName: 'Peak attached users',
      valueType: 'count',
      unit: 'users',
      peakTotalUsers: total.peak,
      peakPeriod: total.peakAt,
      averageTotalUsers: avgTotal,
      lowestTotalUsers: total.min,
      lowestPeriod: total.minAt,
      averageDailyPeak: avgDailyPeak,
      latestPeriod: latest?.label || 'N/A',
      latestTotalUsers: latest?.total ?? 0,
      users2g: stat(hourly, 'users2g'),
      users3g: stat(hourly, 'users3g'),
      users4g: stat(hourly, 'users4g'),
      share2gPct: share('users2g'),
      share3gPct: share('users3g'),
      share4gPct: share('users4g'),
      mdc1SharePct: share('mdc1'),
      mdc2SharePct: share('mdc2'),
      vlr,
      bhca,
      hasVoice: measuresFound.includes('vlr') || measuresFound.includes('bhca'),
      measuresFound,
      cmmNodes,
      mscNodes,
      cmmNodeCount: cmmNodes.length,
      mscNodeCount: mscNodes.length,
      periodCount: hourly.length,
      dayCount: daily.length,
      rawRowCount: records.length,
      timeGranularity: timeSeries.detected.label,
      timeSpan: timeSeries.detected.spanLabel,
    },
    timeSeries,
    dailyStats,
    hourProfile: buildHourProfile(hourly),
    nodeStats: buildNodeStats(records),
    nodeMatrix: buildNodeMatrix(records),
    nodeSplit: [
      { label: 'MDC1', percentage: share('mdc1') },
      { label: 'MDC2', percentage: share('mdc2') },
    ],
    technologySplit: [
      { label: '2G', percentage: share('users2g') },
      { label: '3G', percentage: share('users3g') },
      { label: '4G', percentage: share('users4g') },
    ],
    anomalies: [],
    rawRecordCount: records.length,
  };
}

function buildInsight(metrics, det) {
  return {
    subtitle: 'Users attached to the core across 2G, 3G and 4G, with voice registrations and call load alongside',
    formula: {
      title: 'Per hour',
      expression: `2G + 3G + 4G attached users, added across all ${metrics.cmmNodeCount} CMM${metrics.cmmNodeCount === 1 ? '' : 's'}`,
      result: 'users',
      note: 'Hours are never added together: a day or week shows its average hour and its peak hour.',
    },
    pipeline: [
      { step: 1, title: 'Read every data sheet', detail: `${metrics.measuresFound.length} counters · ${metrics.rawRowCount.toLocaleString()} rows`, icon: 'database' },
      { step: 2, title: 'Add nodes per hour', detail: `${metrics.cmmNodeCount} CMMs → one total per hour · MDC1 / MDC2`, icon: 'calculator' },
      { step: 3, title: 'Average & peak per day', detail: `${metrics.dayCount} days · ${metrics.periodCount} hours`, icon: 'layers' },
    ],
    scope: {
      timeSpan: det.spanLabel || '—',
      granularity: 'Hourly',
      periodCount: metrics.periodCount,
      dayCount: metrics.dayCount,
      dayLabel: `${metrics.dayCount} day${metrics.dayCount === 1 ? '' : 's'}`,
      rawRows: metrics.rawRowCount,
      cmmNodes: metrics.cmmNodes,
      mscNodes: metrics.mscNodes,
    },
  };
}

function generateSummary(calculated, transformed) {
  const { metrics, timeSeries } = calculated;
  const det = timeSeries?.detected || {};

  const highlights = [
    { label: 'Time span', value: det.spanLabel || '—', trend: 'neutral' },
    { label: 'Peak attached users', value: formatCount(metrics.peakTotalUsers), sub: metrics.peakPeriod, trend: 'up' },
    { label: 'Nodes counted', value: `${metrics.cmmNodeCount} CMM${metrics.cmmNodeCount === 1 ? '' : 's'}${metrics.mscNodeCount ? ` · ${metrics.mscNodeCount} MSC${metrics.mscNodeCount === 1 ? '' : 's'}` : ''}`, trend: 'neutral' },
    { label: 'Average attached users', value: formatCount(metrics.averageTotalUsers), sub: 'average hour', trend: 'neutral' },
    { label: 'Average daily peak', value: formatCount(metrics.averageDailyPeak), sub: 'busiest hour of a typical day', trend: 'neutral' },
    { label: '4G share', value: `${metrics.share4gPct}%`, trend: 'neutral' },
    { label: '3G share', value: `${metrics.share3gPct}%`, trend: 'neutral' },
    { label: '2G share', value: `${metrics.share2gPct}%`, trend: 'neutral' },
    { label: 'MDC1 share', value: `${metrics.mdc1SharePct}%`, trend: 'neutral' },
    { label: 'MDC2 share', value: `${metrics.mdc2SharePct}%`, trend: 'neutral' },
  ];
  if (metrics.measuresFound.includes('vlr')) {
    highlights.push({ label: 'Peak VLR subscribers', value: formatCount(metrics.vlr.peak), sub: metrics.vlr.peakAt, trend: 'up' });
  }
  if (metrics.measuresFound.includes('bhca')) {
    highlights.push({ label: 'Peak BHCA', value: `${formatCount(metrics.bhca.peak)} Erl`, sub: metrics.bhca.peakAt, trend: 'up' });
  }

  return {
    title: 'Peak Attached Users Report',
    kpiName: 'Peak attached users',
    generatedAt: new Date().toISOString(),
    dateRange: transformed.dateRange,
    timeContext: { granularity: det.label, span: det.spanLabel, points: det.pointCount },
    insight: buildInsight(metrics, det),
    highlights,
    anomalies: [],
    narrative:
      `Attached users peaked at ${formatCount(metrics.peakTotalUsers)} (${metrics.peakPeriod}) and averaged ` +
      `${formatCount(metrics.averageTotalUsers)} over ${det.spanLabel || 'the period'}. ` +
      `4G carries ${metrics.share4gPct}% of attached users.`,
  };
}

module.exports = { calculate, generateSummary, formatCount };
