const { loadWorkbook } = require('../../utils/workbookLoader');
const { readSheetRows } = require('../../services/excelParser.service');
const { siteOf, shortNode, toDate, toNumber } = require('../shared/netactNodes');

/**
 * The SAAU (Simultaneously Attached Active Users) export.
 *
 * One sheet, "Data for SAAU": header row, a NetAct field-code row, then one row
 * per CMG per hour —
 *
 *   Period start time | SAM name | CMG name | maxNumberOfActiveUtranBearers
 *                                           | maxNumberOfActiveGeranBearers
 *                                           | maxNumberOfActiveEutranBearers
 *
 *   SAAU = Utran + Geran + Eutran active bearers
 *
 * SAAU is a count of bearers, unit "[#]" in the workbook's Documentation sheet.
 * It carries no data volume and is never converted to TB or any other unit — the
 * MB-to-TB conversion belongs to the Total Data Volume workflow alone, and this
 * workflow deliberately does not import it.
 */

const SHEET_PATTERN = /^data for saau/i;

/** The three bearer counters, by position after the node column. */
const BEARER_FIELDS = [
  { key: 'utran', label: '3G (UTRAN)', offset: 0 },
  { key: 'geran', label: '2G (GERAN)', offset: 1 },
  { key: 'eutran', label: '4G (E-UTRAN)', offset: 2 },
];

function findSheet(workbook) {
  return workbook.worksheets.find((ws) => SHEET_PATTERN.test(String(ws.name || '')));
}

async function loadSource(filePath) {
  const workbook = await loadWorkbook(filePath);
  const worksheet = findSheet(workbook);

  if (!worksheet) {
    return {
      sheetName: 'Data for SAAU',
      headers: [],
      dataRows: [],
      headerRowIndex: 0,
      dataStartRowIndex: 2,
      sheetFound: false,
    };
  }

  const rows = readSheetRows(worksheet);
  const headers = (rows[0] || []).map((h) => String(h ?? '').trim());
  // Period start time | SAM name | CMG name | Utran | Geran | Eutran
  const nodeIndex = headers.length - 4;
  const firstValueIndex = nodeIndex + 1;

  const records = [];
  let skipped = 0;

  // Row 0 is the header and row 1 the field-code row; data starts at row 2.
  for (const row of rows.slice(2)) {
    const date = toDate(row?.[0]);
    const node = String(row?.[nodeIndex] ?? '').trim();
    const bearers = {};
    let anyValue = false;
    for (const field of BEARER_FIELDS) {
      const value = toNumber(row?.[firstValueIndex + field.offset]);
      if (value != null) anyValue = true;
      bearers[field.key] = value || 0;
    }
    if (!date || !anyValue) {
      if (row && row.some((cell) => cell !== null && cell !== undefined && cell !== '')) skipped += 1;
      continue;
    }
    records.push({
      date,
      node: shortNode(node),
      rawNode: node,
      site: siteOf(node),
      sam: String(row?.[1] ?? '').trim(),
      values: {
        ...bearers,
        // SAAU itself: the three bearer counters added together, as a count.
        total: bearers.utran + bearers.geran + bearers.eutran,
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

module.exports = { loadSource, BEARER_FIELDS, SHEET_PATTERN };
