const { formatCount } = require('./timeSeries');

/**
 * The tables the PowerPoint export adds for this workflow: the same figures the
 * report page shows under "How this KPI is calculated", day by day and per node.
 */
function exportTables(calculated) {
  const m = calculated?.metrics;
  if (!m) return [];
  const tables = [];

  const measures = [
    ['Total attached users', m.peakTotalUsers, m.peakPeriod, m.averageTotalUsers, ''],
    ['4G attached', m.users4g?.peak, m.users4g?.peakAt, m.users4g?.average, ''],
    ['3G attached', m.users3g?.peak, m.users3g?.peakAt, m.users3g?.average, ''],
    ['2G attached', m.users2g?.peak, m.users2g?.peakAt, m.users2g?.average, ''],
  ];
  if (m.measuresFound?.includes('vlr')) {
    measures.push(['VLR subscribers', m.vlr.peak, m.vlr.peakAt, m.vlr.average, '']);
  }
  if (m.measuresFound?.includes('bhca')) {
    measures.push(['BHCA', m.bhca.peak, m.bhca.peakAt, m.bhca.average, ' Erl']);
  }

  tables.push({
    title: 'Overall peak and average',
    subtitle: `Every node added together per hour, over ${m.timeSpan}. Average daily peak: ${formatCount(
      m.averageDailyPeak
    )} attached users. Lowest hour: ${formatCount(m.lowestTotalUsers)} (${m.lowestPeriod}).`,
    columns: ['Measure', 'Overall peak', 'Peak hour', 'Overall average', 'Share of attached'],
    align: ['left', 'right', 'left', 'right', 'right'],
    rows: measures.map(([label, peak, at, avg, unit]) => [
      label,
      `${formatCount(peak)}${unit}`,
      at || '—',
      `${formatCount(avg)}${unit}`,
      label === '4G attached'
        ? `${m.share4gPct}%`
        : label === '3G attached'
          ? `${m.share3gPct}%`
          : label === '2G attached'
            ? `${m.share2gPct}%`
            : label === 'Total attached users'
              ? '100%'
              : '—',
    ]),
  });

  const daily = calculated.dailyStats || [];
  if (daily.length) {
    const hasVlr = m.measuresFound?.includes('vlr');
    const hasBhca = m.measuresFound?.includes('bhca');
    const topPeak = Math.max(...daily.map((d) => d.peakTotal));
    tables.push({
      title: 'Day by day',
      subtitle: "Each day's average hour and its busiest hour. The highest daily peak is marked.",
      columns: [
        'Day',
        'Daily average',
        'Daily peak',
        'Peak hour',
        '4G avg',
        '3G avg',
        '2G avg',
        ...(hasVlr ? ['VLR peak'] : []),
        ...(hasBhca ? ['BHCA peak'] : []),
      ],
      align: ['left', 'right', 'right', 'left', 'right', 'right', 'right', 'right', 'right'],
      rows: daily.map((d) => [
        d.hours < 24 ? `${d.day} (${d.hours}h)` : d.day,
        formatCount(d.avgTotal),
        `${formatCount(d.peakTotal)}${d.peakTotal === topPeak ? '  ▲' : ''}`,
        d.peakAt,
        formatCount(d.avg4g),
        formatCount(d.avg3g),
        formatCount(d.avg2g),
        ...(hasVlr ? [formatCount(d.peakVlr)] : []),
        ...(hasBhca ? [`${formatCount(d.peakBhca)} Erl`] : []),
      ]),
    });
  }

  const nodes = calculated.nodeStats || [];
  if (nodes.length) {
    tables.push({
      title: 'Per node',
      subtitle: 'Each CMM and MSC on its own, so one node carrying more or less than its peers stands out.',
      columns: ['Measure', 'Node', 'Site', 'Peak', 'Average', 'Readings'],
      align: ['left', 'left', 'left', 'right', 'right', 'right'],
      rows: nodes.map((n) => {
        const unit = n.measure === 'bhca' ? ' Erl' : '';
        return [
          n.measureLabel,
          n.node,
          n.site || '—',
          `${formatCount(n.peak)}${unit}`,
          `${formatCount(n.average)}${unit}`,
          String(n.readings),
        ];
      }),
    });
  }

  return tables;
}

module.exports = { exportTables };
