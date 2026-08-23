/**
 * Core Insight — stakeholder presentation.
 *
 * Mixed audience: NOC engineers who need to trust the method, and leadership who
 * need the outcome. Every figure here is measured from a real run against the
 * NetAct sample, not illustrative.
 */
const PptxGenJS = require('../backend/node_modules/pptxgenjs');
const fs = require('fs');

const OUT = __dirname + '/../CoreInsight-Overview.pptx';
const CHART = '/tmp/deck-assets/deck_cmg-throughput-lines.png';

const GREEN = '00B140';
const GREEN_DK = '00863'.padEnd(6, '1');
const INK = '0F1724';
const MUTED = '5B6478';
const LINE = 'DDE3EA';
const WASH = 'F4FAF6';
const WHITE = 'FFFFFF';

const W = 13.333;
const H = 7.5;
const MX = 0.85; // horizontal margin

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Core Insight';
pptx.title = 'Core Insight — Telecom KPI Analytics';
pptx.subject = 'Platform overview for team and stakeholders';

let pageNo = 0;

/** Standard content slide: green rule, title, optional kicker, footer. */
function slide({ title, kicker, dark = false } = {}) {
  const s = pptx.addSlide();
  s.background = { color: dark ? INK : WHITE };
  pageNo += 1;

  if (title) {
    if (kicker) {
      s.addText(kicker.toUpperCase(), {
        x: MX, y: 0.46, w: W - MX * 2, h: 0.26,
        fontFace: 'Arial', fontSize: 11, bold: true, color: GREEN, charSpacing: 1.6,
      });
    }
    s.addText(title, {
      x: MX, y: kicker ? 0.74 : 0.6, w: W - MX * 2, h: 0.7,
      fontFace: 'Arial', fontSize: 30, bold: true, color: dark ? WHITE : INK,
    });
    s.addShape(pptx.ShapeType.rect, {
      x: MX, y: kicker ? 1.46 : 1.32, w: 0.9, h: 0.055, fill: { color: GREEN },
    });
  }

  s.addText(`Core Insight  ·  ${pageNo}`, {
    x: MX, y: H - 0.52, w: W - MX * 2, h: 0.26,
    fontFace: 'Arial', fontSize: 9, color: dark ? '6B7684' : MUTED, align: 'right',
  });
  return s;
}

/** Metric card with a big number. */
function statCard(s, { x, y, w, h, value, label, sub, accent = GREEN }) {
  s.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.06,
    fill: { color: WASH }, line: { color: LINE, width: 1 },
  });
  s.addText(value, {
    x: x + 0.22, y: y + 0.2, w: w - 0.44, h: 0.62,
    fontFace: 'Arial', fontSize: 30, bold: true, color: accent,
  });
  s.addText(label, {
    x: x + 0.22, y: y + 0.82, w: w - 0.44, h: 0.3,
    fontFace: 'Arial', fontSize: 12.5, bold: true, color: INK,
  });
  if (sub) {
    s.addText(sub, {
      x: x + 0.22, y: y + 1.12, w: w - 0.44, h: 0.5,
      fontFace: 'Arial', fontSize: 10.5, color: MUTED,
    });
  }
}

/** Numbered point with heading + body. */
function point(s, { x, y, w, n, head, body }) {
  s.addShape(pptx.ShapeType.ellipse, {
    x, y: y + 0.02, w: 0.34, h: 0.34, fill: { color: GREEN },
  });
  s.addText(String(n), {
    x, y: y + 0.02, w: 0.34, h: 0.34,
    fontFace: 'Arial', fontSize: 12, bold: true, color: WHITE, align: 'center', valign: 'middle',
  });
  s.addText(head, {
    x: x + 0.5, y, w: w - 0.5, h: 0.32,
    fontFace: 'Arial', fontSize: 15, bold: true, color: INK,
  });
  s.addText(body, {
    x: x + 0.5, y: y + 0.33, w: w - 0.5, h: 0.8,
    fontFace: 'Arial', fontSize: 12, color: MUTED, lineSpacingMultiple: 1.2, valign: 'top',
  });
}

