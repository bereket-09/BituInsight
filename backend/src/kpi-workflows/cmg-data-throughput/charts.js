const { SERIES_COLORS } = require('./timeSeries');

const definitions = [
  {
    id: 'cmg-throughput-lines',
    type: 'line',
    title: 'Data throughput by CMG node',
    description: 'MDC1 vs MDC2 aggregated Gbps per period',
  },
  {
    id: 'cmg-throughput-stacked',
    type: 'area',
    title: 'Stacked throughput (MDC1 + MDC2)',
  },
  {
    id: 'cmg-node-split',
    type: 'pie',
    title: 'MDC1 vs MDC2 share (total period)',
  },
  {
    id: 'cmg-total-trend',
    type: 'line',
    title: 'Combined throughput trend',
  },
];

function buildMultiLineDataset(series, keys) {
  return keys.map((key) => ({
    label: SERIES_COLORS[key].label,
    data: series.map((p) => p[key]),
    borderColor: SERIES_COLORS[key].line,
    backgroundColor: SERIES_COLORS[key].fill,
    fill: false,
    tension: 0.35,
    borderWidth: 2.5,
    pointRadius: series.length <= 24 ? 4 : 2,
    pointHoverRadius: 6,
    pointBackgroundColor: SERIES_COLORS[key].line,
    pointBorderColor: '#1a1d23',
    pointBorderWidth: 1,
  }));
}

function getChartConfigs(calculated) {
  const { timeSeries, nodeSplit = [] } = calculated;
  const series = timeSeries?.series?.primary || [];
  const det = timeSeries?.detected || {};
  const titleSuffix = det.spanLabel ? ` (${det.label})` : '';
  const labels = series.map((p) => p.label);

  return [
    {
      id: 'cmg-throughput-lines',
      type: 'line',
      title: `Data throughput — MDC1 & MDC2${titleSuffix}`,
      meta: { granularity: det.label, span: det.spanLabel },
      data: {
        labels,
        datasets: buildMultiLineDataset(series, ['mdc1', 'mdc2', 'total']),
      },
    },
    {
      id: 'cmg-throughput-stacked',
      type: 'area',
      title: `Stacked throughput${titleSuffix}`,
      data: {
        labels,
        datasets: [
          {
            label: SERIES_COLORS.mdc1.label,
            data: series.map((p) => p.mdc1),
            borderColor: SERIES_COLORS.mdc1.line,
            backgroundColor: 'rgba(59, 158, 255, 0.45)',
            fill: true,
            tension: 0.35,
            borderWidth: 0,
            stack: 'tp',
          },
          {
            label: SERIES_COLORS.mdc2.label,
            data: series.map((p) => p.mdc2),
            borderColor: SERIES_COLORS.mdc2.line,
            backgroundColor: 'rgba(255, 107, 53, 0.45)',
            fill: true,
            tension: 0.35,
            borderWidth: 0,
            stack: 'tp',
          },
        ],
      },
    },
    {
      id: 'cmg-node-split',
      type: 'doughnut',
      title: 'MDC1 vs MDC2 (aggregated)',
      data: {
        labels: nodeSplit.map((n) => n.label),
        datasets: [
          {
            data: nodeSplit.map((n) => n.value),
            backgroundColor: [SERIES_COLORS.mdc1.line, SERIES_COLORS.mdc2.line],
            borderColor: '#1a1d23',
            borderWidth: 3,
            hoverOffset: 8,
          },
        ],
      },
    },
    {
      id: 'cmg-total-trend',
      type: 'line',
      title: `Combined throughput${titleSuffix}`,
      data: {
        labels,
        datasets: [
          {
            label: 'Total Gbps',
            data: series.map((p) => p.total),
            borderColor: SERIES_COLORS.total.line,
            backgroundColor: SERIES_COLORS.total.fill,
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
          },
        ],
      },
    },
  ];
}

module.exports = {
  definitions,
  getChartConfigs,
  SERIES_COLORS,
};
