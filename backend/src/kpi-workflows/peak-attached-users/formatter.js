const { formatCount } = require('./timeSeries');

function formatTeamsMessage(summary, calculated, reportId) {
  const { metrics } = calculated;
  const facts = [
    { name: 'Generated', value: new Date(summary.generatedAt).toLocaleString() },
    { name: 'Time span', value: metrics.timeSpan || '—' },
    { name: 'Peak attached users', value: `${formatCount(metrics.peakTotalUsers)} (${metrics.peakPeriod})` },
    { name: 'Average attached users', value: formatCount(metrics.averageTotalUsers) },
    { name: 'Average daily peak', value: formatCount(metrics.averageDailyPeak) },
    { name: '2G / 3G / 4G share', value: `${metrics.share2gPct}% / ${metrics.share3gPct}% / ${metrics.share4gPct}%` },
    { name: 'MDC1 / MDC2 share', value: `${metrics.mdc1SharePct}% / ${metrics.mdc2SharePct}%` },
  ];
  if (metrics.measuresFound.includes('vlr')) {
    facts.push({ name: 'Peak VLR subscribers', value: `${formatCount(metrics.vlr.peak)} (${metrics.vlr.peakAt})` });
  }
  if (metrics.measuresFound.includes('bhca')) {
    facts.push({ name: 'Peak BHCA', value: `${formatCount(metrics.bhca.peak)} Erl (${metrics.bhca.peakAt})` });
  }

  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: '00B140',
    summary: summary.title,
    sections: [
      { activityTitle: '📶 Peak Attached Users', activitySubtitle: `Report ID: ${reportId}`, facts, markdown: true },
      { title: 'Summary', text: summary.narrative },
    ],
  };
}

module.exports = { formatTeamsMessage };
