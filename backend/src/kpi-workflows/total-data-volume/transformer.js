const { SITES } = require('../shared/netactNodes');

/**
 * Records arrive already parsed from ./source.js; this only sorts them and adds
 * the context the calculator and the report need.
 */
function transform(records) {
  const sorted = [...records].sort((a, b) => a.date - b.date);
  const nodes = [...new Set(sorted.map((r) => r.node))].sort();

  return {
    records: sorted,
    nodes,
    entityNames: nodes,
    sites: SITES.filter((site) => sorted.some((r) => r.site === site)),
    dateRange: {
      start: sorted[0]?.date?.toISOString() || null,
      end: sorted[sorted.length - 1]?.date?.toISOString() || null,
    },
  };
}

module.exports = { transform };