// ---------------------------------------------------------------- 1. Title ---
{
  const s = pptx.addSlide();
  s.background = { color: INK };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.16, fill: { color: GREEN } });
  s.addText('Core Insight', {
    x: MX, y: 2.35, w: W - MX * 2, h: 1.0,
    fontFace: 'Arial', fontSize: 52, bold: true, color: WHITE,
  });
  s.addText('Turning NetAct KPI exports into decisions', {
    x: MX, y: 3.4, w: W - MX * 2, h: 0.5,
    fontFace: 'Arial', fontSize: 20, color: '9AA7B4',
  });
  s.addShape(pptx.ShapeType.rect, { x: MX, y: 4.15, w: 1.1, h: 0.06, fill: { color: GREEN } });
  s.addText('Platform overview  ·  For the Core team, leadership and business stakeholders', {
    x: MX, y: 4.5, w: W - MX * 2, h: 0.4,
    fontFace: 'Arial', fontSize: 12.5, color: '6B7684',
  });
}

// ------------------------------------------------------- 2. Problem framing ---
{
  const s = slide({ kicker: 'Why we built it', title: 'KPI reporting was manual, slow and inconsistent' });
  const y = 2.1;
  const w = 3.6;
  const gap = 0.42;
  const items = [
    ['Hours, not minutes', 'Each NetAct export was opened by hand, filtered, charted and pasted into a deck — repeated per KPI, per week.'],
    ['Two people, two answers', 'The same export could be summarised differently depending on who prepared it and what they chose to highlight.'],
    ['Problems found late', 'A dip at 03:00 or a slow upward creep is easy to miss by eye, so issues surfaced after they had already cost something.'],
  ];
  items.forEach(([head, body], i) => {
    const x = MX + i * (w + gap);
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w, h: 2.3, rectRadius: 0.06, fill: { color: WHITE }, line: { color: LINE, width: 1 },
    });
    s.addShape(pptx.ShapeType.rect, { x, y, w: 0.055, h: 2.3, fill: { color: GREEN } });
    s.addText(head, {
      x: x + 0.3, y: y + 0.3, w: w - 0.6, h: 0.4,
      fontFace: 'Arial', fontSize: 16, bold: true, color: INK,
    });
    s.addText(body, {
      x: x + 0.3, y: y + 0.8, w: w - 0.6, h: 1.3,
      fontFace: 'Arial', fontSize: 12, color: MUTED, lineSpacingMultiple: 1.25,
    });
  });
  s.addText('The data was never the problem. Getting a consistent answer out of it was.', {
    x: MX, y: 4.85, w: W - MX * 2, h: 0.4,
    fontFace: 'Arial', fontSize: 15, italic: true, color: INK,
  });
}

// ------------------------------------------------------------- 3. What it is ---
{
  const s = slide({ kicker: 'What it is', title: 'One place where an export becomes a reviewed report' });
  s.addText(
    'You upload the Excel file exactly as NetAct produces it. Core Insight checks the file is what it claims to be, computes the KPI, analyses the result statistically, and writes the summary — with charts and exports ready to share.',
    { x: MX, y: 1.95, w: W - MX * 2, h: 0.9, fontFace: 'Arial', fontSize: 15, color: MUTED, lineSpacingMultiple: 1.3 }
  );

  const steps = ['Upload', 'Validate', 'Analyse', 'Report', 'Share'];
  const notes = ['NetAct file,\nunchanged', 'Structure and\ncolumns checked', 'Baselines, trends,\nquality', 'Charts and a\nwritten summary', 'PowerPoint,\nTeams, download'];
  const bw = 2.24;
  const bgap = 0.28;
  const by = 3.15;
  steps.forEach((label, i) => {
    const x = MX + i * (bw + bgap);
    const isLast = i === steps.length - 1;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y: by, w: bw, h: 1.5, rectRadius: 0.06,
      fill: { color: isLast ? GREEN : WASH }, line: { color: isLast ? GREEN : LINE, width: 1 },
    });
    s.addText(label, {
      x, y: by + 0.24, w: bw, h: 0.36,
      fontFace: 'Arial', fontSize: 15, bold: true, color: isLast ? WHITE : INK, align: 'center',
    });
    s.addText(notes[i], {
      x: x + 0.12, y: by + 0.66, w: bw - 0.24, h: 0.7,
      fontFace: 'Arial', fontSize: 10.5, color: isLast ? 'E6F6EC' : MUTED, align: 'center', lineSpacingMultiple: 1.15,
    });
    if (!isLast) {
      s.addText('›', {
        x: x + bw, y: by + 0.5, w: bgap, h: 0.4,
        fontFace: 'Arial', fontSize: 20, bold: true, color: LINE, align: 'center',
      });
    }
  });
  s.addText('No new tool for the engineers to learn, and no reformatting of the export beforehand.', {
    x: MX, y: 5.0, w: W - MX * 2, h: 0.4, fontFace: 'Arial', fontSize: 12.5, color: MUTED,
  });
}

