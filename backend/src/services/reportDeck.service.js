const PptxGenJS = require('pptxgenjs');

/**
 * Detailed deck for a single report whose KPI is not a success rate — attached
 * users, throughput, traffic volume.
 *
 * The workbook deck is built around a target percentage: health against target,
 * average / latest / peak. For a headcount or a volume none of that exists, so
 * that layout came out as empty boxes and a meaningless "Target 99%". This deck
 * is built from what every report already carries instead: key figures, the
 * analysis and its findings, every stored chart, the workflow's own tables and
 * the projection.
 *
 * Slide chrome (accent bar, footer, closing slide, table cells) comes from the
 * workbook deck through `kit`, so both decks look like one product.
 */

const W = 13.33;
const MARGIN = 0.45;
const CONTENT_W = W - MARGIN * 2;
const TABLE_ROWS_PER_SLIDE = 13;

const SEVERITY = {
  critical: { label: 'Critical', color: 'F85149' },
  major: { label: 'Major', color: 'F0883E' },
  minor: { label: 'Minor', color: '58A6FF' },
  info: { label: 'Note', color: '8B949E' },
};

function compact(value, unit = '') {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  let text;
  if (abs >= 1e6) text = `${(n / 1e6).toFixed(2)}M`;
  else if (abs >= 1e4) text = `${(n / 1e3).toFixed(1)}K`;
  else text = n.toLocaleString('en-US', { maximumFractionDigits: abs >= 100 ? 0 : 1 });
  return unit ? `${text} ${unit}` : text;
}

function clip(text, max) {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function chunk(rows, size) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out.length ? out : [[]];
}

/** Title block shared by every content slide. */
function addHeader(slide, pptx, T, kit, eyebrow, title, subtitle) {
  slide.background = { color: T.bg };
  kit.addSlideAccentBar(slide, pptx, T);
  slide.addText(eyebrow.toUpperCase(), {
    x: MARGIN,
    y: 0.22,
    w: CONTENT_W,
    h: 0.24,
    fontSize: 9,
    color: T.purple,
    bold: true,
    charSpacing: 3,
  });
  slide.addText(title, {
    x: MARGIN,
    y: 0.44,
    w: CONTENT_W,
    h: 0.5,
    fontSize: 22,
    color: T.text,
    bold: true,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: MARGIN,
      y: 0.94,
      w: CONTENT_W,
      h: 0.3,
      fontSize: 10,
      color: T.textSoft,
    });
  }
}

function addTile(slide, pptx, T, { x, y, w, h, label, value, sub, valueColor }) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    fill: { color: T.bgSlide },
    line: { color: T.border, width: 1 },
    rectRadius: 0.08,
  });
  slide.addText(String(label).toUpperCase(), {
    x: x + 0.15,
    y: y + 0.1,
    w: w - 0.3,
    h: 0.22,
    fontSize: 7.5,
    color: T.textSoft,
    bold: true,
    charSpacing: 1.5,
  });
  slide.addText(String(value ?? '—'), {
    x: x + 0.15,
    y: y + 0.34,
    w: w - 0.3,
    h: 0.42,
    fontSize: 18,
    color: valueColor || T.text,
    bold: true,
    fit: 'shrink',
  });
  if (sub) {
    slide.addText(clip(sub, 120), {
      x: x + 0.15,
      y: y + 0.78,
      w: w - 0.3,
      h: h - 0.86,
      fontSize: 8,
      color: T.textSoft,
      valign: 'top',
    });
  }
}

