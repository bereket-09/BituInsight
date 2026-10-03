const { SERIES_COLORS } = require('./timeSeries');

const definitions = [
  { id: 'attach-by-technology', type: 'area', title: 'Attached users by technology (2G / 3G / 4G)' },
  { id: 'attach-daily-avg-peak', type: 'bar', title: 'Daily average vs daily peak attached users' },
  { id: 'attach-site-split', type: 'line', title: 'Attached users by site (MDC1 / MDC2)' },
  { id: 'voice-vlr-bhca', type: 'line', title: 'VLR subscribers and BHCA' },
];

function stackedArea(key, series) {
  return {
    label: SERIES_COLORS[key].label,
    data: series.map((p) => p[key]),
    borderColor: SERIES_COLORS[key].line,
    backgroundColor: SERIES_COLORS[key].fill,
    fill: true,
    tension: 0.3,
    borderWidth: 1,
    pointRadius: 0,
    stack: 'attach',
  };
}

function line(key, series, extra = {}) {
  return {
    label: SERIES_COLORS[key].label,
    data: series.map((p) => p[key]),
    borderColor: SERIES_COLORS[key].line,
    backgroundColor: SERIES_COLORS[key].fill,
    fill: false,
    tension: 0.3,
    borderWidth: 2,
    pointRadius: 0,
    ...extra,
  };
}

function getChartConfigs(calculated) {
  const { timeSeries, dailyStats = [], metrics = {} } = calculated;
  const hourly = timeSeries?.series?.native || [];
  const labels = hourly.map((p) => p.label);
  const span = timeSeries?.detected?.spanLabel;

  const configs = [
    {
      id: 'attach-by-technology',
      type: 'area',
      stacked: true,
      title: `Attached users by technology — hourly${span ? ` (${span})` : ''}`,
      data: { labels, datasets: ['users4g', 'users3g', 'users2g'].map((k) => stackedArea(k, hourly)) },
    },
    {
      id: 'attach-daily-avg-peak',
      type: 'bar',
      title: 'Daily average vs daily peak attached users',
      data: {
        labels: dailyStats.map((d) => d.day),
        datasets: [
          { label: 'Daily average', data: dailyStats.map((d) => d.avgTotal), backgroundColor: 'rgba(59, 158, 255, 0.7)' },
          { label: 'Daily peak', data: dailyStats.map((d) => d.peakTotal), backgroundColor: 'rgba(74, 222, 128, 0.8)' },
        ],
      },
    },
    {
      id: 'attach-site-split',
      type: 'line',
      title: 'Attached users by site — hourly',
      data: { labels, datasets: [line('mdc1', hourly), line('mdc2', hourly)] },
    },
  ];

  if (metrics.hasVoice) {
    configs.push({
      id: 'voice-vlr-bhca',
      type: 'line',
      title: 'VLR subscribers (left) and BHCA in Erlang (right) — hourly',
      data: {
        labels,
        datasets: [line('vlr', hourly, { yAxisID: 'y' }), line('bhca', hourly, { yAxisID: 'y1' })],
      },
      options: {
        scales: {
          y: { position: 'left' },
          y1: { position: 'right', grid: { drawOnChartArea: false } },
        },
      },
    });
  }

  return configs;
}

module.exports = { definitions, getChartConfigs, SERIES_COLORS };
