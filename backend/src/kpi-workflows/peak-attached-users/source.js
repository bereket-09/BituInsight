const { loadWorkbook } = require('../../utils/workbookLoader');
const { readSheetRows } = require('../../services/excelParser.service');

/**
 * The Peak Attach Users export is one workbook with a "Data for …" sheet per
 * counter: attached users per radio technology on each CMM, plus VLR subscribers
 * and busy-hour call load on each MSC. No single sheet tells the story, so this
 * workflow reads every data sheet itself instead of the one sheet the engine
 * would otherwise hand it.
 *
 * Each sheet is: header row, a field-code row, then
 *   Period start time | (SAM name) | CMM or MSC name | value
 */

/** Which measure a sheet carries, from its value column header or its name. */
const MEASURES = [
  { key: 'users2g', label: '2G', match: /PEAK_ATTACH_GB/i, group: 'attach' },
  { key: 'users3g', label: '3G', match: /PEAK_ATTACH_IU/i, group: 'attach' },
  { key: 'users4g', label: '4G', match: /PEAK_ATTACH_LTE/i, group: 'attach' },
  { key: 'vlr', label: 'VLR subscribers', match: /VLR|AVGSUBS/i, group: 'voice' },
  { key: 'bhca', label: 'BHCA (Erlang)', match: /BHCA/i, group: 'voice' },
];

const ATTACH_KEYS = MEASURES.filter((m) => m.group === 'attach').map((m) => m.key);

function classifySheet(sheetName, valueHeader) {
  const text = `${valueHeader} ${sheetName}`;
  return MEASURES.find((m) => m.match.test(text)) || null;
}

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

/** "10.43.2.100@mdc1-nk-cmm-ta01" → MDC1, "MDC2NMSS01" → MDC2. */
function siteOf(nodeName) {
  const m = String(nodeName || '').match(/mdc\s*([12])/i);
  return m ? `MDC${m[1]}` : null;
}

/** Short node name for display: drop the IP prefix of a CMM name. */
function shortNode(nodeName) {
  const name = String(nodeName || '').trim();
  const at = name.lastIndexOf('@');
  return (at >= 0 ? name.slice(at + 1) : name).toUpperCase();
}

async function loadSource(filePath) {
  const workbook = await loadWorkbook(filePath);
  const records = [];
  const sheets = [];

  for (const worksheet of workbook.worksheets) {
    if (!/^data for/i.test(worksheet.name)) continue;

    const rows = readSheetRows(worksheet);
    const headers = (rows[0] || []).map((h) => String(h ?? '').trim());
    if (headers.length < 3) continue;

    const valueIndex = headers.length - 1;
    const nodeIndex = valueIndex - 1;
    const measure = classifySheet(worksheet.name, headers[valueIndex]);
    if (!measure) {
      sheets.push({ name: worksheet.name, measure: null, rows: 0 });
      continue;
    }

    let count = 0;
    // Row 1 is the NetAct field-code row; data starts at row 2.
    for (const row of rows.slice(2)) {
      const date = toDate(row?.[0]);
      const value = toNumber(row?.[valueIndex]);
      if (!date || value == null) continue;
      const node = String(row[nodeIndex] ?? '').trim();
      records.push({
        date,
        measure: measure.key,
        node: shortNode(node),
        site: siteOf(node),
        value,
      });
      count += 1;
    }

    sheets.push({
      name: worksheet.name,
      measure: measure.key,
      label: measure.label,
      valueHeader: headers[valueIndex],
      nodeHeader: headers[nodeIndex],
      rows: count,
    });
  }

  const found = sheets.filter((s) => s.measure);
  return {
    sheetName: `${found.length} data sheet${found.length === 1 ? '' : 's'}`,
    // Only used by the engine to name the metric; the validator reads records.
    headers: ['Period start time', 'Node name', 'Peak attached users'],
    dataRows: records,
    headerRowIndex: 0,
    dataStartRowIndex: 2,
    sheets,
  };
}

module.exports = { loadSource, MEASURES, ATTACH_KEYS, siteOf, shortNode };
