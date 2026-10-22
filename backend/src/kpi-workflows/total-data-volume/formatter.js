const { formatTb } = require('./timeSeries');

function formatTeamsMessage(summary, calculated, reportId) {
  const { metrics } = calculated;
  const facts = [
    { name: 'Generated', value: new Date(summary.generatedAt).toLocaleString() },
    { name: 'Time span', value: metrics.timeSpan || '—' },
    { name: 'Total data volume', value: formatTb(metrics.grandTotal) },
    { name: 'Peak hour', value: `${formatTb(metrics.peakTotal)} (${metrics.peakPeriod})` },
    { name: 'Average hour', value: formatTb(metrics.averageHourly) },
    { name: 'Average day', value: formatTb(metrics.averageDailyTotal) },
    { name: 'Average daily peak', value: formatTb(metrics.averageDailyPeak) },
    { name: 'MDC1 / MDC2 share', value: `${metrics.mdc1SharePct}% / ${metrics.mdc2SharePct}%` },
    { name: '4G / 2G+3G share', value: `${metrics.share4gPct}% / ${metrics.share2g3gPct}%` },
  ];

  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: '00B140',
    summary: summary.title,
    sections: [
      {
        activityTitle: 'Total Data Volume',
        activitySubtitle: `Report ID: ${reportId}`,
        facts,
        markdown: true,
      },
      { title: 'Summary', text: summary.narrative },
    ],
  };
}

module.exports = { formatTeamsMessage };
