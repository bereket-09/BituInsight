const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

/** Must match a font installed in the Docker image (see Dockerfile) */
const CHART_FONT = 'DejaVu Sans';

const DARK_THEME = {
  background: '#0d1117',
  text: '#e6edf3',
  muted: '#8b949e',
  grid: 'rgba(139, 148, 158, 0.12)',
};

const chartRenderers = {};

/**
 * chartjs-node-canvas pulls in the native `canvas` binding, which needs Cairo and
 * Pango at runtime. Those exist in the Docker image but not on serverless hosts,
 * so the module is loaded lazily and its absence degrades to "no PNGs" instead of
 * crashing the whole upload. The UI charts are rendered client-side by Recharts
 * either way; these PNGs are for downloads, PPTX export, and Teams cards.
 */
let canvasModule;
let canvasUnavailableReason = null;

function loadCanvas() {
  if (canvasModule || canvasUnavailableReason) return canvasModule;
  if (!config.chartsEnabled) {
    canvasUnavailableReason = 'disabled by DISABLE_CHART_RENDERING';
    return null;
  }
  try {
    canvasModule = require('chartjs-node-canvas');
  } catch (err) {
    canvasUnavailableReason = err.message;
    logger.warn('Server-side chart rendering unavailable — reports will omit PNG charts', {
      error: err.message,
    });
  }
  return canvasModule;
}

function chartRenderingAvailable() {
  return Boolean(loadCanvas());
}

function registerChartFonts(ChartJS) {
  ChartJS.defaults.font.family = CHART_FONT;
  ChartJS.defaults.color = DARK_THEME.text;
}

function formatAxisValue(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return value;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function fontSpec(size, weight = 'normal') {
  return { family: CHART_FONT, size, weight, style: 'normal' };
}

function getRenderer(width = 1100, height = 520) {
  const mod = loadCanvas();
  if (!mod) return null;
  const { ChartJSNodeCanvas } = mod;

  const key = `${width}x${height}`;
  if (!chartRenderers[key]) {
    chartRenderers[key] = new ChartJSNodeCanvas({
      width,
      height,
      backgroundColour: DARK_THEME.background,
      chartCallback: registerChartFonts,
    });
  }
  return chartRenderers[key];
}

function buildChartJsConfig(chartConfig) {
  const { type, title, data, options: extraOptions = {} } = chartConfig;
  const chartType = type === 'area' ? 'line' : type;

  const baseOptions = {
    responsive: false,
    animation: false,
    layout: { padding: { top: 16, right: 20, bottom: 12, left: 12 } },
    plugins: {
      title: {
        display: true,
        text: title,
        color: DARK_THEME.text,
        font: fontSpec(18, 'bold'),
        padding: { bottom: 18 },
      },
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          color: DARK_THEME.text,
          font: fontSpec(12),
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 18,
        },
      },
      tooltip: { enabled: false },
    },
  };

  if (chartType === 'pie' || chartType === 'doughnut') {
    return {
      type: chartType === 'doughnut' ? 'doughnut' : 'pie',
      data,
      options: {
        ...baseOptions,
        cutout: chartType === 'doughnut' ? '62%' : undefined,
        plugins: {
          ...baseOptions.plugins,
          legend: {
            position: 'right',
            labels: { color: DARK_THEME.text, font: fontSpec(12), padding: 14 },
          },
        },
      },
    };
  }

  const isStacked = chartConfig.id === 'traffic-stacked-area';
  const isPercent = chartConfig.id === 'contribution-trend';

  if (!data?.datasets?.length) {
    throw new Error(`Chart "${chartConfig.id}" has no dataset — check that the sheet has valid numeric data`);
  }

  const datasets = data.datasets.map((ds) => ({
    ...ds,
    ...(type === 'area' || isStacked ? { fill: true } : {}),
    borderWidth: ds.borderWidth ?? 2.5,
    pointRadius: ds.pointRadius ?? (data.labels?.length <= 14 ? 4 : 2),
    pointHoverRadius: 6,
  }));

  return {
    type: chartType,
    data: { ...data, datasets },
    options: {
      ...baseOptions,
      ...extraOptions,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          ticks: {
            color: DARK_THEME.muted,
            font: fontSpec(11),
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 12,
          },
          grid: { color: DARK_THEME.grid, drawBorder: false },
          border: { display: false },
        },
        y: {
          stacked: isStacked,
          min: isPercent ? 0 : undefined,
          max: isPercent ? 100 : undefined,
          ticks: {
            color: DARK_THEME.muted,
            font: fontSpec(11),
            callback: isPercent ? (v) => `${v}%` : formatAxisValue,
          },
          grid: { color: DARK_THEME.grid, drawBorder: false },
          border: { display: false },
        },
      },
    },
  };
}

async function generateChart(chartConfig, outputDir, reportId) {
  const isMainLine = chartConfig.id === 'traffic-volume-lines';
  const renderer = getRenderer(isMainLine ? 1200 : 1000, isMainLine ? 560 : 480);
  const jsConfig = buildChartJsConfig(chartConfig);
  const buffer = await renderer.renderToBuffer(jsConfig);

  const filename = `${reportId}_${chartConfig.id}.png`;
  const filePath = path.join(outputDir, filename);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(filePath, buffer);
  logger.info('Chart generated', { chartId: chartConfig.id, filePath });

  return {
    chartType: chartConfig.type,
    title: chartConfig.title,
    filePath,
    filename,
    config: chartConfig,
  };
}

async function generateAllCharts(chartConfigs, reportId) {
  if (!chartRenderingAvailable()) {
    logger.info('Skipping PNG chart generation', {
      reportId,
      reason: canvasUnavailableReason,
      chartsRequested: chartConfigs.length,
    });
    return [];
  }

  const outputDir = path.join(config.chartsDir, reportId);
  const results = [];

  for (const chartConfig of chartConfigs) {
    const chart = await generateChart(chartConfig, outputDir, reportId);
    results.push(chart);
  }

  return results;
}

module.exports = {
  generateChart,
  generateAllCharts,
  chartRenderingAvailable,
  DARK_THEME,
  CHART_FONT,
};
