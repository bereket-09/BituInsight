const { formatCount } = require('./timeSeries');

/**
 * Nodes down the side, measures across the top with peak and average under
 * each: a two-row header with merged group cells, and the site merged down
 * across its nodes.
 */
function nodeGrid({ title, subtitle, groups, rows, totalRow, share = false }) {
  const fmt = (key, v) => (v == null ? '—' : `${formatCount(v)}${key === 'bhca' ? ' Erl' : ''}`);
  const headerRows = [
    [
      { text: 'Site', rowspan: 2 },
      { text: 'Node', rowspan: 2 },
      ...groups.map(([, label]) => ({ text: label, colspan: 2 })),
      ...(share ? [{ text: 'Share', rowspan: 2 }] : []),
    ],
    groups.flatMap(() => [{ text: 'Peak' }, { text: 'Avg' }]),
  ];

  const body = rows.map((r, i) => {
    const firstOfSite = i === 0 || rows[i - 1].site !== r.site;
    let span = 0;
    if (firstOfSite) while (rows[i + span] && rows[i + span].site === r.site) span += 1;
    return [
      ...(firstOfSite ? [{ text: r.site || '—', rowspan: span, bold: true }] : []),
      r.node,
      ...groups.flatMap(([key]) => [fmt(key, r[key]?.peak), fmt(key, r[key]?.avg)]),
      ...(share ? [`${r.sharePct}%`] : []),
    ];
  });
  if (totalRow) {
    body.push([
      { text: totalRow.label, colspan: 2, bold: true, total: true },
      ...groups.flatMap(([key]) => [
        { text: fmt(key, totalRow[key]?.peak), bold: true, total: true },
        { text: fmt(key, totalRow[key]?.avg), total: true },
      ]),
      ...(share ? [{ text: '100%', total: true }] : []),
    ]);
  }

  return {
    title,
    subtitle,
    headerRows,
    rows: body,
    align: ['left', 'left', ...groups.flatMap(() => ['right', 'right']), ...(share ? ['right'] : [])],
    // Site and node get fixed widths so node names stay on one line.
    colW: { fixed: [0.85, 2.05] },
    keepTogether: true,
  };
}

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
        ...(hasBhca ? ['BHCA avg', 'BHCA peak'] : []),
      ],
      align: ['left', 'right', 'right', 'left', 'right', 'right', 'right', 'right', 'right', 'right'],
      rows: daily.map((d) => [
        d.hours < 24 ? `${d.day} (${d.hours}h)` : d.day,
        formatCount(d.avgTotal),
        `${formatCount(d.peakTotal)}${d.peakTotal === topPeak ? '  ▲' : ''}`,
        d.peakAt,
        formatCount(d.avg4g),
        formatCount(d.avg3g),
        formatCount(d.avg2g),
        ...(hasVlr ? [formatCount(d.peakVlr)] : []),
        ...(hasBhca ? [`${formatCount(d.avgBhca)} Erl`, `${formatCount(d.peakBhca)} Erl`] : []),
      ]),
    });
  }

  const matrix = calculated.nodeMatrix;
  if (matrix?.cmm?.length) {
    tables.push(
      nodeGrid({
        title: 'Attached users per CMM',
        subtitle: "One row per CMM. Peak is the node's busiest hour, avg its average hour; share is of all attached users.",
        groups: [
          ['users4g', '4G'],
          ['users3g', '3G'],
          ['users2g', '2G'],
          ['total', 'Total attached'],
        ],
        rows: matrix.cmm,
        share: true,
        totalRow: {
          label: `All ${matrix.cmm.length} CMMs`,
          users4g: { peak: m.users4g?.peak, avg: m.users4g?.average },
          users3g: { peak: m.users3g?.peak, avg: m.users3g?.average },
          users2g: { peak: m.users2g?.peak, avg: m.users2g?.average },
          total: { peak: m.peakTotalUsers, avg: m.averageTotalUsers },
          sharePct: 100,
        },
      })
    );
  }
  if (matrix?.msc?.length) {
    const groups = [];
    if (m.measuresFound?.includes('vlr')) groups.push(['vlr', 'VLR subscribers']);
    if (m.measuresFound?.includes('bhca')) groups.push(['bhca', 'BHCA (Erlang)']);
    tables.push(
      nodeGrid({
        title: 'Voice per MSC',
        subtitle: 'VLR subscribers registered and busy-hour call load on each MSC.',
        groups,
        rows: matrix.msc,
        totalRow: {
          label: `All ${matrix.msc.length} MSCs`,
          vlr: { peak: m.vlr?.peak, avg: m.vlr?.average },
          bhca: { peak: m.bhca?.peak, avg: m.bhca?.average },
        },
      })
    );
  }

  return tables;
}

module.exports = { exportTables };
