const { buildSuccessRatioSeries, formatPercent, round, mean } = require('./timeSeries');

/**
 * Per-KPI calculations for a success-ratio workbook.
 *
 * Every KPI is worked out on its own — its own nodes, its own data centres, its
 * own combined view, its own daily table. Nothing is averaged *across* KPIs:
 * a "network success ratio" blended from attach, paging and handover would be a
 * number with no owner and no meaning. The only cross-KPI figures the report
 * carries are comparisons (which KPI is weakest) and counts (how many sit below
 * a given level), both of which keep each KPI's identity.
 */

/** Below this, a success ratio is worth a NOC's attention. */
const ATTENTION_PERCENT = 95;

function meanOf(values) {
  const present = values.filter((v) => v != null && Number.isFinite(v));
  return present.length ? mean(present) : null;
}

function extreme(points, worst = true) {
  const present = (points || []).filter((p) => p.total != null);
  if (!present.length) return null;
  const pick = present.reduce(
    (best, p) => ((worst ? p.total < best.total : p.total > best.total) ? p : best),
    present[0]
  );
  return { value: pick.total, label: pick.label, timestamp: pick.timestamp };
}

/**
 * One node across the whole report: the mean of its own raw readings.
 *
 * The whole period is just the largest bucket, so it follows the same rule as
 * an hour or a day — a node is the mean of its readings, and nothing fills in
 * the readings it never sent.
 */
function buildNodeStats(samples, meta) {
  const byNode = new Map();
  for (const sample of samples) {
    let acc = byNode.get(sample.node);
    if (!acc) {
      acc = { node: sample.node, site: sample.site, sum: 0, count: 0, min: Infinity, max: -Infinity };
      byNode.set(sample.node, acc);
    }
    acc.sum += sample.value;
    acc.count += 1;
    if (sample.value < acc.min) acc.min = sample.value;
    if (sample.value > acc.max) acc.max = sample.value;
  }

  const expected = Math.max(...[...byNode.values()].map((a) => a.count), 0);
  return meta.nodes
    .map((n) => byNode.get(n.node))
    .filter(Boolean)
    .map((acc) => ({
      node: acc.node,
      site: acc.site,
      average: round(acc.sum / acc.count, 2),
      lowest: round(acc.min, 2),
      highest: round(acc.max, 2),
      readings: acc.count,
      // The yardstick is the best-covered node in the same KPI, so a sheet that
      // is short everywhere does not read as a gap.
      missingReadings: Math.max(0, expected - acc.count),
      coveragePct: expected ? round((acc.count / expected) * 100, 1) : 100,
    }));
}

/** A data centre is the mean of its own nodes — an average, never a sum. */
function buildSiteStats(nodeStats) {
  const sites = [...new Set(nodeStats.map((n) => n.site).filter(Boolean))].sort();
  return sites.map((site) => {
    const own = nodeStats.filter((n) => n.site === site);
    return {
      site,
      nodes: own.map((n) => n.node),
      nodeCount: own.length,
      average: round(meanOf(own.map((n) => n.average)), 2),
      lowest: round(Math.min(...own.map((n) => n.lowest)), 2),
      highest: round(Math.max(...own.map((n) => n.highest)), 2),
      readings: own.reduce((sum, n) => sum + n.readings, 0),
    };
  });
}

/**
 * Name each day's worst hour on the day's own point.
 *
 * A separate daily table would be a second copy of the daily series — on 22
 * KPIs that copy costs more than the two fields it adds, so the fields go onto
 * the points instead and the daily view gains a "worst hour" column for free.
 */
function annotateDailyWorstHour(timeSeries) {
  const hourly = timeSeries.series.hourly || [];
  for (const day of timeSeries.series.daily || []) {
    const hours = hourly.filter((h) => h.bucketKey.slice(0, 10) === day.bucketKey);
    const worst = extreme(hours, true);
    day.worstHour = worst?.value ?? null;
    day.worstHourAt = worst?.label ?? null;
  }
}

/** The shape of a typical day: each hour of day averaged across the report. */
function buildHourProfile(hourly) {
  const byHour = new Map();
  for (const point of hourly) {
    if (point.total == null) continue;
    const hour = new Date(point.timestamp).getHours();
    if (!byHour.has(hour)) byHour.set(hour, []);
    byHour.get(hour).push(point.total);
  }
  return [...byHour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, values]) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      average: round(meanOf(values), 2),
      lowest: round(Math.min(...values), 2),
    }));
}