function coverSlide(ctx) {
  const { pptx, T, kpi, report, highlights, scopeLabel } = ctx;
  const slide = pptx.addSlide();
  slide.background = { color: T.bg };
  slide.addShape(pptx.ShapeType.ellipse, {
    x: 9.2,
    y: -1.6,
    w: 5.2,
    h: 5.2,
    fill: { color: T.purple, transparency: T.isLight ? 88 : 84 },
  });
  slide.addShape(pptx.ShapeType.rect, { x: 0.75, y: 0.8, w: 0.1, h: 1.6, fill: { color: T.purple } });
  slide.addText('CORE INSIGHT', {
    x: 1,
    y: 0.78,
    w: 5,
    h: 0.35,
    fontSize: 11,
    color: T.purple,
    bold: true,
    charSpacing: 6,
  });
  slide.addText(ctx.workflowName, {
    x: 1,
    y: 1.15,
    w: 11,
    h: 0.8,
    fontSize: 38,
    color: T.text,
    bold: true,
  });
  slide.addText('KPI report', { x: 1, y: 1.9, w: 8, h: 0.4, fontSize: 16, color: T.textSoft });

  slide.addText(
    [
      { text: 'Period  ', options: { color: T.textSoft } },
      { text: scopeLabel || '—', options: { color: T.text, bold: true } },
      { text: '\nSource  ', options: { color: T.textSoft } },
      { text: report.original_filename || '—', options: { color: T.text } },
      { text: '\nProcessed  ', options: { color: T.textSoft } },
      { text: new Date(report.created_at || Date.now()).toLocaleString('en-GB'), options: { color: T.text } },
    ],
    { x: 1, y: 2.75, w: 11, h: 1.1, fontSize: 11, valign: 'top' }
  );

  // Headline figures on the cover: the first three after the time span.
  const lead = highlights.filter((h) => h.label !== 'Time span').slice(0, 3);
  lead.forEach((h, i) => {
    addTile(slide, pptx, T, {
      x: 1 + i * 3.85,
      y: 4.25,
      w: 3.6,
      h: 1.35,
      label: h.label,
      value: h.value,
      sub: h.sub,
      valueColor: T.purple,
    });
  });
  ctx.kit.addBrandFooter(slide, pptx, T, ctx.page(), ctx.totalPages);
  return slide;
}

function keyFiguresSlide(ctx) {
  const { pptx, T, highlights } = ctx;
  const slide = pptx.addSlide();
  addHeader(slide, pptx, T, ctx.kit, 'At a glance', 'Key figures', ctx.scopeLabel);
  const cols = 4;
  const tileW = (CONTENT_W - (cols - 1) * 0.2) / cols;
  const rows = Math.ceil(highlights.length / cols);
  const tileH = Math.min(1.25, (5.2 - (rows - 1) * 0.18) / Math.max(rows, 1));
  highlights.slice(0, 16).forEach((h, i) => {
    addTile(slide, pptx, T, {
      x: MARGIN + (i % cols) * (tileW + 0.2),
      y: 1.4 + Math.floor(i / cols) * (tileH + 0.18),
      w: tileW,
      h: tileH,
      label: h.label,
      value: h.value,
      sub: h.sub,
    });
  });
  ctx.kit.addBrandFooter(slide, pptx, T, ctx.page(), ctx.totalPages);
}

