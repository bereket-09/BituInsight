const { loadWorkbook } = require('../../utils/workbookLoader');
const { readSheetRows } = require('../../services/excelParser.service');

/**
 * Reader for a NetAct "success ratio" workbook — one that carries many
 * percentage KPIs, each on its own "Data for …" sheet.
 *
 * Both the Basic PS KPIs SR export (22 KPIs) and the Basic CS KPIs SR export
 * (4 KPIs) have this shape, so the reader is written once and configured twice.
 *
 * Each data sheet is: a header row, a NetAct field-code row, then
 *
 *   Period start time | (grouping label…) | <entity> name | value
 *
 * Three things about those sheets are not safe to assume:
 *
 *  - **The entity column is not always "CMM name".** The PS workbook alone uses
 *    CMM name, SPS name, CMG name and HSS name, and the HSS sheet carries two
 *    label columns ("IMSNFM name | HSS name"). The entity is therefore read as
 *    the last label column before the value column, never by name.
 *  - **The sheet name is not the KPI name.** Excel truncates a sheet name to 31
 *    characters and drops "/", so "Data for Gx total CCA CCR succe" is really
 *    "Gx total CCA/CCR success ratio". The value column header is the KPI name.
 *  - **The cadence differs per KPI.** Most sheets are 15-minute; the three Sy_*
 *    sheets are 5-minute. Cadence is measured per KPI from one node's readings,
 *    because several nodes share (or stagger around) each period and adjacent
 *    rows say nothing about the step.
 */

const DATA_SHEET = /^data\s+for\b/i;
const PERIOD_HEADER = /\b(period|time|date)\b/i;
const HEADER_ROW_INDEX = 0;
const DATA_START_ROW_INDEX = 2;

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value == null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null || value === '') return null;
  const n = parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** "10.43.2.100@mdc1-nk-cmm-ta01" → MDC1, "MDC2NMSS01" → MDC2, anything else → null. */
function siteOf(nodeName) {
  const m = String(nodeName || '').match(/mdc\s*([12])/i);
  return m ? `MDC${m[1]}` : null;
}

/** Display name for a node: drop the IP prefix a CMM / CMG name carries. */
function shortNode(nodeName) {
  const name = String(nodeName || '').trim();
  const at = name.lastIndexOf('@');
  return (at >= 0 ? name.slice(at + 1) : name).toUpperCase();
}

/**
 * A url- and filename-safe id for a KPI name.
 *
 * One PS KPI is literally `Gb MO PDP act "tech" SR`, so nothing may assume the
 * name is identifier-safe: every character outside [a-z0-9] collapses to a dash.
 */
function slugify(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || 'kpi';
}

