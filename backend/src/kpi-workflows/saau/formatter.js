const { formatCount } = require('./timeSeries');

function formatTeamsMessage(summary, calculated, reportId) {
  const { metrics } = calculated;
  const facts = [
    { name: 'Generated', value: new Date(summary.generatedAt).toLocaleString() },
    { name: 'Time span', value: metrics.timeSpan || '—' },
    { name: 'Peak SAAU', value: `${formatCount(metrics.peakTotal)} (${metrics.peakPeriod})` },
    { name: 'Average SAAU', value: formatCount(metrics.averageHourly) },
    { name: 'Average daily peak', value: formatCount(metrics.averageDailyPeak) },
    { name: 'MDC1 average / peak', value: `${formatCount(metrics.mdc1.average)} / ${formatCount(metrics.mdc1.peak)}` },
    { name: 'MDC2 average / peak', value: `${formatCount(metrics.mdc2.average)} / ${formatCount(metrics.mdc2.peak)}` },
    {
      name: '2G / 3G / 4G bearer share',
      value: `${metrics.shareGeranPct}% / ${metrics.shareUtranPct}% / ${metrics.shareEutranPct}%`,
    },
  ];

  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: '00B140',
    summary: summary.title,
    sections: [
      {
        activityTitle: 'SAAU — simultaneously attached active users',
        activitySubtitle: `Report ID: ${reportId}`,
        facts,
        markdown: true,
      },
      { title: 'Summary', text: summary.narrative },
    ],
  };
}

module.exports = { formatTeamsMessage };
