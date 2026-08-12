const fs = require('fs');
const path = require('path');
const PptxGenJS = require('pptxgenjs');
const pool = require('../db/pool');
const config = require('../config');
const { getWorkbookById } = require('./cmmWorkbook.service');
const { getWorkflow } = require('../kpi-workflows/registry');
const { generateChart } = require('./chart.service');
const { resolveThreshold } = require('../kpi-workflows/telecom-metric/constants');

const LAYOUT = {
  footerY: 6.72,
  footerH: 0.42,
  contentMaxY: 6.45,
  rowsFirstSlide: 7,
  rowsContSlide: 9,
  tableRowH: 0.38,
};

function createTheme(themeId = 'dark') {
  const light = themeId === 'light';
  return {
    id: light ? 'light' : 'dark',
    isLight: light,
    purple: '632CA6',
    purpleLight: '8B5CF6',
    accent: '3B9EFF',
    green: '22C55E',
    orange: 'F97316',
    bg: light ? 'F1F5F9' : '0D1117',
    bgSlide: light ? 'FFFFFF' : '161B22',
    bgElevated: light ? 'FFFFFF' : '1C2128',
    text: light ? '0F172A' : 'E6EDF3',
    textSoft: light ? '475569' : '8B949E',
    border: light ? 'E2E8F0' : '30363D',
    tableHeader: '632CA6',
    tableHeaderText: 'FFFFFF',
    rowEven: light ? 'FFFFFF' : '161B22',
    rowOdd: light ? 'F8FAFC' : '1C2128',
    statusOkBg: light ? 'DCFCE7' : '1A3D2E',
    statusOkText: light ? '15803D' : '3FB950',
    statusBelowBg: light ? 'FFEDD5' : '3D2618',
    statusBelowText: light ? 'C2410C' : 'FF6B35',
    statusVolumeBg: light ? 'E0F2FE' : '1A2D3D',
    statusVolumeText: light ? '0369A1' : '3B9EFF',
    chartFrame: '0D1117',
    coverGradient: light ? 'EEF2FF' : '0D1117',
    footerBar: '632CA6',
    footerText: 'FFFFFF',
    closingBg: '632CA6',
    closingText: 'FFFFFF',
  };
}

function parseSummary(summary) {
  if (!summary) return {};
  if (typeof summary === 'string') {
    try {
      return JSON.parse(summary);
    } catch {
      return {};
    }
  }
  return summary;
}

