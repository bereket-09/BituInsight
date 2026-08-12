const { formatThroughputGbps } = require('./calculator');

function formatTeamsMessage(summary, calculated, reportId) {
  const { metrics, anomalies } = calculated;
  const anomalyText =
    anomalies.length > 0
      ? anomalies.map((a) => `- ${a.message}`).join('\n')
      : 'No anomalies detected';

  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: '632CA6',
    summary: summary.title,
    sections: [
      {
        activityTitle: '📊 CMG Data Throughput KPI',
        activitySubtitle: `Report ID: ${reportId}`,
        facts: [
          { name: 'Generated', value: new Date(summary.generatedAt).toLocaleString() },
          { name: 'SAM', value: (summary.samNames || []).join(', ') || '—' },
          { name: 'Total throughput', value: formatThroughputGbps(metrics.totalThroughputGbps) },
          { name: 'MDC1', value: formatThroughputGbps(metrics.totalMdc1Gbps) },
          { name: 'MDC2', value: formatThroughputGbps(metrics.totalMdc2Gbps) },
          { name: 'MDC1 share', value: `${metrics.mdc1SharePct}%` },
          { name: 'Time span', value: calculated.timeSeries?.detected?.spanLabel || '—' },
          { name: 'Periods', value: String(metrics.periodCount) },
          { name: 'Peak period', value: `${metrics.peakPeriod} (${formatThroughputGbps(metrics.peakPeriodGbps)})` },
          { name: 'Raw CMG rows', value: String(metrics.rawRowCount) },
        ],
        markdown: true,
      },
      { title: 'Summary', text: summary.narrative },
      { title: 'Anomalies', text: anomalyText },
    ],
  };
}

module.exports = { formatTeamsMessage };