/** Everything the report knows about one KPI. */
function buildKpi(meta, { includeRaw, includePrimary }) {
  const timeSeries = buildSuccessRatioSeries(meta.samples, {
    cadenceMs: meta.cadenceMs,
    nodes: meta.nodes,
    includeRaw,
    includePrimary,
  });
  annotateDailyWorstHour(timeSeries);

  const nodeStats = buildNodeStats(meta.samples, meta);
  const siteStats = buildSiteStats(nodeStats);
  const hourProfile = buildHourProfile(timeSeries.series.hourly);

  const average = round(meanOf(nodeStats.map((n) => n.average)), 2);
  const worstHour = extreme(timeSeries.series.hourly, true);
  const bestHour = extreme(timeSeries.series.hourly, false);
  const worstDay = extreme(timeSeries.series.daily, true);
  const weakestNode = nodeStats.length
    ? nodeStats.reduce((worst, n) => (n.average < worst.average ? n : worst), nodeStats[0])
    : null;
  const strongestNode = nodeStats.length
    ? nodeStats.reduce((best, n) => (n.average > best.average ? n : best), nodeStats[0])
    : null;

  const expectedReadings = nodeStats.length
    ? Math.max(...nodeStats.map((n) => n.readings)) * nodeStats.length
    : 0;
  const readings = nodeStats.reduce((sum, n) => sum + n.readings, 0);
  const siteGapPct =
    siteStats.length === 2 ? round(Math.abs(siteStats[0].average - siteStats[1].average), 2) : null;

  return {
    id: meta.id,
    order: meta.order,
    name: meta.kpiName,
    sheetName: meta.sheetName,
    entityHeader: meta.entityHeader,
    fieldCode: meta.fieldCode,
    unit: '%',
    cadenceLabel: meta.cadenceLabel,
    nodes: meta.nodes.map((n) => n.node),
    sites: meta.sites,
    metrics: {
      average,
      worstHour: worstHour?.value ?? null,
      worstHourAt: worstHour?.label ?? null,
      bestHour: bestHour?.value ?? null,
      bestHourAt: bestHour?.label ?? null,
      worstDay: worstDay?.value ?? null,
      worstDayAt: worstDay?.label ?? null,
      spread: round((bestHour?.value ?? 0) - (worstHour?.value ?? 0), 2),
      weakestNode: weakestNode?.node ?? null,
      weakestNodeAverage: weakestNode?.average ?? null,
      strongestNode: strongestNode?.node ?? null,
      strongestNodeAverage: strongestNode?.average ?? null,
      siteGapPct,
      nodeCount: nodeStats.length,
      siteCount: siteStats.length,
      hourCount: timeSeries.series.hourly.length,
      dayCount: timeSeries.series.daily.length,
      readings,
      expectedReadings,
      missingReadings: Math.max(0, expectedReadings - readings),
      coveragePct: expectedReadings ? round((readings / expectedReadings) * 100, 2) : 100,
      belowAttention: average != null && average < ATTENTION_PERCENT,
      hoursBelowAttention: timeSeries.series.hourly.filter(
        (h) => h.total != null && h.total < ATTENTION_PERCENT
      ).length,
      spanLabel: timeSeries.detected.spanLabel,
    },
    timeSeries,
    nodeStats,
    siteStats,
    hourProfile,
  };
}

/** The one-line view of each KPI that the selector and the ranking tables use. */
function toIndexRow(kpi) {
  return {
    id: kpi.id,
    name: kpi.name,
    order: kpi.order,
    entityHeader: kpi.entityHeader,
    average: kpi.metrics.average,
    worstHour: kpi.metrics.worstHour,
    worstHourAt: kpi.metrics.worstHourAt,
    weakestNode: kpi.metrics.weakestNode,
    nodeCount: kpi.metrics.nodeCount,
    cadenceLabel: kpi.cadenceLabel,
    coveragePct: kpi.metrics.coveragePct,
    belowAttention: kpi.metrics.belowAttention,
  };
}

