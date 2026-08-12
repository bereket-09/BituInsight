const { parseNumber } = require('./validator');

function cleanCommas(value) {
  if (typeof value === 'number') return value;
  return parseNumber(String(value).replace(/,/g, ''));
}

function parseDate(value) {
  if (value instanceof Date) return value;
  return new Date(value);
}

function transform(rows, mapping) {
  const records = rows
    .map((row, index) => {
      const dateRaw = row[mapping.date.index];
      const date = parseDate(dateRaw);
      if (isNaN(date.getTime())) return null;

      const volume2g3g = cleanCommas(row[mapping.volume2g3g.index]) || 0;
      const volume4g = cleanCommas(row[mapping.volume4g.index]) || 0;
      const totalVolume = cleanCommas(row[mapping.totalVolume.index]) || 0;

      return {
        rowIndex: index + 2,
        date,
        dateKey: date.toISOString().split('T')[0],
        hour: date.getHours(),
        plmnName: String(row[mapping.plmnName.index] || 'Unknown').trim(),
        volume2g3g,
        volume4g,
        totalVolume: totalVolume || volume2g3g + volume4g,
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
