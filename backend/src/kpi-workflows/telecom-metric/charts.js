const SERIES_COLOR = '#3B9EFF';
const THRESHOLD_COLOR = '#FF6B35';
const { resolveThreshold } = require('./constants');

const definitions = [
  { id: 'metric-trend', type: 'line', title: 'KPI trend over time' },
  { id: 'metric-distribution', type: 'line', title: 'KPI with average' },
];

function getChartConfigs(calculated, context = {}) {
  const { timeSeries, metrics, valueType } = calculated;
  const threshold = resolveThreshold({
    threshold: calculated.threshold ?? metrics.threshold ?? context.threshold,
  });
  const series = timeSeries?.series?.primary || [];
  const kpiName = context.kpiName || metrics.kpiName || 'KPI';
  const det = timeSeries?.detected || {};
  const titleSuffix = det.spanLabel ? ` (${det.label})` : '';
  const labels = series.map((p) => p.label);
  const values = series.map((p) => p.value);

  const datasets = [
    {
      label: kpiName,
      data: values,
      borderColor: SERIES_COLOR,
      backgroundColor: 'rgba(59, 158, 255, 0.12)',
      fill: true,
      tension: 0.35,
      borderWidth: 2.5,
    },
  ];

  if (valueType === 'percent') {
    datasets.push({
      label: `${threshold}% target`,
      data: labels.map(() => threshold),
      borderColor: THRESHOLD_COLOR,
      borderDash: [6, 4],
      fill: false,
      pointRadius: 0,
      borderWidth: 1.5,
    });
  }

  return [
    {
      id: 'metric-trend',
      type: 'line',
      title: `${kpiName}${titleSuffix}`,
      data: { labels, datasets: [datasets[0]] },
    },
    {
      id: 'metric-trend-threshold',
      type: 'line',
      title: `${kpiName} vs target${titleSuffix}`,
      data: { labels, datasets },
    },
  ];
}

module.exports = { definitions, getChartConfigs };