// --------------------------------------------------------- 4. Measured run ---
{
  const s = slide({ kicker: 'Measured, not estimated', title: 'A three-day export, end to end' });
  s.addText('Figures below are from an actual run on a real NetAct CMG export, on the live deployment.', {
    x: MX, y: 1.95, w: W - MX * 2, h: 0.35, fontFace: 'Arial', fontSize: 13, color: MUTED,
  });
  const w = 2.72;
  const gap = 0.3;
  const y = 2.6;
  const cards = [
    ['3,456', 'rows ingested', 'raw CMG measurements'],
    ['288', 'periods analysed', '15-minute resolution'],
    ['4', 'charts generated', 'rendered server-side'],
    ['~5 sec', 'upload to report', 'including the written summary'],
  ];
  cards.forEach(([v, l, sub], i) => {
    statCard(s, { x: MX + i * (w + gap), y, w, h: 1.75, value: v, label: l, sub });
  });
  s.addText(
    'The same file, prepared by hand, was a morning of work — and produced a summary that depended on who wrote it.',
    { x: MX, y: 4.75, w: W - MX * 2, h: 0.5, fontFace: 'Arial', fontSize: 14, color: INK }
  );
}

// ------------------------------------------------------- 5. What it detects ---
{
  const s = slide({ kicker: 'What the analysis looks for', title: 'Five questions, answered on every upload' });
  const col = 5.6;
  const items = [
    ['Is anything unusual?', 'Spikes and dips judged against what that hour of day normally looks like — so a busy evening is not an alarm, but a quiet 03:00 is.'],
    ['Has something changed for good?', 'A step change that persists, which usually means a configuration change or rerouted traffic rather than demand.'],
    ['Where is this heading?', 'A trend with a confidence measure, and a forecast only when the trend is real.'],
    ['Are we running out of room?', 'Busy-period load against the target, with a projected date if growth is genuine.'],
    ['Can we trust this export?', 'Collection gaps, duplicates and stuck counters, scored out of 100 before any conclusion is drawn.'],
  ];
  items.forEach(([head, body], i) => {
    const x = i < 3 ? MX : MX + col + 0.6;
    const y = 2.02 + (i % 3) * 1.32;
    point(s, { x, y, w: col, n: i + 1, head, body });
  });
}

// ------------------------------------------------------------ 6. Trust slide ---
{
  const s = slide({ kicker: 'For the sceptics in the room', title: 'Why the findings are worth acting on' });
  const rows = [
    ['Compared like with like', 'Every point is judged against its own hour-of-day baseline, not a flat average. Busy hours stop looking like incidents.'],
    ['Two bars, not one', 'A point must be both statistically unusual and materially different. A 9% wobble in a quiet bucket is not raised as major.'],
    ['Honest about weak signals', 'Where a trend explains little of the variation it is reported as flat and no forecast is produced, instead of drawing a confident line through noise.'],
    ['Silence is a result', 'A clean period is reported as clean. The platform does not manufacture findings to look useful.'],
  ];
  let y = 2.05;
  rows.forEach(([head, body]) => {
    s.addShape(pptx.ShapeType.rect, { x: MX, y: y + 0.06, w: 0.055, h: 0.72, fill: { color: GREEN } });
    s.addText(head, {
      x: MX + 0.28, y, w: 4.3, h: 0.4, fontFace: 'Arial', fontSize: 14.5, bold: true, color: INK,
    });
    s.addText(body, {
      x: MX + 4.7, y, w: W - MX - 4.7 - MX, h: 0.8,
      fontFace: 'Arial', fontSize: 12, color: MUTED, lineSpacingMultiple: 1.2, valign: 'top',
    });
    y += 1.02;
  });
}