function formatDateRange(workbook) {
  return new Date(workbook.created_at).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function clampThreshold(value) {
  return resolveThreshold({ threshold: value });
}

function parseReportData(reportData) {
  if (!reportData) return {};
  if (typeof reportData === 'string') {
    try {
      return JSON.parse(reportData);
    } catch {
      return {};
    }
  }
  return reportData;
}

function pickStoredChart(charts) {
  return (
    charts.find((c) => c.path?.includes('metric-trend-threshold')) ||
    charts.find((c) => c.path?.includes('metric-trend')) ||
    charts[0]
  );
}

async function resolveMainChartForExport(kpi, thresholdOverride) {
  const summary = kpi.summary;
  const reportData = kpi.reportData;
  const calculated = reportData?.calculated || {};
  const valueType = calculated.valueType || calculated.metrics?.valueType || 'percent';
  const storedThreshold = resolveThreshold({
    threshold: summary.threshold ?? calculated.threshold ?? calculated.metrics?.threshold,
  });
  const hasOverride = thresholdOverride !== undefined && thresholdOverride !== null;
  const effectiveThreshold = hasOverride
    ? clampThreshold(thresholdOverride)
    : storedThreshold;

  const stored = pickStoredChart(kpi.charts);
  const needsRegen =
    valueType === 'percent' &&
    hasOverride &&
    Math.abs(effectiveThreshold - storedThreshold) > 0.001 &&
    calculated.timeSeries?.series?.primary?.length;

  if (needsRegen) {
    const workflow = getWorkflow(kpi.workflowSlug || 'telecom-metric');
    const calcWithThreshold = {
      ...calculated,
      threshold: effectiveThreshold,
      metrics: { ...(calculated.metrics || {}), threshold: effectiveThreshold },
    };
    const chartConfigs = workflow.charts.getChartConfigs(calcWithThreshold, {
      kpiName: kpi.kpiName,
      threshold: effectiveThreshold,
    });
    const chartCfg =
      chartConfigs.find((c) => c.id === 'metric-trend-threshold') || chartConfigs[0];
    const exportDir = path.join(config.chartsDir, 'pptx-export', kpi.reportId);
    const generated = await generateChart(chartCfg, exportDir, kpi.reportId);
    return { path: generated.filePath, threshold: effectiveThreshold };
  }

  if (stored?.path && fs.existsSync(stored.path)) {
    return { path: stored.path, threshold: effectiveThreshold };
  }

  return { path: null, threshold: effectiveThreshold };
}

async function fetchWorkbookCharts(workbookId, userId) {
  const result = await pool.query(
    `SELECT pr.id as report_id, pr.kpi_name, pr.sheet_name, pr.summary, pr.report_data,
            kw.slug as workflow_slug,
            gc.title as chart_title, gc.file_path, gc.chart_type
     FROM processed_reports pr
     JOIN kpi_workflows kw ON pr.workflow_id = kw.id
     LEFT JOIN generated_charts gc ON gc.report_id = pr.id
     WHERE pr.workbook_id = $1 AND pr.user_id = $2 AND pr.status = 'completed'
     ORDER BY pr.kpi_name, gc.created_at`,
    [workbookId, userId]
  );

  const byKpi = new Map();

  for (const row of result.rows) {
    const key = row.report_id;
    if (!byKpi.has(key)) {
      byKpi.set(key, {
        reportId: row.report_id,
        kpiName: row.kpi_name,
        sheetName: row.sheet_name,
        summary: parseSummary(row.summary),
        reportData: parseReportData(row.report_data),
        workflowSlug: row.workflow_slug,
        charts: [],
      });
    }
    if (row.file_path && fs.existsSync(row.file_path)) {
      byKpi.get(key).charts.push({
        title: row.chart_title,
        path: row.file_path,
        type: row.chart_type,
      });
    }
  }

  return [...byKpi.values()].map((kpi) => {
    const preferred = pickStoredChart(kpi.charts);
    return { ...kpi, mainChart: preferred };
  });
}

function highlightValue(summary) {
  const highlights = summary.highlights || [];
  const find = (label) => highlights.find((h) => h.label === label)?.value;
  return {
    average: find('Average') || '—',
    latest: find('Latest') || '—',
    peak: find('Peak') || '—',
    span: find('Time span') || summary.timeContext?.span || '—',
    granularity: find('Granularity') || summary.timeContext?.granularity || '—',
  };
}

function parseMetricNumber(value) {
  if (value == null || value === '—') return null;
  const n = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function getKpiValueType(kpi) {
  const calculated = kpi.reportData?.calculated || {};
  return calculated.valueType || calculated.metrics?.valueType || 'percent';
}

function getKpiHealth(kpi, T) {
  const valueType = getKpiValueType(kpi);
  if (valueType !== 'percent') {
    return {
      label: 'Volume',
      textColor: T.statusVolumeText,
      fill: T.statusVolumeBg,
      code: 'volume',
    };
  }
  const latest = parseMetricNumber(highlightValue(kpi.summary).latest);
  const threshold = kpi.displayThreshold ?? resolveThreshold({ threshold: kpi.summary?.threshold });
  if (latest == null) {
    return { label: '—', textColor: T.textSoft, fill: T.rowOdd, code: 'unknown' };
  }
  if (latest >= threshold) {
    return { label: 'On target', textColor: T.statusOkText, fill: T.statusOkBg, code: 'ok' };
  }
  return {
    label: 'Below target',
    textColor: T.statusBelowText,
    fill: T.statusBelowBg,
    code: 'below',
  };
}

function buildKpiPortfolioRows(kpiSlides, T) {
  return kpiSlides.map((kpi) => {
    const m = highlightValue(kpi.summary);
    const valueType = getKpiValueType(kpi);
    const health = getKpiHealth(kpi, T);
    const coverage =
      m.span !== '—'
        ? String(m.span).slice(0, 24)
        : m.granularity !== '—'
          ? String(m.granularity)
          : '—';
    const target = valueType === 'percent' ? `${kpi.displayThreshold ?? '—'}%` : '—';

    return {
      kpiName: (kpi.kpiName || kpi.sheetName || 'KPI').slice(0, 38),
      target,
      latest: String(m.latest),
      average: String(m.average),
      peak: String(m.peak),
      coverage,
      healthLabel: health.label,
      healthText: health.textColor,
      healthFill: health.fill,
    };
  });
}

function computePortfolioSummary(kpiSlides, T) {
  const rows = buildKpiPortfolioRows(kpiSlides, T);
  const percentRows = kpiSlides.filter((k) => getKpiValueType(k) === 'percent');
  const onTarget = percentRows.filter((k) => getKpiHealth(k, T).code === 'ok').length;
  const belowTarget = percentRows.filter((k) => getKpiHealth(k, T).code === 'below').length;

  const spans = kpiSlides
    .map((k) => highlightValue(k.summary).span)
    .filter((s) => s && s !== '—');
  const reportingPeriod = spans[0] ? String(spans[0]).slice(0, 52) : null;

  return {
    rows,
    total: kpiSlides.length,
    percentCount: percentRows.length,
    onTarget,
    belowTarget,
    reportingPeriod,
  };
}

function addBrandFooter(slide, pptx, T, pageNum, totalPages) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: LAYOUT.footerY,
    w: '100%',
    h: LAYOUT.footerH,
    fill: { color: T.footerBar },
  });
  slide.addText('BituInsight · Telecom KPI Executive Report', {
    x: 0.45,
    y: LAYOUT.footerY + 0.1,
    w: 6,
    h: 0.28,
    fontSize: 8,
    color: T.footerText,
    bold: true,
  });
  if (pageNum != null) {
    slide.addText(`${pageNum} / ${totalPages}`, {
      x: 12.2,
      y: LAYOUT.footerY + 0.1,
      w: 0.9,
      h: 0.28,
      fontSize: 8,
      color: T.footerText,
      align: 'right',
    });
  }
}

