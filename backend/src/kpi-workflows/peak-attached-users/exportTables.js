const { formatCount } = require('./timeSeries');
const { MEASURES } = require('./source');

/**
 * The downloadable tables for this workflow.
 *
 * Organised the way the operator asked for: Voice and Packet are separate
 * sections, and within every table a measure's peak and its average sit in
 * adjacent columns so the two can be read off one row.
 *
 * The two groups come from ./source.js — `MEASURES` already tags each counter
 * `attach` (packet, counted per CMM) or `voice` (per MSC) — so the export
 * cannot drift from the parser that produced the numbers.
 *
 * Measures do not overlap between the groups, which is a property of the data
 * and not an omission: 2G/3G/4G attached users and their total exist only for
 * packet, VLR subscribers and BHCA only for voice. Each section says so rather
 * than leaving a reader to wonder where the other half went.
 */

/** Packet's total is derived (2G + 3G + 4G per hour), so it is not in MEASURES. */
const TOTAL_MEASURE = { key: 'total', label: 'Total attached', group: 'attach' };

const GROUPS = [
  {
    id: 'attach',
    title: 'Packet',
    /** Measures, biggest first, with the derived total leading. */
    measures: [
      TOTAL_MEASURE,
      ...['users4g', 'users3g', 'users2g'].map((k) => MEASURES.find((m) => m.key === k)),
    ],
    nodeLabel: 'CMM',
    only: 'Attached users are counted per CMM across 2G, 3G and 4G; the voice counters (VLR subscribers, BHCA) exist only on the MSCs and are in the voice section.',
  },
  {
    id: 'voice',
    title: 'Voice',
    measures: MEASURES.filter((m) => m.group === 'voice'),
    nodeLabel: 'MSC',
    only: 'VLR subscribers and BHCA are counted per MSC; the attached-user counters (2G, 3G, 4G) exist only on the CMMs and are in the packet section.',
  },
];

/** Per-measure display unit. Everything else is a plain count. */
const UNIT = { bhca: ' Erl' };

const fmt = (key, value) => (value == null ? '—' : `${formatCount(value)}${UNIT[key] || ''}`);

/** Which of a group's measures this report actually carries. */
function presentMeasures(group, metrics) {
  const found = metrics?.measuresFound || [];
  return group.measures.filter((m) => m && (m.key === 'total' || found.includes(m.key)));
}

/** Overall peak / average for one measure, from the metrics block. */
function overallOf(metrics, key) {
  if (key === 'total') {
    return {
      peak: metrics.peakTotalUsers,
      peakAt: metrics.peakPeriod,
      average: metrics.averageTotalUsers,
    };
  }
  const stat = metrics[key];
  return { peak: stat?.peak, peakAt: stat?.peakAt, average: stat?.average };
}

const SHARE_FIELD = {
  total: null,
  users4g: 'share4gPct',
  users3g: 'share3gPct',
  users2g: 'share2gPct',
};

/**
 * A two-row header: a row of merged group labels over a row of Peak / Avg
 * pairs. `lead` and `trail` columns span both rows.
 */
function pairHeader(lead, groups, trail = []) {
  return [
    [
      ...lead.map((text) => ({ text, rowspan: 2 })),
      ...groups.map(([, label]) => ({ text: label, colspan: 2 })),
      ...trail.map((text) => ({ text, rowspan: 2 })),
    ],
    groups.flatMap(() => [{ text: 'Peak' }, { text: 'Avg' }]),
  ];
}

/**
 * Nodes down the side, measures across the top with peak and average under
 * each: a two-row header with merged group cells, and the site merged down
 * across its nodes.
 */