// ----------------------------------------------------------- 7. Real output ---
{
  const s = slide({ kicker: 'Real output', title: 'What a finished report shows' });
  if (fs.existsSync(CHART)) {
    s.addShape(pptx.ShapeType.roundRect, {
      x: MX, y: 1.95, w: 7.9, h: 3.75, rectRadius: 0.06, fill: { color: INK }, line: { color: LINE, width: 1 },
    });
    s.addImage({ path: CHART, x: MX + 0.12, y: 2.07, w: 7.66, h: 3.51 });
  }
  const px = MX + 8.25;
  const pw = W - px - MX;
  s.addText('Written summary', {
    x: px, y: 1.95, w: pw, h: 0.3, fontFace: 'Arial', fontSize: 12, bold: true, color: GREEN,
  });
  s.addText(
    '"Data throughput across 3 days at 15-minute resolution (288 periods). Typical level 247 Gbps, busy-period peak 383 Gbps. No anomalies, trend, or data-quality issues detected in this period."',
    { x: px, y: 2.3, w: pw, h: 1.7, fontFace: 'Arial', fontSize: 11.5, italic: true, color: INK, lineSpacingMultiple: 1.25 }
  );
  s.addShape(pptx.ShapeType.roundRect, {
    x: px, y: 4.1, w: pw, h: 1.6, rectRadius: 0.06, fill: { color: WASH }, line: { color: LINE, width: 1 },
  });
  s.addText('Data quality  100 / 100', {
    x: px + 0.2, y: 4.28, w: pw - 0.4, h: 0.3, fontFace: 'Arial', fontSize: 13, bold: true, color: GREEN,
  });
  s.addText('100% of expected data points present.\nBusiest hour 23:00, quietest 07:00.\nNothing flagged — a verified clean period,\nnot an unchecked one.', {
    x: px + 0.2, y: 4.6, w: pw - 0.4, h: 1.0, fontFace: 'Arial', fontSize: 10.5, color: MUTED, lineSpacingMultiple: 1.2,
  });
}

// -------------------------------------------------------- 8. Business value ---
{
  const s = slide({ kicker: 'What it is worth', title: 'For the business' });
  const w = 5.6;
  const items = [
    ['Reporting time collapses', 'A task measured in hours becomes one measured in seconds, repeatable by anyone on the team.'],
    ['One version of the truth', 'The same file always produces the same summary, with the numbers behind every statement.'],
    ['Problems surface earlier', 'Dips, step changes and slow growth are caught while they are still cheap to fix.'],
    ['Decisions are auditable', 'Every report keeps its data, its charts and its reasoning, so a conclusion can be checked months later.'],
  ];
  items.forEach(([head, body], i) => {
    const x = i % 2 === 0 ? MX : MX + w + 0.6;
    const y = 2.1 + Math.floor(i / 2) * 1.6;
    s.addShape(pptx.ShapeType.roundRect, {
      x, y, w, h: 1.35, rectRadius: 0.06, fill: { color: WASH }, line: { color: LINE, width: 1 },
    });
    s.addText(head, {
      x: x + 0.3, y: y + 0.22, w: w - 0.6, h: 0.34, fontFace: 'Arial', fontSize: 15, bold: true, color: INK,
    });
    s.addText(body, {
      x: x + 0.3, y: y + 0.6, w: w - 0.6, h: 0.62, fontFace: 'Arial', fontSize: 11.5, color: MUTED, lineSpacingMultiple: 1.2,
    });
  });
  s.addText('None of this asks the team to change how they export data.', {
    x: MX, y: 5.5, w: W - MX * 2, h: 0.4, fontFace: 'Arial', fontSize: 13, italic: true, color: MUTED,
  });
}

