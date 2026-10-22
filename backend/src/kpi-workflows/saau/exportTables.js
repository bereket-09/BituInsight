const { formatCount } = require('./timeSeries');

/**
 * The tables the PowerPoint export adds for this workflow: the same figures the
 * dashboard shows — overall, day by day, and per CMG. Counts throughout.
 */
function exportTables(calculated) {
  const m = calculated?.metrics;
  if (!m) return [];
  const tables = [];

  tables.push({
    title: 'Overall SAAU, peak and average',
    subtitle:
      `SAAU = UTRAN + GERAN + E-UTRAN active bearers. Combined is MDC1 + MDC2 at the same period ` +
      `start time, over ${m.timeSpan}. Lowest hour: ${formatCount(m.lowestTotal)} (${m.lowestPeriod}).`,
    columns: ['Stream', 'Peak hour', 'At', 'Average hour', 'Share'],
    align: ['left', 'right', 'left', 'right', 'right'],
    rows: [
      ['MDC1', formatCount(m.mdc1.peak), m.mdc1.peakAt, formatCount(m.mdc1.average), `${m.mdc1SharePct}%`],
      ['MDC2', formatCount(m.mdc2.peak), m.mdc2.peakAt, formatCount(m.mdc2.average), `${m.mdc2SharePct}%`],
      ['Combined', formatCount(m.peakTotal), m.peakPeriod, formatCount(m.averageHourly), '100%'],
      ['4G (E-UTRAN)', formatCount(m.eutran.peak), m.eutran.peakAt, formatCount(m.eutran.average), `${m.shareEutranPct}%`],
      ['3G (UTRAN)', formatCount(m.utran.peak), m.utran.peakAt, formatCount(m.utran.average), `${m.shareUtranPct}%`],
      ['2G (GERAN)', formatCount(m.geran.peak), m.geran.peakAt, formatCount(m.geran.average), `${m.shareGeranPct}%`],
    ],
  });

  const daily = calculated.dailyStats || [];
  if (daily.length) {
    const topPeak = Math.max(...daily.map((d) => d.peakTotal));
    tables.push({
      title: 'Day by day',
      subtitle:
        "Each day's average hour and its busiest hour, for each data centre and the two combined. The highest daily peak is marked.",
      columns: [
        'Day',
        'MDC1 avg',
        'MDC2 avg',
        'Combined avg',
        'MDC1 peak',
        'MDC2 peak',
        'Combined peak',
        'Peak hour',
      ],
      align: ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'left'],
      rows: daily.map((d) => [
        d.hours < 24 ? `${d.day} (${d.hours}h)` : d.day,
        formatCount(d.avgMdc1),
        formatCount(d.avgMdc2),
        formatCount(d.avgTotal),
        formatCount(d.peakMdc1),
        formatCount(d.peakMdc2),
        `${formatCount(d.peakTotal)}${d.peakTotal === topPeak ? '  ▲' : ''}`,
        d.peakHourOfDay,
      ]),
    });
  }

  const nodes = calculated.nodeStats || [];
  if (nodes.length) {
    tables.push({
      title: 'SAAU per CMG',
      subtitle: "One row per CMG. Peak is the node's busiest hour, average its average hour.",
      columns: ['Site', 'CMG', 'Peak', 'Average', '4G avg', '3G avg', '2G avg', 'Share'],
      align: ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right'],
      rows: nodes.map((n) => [
        n.site || '—',
        n.node,
        formatCount(n.peak),
        formatCount(n.average),
        formatCount(n.avgEutran),
        formatCount(n.avgUtran),
        formatCount(n.avgGeran),
        `${n.sharePct}%`,
      ]),
    });
  }

  return tables;
}

module.exports = { exportTables };
