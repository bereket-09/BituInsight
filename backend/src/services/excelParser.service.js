const ExcelJS = require('exceljs');
const logger = require('../utils/logger');

const FIELD_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function extractCellValue(cell) {
  if (cell === null || cell === undefined) return null;
  let value = cell;
  if (value && typeof value === 'object') {
    if (value.result !== undefined) value = value.result;
    else if (value.text !== undefined) value = value.text;
    else if (value instanceof Date) return value;
    else if (value.richText) value = value.richText.map((t) => t.text).join('');
    else if (value.hyperlink) value = value.text || value.hyperlink;
  }
  return value;
}

function readSheetRows(worksheet, maxRows = null) {
  const rows = [];
  const limit = maxRows || worksheet.rowCount || 100;
  for (let r = 1; r <= Math.min(worksheet.rowCount || 0, limit); r++) {
    const row = worksheet.getRow(r);
    if (!row || !row.cellCount) {
      const empty = [];
      rows.push(empty);
      continue;
    }
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[colNumber - 1] = extractCellValue(cell.value);
    });
    rows.push(values);
  }
  return rows;
}

function serializeCell(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  return String(value);
}

function isFieldCodeRow(row, numericColumnIndices = []) {
  if (!row || row.length === 0) return false;
  const checks = numericColumnIndices.length > 0 ? numericColumnIndices : [2, 3, 4];
  let codeLike = 0;
  let checked = 0;
  for (const idx of checks) {
    const val = row[idx];
    if (val === null || val === undefined || val === '') continue;
    checked++;
    const str = String(val).trim();
    if (FIELD_CODE_PATTERN.test(str)) codeLike++;
    else if (typeof val === 'number' || !isNaN(parseFloat(String(val).replace(/,/g, '')))) {
      return false;
    }
  }
  return checked > 0 && codeLike === checked;
}

function isCmmDataSheetName(name) {
  return /^data\s/i.test(String(name || '').trim());
}

function getRequiredColumnCount(workflowValidator) {
  return workflowValidator?.requiredColumnCount ?? 5;
}

function resolveValidatorMapping(workflowValidator, headers) {
  if (!workflowValidator?.mapHeaders) return {};
  const metricHint = headers?.length >= 3 ? headers[2] : '';
  return workflowValidator.mapHeaders(headers, metricHint) || {};
}

function findDataStartRow(allRows, headerRowIndex, mapping) {
  if (!mapping) return Math.min(headerRowIndex + 1, allRows.length - 1);

  const numericIndices = ['volume2g3g', 'volume4g', 'totalVolume', 'value']
    .filter((k) => mapping[k])
    .map((k) => mapping[k].index);

  for (let i = headerRowIndex + 1; i < Math.min(allRows.length, headerRowIndex + 5); i++) {
    const row = allRows[i];
    if (!row) continue;
    if (isFieldCodeRow(row, numericIndices)) continue;
    return i;
  }
  return headerRowIndex + 1;
}