function addSlideAccentBar(slide, pptx, T) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: '100%',
    h: 0.06,
    fill: { color: T.purple },
  });
}

function addCoverSlide(pptx, workbook, kpiSlides, T) {
  const slide = pptx.addSlide();
  slide.background = { color: T.coverGradient };

  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: '100%',
    h: '100%',
    fill: { color: T.bg },
  });

  slide.addShape(pptx.ShapeType.ellipse, {
    x: 9,
    y: -1.5,
    w: 5,
    h: 5,
    fill: { color: T.purple, transparency: lightTransparency(T, 82) },
  });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: -1,
    y: 4.5,
    w: 3.5,
    h: 3.5,
    fill: { color: T.accent, transparency: lightTransparency(T, 88) },
  });

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.55,
    y: 0.45,
    w: 12.2,
    h: 5.9,
    fill: { color: T.bgSlide, transparency: T.isLight ? 0 : 15 },
    line: { color: T.border, width: T.isLight ? 1 : 0 },
    rectRadius: 0.12,
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.75,
    y: 0.65,
    w: 0.1,
    h: 1.35,
    fill: { color: T.purpleLight },
  });

  slide.addText('BITUINSIGHT', {
    x: 1,
    y: 0.62,
    w: 4,
    h: 0.35,
    fontSize: 11,
    color: T.purple,
    bold: true,
    charSpacing: 6,
  });

  slide.addText('Weekly KPI\nExecutive Report', {
    x: 0.75,
    y: 1.35,
    w: 9,
    h: 1.5,
    fontSize: 38,
    color: T.text,
    bold: true,
    lineSpacing: 42,
  });

  slide.addText(workbook.original_filename || 'CMM Workbook', {
    x: 0.75,
    y: 3.05,
    w: 10,
    h: 0.35,
    fontSize: 15,
    color: T.textSoft,
  });

  slide.addText(formatDateRange(workbook), {
    x: 0.75,
    y: 3.45,
    w: 8,
    h: 0.3,
    fontSize: 11,
    color: T.accent,
  });

  const portfolio = computePortfolioSummary(kpiSlides, T);
  const statY = 4.15;
  const statCards = [
    { label: 'KPIs', value: String(portfolio.total), color: T.accent },
    { label: 'On target', value: String(portfolio.onTarget), color: T.green },
    { label: 'Below target', value: String(portfolio.belowTarget), color: T.orange },
  ];

  statCards.forEach((card, i) => {
    const x = 0.75 + i * 3.9;
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: statY,
      w: 3.55,
      h: 1.05,
      fill: { color: T.bgElevated },
      line: { color: T.border, width: 1 },
      rectRadius: 0.1,
    });
    slide.addText(card.label, {
      x: x + 0.2,
      y: statY + 0.12,
      w: 3.1,
      h: 0.22,
      fontSize: 9,
      color: T.textSoft,
    });
    slide.addText(card.value, {
      x: x + 0.2,
      y: statY + 0.38,
      w: 3.1,
      h: 0.5,
      fontSize: 26,
      color: card.color,
      bold: true,
    });
  });

  slide.addText(
    T.isLight ? 'Executive presentation · Light theme' : 'Executive presentation · Dark theme',
    {
      x: 0.75,
      y: 5.35,
      w: 8,
      h: 0.25,
      fontSize: 8,
      color: T.textSoft,
      italic: true,
    }
  );
}

