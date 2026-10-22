const { formatPercent } = require('./timeSeries');

/**
 * Teams card for a success-ratio report.
 *
 * A card cannot carry 22 KPIs, so it carries the shape of the file and the
 * handful of KPIs someone would act on — never a blended figure across them.
 */
function createFormatter(config = {}) {
  const icon = config.teamsIcon || '📊';
  const themeColor = '00B140';

  function formatTeamsMessage(summary, calculated, reportId) {
    const { metrics, ranking = [] } = calculated;
    const weakest = ranking.slice(0, 5);

    const facts = [
      { name: 'Generated', value: new Date(summary.generatedAt).toLocaleString() },
      { name: 'Time span', value: metrics.timeSpan || '—' },
      {
        name: `${metrics.kpiGroupLabel} analysed`,
        value: `${metrics.kpiCount} · each calculated separately`,
      },
      {
        name: 'Nodes',
        value: `${metrics.nodeCount}${metrics.siteNames?.length ? ` (${metrics.siteNames.join(' / ')})` : ''}`,
      },
      {
        name: `Below ${metrics.attentionThreshold}%`,
        value: `${metrics.kpisBelowAttention} of ${metrics.kpiCount}`,
      },
      { name: 'Data coverage', value: formatPercent(metrics.coveragePct) },
    ];

    if (metrics.lowestHourKpi) {
      facts.push({
        name: 'Worst single hour',
        value: `${formatPercent(metrics.lowestHourValue)} — ${metrics.lowestHourKpi} (${metrics.lowestHourAt})`,
      });
    }

    for (const kpi of weakest) {
      facts.push({
        name: kpi.name,
        value: `${formatPercent(kpi.average)} average · worst hour ${formatPercent(kpi.worstHour)}`,
      });
    }

    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor,
      summary: summary.title,
      sections: [
        {
          activityTitle: `${icon} ${config.name || summary.title}`,
          activitySubtitle: `Report ID: ${reportId}`,
          facts,
          markdown: true,
        },
        { title: 'Summary', text: summary.narrative },
      ],
    };
  }

  return { formatTeamsMessage };
}

module.exports = { createFormatter };
