const { detectCadenceMs, cadenceLabel, siteOf } = require('./source');

/**
 * Group the engine's records back into one bundle per KPI.
 *
 * Records arrive already parsed from ./source.js. The sheet metadata rides
 * along on the record array as `kpiMeta` (set by loadSource, invisible to JSON),
 * and is rebuilt from the records themselves if a caller ever hands over bare
 * rows — the KPIs must survive either way.
 */
function rebuildMeta(records) {
  const order = [];
  const byId = new Map();

  for (const record of records) {
    let meta = byId.get(record.kpiId);
    if (!meta) {
      meta = {
        id: record.kpiId,
        order: order.length,
        kpiName: record.kpiName || record.kpiId,
        entityHeader: record.entityHeader || 'Node name',
        sheetName: null,
        fieldCode: null,
        times: new Map(),
      };
      byId.set(record.kpiId, meta);
      order.push(meta);
    }
    if (!meta.times.has(record.node)) meta.times.set(record.node, []);
    meta.times.get(record.node).push(record.date.getTime());
  }

  return order.map((meta) => {
    const cadenceMs = detectCadenceMs(meta.times);
    const nodes = [...meta.times.keys()]
      .map((node) => ({ node, site: siteOf(node), samples: meta.times.get(node).length }))
      .sort((a, b) => String(a.site).localeCompare(String(b.site)) || a.node.localeCompare(b.node));
    return {
      id: meta.id,
      order: meta.order,
      kpiName: meta.kpiName,
      entityHeader: meta.entityHeader,
      sheetName: meta.sheetName,
      fieldCode: meta.fieldCode,
      cadenceMs,
      cadenceLabel: cadenceLabel(cadenceMs),
      nodes,
      sites: [...new Set(nodes.map((n) => n.site).filter(Boolean))].sort(),
      sampleCount: nodes.reduce((sum, n) => sum + n.samples, 0),
      unparsedRows: 0,
    };
  });
}

function transform(records) {
  const rows = Array.isArray(records) ? records : [];
  const sorted = [...rows].sort((a, b) => a.date - b.date);
  const meta = rows.kpiMeta?.length ? rows.kpiMeta : rebuildMeta(sorted);

  const samplesById = new Map(meta.map((k) => [k.id, []]));
  for (const record of sorted) {
    const bucket = samplesById.get(record.kpiId);
    if (bucket) bucket.push(record);
  }

  const kpis = meta
    .filter((k) => (samplesById.get(k.id) || []).length)
    .map((k) => ({ ...k, samples: samplesById.get(k.id) }));

  const entityNames = [...new Set(sorted.map((r) => r.node))].sort();

  return {
    records: sorted,
    kpis,
    kpiCount: kpis.length,
    entityNames,
    entityHeaders: [...new Set(kpis.map((k) => k.entityHeader))],
    sites: [...new Set(sorted.map((r) => r.site).filter(Boolean))].sort(),
    dateRange: {
      start: sorted[0]?.date?.toISOString() || null,
      end: sorted[sorted.length - 1]?.date?.toISOString() || null,
    },
  };
}

module.exports = { transform, rebuildMeta };