function lightTransparency(T, value) {
  return T.isLight ? Math.min(95, value + 5) : value;
}

function makeCell(T, text, options = {}) {
  return {
    text: String(text ?? '—'),
    options: {
      fontSize: 8,
      color: T.text,
      valign: 'middle',
      ...options,
    },
  };
}

function makeHeaderCell(T, text) {
  return makeCell(T, text, {
    bold: true,
    color: T.tableHeaderText,
    fill: { color: T.tableHeader },
    align: 'center',
    fontSize: 8,
  });
}

function buildPortfolioTableRows(chunk, T) {
  const header = [
    makeHeaderCell(T, 'KPI'),
    makeHeaderCell(T, 'Target'),
    makeHeaderCell(T, 'Latest'),
    makeHeaderCell(T, 'Avg'),
    makeHeaderCell(T, 'Peak'),
    makeHeaderCell(T, 'Coverage'),
    makeHeaderCell(T, 'Status'),
  ];

  const body = chunk.map((row, idx) => {
    const rowFill = idx % 2 === 0 ? T.rowEven : T.rowOdd;
    return [
      makeCell(T, row.kpiName, { bold: true, align: 'left', fill: { color: rowFill } }),
      makeCell(T, row.target, { align: 'center', color: T.orange, fill: { color: rowFill } }),
      makeCell(T, row.latest, {
        align: 'center',
        bold: true,
        color: T.accent,
        fill: { color: rowFill },
      }),
      makeCell(T, row.average, { align: 'center', fill: { color: rowFill } }),
      makeCell(T, row.peak, { align: 'center', fill: { color: rowFill } }),
      makeCell(T, row.coverage, {
        fontSize: 7,
        color: T.textSoft,
        fill: { color: rowFill },
      }),
      makeCell(T, row.healthLabel, {
        align: 'center',
        bold: true,
        color: row.healthText,
        fill: { color: row.healthFill },
      }),
    ];
  });

  return [header, ...body];
}

