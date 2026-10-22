const { SERIES_COLORS } = require('./timeSeries');

const definitions = [
  { id: 'saau-site-hourly', type: 'line', title: 'SAAU by data centre (MDC1 / MDC2) — hourly' },
  { id: 'saau-daily-avg-peak', type: 'bar', title: 'Daily average vs daily peak SAAU' },
  { id: 'saau-daily-site', type: 'bar', title: 'Daily average SAAU by data centre' },
  { id: 'saau-bearers', type: 'area', title: 'SAAU by bearer type (2G / 3G / 4G)' },
  { id: 'saau-site-share', type: 'doughnut', title: 'Share of SAAU by data centre' },
  { id: 'saau-hour-profile', type: 'bar', title: 'A typical day: average SAAU by hour' },
];

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
    stack: 'saau',
  };
}

function getChartConfigs(calculated) {
  const { timeSeries, dailyStats = [], hourProfile = [], nodeSplit = [] } = calculated;
  const hourly = timeSeries?.series?.native || [];
  const labels = hourly.map((p) => p.label);
  const span = timeSeries?.detected?.spanLabel;

  const configs = [
    {
      id: 'saau-site-hourly',
      type: 'line',
      title: `SAAU by data centre — hourly${span ? ` (${span})` : ''}`,
      data: {
        labels,
        datasets: [line('mdc1', hourly), line('mdc2', hourly), line('total', hourly, { borderWidth: 2.5 })],
      },
    },
    {
      id: 'saau-bearers',
      type: 'area',
      stacked: true,
      title: 'SAAU by bearer type — hourly',
      data: {
        labels,
        datasets: [stackedArea('eutran', hourly), stackedArea('utran', hourly), stackedArea('geran', hourly)],
      },
    },
  ];

  if (dailyStats.length) {
    configs.push({
      id: 'saau-daily-avg-peak',
      type: 'bar',
      title: 'Daily average vs daily peak SAAU — combined',
      data: {
        labels: dailyStats.map((d) => d.day),
        datasets: [
          { label: 'Average hour', data: dailyStats.map((d) => d.avgTotal), backgroundColor: 'rgba(59, 158, 255, 0.7)' },
          { label: 'Peak hour', data: dailyStats.map((d) => d.peakTotal), backgroundColor: 'rgba(74, 222, 128, 0.8)' },
        ],
      },
    });
    configs.push({
      id: 'saau-daily-site',
      type: 'bar',
      stacked: true,
      title: 'Daily average SAAU by data centre',
      data: {
        labels: dailyStats.map((d) => d.day),
        datasets: [
          { label: 'MDC1', data: dailyStats.map((d) => d.avgMdc1), backgroundColor: SERIES_COLORS.mdc1.line },
          { label: 'MDC2', data: dailyStats.map((d) => d.avgMdc2), backgroundColor: SERIES_COLORS.mdc2.line },
        ],
      },
    });
  }

  if (nodeSplit.length) {
    configs.push({
      id: 'saau-site-share',
      type: 'doughnut',
      title: 'Share of SAAU by data centre (average hour)',
      data: {
        labels: nodeSplit.map((n) => `${n.label} — ${n.percentage}%`),
        datasets: [
          {
            data: nodeSplit.map((n) => n.percentage),
            backgroundColor: [SERIES_COLORS.mdc1.line, SERIES_COLORS.mdc2.line],
            borderColor: '#1a1d23',
            borderWidth: 3,
          },
        ],
      },
    });
  }

  if (hourProfile.length > 1) {
    const busiest = hourProfile.reduce((b, h) => (h.total > b.total ? h : b), hourProfile[0]);
    configs.push({
      id: 'saau-hour-profile',
      type: 'bar',
      title: `A typical day — average combined SAAU by hour (busiest ${busiest.label})`,
      data: {
        labels: hourProfile.map((h) => h.label),
        datasets: [
          {
            label: 'Average combined SAAU',
            data: hourProfile.map((h) => h.total),
            backgroundColor: hourProfile.map((h) =>
              h.hour === busiest.hour ? SERIES_COLORS.total.line : 'rgba(59, 158, 255, 0.7)'
            ),
          },
        ],
      },
    });
  }

  return configs;
}

module.exports = { definitions, getChartConfigs, SERIES_COLORS };
