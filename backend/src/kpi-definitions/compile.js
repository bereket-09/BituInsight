/**
 * Compile a validated JSON definition into a workflow module.
 *
 * "Compile" here means *bind*, not *generate*: the result is a plain object of
 * closures over the definition data, exposing the same surface the three
 * hand-written workflows expose:
 *
 *   { slug, name, description, version, metadata, requiredColumns, chartDefinitions,
 *     validator, transformer, calculator, charts, formatter, generateSummary }
 *
 * Because the surface matches, workflowEngine.service.js drives a database-defined
 * workflow through the exact same processReport path as a code one, and every
 * downstream consumer (analytics, chart.service, pptxExport, report.service's Teams
 * send) needs no change.
 *
 * No string from a definition is ever turned into code. Every behavioural choice is
 * a lookup in a fixed table, checked by validator.js before we get here.
 */
const { createSourceValidator } = require('./runtime/source');
const { createTransformer } = require('./runtime/transform');
const { buildSeries } = require('./runtime/timeSeries');
const { evaluateMetrics, detectAnomalies } = require('./runtime/metrics');
const { createCharts, DEFAULT_PALETTE, DEFAULT_FILLS } = require('./runtime/charts');
const { formatValue, interpolate, round } = require('./runtime/format');
const { validateDefinition, formatErrors } = require('./validator');

/** Build the stream descriptors the series builder and charts both need. */
function buildStreams(def) {
  return (def.series.streams || []).map((s, i) => ({
    key: s.key,
    label: s.label,
    from: s.from,
    sharePctField: s.sharePctField || `${s.key}SharePct`,
    color: s.color || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
    fill: s.fill || DEFAULT_FILLS[i % DEFAULT_FILLS.length],
  }));
}