function scoreSheetForWorkflow(allRows, workflowValidator, sheetName = '') {
  if (!workflowValidator || allRows.length < 2) return { score: 0 };

  const requiredCols = getRequiredColumnCount(workflowValidator);
  const cmmDataSheet = isCmmDataSheetName(sheetName);
  let best = { score: 0, headerRowIndex: 0, mapping: null };

  for (let h = 0; h < Math.min(allRows.length, 15); h++) {
    const headerRow = allRows[h];
    if (!headerRow) continue;
    const headers = headerRow.map((c) => String(c ?? '').trim());
    if (headers.every((x) => !x)) continue;

    const mapping = resolveValidatorMapping(workflowValidator, headers);
    const matched = Object.keys(mapping).filter((k) => mapping[k]?.index != null).length;
    if (matched < Math.min(3, requiredCols)) continue;

    const preferredCmgSheet = workflowValidator.isPreferredSheet?.(sheetName);
    const dataStart = preferredCmgSheet && matched >= requiredCols
      ? Math.min(2, allRows.length - 1)
      : cmmDataSheet
        ? Math.min(2, allRows.length - 1)
        : findDataStartRow(allRows, h, mapping);
    const dataRows = allRows
      .slice(dataStart)
      .filter((row) => row && row.some((c) => c != null && c !== ''));

    const valueIdx = mapping.value?.index ?? mapping.volume2g3g?.index ?? 2;
    const numericRows = dataRows.filter((row) => {
      const v = row[valueIdx];
      return typeof v === 'number' || (v && !isNaN(parseFloat(String(v).replace(/,/g, ''))));
    }).length;

    let score = matched * 10 + numericRows * 5;
    if (matched >= requiredCols) score += 20;
    if (cmmDataSheet && matched >= 3) score += 50;
    if (workflowValidator.isPreferredSheet?.(sheetName)) score += 35;
    if (mapping.dlMbps && mapping.ulMbps) score += 15;

    if (score > best.score) {
      best = {
        score,
        headerRowIndex: cmmDataSheet ? 0 : h,
        mapping,
        dataStartRowIndex: cmmDataSheet ? 2 : dataStart,
        dataRowCount: dataRows.length,
      };
    }
  }

  if (cmmDataSheet && best.score === 0 && allRows.length >= 3) {
    const headers = (allRows[0] || []).map((c) => String(c ?? '').trim());
    const mapping = resolveValidatorMapping(workflowValidator, headers);
    best = {
      score: 40,
      headerRowIndex: 0,
      mapping,
      dataStartRowIndex: 2,
      dataRowCount: allRows.slice(2).filter((r) => r?.some((c) => c != null && c !== '')).length,
    };
  }

  return best;
}

async function loadWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

async function getWorkbookPreview(filePath, workflowValidator = null) {
  const workbook = await loadWorkbook(filePath);
  const sheets = [];

  for (let i = 0; i < workbook.worksheets.length; i++) {
    const worksheet = workbook.worksheets[i];
    const allRows = readSheetRows(worksheet, 25);
    const analysis = scoreSheetForWorkflow(allRows, workflowValidator, worksheet.name);

    const previewRows = allRows.slice(0, 12).map((row, idx) => ({
      rowNumber: idx + 1,
      cells: row.map(serializeCell),
      rowType:
        idx === analysis.headerRowIndex
          ? 'header'
          : idx === analysis.dataStartRowIndex - 1 && analysis.dataStartRowIndex > analysis.headerRowIndex + 1
            ? 'field_codes'
            : idx >= (analysis.dataStartRowIndex ?? 1)
              ? 'data'
              : 'meta',
    }));

    sheets.push({
      index: i,
      name: worksheet.name,
      rowCount: worksheet.rowCount,
      columnCount: worksheet.columnCount,
      previewRows,
      suggestedHeaderRow: analysis.headerRowIndex ?? 0,
      suggestedDataStartRow: analysis.dataStartRowIndex ?? 1,
      matchedColumns: analysis.mapping
        ? Object.keys(analysis.mapping).filter((k) => analysis.mapping[k]?.index != null).length
        : 0,
      requiredColumns: workflowValidator ? getRequiredColumnCount(workflowValidator) : 5,
      isCmmDataSheet: isCmmDataSheetName(worksheet.name),
      estimatedDataRows: analysis.dataRowCount ?? 0,
      columnMapping: analysis.mapping
        ? Object.fromEntries(
            Object.entries(analysis.mapping).map(([k, v]) => [k, { header: v.header, index: v.index }])
          )
        : null,
      matchScore: analysis.score,
      isRecommended: false,
    });
  }

  sheets.sort((a, b) => b.matchScore - a.matchScore);
  if (sheets.length > 0 && sheets[0].matchScore > 0) {
    sheets[0].isRecommended = true;
  }

  return {
    sheetCount: sheets.length,
    sheets,
    recommendedSheet: sheets.find((s) => s.isRecommended)?.name || sheets[0]?.name,
    recommendedSheetIndex: sheets.find((s) => s.isRecommended)?.index ?? 0,
  };
}

