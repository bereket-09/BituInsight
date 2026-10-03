/**
 * Records arrive already parsed from ./source.js; this only adds the context the
 * calculator and the report need — which counters and which nodes are present.
 */
function transform(records) {
  const sorted = [...records].sort((a, b) => a.date - b.date);
  const measuresFound = [...new Set(sorted.map((r) => r.measure))];
  const nodesFor = (prefix) =>
    [...new Set(sorted.filter((r) => r.measure.startsWith(prefix)).map((r) => r.node))].sort();

  return {
    records: sorted,
    measuresFound,
    cmmNodes: nodesFor('users'),
    mscNodes: [...new Set(sorted.filter((r) => r.measure === 'vlr' || r.measure === 'bhca').map((r) => r.node))].sort(),
    entityNames: [...new Set(sorted.map((r) => r.node))].sort(),
    dateRange: {
      start: sorted[0]?.date?.toISOString() || null,
      end: sorted[sorted.length - 1]?.date?.toISOString() || null,
    },
  };
}

module.exports = { transform };
