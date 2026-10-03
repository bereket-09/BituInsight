const { SERIES_COLORS } = require('./timeSeries');

const definitions = [
  { id: 'attach-by-technology', type: 'area', title: 'Attached users by technology (2G / 3G / 4G)' },
  { id: 'attach-daily-avg-peak', type: 'bar', title: 'Daily average vs daily peak attached users' },
  { id: 'attach-site-split', type: 'line', title: 'Attached users by site (MDC1 / MDC2)' },
  { id: 'voice-vlr-bhca', type: 'line', title: 'VLR subscribers and BHCA' },
  { id: 'attach-tech-share', type: 'doughnut', title: 'Share of attached users by technology' },
  { id: 'attach-hour-profile', type: 'bar', title: 'A typical day: average attached users by hour' },
  { id: 'attach-daily-tech', type: 'bar', title: 'Daily average attached users by technology' },
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

  const { technologySplit = [], hourProfile = [] } = calculated;
  if (technologySplit.length) {
    configs.push({
      id: 'attach-tech-share',
      type: 'doughnut',
      title: 'Share of attached users by technology (average hour)',
      data: {
        labels: technologySplit.map((t) => `${t.label} — ${t.percentage}%`),
        datasets: [
          {
            data: technologySplit.map((t) => t.percentage),
            backgroundColor: [SERIES_COLORS.users2g.line, SERIES_COLORS.users3g.line, SERIES_COLORS.users4g.line],
            borderColor: '#1a1d23',
            borderWidth: 3,
          },
        ],
      },
    });
  }

  if (hourProfile.length > 1) {
    const busiest = hourProfile.reduce((b, h) => (h.avgTotal > b.avgTotal ? h : b), hourProfile[0]);
    configs.push({
      id: 'attach-hour-profile',
      type: 'bar',
      title: `A typical day — average attached users by hour (busiest ${busiest.label})`,
      data: {
        labels: hourProfile.map((h) => h.label),
        datasets: [
          {
            label: 'Average attached users',
            data: hourProfile.map((h) => h.avgTotal),
            backgroundColor: hourProfile.map((h) =>
              h.hour === busiest.hour ? SERIES_COLORS.users4g.line : 'rgba(59, 158, 255, 0.7)'
            ),
          },
        ],
      },
    });
  }

  if (dailyStats.length > 1) {
    configs.push({
      id: 'attach-daily-tech',
      type: 'bar',
      stacked: true,
      title: 'Daily average attached users by technology',
      data: {
        labels: dailyStats.map((d) => d.day),
        datasets: [
          { label: '4G', data: dailyStats.map((d) => d.avg4g), backgroundColor: SERIES_COLORS.users4g.line },
          { label: '3G', data: dailyStats.map((d) => d.avg3g), backgroundColor: SERIES_COLORS.users3g.line },
          { label: '2G', data: dailyStats.map((d) => d.avg2g), backgroundColor: SERIES_COLORS.users2g.line },
        ],
      },
    });
  }

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
