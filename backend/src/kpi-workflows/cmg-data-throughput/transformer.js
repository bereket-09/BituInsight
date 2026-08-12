const { parseNumber, extractCmgNode } = require('./validator');

function parseDate(value) {
  if (value instanceof Date) return value;
  return new Date(value);
}

function transform(rows, mapping) {
  const records = rows
    .map((row, index) => {
      const periodRaw = row[mapping.period.index];
      const date = parseDate(periodRaw);
      if (isNaN(date.getTime())) return null;

      const dl = parseNumber(row[mapping.dlMbps.index]) ?? 0;
      const ul = parseNumber(row[mapping.ulMbps.index]) ?? 0;
      const cmgNode = extractCmgNode(row[mapping.cmgName.index]);
      if (!cmgNode) return null;

      const rowThroughputGbps = (dl + ul) / 1000;

      return {
        rowIndex: index + 3,
        date,
        periodKey: date.toISOString(),
        samName: String(row[mapping.samName?.index ?? 1] ?? '').trim() || '—',
        cmgName: String(row[mapping.cmgName.index] || '').trim(),
        cmgNode,
        dlMbps: dl,
        ulMbps: ul,
        rowThroughputGbps,
      };
    })
    .filter(Boolean);

  records.sort((a, b) => a.date - b.date);

  const samNames = [...new Set(records.map((r) => r.samName).filter((s) => s && s !== '—'))];

  return {
    records,
    samNames,
    cmgNodes: ['MDC1', 'MDC2'],
    dateRange: {
      start: records[0]?.date,
      end: records[records.length - 1]?.date,
    },
  };
}

module.exports = { transform };
