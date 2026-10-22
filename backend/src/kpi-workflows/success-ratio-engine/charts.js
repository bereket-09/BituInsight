const { SERIES_COLORS, NODE_COLORS } = require('./timeSeries');

/**
 * Server-rendered charts for a success-ratio report.
 *
 * These are the images that go into the PowerPoint deck and the Teams card, so
 * the set has to stay bounded: the PS workbook holds 22 KPIs, and rendering
 * three PNGs each would mean 66 images rasterised inside one request and stored
 * against one report. The browser explorer draws node / data-centre / combined
 * charts for **every** KPI on demand; the deck gets a comparison of all of them
 * plus the detail of the few that need looking at.
 */

const DETAIL_KPI_LIMIT = 6;

const definitions = [
  { id: 'sr-kpi-average', type: 'bar', title: 'Average success ratio per KPI' },
  { id: 'sr-kpi-worst-hour', type: 'bar', title: 'Worst single hour per KPI' },
  { id: 'sr-kpi-nodes', type: 'line', title: 'Success ratio per node — hourly' },
  { id: 'sr-kpi-sites', type: 'line', title: 'Success ratio per data centre — daily' },
];

/**
 * The per-KPI detail charts are lines rather than bars on purpose. The shared
 * renderer forces `beginAtZero` on a bar chart and builds its own `scales`, so
 * a bar chart of a 98–100% KPI would be seven identical-looking columns with no
 * way to crop the axis; a line chart there is auto-scaled and shows the shape.
 * The two comparison charts stay bars, where a zero baseline is the honest one.
 */
function nodeColor(index) {
  return NODE_COLORS[index % NODE_COLORS.length];
}

/** One KPI, every node plus the combined line, over hours. */
function nodeChart(kpi) {
  const points = kpi.timeSeries.series.hourly;
  const labels = points.map((p) => p.label);
  const datasets = kpi.nodes.map((node, index) => ({
    label: node,
    data: points.map((p) => p.nodeValues?.[node] ?? null),
    borderColor: nodeColor(index),
    backgroundColor: nodeColor(index),
    fill: false,
    tension: 0.3,
    borderWidth: 1.5,
    pointRadius: 0,
    spanGaps: false,
  }));
  datasets.push({
    label: 'Combined',
    data: points.map((p) => p.total),
    borderColor: SERIES_COLORS.combined.line,
    backgroundColor: SERIES_COLORS.combined.fill,
    fill: false,
    tension: 0.3,
    borderWidth: 2.5,
    pointRadius: 0,
  });

  return {
    id: `sr-${kpi.id}-nodes`,
    type: 'line',
    title: `${kpi.name} — per node and combined, hourly (%)`,
    data: { labels, datasets },
  };
}

/** One KPI, each data centre plus combined, over days. */
function siteChart(kpi) {
  const points = kpi.timeSeries.series.daily;
  const labels = points.map((p) => p.label);
  const line = (key, color) => ({
    label: SERIES_COLORS[key].label,
    data: points.map((p) => p[key]),
    borderColor: color,
    backgroundColor: color,
    fill: false,
    tension: 0.3,
    borderWidth: key === 'total' ? 2.5 : 2,
  });

  const datasets = [];
  if (kpi.sites.includes('MDC1')) datasets.push(line('mdc1', SERIES_COLORS.mdc1.line));
  if (kpi.sites.includes('MDC2')) datasets.push(line('mdc2', SERIES_COLORS.mdc2.line));
  datasets.push(line('total', SERIES_COLORS.combined.line));

  return {
    id: `sr-${kpi.id}-sites`,
    type: 'line',
    title: `${kpi.name} — daily average per data centre (%)`,
    data: { labels, datasets },
  };
}

function getChartConfigs(calculated) {
  const { kpis = [], ranking = [], metrics = {} } = calculated;
  if (!kpis.length) return [];

  const byAverage = [...ranking];
  const configs = [];

  if (byAverage.length > 1) {
    configs.push({
      id: 'sr-kpi-average',
      type: 'bar',
      title: `Average success ratio per KPI — ${metrics.timeSpan || 'the period'} (%)`,
      data: {
        labels: byAverage.map((k) => k.name),
        datasets: [
          {
            label: 'Average',
            data: byAverage.map((k) => k.average),
            backgroundColor: byAverage.map((k) =>
              k.belowAttention ? SERIES_COLORS.mdc2.line : SERIES_COLORS.combined.line
            ),
          },
        ],
      },
    });

    configs.push({
      id: 'sr-kpi-worst-hour',
      type: 'bar',
      title: 'Worst single hour per KPI (%)',
      data: {
        labels: byAverage.map((k) => k.name),
        datasets: [
          {
            label: 'Worst hour',
            data: byAverage.map((k) => k.worstHour),
            backgroundColor: SERIES_COLORS.mdc1.line,
          },
        ],
      },
    });
  }

  // Detail for the KPIs that most need it: the weakest on average, with the
  // report's primary KPI always included so the headline series has its charts.
  const detailIds = new Set(byAverage.slice(0, DETAIL_KPI_LIMIT).map((k) => k.id));
  if (metrics.primaryKpiId) detailIds.add(metrics.primaryKpiId);

  for (const kpi of kpis) {
    if (!detailIds.has(kpi.id)) continue;
    if (kpi.timeSeries.series.hourly.length) configs.push(nodeChart(kpi));
    if (kpi.timeSeries.series.daily.length) configs.push(siteChart(kpi));
  }

  return configs;
}

module.exports = { definitions, getChartConfigs, DETAIL_KPI_LIMIT, SERIES_COLORS };