async function parseExcelFile(filePath, options = {}) {
  const {
    sheetName,
    sheetIndex = 0,
    headerRowIndex,
    dataStartRowIndex,
    autoDetect = true,
    workflowValidator,
  } = options;

  const workbook = await loadWorkbook(filePath);
  let worksheet;

  if (sheetName) {
    worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) throw new Error(`Sheet not found: ${sheetName}`);
  } else {
    worksheet = workbook.worksheets[sheetIndex] || workbook.worksheets[0];
  }

  if (!worksheet) throw new Error('Excel file has no worksheets');

  const allRows = readSheetRows(worksheet);

  let headerIdx = headerRowIndex;
  let dataStartIdx = dataStartRowIndex;
  let mapping = null;
  const cmmDataSheet = isCmmDataSheetName(worksheet.name);

  if (autoDetect && (headerIdx === undefined || headerIdx === null)) {
    const analysis = scoreSheetForWorkflow(allRows, workflowValidator, worksheet.name);
    headerIdx = analysis.headerRowIndex ?? 0;
    dataStartIdx = analysis.dataStartRowIndex ?? headerIdx + 1;
    mapping = analysis.mapping;
  } else {
    headerIdx = headerIdx ?? 0;
    if (workflowValidator) {
      if (!allRows[headerIdx]) headerIdx = 0;
      const headers = (allRows[headerIdx] || []).map((h) => String(h || '').trim());
      mapping = resolveValidatorMapping(workflowValidator, headers);
      if (dataStartIdx === undefined || dataStartIdx === null) {
        dataStartIdx = cmmDataSheet ? 2 : findDataStartRow(allRows, headerIdx, mapping);
      }
    } else {
      dataStartIdx = dataStartIdx ?? headerIdx + 1;
    }
  }

  if (!allRows[headerIdx]) {
    throw new Error(
      `Invalid header row ${headerIdx + 1} on sheet "${worksheet.name}". Use CMM Workbook upload or pick a "Data for …" sheet.`
    );
  }

  const headers = allRows[headerIdx].map((h) => String(h || '').trim());
  if (!mapping && workflowValidator) {
    mapping = resolveValidatorMapping(workflowValidator, headers);
  }

  let dataRows = allRows
    .slice(dataStartIdx)
    .filter((row) => row && row.some((c) => c !== null && c !== undefined && c !== ''));

  if (workflowValidator?.filterDataRows && mapping) {
    const before = dataRows.length;
    dataRows = workflowValidator.filterDataRows(dataRows, mapping);
    if (before > dataRows.length) {
      logger.info('Skipped field-code/metadata rows', { skipped: before - dataRows.length });
    }
  } else if (mapping) {
    const numericIndices = ['volume2g3g', 'volume4g', 'totalVolume', 'value']
      .map((k) => mapping[k]?.index)
      .filter((i) => i !== undefined);
    dataRows = dataRows.filter((row) => !isFieldCodeRow(row, numericIndices));
  }

  logger.info('Excel parsed', {
    headers: headers.length,
    rows: dataRows.length,
    sheet: worksheet.name,
    headerRow: headerIdx + 1,
    dataStartRow: dataStartIdx + 1,
  });

  return {
    headers,
    dataRows,
    sheetName: worksheet.name,
    sheetIndex: workbook.worksheets.indexOf(worksheet),
    headerRowIndex: headerIdx,
    dataStartRowIndex: dataStartIdx,
    mapping,
    totalSheetRows: allRows.length,
  };
}

async function countCmmDataSheets(filePath) {
  const workbook = await loadWorkbook(filePath);
  return workbook.worksheets.filter((ws) => isCmmDataSheetName(ws.name)).length;
}

module.exports = {
  parseExcelFile,
  getWorkbookPreview,
  readSheetRows,
  isFieldCodeRow,
  findDataStartRow,
  isCmmDataSheetName,
  countCmmDataSheets,
  getRequiredColumnCount,
};
