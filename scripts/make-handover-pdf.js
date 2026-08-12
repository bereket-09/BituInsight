/* Generate the BituInsight client handover PDF. */
const PDFDocument = require('pdfkit');
const fs = require('fs');

const OUT = '/Users/infradev/Documents/Source-codes/BituInsight/BituInsight-Handover.pdf';

const ACCENT = '#632CA6';
const INK = '#1A1A2E';
const MUTED = '#5B6478';
const LINE = '#D8DBE4';
const PANEL = '#F5F3FA';
const WARN_BG = '#FFF6ED';
const WARN_EDGE = '#FF8B3D';

const M = 56; // page margin
const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 54, bottom: 62, left: M, right: M },
  info: {
    Title: 'BituInsight — Client Handover',
    Author: 'BituInsight',
    Subject: 'Platform handover: overview, access details, and credentials',
  },
});
doc.pipe(fs.createWriteStream(OUT));

const W = doc.page.width - M * 2;

function chrome() {
  const { width, height } = doc.page;
  // Page furniture is drawn below the bottom margin. pdfkit would treat that as
  // overflow and add another page — which re-triggers this handler forever — so
  // the margin is dropped for the duration of the draw.
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const savedY = doc.y;
  doc.save();
  doc.rect(0, 0, width, 10).fill(ACCENT);
  doc
    .moveTo(M, height - 44)
    .lineTo(width - M, height - 44)
    .lineWidth(0.5)
    .stroke(LINE);
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(8)
    .text('BituInsight — Client Handover', M, height - 36, {
      width: W,
      align: 'left',
      lineBreak: false,
    })
    .text('13 August 2026', M, height - 36, { width: W, align: 'right', lineBreak: false });
  doc.restore();
  doc.page.margins.bottom = savedBottom;
  doc.y = savedY;
}
chrome();
doc.on('pageAdded', chrome);

function h2(text) {
  if (doc.y > doc.page.height - 170) doc.addPage();
  doc.moveDown(0.9);
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(12.5).text(text, M, doc.y);
  doc.moveDown(0.45);
}

function body(text, opts = {}) {
  doc
    .fillColor(opts.color || INK)
    .font(opts.font || 'Helvetica')
    .fontSize(opts.size || 10)
    .text(text, M, doc.y, { width: W, align: 'left', lineGap: 3.2, ...opts });
  doc.moveDown(0.45);
}

function rule() {
  doc.moveDown(0.3);
  doc.moveTo(M, doc.y).lineTo(M + W, doc.y).lineWidth(0.8).stroke(LINE);
  doc.moveDown(0.6);
}

function bullets(items) {
  const indent = 14;
  for (const item of items) {
    if (doc.y > doc.page.height - 110) doc.addPage();
    const startY = doc.y;
    doc.circle(M + 3.5, startY + 5.2, 1.9).fill(ACCENT);
    doc.fillColor(INK).font('Helvetica').fontSize(10);
    doc.text(item, M + indent, startY, { width: W - indent, lineGap: 3.2 });
    doc.moveDown(0.4);
  }
  doc.moveDown(0.2);
}

/** Two-column label/value table with a shaded label column. */
function kvTable(rows) {
  const labelW = 122;
  const pad = 9;
  const valueW = W - labelW - pad * 2;

  for (const [label, value, mono] of rows) {
    doc.font(mono ? 'Courier-Bold' : 'Helvetica').fontSize(9.5);
    const valueH = doc.heightOfString(value, { width: valueW, lineGap: 2.5 });
    doc.font('Helvetica-Bold').fontSize(9.5);
    const labelH = doc.heightOfString(label, { width: labelW - pad * 2, lineGap: 2.5 });
    const rowH = Math.max(valueH, labelH) + pad * 2;

    if (doc.y + rowH > doc.page.height - 90) doc.addPage();
    const y = doc.y;

    doc.rect(M, y, labelW, rowH).fill(PANEL);
    doc.rect(M, y, W, rowH).lineWidth(0.6).stroke(LINE);

    doc
      .fillColor(MUTED)
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text(label, M + pad, y + pad, { width: labelW - pad * 2, lineGap: 2.5 });

    doc
      .fillColor(INK)
      .font(mono ? 'Courier-Bold' : 'Helvetica')
      .fontSize(9.5)
      .text(value, M + labelW + pad, y + pad, { width: valueW, lineGap: 2.5 });

    doc.y = y + rowH;
  }
  doc.moveDown(0.7);
}

