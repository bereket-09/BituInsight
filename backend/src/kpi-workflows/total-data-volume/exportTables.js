const { formatTb } = require('./timeSeries');

/**
 * The tables the PowerPoint export adds for this workflow: the same figures the
 * dashboard shows — overall, day by day, and per CMG.
 */
function exportTables(calculated) {
  const m = calculated?.metrics;
  if (!m) return [];
  const tables = [];

  tables.push({
    title: 'Overall volume, peak and average',
    subtitle:
      `Every hour is MDC1 + MDC2 at the same period start time, over ${m.timeSpan}. ` +
      `Megabytes from the export divided by 1024² to give terabytes.`,
    columns: ['Stream', 'Total volume', 'Peak hour', 'At', 'Average hour', 'Share'],
    align: ['left', 'right', 'right', 'left', 'right', 'right'],
    rows: [
      ['MDC1', formatTb(m.mdc1Total), formatTb(m.mdc1.peak), m.mdc1.peakAt, formatTb(m.mdc1.average), `${m.mdc1SharePct}%`],
      ['MDC2', formatTb(m.mdc2Total), formatTb(m.mdc2.peak), m.mdc2.peakAt, formatTb(m.mdc2.average), `${m.mdc2SharePct}%`],
      ['Combined', formatTb(m.grandTotal), formatTb(m.peakTotal), m.peakPeriod, formatTb(m.averageHourly), '100%'],
    ],
  });

  const daily = calculated.dailyStats || [];
  if (daily.length) {
    const topPeak = Math.max(...daily.map((d) => d.peakTotal));
    tables.push({
      title: 'Day by day',
      subtitle:
        "Each day's total, its average hour and its busiest hour for each data centre and the two combined. The highest daily peak is marked.",
      columns: [
        'Day',
        'Day total',
        'MDC1 avg',
        'MDC2 avg',
        'Combined avg',
        'MDC1 peak',
        'MDC2 peak',
        'Combined peak',
        'Peak hour',
      ],
      align: ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'left'],
      rows: daily.map((d) => [
        d.hours < 24 ? `${d.day} (${d.hours}h)` : d.day,
        formatTb(d.dayTotal),
        formatTb(d.avgMdc1),
        formatTb(d.avgMdc2),
        formatTb(d.avgTotal),
        formatTb(d.peakMdc1),
        formatTb(d.peakMdc2),
        `${formatTb(d.peakTotal)}${d.peakTotal === topPeak ? '  ▲' : ''}`,
        d.peakHourOfDay,
      ]),
    });
  }

  const nodes = calculated.nodeStats || [];
  if (nodes.length) {
    tables.push({
      title: 'Volume per CMG',
      subtitle: "One row per CMG. Peak is the node's busiest hour, average its average hour.",
      columns: ['Site', 'CMG', 'Total', '4G', '2G+3G', 'Peak hour', 'Average hour', 'Share'],
      align: ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right'],
      rows: nodes.map((n) => [
        n.site || '—',
        n.node,
        formatTb(n.total),
        formatTb(n.total4g),
        formatTb(n.total2g3g),
        formatTb(n.peak),
        formatTb(n.average),
        `${n.sharePct}%`,
      ]),
    });
  }

  return tables;
}

module.exports = { exportTables };