function compileDefinition(definition, { skipValidation = false } = {}) {
  if (!skipValidation) {
    const { valid, errors } = validateDefinition(definition);
    if (!valid) {
      const err = new Error(`Invalid workflow definition "${definition && definition.slug}":\n${formatErrors(errors)}`);
      err.validationErrors = errors;
      throw err;
    }
  }

  const def = definition;
  const streams = buildStreams(def);
  const unit = def.metadata?.unit || '';
  const kpiName = def.presentation?.kpiName || def.name;

  // Field -> colour/label map shared by the chart builder and the series colours
  // block that the frontend reads straight off timeSeries.colors.
  const colorsByField = {};
  for (const s of streams) colorsByField[s.key] = { line: s.color, fill: s.fill, label: s.label };
  colorsByField.total = {
    line: def.series.totalColor || '#4ADE80',
    fill: def.series.totalFill || 'rgba(74, 222, 128, 0.12)',
    label: 'Total',
  };

  const seriesSpec = {
    valueField: def.series.valueField,
    aggregate: def.series.aggregate || 'sum',
    // Default: measure the declared value field. A definition whose streams
    // partition that field (classify + equals) should say totalMode "streams".
    totalMode: def.series.totalMode || (def.series.valueField ? 'valueField' : 'streams'),
    granularity: def.series.granularity || 'auto',
    granularityLabels: def.series.granularityLabels,
    spanFormat: def.series.spanFormat || 'short',
    includeDailyPeaks: def.series.includeDailyPeaks !== false,
    streams,
    colors: colorsByField,
  };

  const validator = createSourceValidator(def);
  const transformer = createTransformer(def);
  const charts = createCharts(def, colorsByField);
  const splitKey = def.series.splitOutputKey || 'split';

  /** Format one metric using the definition's declared format for it. */
  const metricFormats = new Map(def.metrics.map((m) => [m.key, { format: m.format, unit: m.unit }]));
  function formatMetric(key, value) {
    const f = metricFormats.get(key) || {};
    const fmt = f.format || (typeof value === 'string' ? 'text' : 'number');
    return formatValue(value, fmt, f.unit !== undefined ? f.unit : '');
  }

  /** Build the {token} map used by narrative templates: every metric, formatted. */
  function metricTokens(metrics) {
    const tokens = {};
    // getOwnPropertyNames, not keys: metrics marked internal are non-enumerable so
    // they stay out of the emitted metrics, but they must still resolve as tokens.
    for (const key of Object.getOwnPropertyNames(metrics)) tokens[key] = formatMetric(key, metrics[key]);
    return tokens;
  }

  // Anomaly messages format point values with the definition's chosen format so a
  // converted workflow can reproduce its original wording (e.g. "1.20 Tbps").
  const anomalyFormat = def.anomalies?.format || 'number';
  function anomalyMessage(template, point) {
    const fmt = (v) => formatValue(v, anomalyFormat, unit);
    if (!template) return `Anomaly at ${point.label}: ${fmt(point.total)}`;
    const tokens = { label: point.label, timestamp: point.timestamp, total: fmt(point.total) };
    for (const s of streams) {
      tokens[s.key] = fmt(point[s.key]);
      tokens[s.sharePctField] = formatValue(point[s.sharePctField], 'percent');
    }
    return interpolate(template, tokens);
  }

  function calculate(transformed, context = {}) {
    const records = transformed.records || [];
    const timeSeries = buildSeries(records, seriesSpec);
    const primary = timeSeries.series.primary;

    const metrics = evaluateMetrics(def.metrics, {
      series: primary,
      records,
      detected: timeSeries.detected,
      peak: timeSeries.peak,
      min: timeSeries.min,
      streams,
    });

    // kpiName and unit are contractual for the analytics/narrative layer, so fill
    // them in when the definition did not declare them as explicit metrics.
    if (metrics.kpiName === undefined) metrics.kpiName = context.kpiName || kpiName;
    if (metrics.unit === undefined && unit) metrics.unit = unit;

    // Stream totals — the pie/doughnut source and the "share" table.
    const streamTotals = streams.map((s) => {
      const total = primary.reduce((sum, p) => sum + (p.__raw?.[s.key] ?? Number(p[s.key]) ?? 0), 0);
      return { key: s.key, label: s.label, value: round(total) };
    });
    const grandTotal = streamTotals.reduce((sum, s) => sum + s.value, 0);
    for (const s of streamTotals) {
      s.percentage = grandTotal > 0 ? round((s.value / grandTotal) * 100, 2) : 0;
    }

    const anomalies = detectAnomalies(primary, def.anomalies, anomalyMessage);

    const calculated = {
      valueType: def.metadata?.category || 'metric',
      metrics,
      timeSeries,
      split: streamTotals,
      dailyPeaks: timeSeries.dailyPeaks,
      peaksByView: timeSeries.peaksByView,
      anomalies,
      rawRecordCount: records.length,
      definition: { slug: def.slug, version: def.version || '1.0.0', schemaVersion: def.schemaVersion },
    };
    // Alias under the definition's preferred name (nodeSplit, technologySplit, …)
    // so a converted workflow keeps the key its existing UI reads.
    if (splitKey !== 'split') calculated[splitKey] = streamTotals;
    if (def.target) calculated.target = def.target;

    return calculated;
  }

  function buildHighlights(metrics, tokens) {
    const specs = def.presentation?.highlights || [];
    return specs.map((h) => ({
      label: interpolate(h.label, tokens),
      value: h.metric
        ? formatValue(metrics[h.metric], h.format || metricFormats.get(h.metric)?.format || 'number', h.unit !== undefined ? h.unit : metricFormats.get(h.metric)?.unit || '')
        : '—',
      trend: h.trend || 'neutral',
    }));
  }

  function generateSummary(calculated, transformed, context = {}) {
    const { metrics, anomalies, timeSeries } = calculated;
    const det = timeSeries?.detected || {};
    const tokens = metricTokens(metrics);

    return {
      title: def.presentation?.title || `${def.name} Report`,
      kpiName: context.kpiName || kpiName,
      generatedAt: new Date().toISOString(),
      // Legacy key kept so existing report views find the entity list.
      plmnNames: transformed.entityNames || [],
      entityNames: transformed.entityNames || [],
      dateRange: transformed.dateRange,
      timeContext: {
        granularity: det.label,
        span: det.spanLabel,
        points: det.pointCount,
      },
      insight: {
        subtitle: def.presentation?.subtitle || def.description || '',
        scope: {
          timeSpan: det.spanLabel || '—',
          granularity: det.label || '—',
          periodCount: det.pointCount,
          dayCount: det.dayCount,
          rawRows: transformed.records?.length || 0,
          entityNames: transformed.entityNames || [],
        },
      },
      highlights: buildHighlights(metrics, tokens),
      anomalies,
      narrative: def.presentation?.narrativeTemplate
        ? interpolate(def.presentation.narrativeTemplate, tokens)
        : `${det.pointCount || 0} periods over ${det.spanLabel || '—'}.`,
      narrativeLong: def.presentation?.narrativeLongTemplate
        ? interpolate(def.presentation.narrativeLongTemplate, tokens)
        : undefined,
    };
  }

  function formatTeamsMessage(summary, calculated, reportId) {
    const teams = def.presentation?.teams || {};
    const metrics = calculated?.metrics || {};
    const anomalies = calculated?.anomalies || [];
    const facts = (teams.facts || []).map((f) => ({
      name: f.name,
      value: formatValue(
        metrics[f.metric],
        f.format || metricFormats.get(f.metric)?.format || 'number',
        f.unit !== undefined ? f.unit : metricFormats.get(f.metric)?.unit || ''
      ),
    }));

    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: teams.themeColor || '00B140',
      summary: summary?.title || def.name,
      sections: [
        {
          activityTitle: teams.activityTitle || `📊 ${def.name}`,
          activitySubtitle: `Report ID: ${reportId}`,
          facts: [
            { name: 'Generated', value: new Date(summary?.generatedAt || Date.now()).toLocaleString() },
            ...facts,
          ],
          markdown: true,
        },
        { title: 'Summary', text: summary?.narrative || '' },
        {
          title: 'Anomalies',
          text: anomalies.length ? anomalies.map((a) => `- ${a.message}`).join('\n') : 'No anomalies detected',
        },
      ],
    };
  }

  return {
    slug: def.slug,
    name: def.name,
    description: def.description || '',
    version: def.version || '1.0.0',
    metadata: { ...(def.metadata || {}), definitionDriven: true, schemaVersion: def.schemaVersion },
    requiredColumns: validator.requiredColumns,
    chartDefinitions: charts.definitions,
    // Hints for the analytics core; workflowEngine falls back to this when a slug
    // has no hard-coded ANALYTICS_PROFILES entry.
    analyticsProfile: {
      unit,
      streams: streams.length >= 2 ? streams.map((s) => ({ key: s.key, label: s.label })) : null,
      threshold: def.target?.value,
    },
    source: 'definition',
    definition: def,
    validator,
    transformer,
    calculator: { calculate, generateSummary },
    charts,
    formatter: { formatTeamsMessage },
    generateSummary,
  };
}

module.exports = { compileDefinition };
