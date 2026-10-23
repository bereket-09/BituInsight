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

  /**
   * A per-KPI report has no other KPI to compare against, so the card carries
   * that KPI's own figures rather than a ranking of one.
   */
  function singleKpiFacts(summary, kpi) {
    const m = kpi.metrics;
    const facts = [
      { name: 'Generated', value: new Date(summary.generatedAt).toLocaleString() },
      { name: 'KPI', value: `${kpi.name} · ${kpi.cadenceLabel} readings` },
      { name: 'Time span', value: m.spanLabel || '—' },
      { name: 'Average', value: `${formatPercent(m.average)} · mean of ${m.nodeCount} nodes` },
      {
        name: 'Nodes',
        value: `${m.nodeCount}${kpi.sites?.length ? ` (${kpi.sites.join(' / ')})` : ''}`,
      },
      { name: 'Data coverage', value: formatPercent(m.coveragePct) },
    ];
    if (m.worstHour != null) {
      facts.push({
        name: 'Worst hour',
        value: `${formatPercent(m.worstHour)} (${m.worstHourAt})`,
      });
    }
    if (m.weakestNode) {
      facts.push({
        name: 'Weakest node',
        value: `${m.weakestNode} at ${formatPercent(m.weakestNodeAverage)}`,
      });
    }
    if (m.siteGapPct != null) {
      facts.push({ name: 'MDC1 to MDC2 gap', value: `${m.siteGapPct.toFixed(2)} points` });
    }
    return facts;
  }

  function allKpiFacts(summary, calculated) {
    const { metrics, ranking = [] } = calculated;
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

    for (const kpi of ranking.slice(0, 5)) {
      facts.push({
        name: kpi.name,
        value: `${formatPercent(kpi.average)} average · worst hour ${formatPercent(kpi.worstHour)}`,
      });
    }

    return facts;
  }

  function formatTeamsMessage(summary, calculated, reportId) {
    const { metrics, kpis = [] } = calculated;
    const facts =
      metrics.singleKpi && kpis[0]
        ? singleKpiFacts(summary, kpis[0])
        : allKpiFacts(summary, calculated);

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
