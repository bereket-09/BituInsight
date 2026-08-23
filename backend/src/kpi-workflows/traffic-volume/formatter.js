const { formatBytes } = require('./calculator');

function formatTeamsMessage(summary, calculated, reportId) {
  const { metrics, anomalies } = calculated;
  const anomalyText =
    anomalies.length > 0
      ? anomalies.map((a) => `- ${a.message}`).join('\n')
      : 'No anomalies detected';

  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: '00B140',
    summary: summary.title,
    sections: [
      {
        activityTitle: '📊 Traffic Volume KPI Report',
        activitySubtitle: `Report ID: ${reportId}`,
        facts: [
          { name: 'Generated', value: new Date(summary.generatedAt).toLocaleString() },
          { name: 'PLMN', value: summary.plmnNames.join(', ') },
          { name: 'Total Volume', value: formatBytes(metrics.totalDailyVolume) },
          { name: '4G Contribution', value: `${metrics.contribution4gPct}%` },
          { name: '2G/3G Contribution', value: `${metrics.contribution2g3gPct}%` },
          { name: 'Time span', value: calculated.timeSeries?.detected?.spanLabel || '—' },
          { name: 'Granularity', value: calculated.timeSeries?.detected?.label || '—' },
          { name: 'Peak period', value: `${metrics.peakPeriod} (${formatBytes(metrics.peakPeriodVolume)})` },
          { name: 'Min traffic', value: `${metrics.minTrafficPeriod} (${formatBytes(metrics.minTrafficHourVolume)})` },
          { name: 'Records', value: String(metrics.recordCount) },
        ],
        markdown: true,
      },
      {
        title: 'Summary',
        text: summary.narrative,
      },
      {
        title: 'Anomalies',
        text: anomalyText,
      },
    ],
  };
}

module.exports = { formatTeamsMessage };