function summarySlide(ctx) {
  const { pptx, T, narrative } = ctx;
  const slide = pptx.addSlide();
  const author =
    narrative.source === 'model' ? `Written by ${narrative.provider || 'model'}` : 'Computed from the data';
  addHeader(slide, pptx, T, ctx.kit, 'Executive summary', 'What the data says', author);

  slide.addShape(pptx.ShapeType.roundRect, {
    x: MARGIN,
    y: 1.4,
    w: CONTENT_W,
    h: 1.55,
    fill: { color: T.bgSlide },
    line: { color: T.border, width: 1 },
    rectRadius: 0.08,
  });
  slide.addShape(pptx.ShapeType.rect, { x: MARGIN, y: 1.4, w: 0.07, h: 1.55, fill: { color: T.purple } });
  slide.addText(clip(narrative.summary, 620), {
    x: MARGIN + 0.25,
    y: 1.5,
    w: CONTENT_W - 0.4,
    h: 1.35,
    fontSize: 13,
    color: T.text,
    valign: 'middle',
    fit: 'shrink',
  });

  const colW = (CONTENT_W - 0.3) / 2;
  const list = (items, x, title) => {
    slide.addText(title.toUpperCase(), {
      x,
      y: 3.2,
      w: colW,
      h: 0.26,
      fontSize: 9,
      color: T.purple,
      bold: true,
      charSpacing: 2,
    });
    slide.addText(
      items.length
        ? items.map((t) => ({ text: clip(t, 220), options: { bullet: { indent: 14 }, breakLine: true } }))
        : [{ text: 'Nothing to add for this period.', options: { color: T.textSoft } }],
      { x, y: 3.5, w: colW, h: 2.9, fontSize: 11, color: T.text, valign: 'top', paraSpaceAfter: 6, fit: 'shrink' }
    );
  };
  // When the analysis found nothing to flag, the headline figures are the key points.
  const keyPoints = narrative.keyPoints?.length
    ? narrative.keyPoints
    : ctx.highlights
        .filter((h) => h.label !== 'Time span')
        .slice(0, 6)
        .map((h) => `${h.label}: ${h.value}${h.sub ? ` (${h.sub})` : ''}`);
  const nextSteps = narrative.recommendations?.length
    ? narrative.recommendations
    : ['No action needed — all checks are clear for this period.'];
  list(keyPoints, MARGIN, 'Key points');
  list(nextSteps, MARGIN + colW + 0.3, 'Recommended next steps');
  ctx.kit.addBrandFooter(slide, pptx, T, ctx.page(), ctx.totalPages);
}

function analysisSlide(ctx) {
  const { pptx, T, intelligence: intel, unit } = ctx;
  const slide = pptx.addSlide();
  const scope = intel.scope || {};
  addHeader(
    slide,
    pptx,
    T,
    ctx.kit,
    'Analysis',
    'Data quality, trend and load',
    scope.pointCount ? `${scope.pointCount} ${String(scope.cadenceLabel || '').toLowerCase()} readings over ${scope.spanLabel}` : null
  );

  const q = intel.dataQuality || {};
  const t = intel.trend || {};
  const c = intel.capacity || {};
  const d = intel.dailyShape;
  const change = t.changeFromStartPct ?? t.totalChangePct;
  const tiles = [
    {
      label: 'Data quality',
      value: `${q.score ?? '—'}/100`,
      sub: `${q.grade || 'unknown'} · ${q.coveragePct ?? 0}% of expected readings arrived`,
    },
    t.available && t.direction !== 'flat'
      ? {
          label: 'Trend',
          value: `${change > 0 ? '+' : ''}${change}%`,
          sub:
            t.startLevel != null
              ? `${compact(t.startLevel, unit)} → ${compact(t.endLevel, unit)} over ${t.spanDays} days`
              : `${t.slopePerDayPct}% per day over ${t.spanDays} days`,
        }
      : { label: 'Trend', value: 'No clear trend', sub: t.available ? `level held over ${t.spanDays} days` : 'not enough data' },
    {
      label: 'Busiest periods',
      value: compact(c.planningPeak, unit),
      sub:
        c.utilizationPct != null
          ? `${c.utilizationPct}% of the ${compact(c.threshold, unit)} limit`
          : `top 5% of readings · ${c.peakToTypicalRatio ?? '—'}× the usual ${compact(c.typical, unit)}`,
    },
    {
      label: 'Busiest hour',
      value: d?.busiest?.label || '—',
      sub: d ? `usually ~${compact(d.busiest.median, unit)} · quietest ${d.quietest.label} (~${compact(d.quietest.median, unit)})` : 'needs hourly data',
    },
  ];
  const tileW = (CONTENT_W - 3 * 0.2) / 4;
  tiles.forEach((tile, i) =>
    addTile(slide, pptx, T, { x: MARGIN + i * (tileW + 0.2), y: 1.4, w: tileW, h: 1.3, ...tile })
  );

  const findings = intel.findings || [];
  slide.addText('FINDINGS', {
    x: MARGIN,
    y: 2.95,
    w: 4,
    h: 0.26,
    fontSize: 9,
    color: T.purple,
    bold: true,
    charSpacing: 2,
  });
  if (!findings.length) {
    slide.addText('All checks clear — no unusual spikes, dips, trend changes or data gaps in this period.', {
      x: MARGIN,
      y: 3.25,
      w: CONTENT_W,
      h: 0.4,
      fontSize: 12,
      color: T.text,
    });
  } else {
    const rows = [
      [ctx.kit.makeHeaderCell(T, 'Severity'), ctx.kit.makeHeaderCell(T, 'Finding'), ctx.kit.makeHeaderCell(T, 'Detail')],
      ...findings.slice(0, 6).map((f, i) => {
        const sev = SEVERITY[f.severity] || SEVERITY.info;
        const fill = { color: i % 2 ? T.rowOdd : T.rowEven };
        return [
          ctx.kit.makeCell(T, sev.label, { bold: true, color: sev.color, fill }),
          ctx.kit.makeCell(T, clip(f.title, 90), { bold: true, fill }),
          ctx.kit.makeCell(T, clip(f.detail, 240), { color: T.textSoft, fill }),
        ];
      }),
    ];
    slide.addTable(rows, {
      x: MARGIN,
      y: 3.25,
      w: CONTENT_W,
      colW: [1.1, 3.6, CONTENT_W - 4.7],
      fontSize: 8,
      border: { type: 'solid', color: T.border, pt: 0.5 },
      autoPage: false,
    });
  }
  ctx.kit.addBrandFooter(slide, pptx, T, ctx.page(), ctx.totalPages);
}