function addExecutiveOverviewSlides(pptx, workbook, kpiSlides, deckDefaultThreshold, T, pageStart, totalPages) {
  const portfolio = computePortfolioSummary(kpiSlides, T);
  const chunks = [];
  const firstLimit = LAYOUT.rowsFirstSlide;
  const contLimit = LAYOUT.rowsContSlide;

  if (portfolio.rows.length === 0) {
    chunks.push({ rows: [], isFirst: true });
  } else {
    chunks.push({
      rows: portfolio.rows.slice(0, firstLimit),
      isFirst: true,
    });
    for (let i = firstLimit; i < portfolio.rows.length; i += contLimit) {
      chunks.push({
        rows: portfolio.rows.slice(i, i + contLimit),
        isFirst: false,
      });
    }
  }

  let pageNum = pageStart;

  chunks.forEach((chunk, chunkIndex) => {
    const slide = pptx.addSlide();
    slide.background = { color: T.bg };
    addSlideAccentBar(slide, pptx, T);

    const isFirst = chunk.isFirst;
    const title = isFirst ? 'KPI Portfolio Overview' : 'KPI Portfolio (continued)';

    slide.addText(title, {
      x: 0.5,
      y: 0.22,
      w: 10,
      h: 0.48,
      fontSize: 24,
      color: T.text,
      bold: true,
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: 0.5,
      y: 0.72,
      w: 1.6,
      h: 0.045,
      fill: { color: T.purpleLight },
    });

    let tableY = 0.88;

    if (isFirst) {
      slide.addText(
        `${workbook.original_filename || 'Workbook'}  ·  ${formatDateRange(workbook)}`,
        { x: 0.5, y: 0.82, w: 11, h: 0.22, fontSize: 9, color: T.textSoft }
      );

      const cards = [
        { label: 'KPIs in deck', value: String(portfolio.total), color: T.accent },
        {
          label: 'On target',
          value: portfolio.percentCount ? String(portfolio.onTarget) : '—',
          color: T.green,
        },
        {
          label: 'Below target',
          value: portfolio.percentCount ? String(portfolio.belowTarget) : '—',
          color: T.orange,
        },
        {
          label: 'Deck target',
          value: `${deckDefaultThreshold ?? workbook.defaultThreshold ?? 99}%`,
          color: T.purpleLight,
        },
      ];

      cards.forEach((card, i) => {
        const x = 0.5 + i * 3.12;
        slide.addShape(pptx.ShapeType.roundRect, {
          x,
          y: 1.08,
          w: 2.92,
          h: 0.82,
          fill: { color: T.bgSlide },
          line: { color: T.border, width: 1 },
          rectRadius: 0.08,
        });
        slide.addText(card.label, {
          x: x + 0.14,
          y: 1.14,
          w: 2.6,
          h: 0.2,
          fontSize: 7,
          color: T.textSoft,
        });
        slide.addText(card.value, {
          x: x + 0.14,
          y: 1.34,
          w: 2.6,
          h: 0.42,
          fontSize: 17,
          color: card.color,
          bold: true,
        });
      });

      const insight =
        portfolio.percentCount > 0
          ? `${portfolio.onTarget} of ${portfolio.percentCount} success-rate KPIs meet target. Chart detail slides follow.`
          : `${portfolio.total} KPI metrics in this deck. Chart detail slides follow.`;

      slide.addText(insight, {
        x: 0.5,
        y: 2.02,
        w: 12.3,
        h: 0.28,
        fontSize: 8,
        color: T.text,
      });

      if (portfolio.reportingPeriod) {
        slide.addText(`Coverage: ${portfolio.reportingPeriod}`, {
          x: 0.5,
          y: 2.28,
          w: 12,
          h: 0.22,
          fontSize: 7,
          color: T.accent,
        });
      }

      tableY = 2.58;
    }

    const tableData = buildPortfolioTableRows(chunk.rows, T);
    const tableHeight = tableData.length * LAYOUT.tableRowH;

    if (tableY + tableHeight > LAYOUT.contentMaxY) {
      tableY = Math.max(0.9, LAYOUT.contentMaxY - tableHeight - 0.05);
    }

    slide.addTable(tableData, {
      x: 0.45,
      y: tableY,
      w: 12.4,
      colW: [3.2, 0.9, 1, 1, 1, 2.2, 1.1],
      border: { pt: 0.5, color: T.border },
      rowH: LAYOUT.tableRowH,
      autoPage: false,
      valign: 'middle',
    });

    addBrandFooter(slide, pptx, T, pageNum, totalPages);
    pageNum += 1;
  });

  return pageNum;
}

