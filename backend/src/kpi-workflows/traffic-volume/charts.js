const { SERIES_COLORS } = require('./timeSeries');

const definitions = [
  {
    id: 'traffic-volume-lines',
    type: 'line',
    title: 'Traffic Volume by Technology',
    description: '2G+3G, 4G, and Total — multi-series line chart',
  },
  {
    id: 'traffic-stacked-area',
    type: 'area',
    title: 'Stacked Volume by Technology',
    description: '2G+3G and 4G stacked over time',
  },
  {
    id: 'technology-pie',
    type: 'pie',
    title: 'Technology Contribution',
    description: 'Overall 2G/3G vs 4G split',
  },
  {
    id: 'contribution-trend',
    type: 'line',
    title: '4G Contribution % Over Time',
    description: '4G percentage trend across the report period',
  },
];

function volumeToDisplayLabel(value) {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(Math.round(value));
}

function buildMultiLineDataset(series, keys) {
  return keys.map((key) => ({
    label: SERIES_COLORS[key].label,
    data: series.map((p) => p[key]),
    borderColor: SERIES_COLORS[key].line,
    backgroundColor: SERIES_COLORS[key].fill,
    fill: false,
    tension: 0.35,
    borderWidth: 2.5,
    pointRadius: series.length <= 12 ? 4 : 2,
    pointHoverRadius: 6,
    pointBackgroundColor: SERIES_COLORS[key].line,
    pointBorderColor: '#1a1d23',
    pointBorderWidth: 1,
  }));
}

function getChartConfigs(calculated) {
  const { timeSeries, technologySplit = [] } = calculated;
  const series = timeSeries?.series?.primary || [];
  const det = timeSeries?.detected || {};
  const titleSuffix = det.spanLabel ? ` (${det.label})` : '';

  const labels = series.map((p) => p.label);

  return [
    {
      id: 'traffic-volume-lines',
      type: 'line',
      title: `Traffic Volume by Technology${titleSuffix}`,
      meta: { granularity: det.label, span: det.spanLabel },
      data: {
        labels,
        datasets: buildMultiLineDataset(series, ['volume2g3g', 'volume4g', 'total']),
      },
      options: {
        interaction: { mode: 'index', intersect: false },
      },
    },
    {
      id: 'traffic-stacked-area',
      type: 'area',
      title: `Stacked Volume${titleSuffix}`,
      data: {
        labels,
        datasets: [
          {
            label: SERIES_COLORS.volume2g3g.label,
            data: series.map((p) => p.volume2g3g),
            borderColor: SERIES_COLORS.volume2g3g.line,
            backgroundColor: 'rgba(255, 107, 53, 0.45)',
            fill: true,
            tension: 0.35,
            borderWidth: 0,
            stack: 'volume',
          },
          {
            label: SERIES_COLORS.volume4g.label,
            data: series.map((p) => p.volume4g),
            borderColor: SERIES_COLORS.volume4g.line,
            backgroundColor: 'rgba(59, 158, 255, 0.45)',
            fill: true,
            tension: 0.35,
            borderWidth: 0,
            stack: 'volume',
          },
        ],
      },
    },
    {
      id: 'technology-pie',
      type: 'doughnut',
      title: 'Technology Contribution (Total Period)',
      data: {
        labels: technologySplit.map((t) => t.label),
        datasets: [
          {
            data: technologySplit.map((t) => t.value),
            backgroundColor: [SERIES_COLORS.volume2g3g.line, SERIES_COLORS.volume4g.line],
            borderColor: '#1a1d23',
            borderWidth: 3,
            hoverOffset: 8,
          },
        ],
      },
    },
    {
      id: 'contribution-trend',
      type: 'line',
      title: `4G Share % Over Time${titleSuffix}`,
      data: {
        labels,
        datasets: [
          {
            label: '4G %',
            data: series.map((p) => p.contribution4gPct),
            borderColor: SERIES_COLORS.contribution4g.line,
            backgroundColor: SERIES_COLORS.contribution4g.fill,
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            yAxisID: 'y',
          },
        ],
      },
      options: {
        scales: {
          y: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
        },
      },
    },
  ];
}

module.exports = {
  definitions,
  getChartConfigs,
  SERIES_COLORS,
  volumeToDisplayLabel,
};