function chartSlide(ctx, chart, index, total) {
  const { pptx, T } = ctx;
  const slide = pptx.addSlide();
  addHeader(slide, pptx, T, ctx.kit, `Chart ${index + 1} of ${total}`, chart.title || 'Chart', null);
  const y = 1.1;
  const h = 5.45;
  slide.addShape(pptx.ShapeType.roundRect, {
    x: MARGIN,
    y,
    w: CONTENT_W,
    h,
    fill: { color: T.chartFrame },
    line: { color: T.border, width: 1 },
    rectRadius: 0.08,
  });
  // Charts render at roughly 2.1:1; fit inside the frame without stretching.
  const maxW = CONTENT_W - 0.3;
  const maxH = h - 0.3;
  const imgW = Math.min(maxW, maxH * 2.08);
  const imgH = imgW / 2.08;
  slide.addImage({
    ...(chart.data ? { data: chart.data } : { path: chart.path }),
    x: MARGIN + (CONTENT_W - imgW) / 2,
    y: y + (h - imgH) / 2,
    w: imgW,
    h: imgH,
  });
  ctx.kit.addBrandFooter(slide, pptx, T, ctx.page(), ctx.totalPages);
}

function tableSlide(ctx, table, rows, part, parts) {
  const { pptx, T, kit } = ctx;
  const slide = pptx.addSlide();
  addHeader(
    slide,
    pptx,
    T,
    kit,
    parts > 1 ? `Data · part ${part} of ${parts}` : 'Data',
    table.title,
    table.subtitle
  );
  const align = table.align || [];
  const body = [
    table.columns.map((c, i) => ({ ...kit.makeHeaderCell(T, c), options: { ...kit.makeHeaderCell(T, c).options, align: align[i] || 'center' } })),
    ...rows.map((r, ri) =>
      r.map((cell, ci) =>
        kit.makeCell(T, cell, {
          align: align[ci] || 'left',
          fill: { color: ri % 2 ? T.rowOdd : T.rowEven },
          fontSize: 9,
          bold: ci === 0,
        })
      )
    ),
  ];
  slide.addTable(body, {
    x: MARGIN,
    y: 1.4,
    w: CONTENT_W,
    rowH: 0.36,
    border: { type: 'solid', color: T.border, pt: 0.5 },
    autoPage: false,
  });
  kit.addBrandFooter(slide, pptx, T, ctx.page(), ctx.totalPages);
}

