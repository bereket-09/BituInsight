const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

/** Must match a font installed in the Docker image (see Dockerfile) */
const CHART_FONT = 'DejaVu Sans';

/**
 * The family actually handed to Chart.js. Normally the bundled DejaVu, but it
 * drops to a platform font if registration fails, so labels still draw.
 */
let CHART_FONT_RESOLVED = CHART_FONT;

const DARK_THEME = {
  background: '#0d1117',
  text: '#e6edf3',
  muted: '#8b949e',
  grid: 'rgba(139, 148, 158, 0.12)',
};

/**
 * Rendering runs on @napi-rs/canvas rather than the `canvas` binding that
 * chartjs-node-canvas pulls in. The former ships prebuilt binaries with the
 * graphics stack statically linked, so it needs no system Cairo/Pango and works
 * unchanged on serverless hosts, where the old path could not render at all.
 *
 * Chart.js is driven directly here — chartjs-node-canvas only wrapped it.
 */
let canvasModule;
let canvasUnavailableReason = null;
let fontsRegistered = false;

function loadCanvas() {
  if (canvasModule || canvasUnavailableReason) return canvasModule;
  if (!config.chartsEnabled) {
    canvasUnavailableReason = 'disabled by DISABLE_CHART_RENDERING';
    return null;
  }
  try {
    canvasModule = require('@napi-rs/canvas');
    registerBundledFonts();
  } catch (err) {
    canvasUnavailableReason = err.message;
    logger.warn('Server-side chart rendering unavailable — reports will omit PNG charts', {
      error: err.message,
    });
  }
  return canvasModule;
}

/**
 * Serverless images ship with essentially no fonts, so Skia would draw a chart
 * with no readable text. DejaVu is bundled as a dependency and registered
 * explicitly — the same family the Docker image installs, so output matches
 * across environments.
 */
function registerBundledFonts() {
  if (fontsRegistered || !canvasModule) return;
  const { GlobalFonts } = canvasModule;

  // The font files are vendored under backend/assets rather than pulled from
  // node_modules: a serverless bundler traces static requires, and a .ttf resolved
  // through a template string is invisible to it, so the file never ships and the
  // chart renders with no text at all.
  const fontDir = path.join(__dirname, '../../assets/fonts');
  let registered = 0;

  for (const file of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) {
    const fontPath = path.join(fontDir, file);
    try {
      if (fs.existsSync(fontPath) && GlobalFonts.registerFromPath(fontPath, CHART_FONT)) {
        registered += 1;
      }
    } catch (err) {
      logger.warn('Could not register bundled chart font', { file, error: err.message });
    }
  }

  fontsRegistered = true;

  if (registered === 0) {
    // Fall back to whatever the platform provides so labels still draw.
    const fallback = GlobalFonts.families?.[0]?.family;
    if (fallback) {
      CHART_FONT_RESOLVED = fallback;
      logger.warn('Bundled chart fonts unavailable — falling back', { fallback, fontDir });
    } else {
      logger.error('No fonts available to the chart renderer; charts will have no text', {
        fontDir,
      });
    }
    return;
  }

  logger.info('Chart fonts registered', {
    family: CHART_FONT,
    files: registered,
    available: GlobalFonts.families.length,
  });
}

function chartRenderingAvailable() {
  return Boolean(loadCanvas());
}

/**
 * Chart.js draws only what it is told to; the canvas itself starts transparent.
 * This paints the NOC background behind the finished chart so exported PNGs match
 * the dark UI instead of arriving see-through.
 */
const backgroundPlugin = {
  id: 'nocBackground',
  beforeDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = DARK_THEME.background;
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  },
};

function renderChartToBuffer(chartConfig, width, height) {
  const mod = loadCanvas();
  if (!mod) return null;

  const { Chart, registerables } = require('chart.js');
  if (!Chart.__bituRegistered) {
    Chart.register(...registerables);
    Chart.__bituRegistered = true;
  }
  registerChartFonts(Chart);

  const canvas = mod.createCanvas(width, height);
  // Chart.js probes DOM-ish properties during initialisation.
  canvas.style = {};

  const jsConfig = buildChartJsConfig(chartConfig);
  jsConfig.options = { ...(jsConfig.options || {}), responsive: false, animation: false };
  jsConfig.plugins = [...(jsConfig.plugins || []), backgroundPlugin];

  const chart = new Chart(canvas.getContext('2d'), jsConfig);
  try {
    return canvas.toBuffer('image/png');
  } finally {
    chart.destroy();
  }
}

function registerChartFonts(ChartJS) {
  ChartJS.defaults.font.family = CHART_FONT_RESOLVED;
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
  return { family: CHART_FONT_RESOLVED, size, weight, style: 'normal' };
}

function chartDimensions(chartConfig) {
  const isMainLine = chartConfig.id === 'traffic-volume-lines';
  return { width: isMainLine ? 1200 : 1000, height: isMainLine ? 560 : 480 };
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

/**
 * Renders a chart and returns its PNG bytes.
 *
 * `outputDir` is optional and only used to keep a copy on disk for local and
 * Docker runs; the buffer is the artefact callers actually persist, because a
 * serverless filesystem does not survive the request.
 */
async function generateChart(chartConfig, outputDir, reportId) {
  const { width, height } = chartDimensions(chartConfig);
  const buffer = renderChartToBuffer(chartConfig, width, height);

  // Callers such as the PPTX exporter invoke this directly rather than through
  // generateAllCharts, so the no-renderer case has to degrade here too — a deck
  // with text-only slides beats a failed export.
  if (!buffer) {
    logger.info('Chart rendering unavailable — returning chart without image', {
      chartId: chartConfig.id,
      reason: canvasUnavailableReason,
    });
    return {
      chartType: chartConfig.type,
      title: chartConfig.title,
      buffer: null,
      filePath: null,
      filename: null,
      config: chartConfig,
      skipped: true,
    };
  }

  const filename = `${reportId}_${chartConfig.id}.png`;
  let filePath = null;

  if (outputDir) {
    try {
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      filePath = path.join(outputDir, filename);
      fs.writeFileSync(filePath, buffer);
    } catch (err) {
      // Read-only filesystem: the buffer is still valid, so this is not fatal.
      filePath = null;
      logger.debug('Chart not written to disk', { chartId: chartConfig.id, error: err.message });
    }
  }

  logger.info('Chart generated', { chartId: chartConfig.id, bytes: buffer.length });

  return {
    chartType: chartConfig.type,
    title: chartConfig.title,
    buffer,
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