function createCalculator(config = {}) {
  const domainLabel = config.domainLabel || 'Success ratio';
  const kpiGroupLabel = config.kpiGroupLabel || 'KPIs';

  function calculate(transformed) {
    const metaList = transformed.kpis || [];
    // Only the primary KPI keeps its raw-cadence series: 22 KPIs at 672 raw
    // points each is a report payload nobody can load, and the customer asked
    // for hourly and daily figures. A single-KPI report has one KPI and it is
    // the primary, so it keeps everything.
    const kpis = metaList.map((meta, index) =>
      buildKpi(meta, { includeRaw: index === 0, includePrimary: index === 0 })
    );
    const primary = kpis[0] || null;
    // One report per KPI is how the workbook path uploads these files; the
    // whole-workbook report is still produced for a single-report upload.
    const singleKpi = kpis.length === 1;

    const ranked = [...kpis]
      .filter((k) => k.metrics.average != null)
      .sort((a, b) => a.metrics.average - b.metrics.average);
    const weakest = ranked[0] || null;
    const strongest = ranked[ranked.length - 1] || null;
    const lowestHourKpi = kpis.reduce((worst, k) => {
      if (k.metrics.worstHour == null) return worst;
      if (!worst || k.metrics.worstHour < worst.metrics.worstHour) return k;
      return worst;
    }, null);

    const allNodes = [...new Set(kpis.flatMap((k) => k.nodes))].sort();
    const allSites = [...new Set(kpis.flatMap((k) => k.sites))].sort();
    const totalReadings = kpis.reduce((sum, k) => sum + k.metrics.readings, 0);
    const totalExpected = kpis.reduce((sum, k) => sum + k.metrics.expectedReadings, 0);

    return {
      valueType: 'percentage',
      metrics: {
        // The report's headline KPI. Each KPI keeps its own figures below; this
        // is what the shared data table and the analytics layer read.
        kpiName: primary?.name || domainLabel,
        primaryKpiId: primary?.id || null,
        valueType: 'percentage',
        unit: '%',
        domainLabel,
        kpiGroupLabel,
        singleKpi,
        kpiCount: kpis.length,
        kpiNames: kpis.map((k) => k.name),
        nodeCount: allNodes.length,
        nodeNames: allNodes,
        siteCount: allSites.length,
        siteNames: allSites,
        entityHeaders: transformed.entityHeaders || [],
        primaryAverage: primary?.metrics.average ?? null,
        weakestKpi: weakest?.name || null,
        weakestKpiAverage: weakest?.metrics.average ?? null,
        strongestKpi: strongest?.name || null,
        strongestKpiAverage: strongest?.metrics.average ?? null,
        lowestHourKpi: lowestHourKpi?.name || null,
        lowestHourValue: lowestHourKpi?.metrics.worstHour ?? null,
        lowestHourAt: lowestHourKpi?.metrics.worstHourAt ?? null,
        kpisBelowAttention: kpis.filter((k) => k.metrics.belowAttention).length,
        attentionThreshold: ATTENTION_PERCENT,
        hourCount: primary?.metrics.hourCount ?? 0,
        dayCount: primary?.metrics.dayCount ?? 0,
        rawRowCount: transformed.records.length,
        readings: totalReadings,
        expectedReadings: totalExpected,
        coveragePct: totalExpected ? round((totalReadings / totalExpected) * 100, 2) : 100,
        timeGranularity: 'Hourly',
        timeSpan: primary?.timeSeries.detected.spanLabel || '—',
      },
      // The report-level series is the primary KPI's, so the shared explorer,
      // data table and intelligence layer all read one coherent KPI rather than
      // a blend of 22.
      timeSeries: primary?.timeSeries || null,
      kpis,
      kpiIndex: kpis.map(toIndexRow),
      ranking: ranked.map(toIndexRow),
      anomalies: [],
      rawRecordCount: transformed.records.length,
    };
  }

  function buildInsight(calculated) {
    const { metrics, kpis } = calculated;
    const span = metrics.timeSpan;
    const subtitle = metrics.singleKpi
      ? `${metrics.kpiName} across ${metrics.nodeCount} ${metrics.nodeCount === 1 ? 'node' : 'nodes'} and ` +
        `${metrics.siteCount} data centre${metrics.siteCount === 1 ? '' : 's'}`
      : `${metrics.kpiCount} ${metrics.kpiGroupLabel}, each calculated on its own across ` +
        `${metrics.nodeCount} nodes and ${metrics.siteCount} data centres`;
    return {
      subtitle,
      formula: {
        title: 'Per hour and per day',
        expression: 'mean(readings of a node) → mean(nodes of a data centre) → mean(all nodes)',
        result: '%',
        note:
          'Success ratios are averaged into a bucket, never added. A node missing a ' +
          'reading is left out of the mean rather than counted as zero.',
      },
      pipeline: [
        {
          step: 1,
          title: metrics.singleKpi ? 'Read this KPI’s sheet' : 'Read every KPI sheet',
          detail: metrics.singleKpi
            ? `${metrics.kpiName} · ${metrics.rawRowCount.toLocaleString()} readings`
            : `${metrics.kpiCount} ${metrics.kpiGroupLabel} · ${metrics.rawRowCount.toLocaleString()} readings`,
          icon: 'database',
        },
        {
          step: 2,
          title: 'Average per node, then per data centre',
          detail: `${metrics.nodeCount} nodes → ${metrics.siteNames.join(' / ') || 'one site'} → combined`,
          icon: 'calculator',
        },
        {
          step: 3,
          title: 'Bucket into hours and days',
          detail: `${metrics.hourCount} hours · ${metrics.dayCount} days`,
          icon: 'layers',
        },
      ],
      scope: {
        timeSpan: span || '—',
        granularity: 'Hourly',
        periodCount: metrics.hourCount,
        dayCount: metrics.dayCount,
        dayLabel: `${metrics.dayCount} day${metrics.dayCount === 1 ? '' : 's'}`,
        rawRows: metrics.rawRowCount,
        kpiNames: kpis.map((k) => k.name),
        nodes: metrics.nodeNames,
      },
    };
  }

  /**
   * Highlights for a report that is one KPI.
   *
   * The all-KPIs report's headline figures are comparisons between KPIs, which
   * say nothing when there is only one. These are the KPI's own figures instead:
   * its average, its worst and best hour, its weakest node and the gap between
   * the two data centres.
   */
  function singleKpiHighlights(kpi, metrics) {
    const m = kpi.metrics;
    return [
      { label: 'Time span', value: metrics.timeSpan || '—', trend: 'neutral' },
      {
        label: 'Average',
        value: m.average != null ? formatPercent(m.average) : '—',
        sub: `mean of ${m.nodeCount} node${m.nodeCount === 1 ? '' : 's'}`,
        trend: m.belowAttention ? 'down' : 'up',
      },
      {
        label: 'Worst hour',
        value: m.worstHour != null ? formatPercent(m.worstHour) : '—',
        sub: m.worstHourAt || undefined,
        trend: 'down',
      },
      {
        label: 'Best hour',
        value: m.bestHour != null ? formatPercent(m.bestHour) : '—',
        sub: m.bestHourAt || undefined,
        trend: 'up',
      },
      {
        label: 'Weakest node',
        value: m.weakestNodeAverage != null ? formatPercent(m.weakestNodeAverage) : '—',
        sub: m.weakestNode || undefined,
        trend: 'down',
      },
      {
        label: 'Nodes',
        value: `${m.nodeCount}`,
        sub: kpi.sites.join(' · ') || undefined,
        trend: 'neutral',
      },
      {
        label: `Hours below ${metrics.attentionThreshold}%`,
        value: `${m.hoursBelowAttention} of ${m.hourCount}`,
        trend: m.hoursBelowAttention ? 'down' : 'up',
      },
      {
        label: 'Data coverage',
        value: formatPercent(m.coveragePct),
        sub: `${m.readings.toLocaleString()} of ${m.expectedReadings.toLocaleString()} readings`,
        trend: m.coveragePct >= 99.5 ? 'up' : 'neutral',
      },
    ];
  }

  function generateSummary(calculated, transformed) {
    const { metrics, ranking, kpis } = calculated;
    const weakThree = ranking.slice(0, 3);

    if (metrics.singleKpi && kpis[0]) {
      const kpi = kpis[0];
      const m = kpi.metrics;
      const narrative =
        `${kpi.name} averaged ${m.average != null ? formatPercent(m.average) : '—'} over ` +
        `${metrics.timeSpan || 'the period'}, taken as the mean of its ${m.nodeCount} ` +
        `${m.nodeCount === 1 ? 'node' : 'nodes'}` +
        (kpi.sites.length ? ` across ${kpi.sites.join(' and ')}` : '') +
        '. ' +
        (m.worstHour != null
          ? `Its lowest hour was ${formatPercent(m.worstHour)} at ${m.worstHourAt}. `
          : '') +
        (m.weakestNode
          ? `${m.weakestNode} is the weakest node at ${formatPercent(m.weakestNodeAverage)}` +
            (m.strongestNode && m.strongestNode !== m.weakestNode
              ? `, against ${formatPercent(m.strongestNodeAverage)} on ${m.strongestNode}.`
              : '.')
          : '') +
        (m.siteGapPct != null
          ? ` MDC1 and MDC2 sit ${m.siteGapPct.toFixed(2)} points apart.`
          : '');

      return {
        title: `${kpi.name} — ${metrics.domainLabel}`,
        kpiName: kpi.name,
        generatedAt: new Date().toISOString(),
        dateRange: transformed.dateRange,
        timeContext: {
          granularity: 'Hourly',
          span: metrics.timeSpan,
          points: m.hourCount,
        },
        insight: buildInsight(calculated),
        highlights: singleKpiHighlights(kpi, metrics),
        anomalies: [],
        narrative,
      };
    }

    const highlights = [
      { label: 'Time span', value: metrics.timeSpan || '—', trend: 'neutral' },
      {
        label: `${metrics.kpiGroupLabel} analysed`,
        value: String(metrics.kpiCount),
        sub: 'each one separately',
        trend: 'neutral',
      },
      {
        label: 'Nodes',
        value: `${metrics.nodeCount}`,
        sub: metrics.siteNames.join(' · ') || undefined,
        trend: 'neutral',
      },
      {
        label: 'Lowest average KPI',
        value: metrics.weakestKpiAverage != null ? formatPercent(metrics.weakestKpiAverage) : '—',
        sub: metrics.weakestKpi || undefined,
        trend: 'down',
      },
      {
        label: 'Highest average KPI',
        value: metrics.strongestKpiAverage != null ? formatPercent(metrics.strongestKpiAverage) : '—',
        sub: metrics.strongestKpi || undefined,
        trend: 'up',
      },
      {
        label: 'Worst single hour',
        value: metrics.lowestHourValue != null ? formatPercent(metrics.lowestHourValue) : '—',
        sub: metrics.lowestHourKpi
          ? `${metrics.lowestHourKpi} · ${metrics.lowestHourAt}`
          : undefined,
        trend: 'down',
      },
      {
        label: `Below ${metrics.attentionThreshold}%`,
        value: `${metrics.kpisBelowAttention} of ${metrics.kpiCount}`,
        sub: 'on their own average',
        trend: metrics.kpisBelowAttention ? 'down' : 'up',
      },
      {
        label: 'Data coverage',
        value: formatPercent(metrics.coveragePct),
        sub: `${metrics.readings.toLocaleString()} of ${metrics.expectedReadings.toLocaleString()} readings`,
        trend: metrics.coveragePct >= 99.5 ? 'up' : 'neutral',
      },
    ];

    const narrative =
      `${metrics.kpiCount} ${metrics.kpiGroupLabel} were calculated separately over ` +
      `${metrics.timeSpan || 'the period'}, each averaged per node, per data centre and combined. ` +
      (weakThree.length
        ? `The weakest on average ${weakThree.length === 1 ? 'is' : 'are'} ` +
          `${weakThree.map((k) => `${k.name} (${formatPercent(k.average)})`).join(', ')}. `
        : '') +
      (metrics.lowestHourKpi
        ? `The lowest single hour anywhere in the file is ${formatPercent(metrics.lowestHourValue)} ` +
          `on ${metrics.lowestHourKpi} at ${metrics.lowestHourAt}.`
        : '');

    return {
      title: `${metrics.domainLabel} Report`,
      kpiName: metrics.kpiName,
      generatedAt: new Date().toISOString(),
      dateRange: transformed.dateRange,
      timeContext: {
        granularity: 'Hourly',
        span: metrics.timeSpan,
        points: metrics.hourCount,
      },
      insight: buildInsight(calculated),
      highlights,
      anomalies: [],
      narrative,
    };
  }

  return { calculate, generateSummary, ATTENTION_PERCENT };
}

module.exports = { createCalculator, buildKpi, buildNodeStats, buildSiteStats, ATTENTION_PERCENT };