function projectionSlide(ctx) {
  const { intelligence: intel, unit } = ctx;
  const f = intel.forecast;
  tableSlide(
    ctx,
    {
      title: `If the current trend continues · next ${f.horizon} ${f.unitLabel}s`,
      subtitle:
        'Extends the trend forward. "Expected" is where the line points; the range is where the value should land 19 times out of 20, given how much it has swung so far.',
      columns: ['Date', 'Expected', 'Likely range'],
      align: ['left', 'right', 'right'],
    },
    f.projections.map((p) => [p.date, compact(p.value, unit), `${compact(p.low, unit)} – ${compact(p.high, unit)}`]),
    1,
    1
  );
}

/**
 * @param {Object} args
 * @param {Object} args.kpi     { kpiName, summary, reportData, charts, workflowSlug }
 * @param {Object} args.report  { original_filename, created_at }
 * @param {Object} args.workflow  the workflow module (for exportTables)
 * @param {Object} args.T       theme
 * @param {Object} args.kit     slide helpers from the workbook deck
 */
async function buildReportDeck({ kpi, report, workflow, T, themeId, kit }) {
  const summary = kpi.summary || {};
  const calculated = kpi.reportData?.calculated || {};
  const intelligence = summary.intelligence?.available ? summary.intelligence : null;
  const highlights = summary.highlights || [];
  const charts = (kpi.charts || []).filter((c) => c.data || c.path);
  const tables = typeof workflow?.exportTables === 'function' ? workflow.exportTables(calculated) : [];
  const unit = intelligence?.unit || calculated.metrics?.unit || '';
  const narrative = intelligence?.narrative?.summary
    ? intelligence.narrative
    : { source: 'deterministic', summary: summary.narrative || '', keyPoints: [], recommendations: [] };

  const plan = [];
  plan.push((ctx) => coverSlide(ctx));
  if (highlights.length) plan.push((ctx) => keyFiguresSlide(ctx));
  if (narrative.summary) plan.push((ctx) => summarySlide(ctx));
  if (intelligence) plan.push((ctx) => analysisSlide(ctx));
  charts.forEach((chart, i) => plan.push((ctx) => chartSlide(ctx, chart, i, charts.length)));
  for (const table of tables) {
    const parts = chunk(table.rows, TABLE_ROWS_PER_SLIDE);
    parts.forEach((rows, i) => plan.push((ctx) => tableSlide(ctx, table, rows, i + 1, parts.length)));
  }
  if (intelligence?.forecast?.available) plan.push((ctx) => projectionSlide(ctx));

  const totalPages = plan.length + 1;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Core Insight';
  pptx.title = `${workflow?.name || kpi.kpiName} — ${report.original_filename || ''}`;
  pptx.subject = 'KPI report';

  let pageNum = 0;
  const ctx = {
    pptx,
    T,
    kit,
    kpi,
    report,
    highlights,
    narrative,
    intelligence,
    unit,
    totalPages,
    workflowName: workflow?.name || kpi.kpiName,
    scopeLabel: summary.timeContext?.span || calculated.timeSeries?.detected?.spanLabel || '',
    page: () => pageNum,
  };
  for (const step of plan) {
    pageNum += 1;
    step(ctx);
  }
  pageNum += 1;
  kit.addClosingSlide(pptx, T, pageNum, totalPages);

  const safeName = (report.original_filename || 'report')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_');
  const fileName = `Core Insight_${(workflow?.name || 'KPI').replace(/\s+/g, '_')}${
    themeId === 'light' ? '_Light' : '_Dark'
  }_${safeName}_${Date.now()}.pptx`;
  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  return { buffer, fileName, slideCount: totalPages, theme: themeId };
}

module.exports = { buildReportDeck };
