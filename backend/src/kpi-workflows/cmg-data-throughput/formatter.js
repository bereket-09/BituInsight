const { formatThroughputGbps } = require('./calculator');

/**
 * The peak list, with whatever each peak coincides with. Reports processed
 * before peak annotation existed carry no `peaks`, so the section is omitted
 * rather than rendered empty.
 */
function peakSection(calculated) {
  const peaks = calculated.peaks;
  if (!peaks?.available || !peaks.points?.length) return null;

  const lines = peaks.points
    .slice(0, 8)
    .map((p) => `- **${p.label}** · ${formatThroughputGbps(p.value)} — ${p.note}`);
  if (peaks.points.length > 8) {
    lines.push(`- …and ${peaks.points.length - 8} more in the report.`);
  }

  return {
    title: `Throughput peaks (${peaks.matchedCount} coinciding with a known event, ${peaks.unmatchedCount} flagged for investigation)`,
    text: lines.join('\n\n'),
  };
}

function formatTeamsMessage(summary, calculated, reportId) {
  const { metrics, anomalies } = calculated;
  const anomalyText =
    anomalies.length > 0
      ? anomalies.map((a) => `- ${a.message}`).join('\n')
      : 'No anomalies detected';
  const peaks = peakSection(calculated);

  return {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: '00B140',
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
      ...(peaks ? [peaks] : []),
    ],
  };
}

module.exports = { formatTeamsMessage };