/** Last column that actually has a header — trailing blank cells do not count. */
function lastHeaderIndex(headers) {
  for (let i = headers.length - 1; i >= 0; i -= 1) {
    if (headers[i]) return i;
  }
  return -1;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The reporting step of one KPI, in milliseconds.
 *
 * Measured within a single node. CSSR staggers its four MSSs across the quarter
 * hour (:01, :03, :11, :13), so the gap between adjacent *rows* there is 3
 * minutes while the KPI's actual cadence is 15.
 */
function detectCadenceMs(byNode) {
  const perNode = [];
  for (const times of byNode.values()) {
    if (times.length < 3) continue;
    const sorted = [...times].sort((a, b) => a - b);
    const diffs = [];
    for (let i = 1; i < sorted.length; i += 1) {
      const d = sorted[i] - sorted[i - 1];
      if (d > 0) diffs.push(d);
    }
    if (diffs.length) perNode.push(median(diffs));
  }
  const detected = median(perNode);
  // Fall back to the 15 minutes every one of these exports uses by default.
  return detected > 0 ? detected : 15 * 60 * 1000;
}

function cadenceLabel(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}-minute`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'Hourly' : `${hours}-hour`;
}

/**
 * Read one data sheet into samples plus the metadata that describes it.
 * Returns null when the sheet is not a usable KPI sheet.
 */
function readKpiSheet(worksheet) {
  const rows = readSheetRows(worksheet);
  const headers = (rows[HEADER_ROW_INDEX] || []).map((h) => String(h ?? '').trim());
  const valueIndex = lastHeaderIndex(headers);
  // Period + at least one label column + a value column.
  if (valueIndex < 2) return null;

  const entityIndex = valueIndex - 1;
  const entityHeader = headers[entityIndex];
  if (!entityHeader || PERIOD_HEADER.test(entityHeader)) return null;

  const kpiName = headers[valueIndex] || String(worksheet.name).replace(DATA_SHEET, '').trim();
  const fieldCode = String((rows[1] || [])[valueIndex] ?? '').trim() || null;

  const samples = [];
  const byNode = new Map();
  let unparsedRows = 0;

  for (const row of rows.slice(DATA_START_ROW_INDEX)) {
    if (!row || row.every((cell) => cell === null || cell === undefined || cell === '')) continue;
    const date = toDate(row[0]);
    const rawNode = String(row[entityIndex] ?? '').trim();
    const value = toNumber(row[valueIndex]);
    if (!date || !rawNode) {
      unparsedRows += 1;
      continue;
    }
    // A blank value is a gap in the counter, not a zero. Dropping it keeps it
    // out of the average instead of dragging the average down.
    if (value == null) {
      unparsedRows += 1;
      continue;
    }

    const node = shortNode(rawNode);
    samples.push({ date, node, site: siteOf(rawNode), value });
    if (!byNode.has(node)) byNode.set(node, []);
    byNode.get(node).push(date.getTime());
  }

  if (!samples.length) return null;

  const cadenceMs = detectCadenceMs(byNode);
  const nodes = [...byNode.keys()]
    .map((node) => ({ node, site: siteOf(node), samples: byNode.get(node).length }))
    .sort((a, b) => String(a.site).localeCompare(String(b.site)) || a.node.localeCompare(b.node));

  return {
    meta: {
      sheetName: worksheet.name,
      kpiName,
      entityHeader,
      fieldCode,
      cadenceMs,
      cadenceLabel: cadenceLabel(cadenceMs),
      nodes,
      sites: [...new Set(nodes.map((n) => n.site).filter(Boolean))].sort(),
      sampleCount: samples.length,
      unparsedRows,
    },
    samples,
  };
}

/**
 * Read the KPI sheets of a success-ratio workbook off an already-loaded
 * workbook's worksheets.
 *
 * `options.kpiSheetName` narrows the read to one sheet, which is what makes a
 * per-KPI report possible: the workbook upload path
 * creates one report per KPI and each of them reads only its own sheet, so a
 * report carries its own KPI rather than all 22. With neither option the whole
 * workbook is read, exactly as before.
 *
 * Deliberately not `options.sheetName`: that one is the single-report upload's
 * "which sheet did the preview recommend", and reading it here would silently
 * cut a whole-workbook report down to one KPI.
 *
 * Ids are assigned over the sheets actually read, so a single-sheet read gives
 * the KPI the same id a whole-workbook read would unless two sheets share a KPI
 * name — and nothing outside one report's payload depends on the id.
 */
function readSuccessRatioWorksheets(worksheets, options = {}) {
  const records = [];
  const kpis = [];
  const skippedSheets = [];
  const usedIds = new Set();
  const wantedSheet = options.kpiSheetName ? String(options.kpiSheetName) : null;

  for (const worksheet of worksheets || []) {
    if (!DATA_SHEET.test(String(worksheet.name || ''))) continue;
    if (wantedSheet && String(worksheet.name) !== wantedSheet) continue;

    let read = null;
    try {
      read = readKpiSheet(worksheet);
    } catch {
      read = null;
    }
    if (!read) {
      skippedSheets.push(worksheet.name);
      continue;
    }

    // Two sheets could in principle carry the same KPI name; ids stay unique.
    let id = slugify(read.meta.kpiName);
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${slugify(read.meta.kpiName)}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);

    kpis.push({ id, order: kpis.length, ...read.meta });
    for (const sample of read.samples) {
      records.push({
        kpiId: id,
        // Carried per record so a caller holding only rows can still rebuild
        // the KPI list; the strings are shared references, not copies.
        kpiName: read.meta.kpiName,
        entityHeader: read.meta.entityHeader,
        ...sample,
      });
    }
  }

  // Sheet metadata the transformer prefers over rebuilding it. A property on
  // the array rather than a record field: JSON.stringify ignores it, so it
  // never reaches the stored report.
  Object.defineProperty(records, 'kpiMeta', { value: kpis, enumerable: false });

  const entityHeaders = [...new Set(kpis.map((k) => k.entityHeader))];

  return {
    sheetName: `${kpis.length} KPI sheet${kpis.length === 1 ? '' : 's'}`,
    // Only used by the engine to name the metric column; the validator and the
    // transformer both read the records.
    headers: ['Period start time', entityHeaders[0] || 'Node name', 'Success ratio (%)'],
    dataRows: records,
    headerRowIndex: HEADER_ROW_INDEX,
    dataStartRowIndex: DATA_START_ROW_INDEX,
    kpis,
    entityHeaders,
    skippedSheets,
    singleKpi: kpis.length === 1 && Boolean(wantedSheet),
  };
}

/**
 * Read a success-ratio workbook from disk.
 *
 * The engine hands the whole record list back as `dataRows`, in the shape the
 * workflow pipeline expects from a `loadSource`. `options` is the parse options
 * object the pipeline already carries, so `kpiSheetName` — which the workbook
 * path sets per child report — narrows this to that report's own KPI.
 */
async function loadSuccessRatioWorkbook(filePath, options = {}) {
  const workbook = await loadWorkbook(filePath);
  return readSuccessRatioWorksheets(workbook.worksheets, options);
}

module.exports = {
  loadSuccessRatioWorkbook,
  readSuccessRatioWorksheets,
  readKpiSheet,
  detectCadenceMs,
  cadenceLabel,
  lastHeaderIndex,
  slugify,
  siteOf,
  shortNode,
  toDate,
  toNumber,
  median,
  DATA_SHEET,
};