function nodeGrid({ title, subtitle, groups, rows, totalRow, share = false }) {
  const headerRows = pairHeader(['Site', 'Node'], groups, share ? ['Share'] : []);

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

/** One group's overall figures: one row per measure, peak beside average. */
function overallTable(group, metrics, measures) {
  const share = group.id === 'attach';
  const extra =
    group.id === 'attach'
      ? ` Average daily peak: ${formatCount(metrics.averageDailyPeak)} attached users. Lowest hour: ${formatCount(
          metrics.lowestTotalUsers
        )} (${metrics.lowestPeriod}).`
      : '';

  return {
    title: `${group.title} — overall peak and average`,
    subtitle:
      `Every ${group.nodeLabel} added together per hour, over ${metrics.timeSpan}. ` +
      `Peak and average sit side by side.${extra} ${group.only}`,
    columns: ['Measure', 'Peak', 'Peak hour', 'Average', ...(share ? ['Share of attached'] : [])],
    align: ['left', 'right', 'left', 'right', ...(share ? ['right'] : [])],
    rows: measures.map((m) => {
      const o = overallOf(metrics, m.key);
      const shareField = SHARE_FIELD[m.key];
      return [
        m.label,
        fmt(m.key, o.peak),
        o.peakAt || '—',
        fmt(m.key, o.average),
        ...(share
          ? [m.key === 'total' ? '100%' : shareField ? `${metrics[shareField]}%` : '—']
          : []),
      ];
    }),
  };
}

/** Where a day's peak and average for one measure live on a dailyStats row. */
const DAILY_FIELDS = {
  total: { peak: 'peakTotal', avg: 'avgTotal' },
  users4g: { peak: 'peak4g', avg: 'avg4g' },
  users3g: { peak: 'peak3g', avg: 'avg3g' },
  users2g: { peak: 'peak2g', avg: 'avg2g' },
  vlr: { peak: 'peakVlr', avg: 'avgVlr' },
  bhca: { peak: 'peakBhca', avg: 'avgBhca' },
};

/** One group, day by day: each measure's peak hour beside its average hour. */
function dailyTable(group, daily, measures, metrics) {
  const groups = measures.map((m) => [m.key, m.label]);
  const trail = group.id === 'attach' ? ['Peak hour'] : [];
  const topPeak = Math.max(...daily.map((d) => d.peakTotal));

  return {
    title: `${group.title} — day by day`,
    subtitle:
      `Each day's busiest hour beside its average hour, per measure.` +
      (group.id === 'attach' ? ' The highest daily peak is marked.' : '') +
      ` ${group.only}`,
    headerRows: pairHeader(['Day'], groups, trail),
    rows: daily.map((d) => [
      d.hours < 24 ? `${d.day} (${d.hours}h)` : d.day,
      ...measures.flatMap((m) => {
        const f = DAILY_FIELDS[m.key];
        const peak = fmt(m.key, d[f.peak]);
        return [
          m.key === 'total' && d.peakTotal === topPeak ? `${peak}  ▲` : peak,
          fmt(m.key, d[f.avg]),
        ];
      }),
      ...(trail.length ? [d.peakAt] : []),
    ]),
    align: ['left', ...measures.flatMap(() => ['right', 'right']), ...trail.map(() => 'left')],
    meta: { timeSpan: metrics.timeSpan },
  };
}

/** One group, per node: the existing merged grid, retitled into its section. */
function nodeTable(group, matrix, metrics, measures) {
  if (group.id === 'attach') {
    if (!matrix?.cmm?.length) return null;
    // Nodes read better biggest-technology-first with the derived total last.
    const groups = [
      ...measures.filter((m) => m.key !== 'total').map((m) => [m.key, m.label]),
      [TOTAL_MEASURE.key, 'Total attached'],
    ];
    return nodeGrid({
      title: `${group.title} — attached users per CMM`,
      subtitle:
        "One row per CMM, peak beside average. Peak is the node's busiest hour, avg its average hour; " +
        `share is of all attached users. ${group.only}`,
      groups,
      rows: matrix.cmm,
      share: true,
      totalRow: {
        label: `All ${matrix.cmm.length} CMMs`,
        users4g: { peak: metrics.users4g?.peak, avg: metrics.users4g?.average },
        users3g: { peak: metrics.users3g?.peak, avg: metrics.users3g?.average },
        users2g: { peak: metrics.users2g?.peak, avg: metrics.users2g?.average },
        total: { peak: metrics.peakTotalUsers, avg: metrics.averageTotalUsers },
        sharePct: 100,
      },
    });
  }

  if (!matrix?.msc?.length) return null;
  return nodeGrid({
    title: `${group.title} — VLR and BHCA per MSC`,
    subtitle:
      'VLR subscribers registered and busy-hour call load on each MSC, peak beside average. ' +
      group.only,
    groups: measures.map((m) => [m.key, m.label]),
    rows: matrix.msc,
    totalRow: {
      label: `All ${matrix.msc.length} MSCs`,
      vlr: { peak: metrics.vlr?.peak, avg: metrics.vlr?.average },
      bhca: { peak: metrics.bhca?.peak, avg: metrics.bhca?.average },
    },
  });
}

/**
 * The tables the PowerPoint export adds for this workflow: the same figures the
 * report page shows under "How this KPI is calculated", grouped into a packet
 * section and a voice section, each with peak beside average.
 */
function exportTables(calculated) {
  const metrics = calculated?.metrics;
  if (!metrics) return [];

  const daily = calculated.dailyStats || [];
  const matrix = calculated.nodeMatrix;
  const tables = [];

  for (const group of GROUPS) {
    const measures = presentMeasures(group, metrics);
    // A group with no counters in this workbook contributes no section at all,
    // rather than a run of empty tables.
    if (!measures.length) continue;

    tables.push(overallTable(group, metrics, measures));
    if (daily.length) tables.push(dailyTable(group, daily, measures, metrics));
    const node = nodeTable(group, matrix, metrics, measures);
    if (node) tables.push(node);
  }

  return tables;
}

module.exports = { exportTables, GROUPS, DAILY_FIELDS, SHARE_FIELD };