function addKpiSlide(pptx, kpi, index, total, T, pageNum, totalPages) {
  const slide = pptx.addSlide();
  slide.background = { color: T.bg };
  addSlideAccentBar(slide, pptx, T);

  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.45,
    y: 0.18,
    w: 12.4,
    h: 1.05,
    fill: { color: T.bgSlide },
    line: { color: T.border, width: 1 },
    rectRadius: 0.08,
  });

  slide.addShape(pptx.ShapeType.rect, {
    x: 0.45,
    y: 0.18,
    w: 0.08,
    h: 1.05,
    fill: { color: T.purple },
  });

  slide.addText(`KPI ${index + 1} of ${total}`, {
    x: 0.65,
    y: 0.24,
    w: 2.5,
    h: 0.22,
    fontSize: 8,
    color: T.textSoft,
  });

  slide.addText(kpi.kpiName, {
    x: 0.65,
    y: 0.44,
    w: 11.5,
    h: 0.5,
    fontSize: 20,
    color: T.text,
    bold: true,
  });

  if (kpi.displayThreshold != null) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: 10.2,
      y: 0.28,
      w: 2.45,
      h: 0.38,
      fill: { color: T.isLight ? T.statusBelowBg : '3D2618' },
      line: { color: T.orange, width: 0.5 },
      rectRadius: 0.06,
    });
    slide.addText(`Target ${kpi.displayThreshold}%`, {
      x: 10.2,
      y: 0.34,
      w: 2.45,
      h: 0.28,
      fontSize: 9,
      color: T.orange,
      bold: true,
      align: 'center',
    });
  }

  const m = highlightValue(kpi.summary);
  const metricsY = 1.38;
  const metricBoxes = [
    { label: 'Average', value: m.average },
    { label: 'Latest', value: m.latest },
    { label: 'Peak', value: m.peak },
  ];

  metricBoxes.forEach((box, i) => {
    const x = 0.45 + i * 4.1;
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: metricsY,
      w: 3.85,
      h: 0.62,
      fill: { color: T.bgSlide },
      line: { color: T.border, width: 1 },
      rectRadius: 0.08,
    });
    slide.addText(box.label, {
      x: x + 0.14,
      y: metricsY + 0.08,
      w: 3.5,
      h: 0.18,
      fontSize: 7,
      color: T.textSoft,
    });
    slide.addText(String(box.value), {
      x: x + 0.14,
      y: metricsY + 0.28,
      w: 3.5,
      h: 0.28,
      fontSize: 14,
      color: T.accent,
      bold: true,
    });
  });

  const chartY = 2.12;
  const chartH = 4.15;
  const chartW = 12.4;
  const chartX = 0.45;

  slide.addShape(pptx.ShapeType.roundRect, {
    x: chartX,
    y: chartY,
    w: chartW,
    h: chartH,
    fill: { color: T.chartFrame },
    line: { color: T.border, width: 1 },
    rectRadius: 0.1,
  });

  if (kpi.mainChart?.path) {
    slide.addImage({
      path: kpi.mainChart.path,
      x: chartX + 0.1,
      y: chartY + 0.1,
      w: chartW - 0.2,
      h: chartH - 0.2,
    });
  } else {
    slide.addText('Chart not available', {
      x: chartX,
      y: chartY + chartH / 2 - 0.2,
      w: chartW,
      h: 0.4,
      fontSize: 12,
      color: T.textSoft,
      align: 'center',
    });
  }

  if (kpi.summary?.narrative) {
    const narrativeY = chartY + chartH + 0.08;
    if (narrativeY + 0.3 < LAYOUT.contentMaxY) {
      slide.addText(
        kpi.summary.narrative.slice(0, 160) + (kpi.summary.narrative.length > 160 ? '…' : ''),
        {
          x: 0.5,
          y: narrativeY,
          w: 12.2,
          h: 0.28,
          fontSize: 8,
          color: T.textSoft,
          italic: true,
        }
      );
    }
  }

  addBrandFooter(slide, pptx, T, pageNum, totalPages);
}