function callout(title, text) {
  const pad = 12;
  const innerW = W - pad * 2 - 4;
  doc.font('Helvetica-Bold').fontSize(9.5);
  const th = doc.heightOfString(title, { width: innerW, lineGap: 2.5 });
  doc.font('Helvetica').fontSize(9.5);
  const bh = doc.heightOfString(text, { width: innerW, lineGap: 3 });
  const h = th + bh + pad * 2 + 5;

  if (doc.y + h > doc.page.height - 90) doc.addPage();
  const y = doc.y;

  doc.rect(M, y, W, h).fill(WARN_BG);
  doc.rect(M, y, 3.5, h).fill(WARN_EDGE);
  doc
    .fillColor(INK)
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .text(title, M + pad + 4, y + pad, { width: innerW, lineGap: 2.5 });
  doc
    .font('Helvetica')
    .fontSize(9.5)
    .text(text, M + pad + 4, doc.y + 3, { width: innerW, lineGap: 3 });

  doc.y = y + h;
  doc.moveDown(0.8);
}

// ---------------------------------------------------------------- content ---

doc.fillColor(INK).font('Helvetica-Bold').fontSize(26).text('BituInsight', M, 68);
doc
  .fillColor(MUTED)
  .font('Helvetica')
  .fontSize(11.5)
  .text('Telecom KPI Analytics Platform  ·  Client Handover', { width: W });
rule();

h2('What this platform does');
body(
  'BituInsight turns raw NetAct KPI exports into reviewed reports. You upload the Excel ' +
    'file exactly as NetAct produces it; the platform validates its structure, computes the ' +
    'KPI, analyses the result statistically, and produces a written summary alongside ' +
    'interactive charts and exports.'
);

h2('What the analysis looks for');
bullets([
  'Spikes and dips, measured against a seasonal baseline — so an evening busy hour is compared with other evenings rather than with 03:00, and an outage (which appears as a dip) is caught rather than ignored.',
  'Sustained level shifts — a step change that persists, which typically indicates a configuration change or rerouted traffic rather than a change in demand.',
  'Trend and forecast, with a confidence measure. Where a trend is only noise, the platform reports it as flat and produces no forecast, instead of projecting a confident line through random variation.',
  'Capacity headroom — busy-period load against a threshold, with a projected saturation date where growth is real.',
  'Data quality — collection gaps, duplicates, flatlined counters, and coverage, scored out of 100. If an export is incomplete, the report says so before drawing conclusions from it.',
]);
body(
  'A clean period is reported as clean. The platform does not manufacture findings to fill the page.'
);

h2('Access details');
kvTable([
  ['Live application', 'https://bituinsight.vercel.app'],
  ['Source code', 'github.com/bereket-09/BituInsight'],
  ['Repository owner', 'bereket-09 — private repository, access granted on request'],
  ['Setup guide', 'SETUP.md, in the repository root'],
]);

h2('Sign-in credentials');
kvTable([
  ['Username', 'admin@bituinsight.local', true],
  ['Password', 'admin123', true],
]);

callout(
  'Change this password before the platform holds real data.',
  'These are the default installation credentials and are documented publicly. The change ' +
    'instructions are in SETUP.md under "Security". The application is currently reachable by ' +
    'anyone who has the link.'
);

h2('Getting started');
bullets([
  'Open the live application link above and sign in with the credentials listed.',
  'Select Upload in the sidebar, choose the KPI type matching your export, and select the file. Sample files are in the samples/ folder of the repository.',
  'Review the preview, then select Upload & Process. The report opens with the executive summary, findings, and charts.',
]);
body(
  'Files must be used exactly as NetAct exports them. Rearranging columns or deleting header ' +
    'rows before upload will cause validation to fail.'
);

h2('Notes on the current deployment');
kvTable([
  ['Hosting', 'Vercel — frontend and API'],
  ['Database', 'Neon managed PostgreSQL'],
  [
    'Upload size',
    'Files up to about 4.5 MB, the hosting platform’s request limit. Larger NetAct exports need a self-hosted install, which has no such cap.',
  ],
  [
    'Charts',
    'Rendered on the server and stored in the database, so they are available in the browser, as image downloads, and embedded in PowerPoint exports. Around 260 KB is kept per report; re-processing a report replaces its images rather than accumulating them.',
  ],
  [
    'AI summaries',
    'Every report includes a written summary computed from the data. Adding an Anthropic API key upgrades this to an AI-authored summary with recommended next steps; it is optional.',
  ],
]);

rule();
doc
  .fillColor(MUTED)
  .font('Helvetica')
  .fontSize(8.5)
  .text(
    'Questions or issues: open an issue at github.com/bereket-09/BituInsight/issues, or contact the project maintainer.',
    M,
    doc.y,
    { width: W, lineGap: 2 }
  );

doc.end();
console.log('PDF written:', OUT);
