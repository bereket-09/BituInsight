/**
 * The downloadable Peak Attached Users data points, reorganised.
 *
 * Two things the operator asked for shape this file:
 *
 *   1. Voice and packet are separate sections. The split is the one the backend
 *      parser already makes — 2G/3G/4G attached users are counted per CMM
 *      (packet), VLR subscribers and BHCA per MSC (voice) — so the download
 *      reflects a real property of the data rather than a cosmetic grouping.
 *   2. A measure's peak and its average sit in adjacent columns, so the pair
 *      can be read off one row instead of hunted for in two places.
 *
 * The CSV stays long-format and machine-readable: one row per
 * group × scope × entity × measure, with `Peak` and `Average` as neighbouring
 * columns and `Group` as the first column, so the sections are contiguous and
 * a spreadsheet can still filter, pivot and sum them. Figures are raw numbers,
 * never the abbreviated display strings.
 *
 * No measure is dropped. The two groups share none, which is a property of the
 * data: `groupNote` on each group says so, and the caller surfaces it.
 */

export const MEASURE_GROUPS = [
  {
    id: 'packet',
    label: 'Packet',
    nodeLabel: 'CMM',
    hasShare: true,
    groupNote:
      'Attached users, counted per CMM across 2G, 3G and 4G. The voice counters (VLR subscribers, BHCA) exist only on the MSCs and are in the voice section.',
    measures: [
      // The total is derived (2G + 3G + 4G in the same hour), so it is always
      // present when any attach counter is.
      { key: 'total', label: 'Total attached', unit: 'users', derived: true },
      { key: 'users4g', label: '4G attached', unit: 'users', shareField: 'share4gPct' },
      { key: 'users3g', label: '3G attached', unit: 'users', shareField: 'share3gPct' },
      { key: 'users2g', label: '2G attached', unit: 'users', shareField: 'share2gPct' },
    ],
  },
  {
    id: 'voice',
    label: 'Voice',
    nodeLabel: 'MSC',
    hasShare: false,
    groupNote:
      'VLR subscribers and busy-hour call load, counted per MSC. The attached-user counters (2G, 3G, 4G) exist only on the CMMs and are in the packet section.',
    measures: [
      { key: 'vlr', label: 'VLR subscribers', unit: 'users' },
      { key: 'bhca', label: 'BHCA', unit: 'Erlang' },
    ],
  },
];

/** Where a day's peak and average for each measure live on a dailyStats row. */
const DAILY_FIELDS = {
  total: { peak: 'peakTotal', avg: 'avgTotal' },
  users4g: { peak: 'peak4g', avg: 'avg4g' },
  users3g: { peak: 'peak3g', avg: 'avg3g' },
  users2g: { peak: 'peak2g', avg: 'avg2g' },
  vlr: { peak: 'peakVlr', avg: 'avgVlr' },
  bhca: { peak: 'peakBhca', avg: 'avgBhca' },
};

export const EXPORT_HEADERS = [
  'Group',
  'Scope',
  'Entity',
  'Site',
  'Measure',
  'Unit',
  'Peak',
  'Peak hour',
  'Average',
  'Share of attached (%)',
];

function num(value) {
  return Number.isFinite(Number(value)) ? Number(value) : '';
}

/** Which of a group's measures this report carries. */
export function presentMeasures(group, metrics) {
  const found = metrics?.measuresFound || [];
  const anyAttach = ['users2g', 'users3g', 'users4g'].some((k) => found.includes(k));
  return group.measures.filter((m) => (m.derived ? anyAttach : found.includes(m.key)));
}

/** The overall peak / peak hour / average for one measure. */
export function overallOf(metrics, key) {
  if (!metrics) return { peak: null, peakAt: null, average: null };
  if (key === 'total') {
    return {
      peak: metrics.peakTotalUsers,
      peakAt: metrics.peakPeriod,
      average: metrics.averageTotalUsers,
    };
  }
  const stat = metrics[key];
  return { peak: stat?.peak ?? null, peakAt: stat?.peakAt ?? null, average: stat?.average ?? null };
}

/**
 * Every row of the download, grouped packet-first then voice, and within each
 * group: overall, day by day, then per node.
 *
 * @param {Object} calculated  a report's `calculated` block.
 * @returns {{groups: Array, rows: Array<Array>}}
 */
export function buildExportSections(calculated) {
  const metrics = calculated?.metrics;
  if (!metrics) return { groups: [], rows: [] };

  const daily = calculated.dailyStats || [];
  const matrix = calculated.nodeMatrix || {};
  const groups = [];
  const rows = [];

  for (const group of MEASURE_GROUPS) {
    const measures = presentMeasures(group, metrics);
    if (!measures.length) continue;

    const overall = measures.map((m) => ({ measure: m, ...overallOf(metrics, m.key) }));
    for (const entry of overall) {
      rows.push([
        group.label,
        'Overall',
        `All ${group.nodeLabel}s`,
        '',
        entry.measure.label,
        entry.measure.unit,
        num(entry.peak),
        entry.peakAt || '',
        num(entry.average),
        group.hasShare
          ? entry.measure.derived
            ? 100
            : num(metrics[entry.measure.shareField])
          : '',
      ]);
    }

    for (const day of daily) {
      for (const m of measures) {
        const f = DAILY_FIELDS[m.key];
        rows.push([
          group.label,
          'Day',
          day.day,
          '',
          m.label,
          m.unit,
          num(day[f.peak]),
          // Only the attach total records which hour of the day it peaked in.
          m.key === 'total' ? day.peakAt || '' : '',
          num(day[f.avg]),
          '',
        ]);
      }
    }

    const nodeRows = group.id === 'packet' ? matrix.cmm || [] : matrix.msc || [];
    for (const node of nodeRows) {
      for (const m of measures) {
        const stat = node[m.key];
        if (!stat) continue;
        rows.push([
          group.label,
          'Node',
          node.node,
          node.site || '',
          m.label,
          m.unit,
          num(stat.peak),
          '',
          num(stat.avg),
          group.hasShare && m.derived ? num(node.sharePct) : '',
        ]);
      }
    }

    groups.push({
      ...group,
      measures,
      overall,
      dayCount: daily.length,
      nodeCount: nodeRows.length,
    });
  }

  return { groups, rows };
}
