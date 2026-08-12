const { parseNumber } = require('./validator');

function transform(rows, mapping) {
  const records = rows
    .map((row, index) => {
      const dateRaw = row[mapping.date.index];
      const date = dateRaw instanceof Date ? dateRaw : new Date(dateRaw);
      if (isNaN(date.getTime())) return null;

      const value = parseNumber(row[mapping.value.index]) ?? 0;

      return {
        rowIndex: index + 2,
        date,
        dateKey: date.toISOString().split('T')[0],
        hour: date.getHours(),
        plmnName: String(row[mapping.plmnName.index] || 'Unknown').trim(),
        value,
      };
    })
    .filter(Boolean);

  records.sort((a, b) => a.date - b.date);

  return {
    records,
    plmnNames: [...new Set(records.map((r) => r.plmnName))],
    dateRange: {
      start: records[0]?.date,
      end: records[records.length - 1]?.date,
    },
  };
}

module.exports = { transform };
