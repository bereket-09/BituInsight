function formatTeamsMessage(summary, calculated, reportId) {
  const { metrics } = calculated;
  const fmt = (v) => (metrics.valueType === 'percent' ? `${v}%` : v);

  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: '00B140',
    summary: summary.title,
    sections: [
      {
        activityTitle: `📊 ${summary.kpiName}`,
        activitySubtitle: `Report ${reportId}`,
        facts: [
          { name: 'Sheet', value: summary.sheetName || '—' },
          { name: 'Span', value: summary.timeContext?.span || '—' },
          { name: 'Average', value: String(fmt(metrics.average)) },
          { name: 'Peak', value: `${metrics.peakPeriod} (${fmt(metrics.peakValue)})` },
          { name: 'Minimum', value: `${metrics.minPeriod} (${fmt(metrics.minValue)})` },
          { name: 'Points', value: String(metrics.recordCount) },
        ],
      },
      { title: 'Summary', text: summary.narrative },
    ],
  };
}

module.exports = { formatTeamsMessage };
