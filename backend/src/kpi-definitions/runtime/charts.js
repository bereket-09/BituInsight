/**
 * Chart config builder for database-defined workflows.
 *
 * Emits exactly the shape chart.service.js already renders and the frontend already
 * draws — `{ id, type, title, meta?, data: { labels, datasets } }` with Chart.js
 * dataset options. The definition supplies which fields to draw and their colours;
 * every structural option (tension, point radius, border width, the dark-theme
 * point border) is fixed here so an imported definition cannot inject arbitrary
 * Chart.js configuration.
 */
const DEFAULT_PALETTE = ['#3B9EFF', '#FF6B35', '#4ADE80', '#A78BFA', '#F472B6', '#FBBF24', '#38BDF8', '#F87171'];
const DEFAULT_FILLS = [
  'rgba(59, 158, 255, 0.15)',
  'rgba(255, 107, 53, 0.15)',
  'rgba(74, 222, 128, 0.12)',
  'rgba(167, 139, 250, 0.15)',
  'rgba(244, 114, 182, 0.15)',
  'rgba(251, 191, 36, 0.15)',
  'rgba(56, 189, 248, 0.15)',
  'rgba(248, 113, 113, 0.15)',
];

/**
 * Resolve a field's colour/label: an explicit value on the chart series wins, then
 * the stream that owns the field, then the palette by position.
 */
function resolveStyle(fieldSpec, index, colorsByField) {
  const owned = colorsByField[fieldSpec.field] || {};
  return {
    label: fieldSpec.label || owned.label || fieldSpec.field,
    color: fieldSpec.color || owned.line || DEFAULT_PALETTE[index % DEFAULT_PALETTE.length],
    fill: fieldSpec.fill || owned.fill || DEFAULT_FILLS[index % DEFAULT_FILLS.length],
  };
}

function createCharts(def, colorsByField) {
  const chartSpecs = def.charts || [];

  const definitions = chartSpecs.map((c) => ({
    id: c.id,
    type: c.type,
    title: c.title,
    description: c.description,
  }));

  function getChartConfigs(calculated) {
    const { timeSeries } = calculated;
    const series = timeSeries?.series?.primary || [];
    const det = timeSeries?.detected || {};
    const labels = series.map((p) => p.label);
    const split = calculated.split || [];
    const titleSuffix = det.spanLabel ? ` (${det.label})` : '';

    return chartSpecs.map((c) => {
      const title = c.appendGranularity ? `${c.title}${titleSuffix}` : c.title;

      if (c.source === 'split') {
        return {
          id: c.id,
          type: c.type === 'pie' ? 'pie' : 'doughnut',
          title,
          data: {
            labels: split.map((s) => s.label),
            datasets: [
              {
                data: split.map((s) => s.value),
                backgroundColor: split.map(
                  (s, i) => colorsByField[s.key]?.line || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length]
                ),
                borderColor: '#1a1d23',
                borderWidth: 3,
                hoverOffset: 8,
              },
            ],
          },
        };
      }

      const tension = c.tension === undefined ? 0.35 : c.tension;
      const areaLike = c.type === 'area';
      const datasets = (c.series || []).map((s, i) => {
        const style = resolveStyle(s, i, colorsByField);
        const fillArea = s.fillArea === true || (areaLike && s.fillArea !== false) || c.fillArea === true;
        const dataset = {
          label: style.label,
          data: series.map((p) => p[s.field]),
          borderColor: style.color,
          backgroundColor: style.fill,
          fill: fillArea,
          tension,
          borderWidth: areaLike && fillArea ? 0 : 2.5,
          pointRadius: series.length <= 24 ? 4 : 2,
          pointHoverRadius: 6,
          pointBackgroundColor: style.color,
          pointBorderColor: '#1a1d23',
          pointBorderWidth: 1,
        };
        if (s.stack) dataset.stack = s.stack;
        return dataset;
      });

      return {
        id: c.id,
        type: c.type,
        title,
        meta: { granularity: det.label, span: det.spanLabel },
        data: { labels, datasets },
      };
    });
  }

  return { definitions, getChartConfigs };
}

module.exports = { createCharts, DEFAULT_PALETTE, DEFAULT_FILLS };