function addClosingSlide(pptx, T, pageNum, totalPages) {
  const slide = pptx.addSlide();
  slide.background = { color: T.closingBg };

  slide.addShape(pptx.ShapeType.ellipse, {
    x: 8,
    y: 1,
    w: 6,
    h: 6,
    fill: { color: 'FFFFFF', transparency: 92 },
  });

  slide.addText('Thank you', {
    x: 0,
    y: 2.55,
    w: '100%',
    h: 0.75,
    fontSize: 40,
    color: T.closingText,
    bold: true,
    align: 'center',
  });
  slide.addText('Questions & discussion', {
    x: 0,
    y: 3.35,
    w: '100%',
    h: 0.35,
    fontSize: 14,
    color: T.closingText,
    align: 'center',
  });
  slide.addText('BituInsight · Management KPI Reporting', {
    x: 0,
    y: 3.85,
    w: '100%',
    h: 0.3,
    fontSize: 10,
    color: T.closingText,
    align: 'center',
  });

  addBrandFooter(slide, pptx, T, pageNum, totalPages);
}

function countOverviewSlides(rowCount) {
  if (rowCount === 0) return 1;
  if (rowCount <= LAYOUT.rowsFirstSlide) return 1;
  return 1 + Math.ceil((rowCount - LAYOUT.rowsFirstSlide) / LAYOUT.rowsContSlide);
}

async function generateWorkbookPptx(workbookId, userId, options = {}) {
  const { reportIds, thresholds = {}, defaultThreshold, theme: themeOption } = options;
  const themeId = themeOption === 'light' ? 'light' : 'dark';
  const T = createTheme(themeId);

  const workbook = await getWorkbookById(workbookId, userId);
  if (!workbook) throw new Error('Workbook not found');

  let kpiSlides = await fetchWorkbookCharts(workbookId, userId);
  if (kpiSlides.length === 0) {
    throw new Error('No completed KPI charts available for export');
  }

  if (Array.isArray(reportIds) && reportIds.length > 0) {
    const allowed = new Set(reportIds);
    kpiSlides = kpiSlides.filter((k) => allowed.has(k.reportId));
    if (kpiSlides.length === 0) {
      throw new Error('No matching completed KPIs selected for export');
    }
  }

  const deckDefaultThreshold =
    defaultThreshold != null
      ? clampThreshold(defaultThreshold)
      : clampThreshold(workbook.defaultThreshold ?? 99);

  for (const kpi of kpiSlides) {
    const override = thresholds[kpi.reportId];
    const chart = await resolveMainChartForExport(
      kpi,
      override !== undefined ? override : undefined
    );
    kpi.mainChart = chart.path ? { path: chart.path } : null;
    kpi.displayThreshold = chart.threshold;
  }

  const overviewCount = countOverviewSlides(kpiSlides.length);
  const totalPages = 1 + overviewCount + kpiSlides.length + 1;

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'BituInsight';
  pptx.title = `KPI Report — ${workbook.original_filename}`;
  pptx.subject = 'Weekly executive KPI deck';

  let page = 1;
  addCoverSlide(pptx, workbook, kpiSlides, T);
  page += 1;

  page = addExecutiveOverviewSlides(
    pptx,
    workbook,
    kpiSlides,
    deckDefaultThreshold,
    T,
    page,
    totalPages
  );

  kpiSlides.forEach((kpi, index) => {
    addKpiSlide(pptx, kpi, index, kpiSlides.length, T, page, totalPages);
    page += 1;
  });

  addClosingSlide(pptx, T, page, totalPages);

  const themeSuffix = themeId === 'light' ? '_Light' : '_Dark';
  const safeName = (workbook.original_filename || 'workbook')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_');
  const fileName = `BituInsight_KPI_Report${themeSuffix}_${safeName}_${Date.now()}.pptx`;

  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  return { buffer, fileName, slideCount: totalPages, theme: themeId };
}

module.exports = { generateWorkbookPptx, createTheme };