// ------------------------------------------------------------ 9. Team value ---
{
  const s = slide({ kicker: 'What it is worth', title: 'For the Core team' });
  const rows = [
    ['New KPIs without a rewrite', 'Each KPI is a self-contained module — validation, transformation, metrics and charts — added without touching the others.'],
    ['Exports that are already formatted', 'PowerPoint decks, chart images and JSON, generated from the report rather than rebuilt by hand.'],
    ['Delivery where people already are', 'Reports can be pushed to Microsoft Teams instead of waiting to be opened.'],
    ['Open to other tools, safely', 'A read-only interface lets AI assistants and scripts query reports and findings — query only, never write.'],
  ];
  let y = 2.1;
  rows.forEach(([head, body]) => {
    s.addShape(pptx.ShapeType.ellipse, { x: MX, y: y + 0.08, w: 0.16, h: 0.16, fill: { color: GREEN } });
    s.addText(head, { x: MX + 0.4, y, w: 4.6, h: 0.36, fontFace: 'Arial', fontSize: 14.5, bold: true, color: INK });
    s.addText(body, {
      x: MX + 5.2, y, w: W - MX - 5.2 - MX, h: 0.8, fontFace: 'Arial', fontSize: 12, color: MUTED, lineSpacingMultiple: 1.2, valign: 'top',
    });
    y += 1.02;
  });
}

// ------------------------------------------------------------- 10. Roadmap ---
{
  const s = slide({ kicker: 'Where it goes next', title: 'Live today, and what follows' });
  const cols = [
    ['Live now', GREEN, [
      'Two KPI workflows plus CMM workbooks',
      'Seasonal anomaly detection and forecasting',
      'Server-rendered charts, stored durably',
      'PowerPoint, JSON and image exports',
      'Deployed and reachable by the team',
    ]],
    ['In build', '9AA7B4', [
      'Read-only interface for AI assistants',
      'KPI definitions held in the database',
      'Assisted KPI creation, reviewed before import',
    ]],
    ['Being considered', 'C4CCD4', [
      'Scheduled and automated reporting',
      'Alerting on findings, not just reports',
      'Cross-KPI correlation',
    ]],
  ];
  const w = 3.85;
  cols.forEach(([head, color, items], i) => {
    const x = MX + i * (w + 0.36);
    s.addShape(pptx.ShapeType.rect, { x, y: 2.05, w, h: 0.055, fill: { color } });
    s.addText(head, {
      x, y: 2.2, w, h: 0.4, fontFace: 'Arial', fontSize: 16, bold: true, color: INK,
    });
    items.forEach((it, j) => {
      s.addText('•', { x, y: 2.75 + j * 0.62, w: 0.2, h: 0.3, fontFace: 'Arial', fontSize: 12, color, valign: 'top' });
      s.addText(it, {
        x: x + 0.22, y: 2.75 + j * 0.62, w: w - 0.22, h: 0.6,
        fontFace: 'Arial', fontSize: 11.5, color: MUTED, lineSpacingMultiple: 1.15, valign: 'top',
      });
    });
  });
}

// --------------------------------------------------------------- 11. Close ---
{
  const s = pptx.addSlide();
  s.background = { color: INK };
  pageNo += 1;
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.16, fill: { color: GREEN } });
  s.addText('See it for yourself', {
    x: MX, y: 2.1, w: W - MX * 2, h: 0.8, fontFace: 'Arial', fontSize: 38, bold: true, color: WHITE,
  });
  s.addText('The platform is running now. Bring a NetAct export and we can process it in the session.', {
    x: MX, y: 3.0, w: W - MX * 2, h: 0.5, fontFace: 'Arial', fontSize: 15, color: '9AA7B4',
  });
  s.addShape(pptx.ShapeType.roundRect, {
    x: MX, y: 3.85, w: 6.4, h: 1.35, rectRadius: 0.06, fill: { color: '17202B' }, line: { color: '2A3441', width: 1 },
  });
  s.addText('bituinsight.vercel.app', {
    x: MX + 0.3, y: 4.05, w: 5.8, h: 0.4, fontFace: 'Arial', fontSize: 17, bold: true, color: GREEN,
  });
  s.addText('Ask for an account — access is granted per person.', {
    x: MX + 0.3, y: 4.5, w: 5.8, h: 0.5, fontFace: 'Arial', fontSize: 11.5, color: '9AA7B4',
  });
  s.addText('Questions — and what you would want it to answer next.', {
    x: MX, y: 5.45, w: W - MX * 2, h: 0.5, fontFace: 'Arial', fontSize: 14, color: '9AA7B4',
  });
}

(async () => {
  await pptx.writeFile({ fileName: OUT });
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`DECK: ${OUT} (${kb} KB, ${pageNo + 1} slides)`);
})();
