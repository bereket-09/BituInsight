const { SERIES_COLORS } = require('./timeSeries');

const definitions = [
  { id: 'volume-site-hourly', type: 'line', title: 'Data volume by data centre (MDC1 / MDC2) — hourly' },
  { id: 'volume-daily-avg-peak', type: 'bar', title: 'Daily average hour vs daily peak hour' },
  { id: 'volume-daily-total', type: 'bar', title: 'Daily total data volume by data centre' },
  { id: 'volume-technology', type: 'area', title: 'Data volume by technology (2G+3G / 4G)' },
  { id: 'volume-site-share', type: 'doughnut', title: 'Share of data volume by data centre' },
  { id: 'volume-hour-profile', type: 'bar', title: 'A typical day: average data volume by hour' },
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
    stack: 'volume',
  };
}

function getChartConfigs(calculated) {
  const { timeSeries, dailyStats = [], hourProfile = [], nodeSplit = [] } = calculated;
  const hourly = timeSeries?.series?.native || [];
  const labels = hourly.map((p) => p.label);
  const span = timeSeries?.detected?.spanLabel;

  const configs = [
    {
      id: 'volume-site-hourly',
      type: 'line',
      title: `Data volume by data centre — hourly, TB${span ? ` (${span})` : ''}`,
      data: { labels, datasets: [line('mdc1', hourly), line('mdc2', hourly), line('total', hourly, { borderWidth: 2.5 })] },
    },
    {
      id: 'volume-technology',
      type: 'area',
      stacked: true,
      title: 'Data volume by technology — hourly, TB',
      data: { labels, datasets: [stackedArea('volume4g', hourly), stackedArea('volume2g3g', hourly)] },
    },
  ];

  if (dailyStats.length) {
    configs.push({
      id: 'volume-daily-avg-peak',
      type: 'bar',
      title: 'Daily average hour vs daily peak hour — combined, TB',
      data: {
        labels: dailyStats.map((d) => d.day),
        datasets: [
          { label: 'Average hour', data: dailyStats.map((d) => d.avgTotal), backgroundColor: 'rgba(59, 158, 255, 0.7)' },
          { label: 'Peak hour', data: dailyStats.map((d) => d.peakTotal), backgroundColor: 'rgba(74, 222, 128, 0.8)' },
        ],
      },
    });
    configs.push({
      id: 'volume-daily-total',
      type: 'bar',
      stacked: true,
      title: 'Daily total data volume by data centre — TB',
      data: {
        labels: dailyStats.map((d) => d.day),
        datasets: [
          { label: 'MDC1', data: dailyStats.map((d) => d.dayTotalMdc1), backgroundColor: SERIES_COLORS.mdc1.line },
          { label: 'MDC2', data: dailyStats.map((d) => d.dayTotalMdc2), backgroundColor: SERIES_COLORS.mdc2.line },
        ],
      },
    });
  }

  if (nodeSplit.length) {
    configs.push({
      id: 'volume-site-share',
      type: 'doughnut',
      title: 'Share of data volume by data centre',
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
      id: 'volume-hour-profile',
      type: 'bar',
      title: `A typical day — average combined volume by hour, TB (busiest ${busiest.label})`,
      data: {
        labels: hourProfile.map((h) => h.label),
        datasets: [
          {
            label: 'Average combined volume',
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
