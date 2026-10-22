const { loadWorkbook } = require('../../utils/workbookLoader');
const { readSheetRows } = require('../../services/excelParser.service');
const { siteOf, shortNode, toDate, toNumber } = require('../shared/netactNodes');

/**
 * The Total Data Volume export.
 *
 * One sheet, "Data for Total Data Volume": header row, a NetAct field-code row,
 * then one row per CMG per hour —
 *
 *   Period start time | SAM name | CMG name | 2G+3G data volume | 4G data volume | Total data volume
 *
 * The two CMG names carry the data centre (…@MDC1-NK-CMG-CP01, …@MDC2-NK-CMG-CP01),
 * so the site split comes from the node name, as it does for every other NetAct
 * workflow here.
 *
 * This workflow reads the workbook itself rather than taking the one sheet the
 * engine would pick, because the same file also carries the SAAU sheets, which
 * belong to a separate KPI with a separate workflow.
 */

/**
 * Megabytes in a terabyte.
 *
 * The values in this export are megabytes. The NetAct formula in the workbook's
 * Documentation sheet divides the raw byte counters by (1024*1024), and the chart
 * sheets label the columns "[MB]".
 *
 * The customer's email asked us to "divide by 1024" — that converts MB to GB, not
 * to TB, and would overstate every figure 1024-fold. This was raised with them and
 * they confirmed the intent: MB ÷ 1024² = TB. The busiest reported hour,
 * 91,442,807.70 MB, is therefore 87.21 TB and not 89,300 of anything.
 *
 * Leave this at 1024 * 1024. The email will say otherwise; the email is wrong.
 */
const MB_PER_TB = 1024 * 1024;

const SHEET_PATTERN = /^data for total data volume/i;

/** The columns this sheet carries, by position after the node column. */
const VALUE_FIELDS = [
  { key: 'volume2g3g', label: '2G+3G', offset: 0 },
  { key: 'volume4g', label: '4G', offset: 1 },
  { key: 'total', label: 'Total', offset: 2 },
];

function findSheet(workbook) {
  return workbook.worksheets.find((ws) => SHEET_PATTERN.test(String(ws.name || '')));
}

async function loadSource(filePath) {
  const workbook = await loadWorkbook(filePath);
  const worksheet = findSheet(workbook);

  if (!worksheet) {
    return {
      sheetName: 'Data for Total Data Volume',
      headers: [],
      dataRows: [],
      headerRowIndex: 0,
      dataStartRowIndex: 2,
      sheetFound: false,
    };
  }

  const rows = readSheetRows(worksheet);
  const headers = (rows[0] || []).map((h) => String(h ?? '').trim());
  // Period start time | SAM name | CMG name | 2G+3G | 4G | Total
  const nodeIndex = headers.length - 4;
  const firstValueIndex = nodeIndex + 1;

  const records = [];
  let skipped = 0;

  // Row 0 is the header and row 1 the field-code row; data starts at row 2.
  for (const row of rows.slice(2)) {
    const date = toDate(row?.[0]);
    const node = String(row?.[nodeIndex] ?? '').trim();
    const values = {};
    for (const field of VALUE_FIELDS) {
      values[field.key] = toNumber(row?.[firstValueIndex + field.offset]);
    }
    if (!date || values.total == null) {
      if (row && row.some((cell) => cell !== null && cell !== undefined && cell !== '')) skipped += 1;
      continue;
    }
    records.push({
      date,
      node: shortNode(node),
      rawNode: node,
      site: siteOf(node),
      sam: String(row?.[1] ?? '').trim(),
      // Megabytes, exactly as the export reports them. The conversion to TB
      // happens once, in the series builder.
      values: {
        volume2g3g: values.volume2g3g || 0,
        volume4g: values.volume4g || 0,
        total: values.total,
      },
    });
  }

  return {
    sheetName: worksheet.name,
    headers,
    dataRows: records,
    headerRowIndex: 0,
    dataStartRowIndex: 2,
    sheetFound: true,
    skippedRows: skipped,
  };
}

module.exports = { loadSource, MB_PER_TB, VALUE_FIELDS, SHEET_PATTERN };
