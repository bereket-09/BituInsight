/**
 * Recompute bucketed time-series views for percentage KPIs.
 *
 * The shared series builder only summed into buckets, so an hourly or daily view
 * of a percentage KPI held the sum of its samples rather than their mean — a day
 * of ~94% availability was stored as 5070. The builder now takes an aggregate
 * mode and telecom-metric asks for 'avg', but reports processed before that fix
 * still hold the inflated numbers.
 *
 * This rebuilds those views from the report's own native points, so it needs no
 * access to the original upload. The native series, the metrics and the summary
 * were never affected and are left untouched.
 *
 *   DATABASE_URL=... node scripts/backfill-percent-buckets.js [--apply]
 *
 * Without --apply it reports what it would change and writes nothing.
 */
const pool = require('../src/db/pool');
const logger = require('../src/utils/logger');
const { buildTimeSeries } = require('../src/kpi-workflows/traffic-volume/timeSeries');

const APPLY = process.argv.includes('--apply');

/** Reconstruct the calculator's input records from stored native points. */
function recordsFromNative(native) {
  return native
    .map((p) => {
      const date = new Date(p.timestamp);
      if (Number.isNaN(date.getTime())) return null;
      return {
        date,
        volume2g3g: Number(p.volume2g3g) || 0,
        volume4g: Number(p.volume4g) || 0,
        totalVolume: Number(p.total) || 0,
        plmnName: p.plmnName,
      };
    })
    .filter(Boolean);
}

async function main() {
  const { rows } = await pool.query(
    `SELECT pr.id, pr.kpi_name, pr.report_data
     FROM processed_reports pr
     JOIN kpi_workflows kw ON pr.workflow_id = kw.id
     WHERE kw.slug = 'telecom-metric'
       AND pr.status = 'completed'
       AND pr.report_data->'calculated'->>'valueType' = 'percent'`
  );

  console.log(`${rows.length} percentage report(s) to inspect\n`);
  let changed = 0;
  let skipped = 0;

  for (const row of rows) {
    const data = row.report_data || {};
    const calculated = data.calculated || {};
    const series = calculated.timeSeries && calculated.timeSeries.series;
    const native = series && series.native;

    if (!Array.isArray(native) || native.length === 0) {
      console.log(`  skip  ${row.kpi_name} — no native series stored`);
      skipped += 1;
      continue;
    }

    const records = recordsFromNative(native);
    if (!records.length) {
      console.log(`  skip  ${row.kpi_name} — native points unusable`);
      skipped += 1;
      continue;
    }

    const rebuilt = buildTimeSeries(records, { aggregate: 'avg' });
    // telecom-metric decorates primary with `value`; reproduce that exactly.
    const primary = rebuilt.series.primary.map((p) => ({ ...p, value: p.total, label: p.label }));

    const before = series.daily && series.daily[0] && series.daily[0].total;
    const after = rebuilt.series.daily && rebuilt.series.daily[0] && rebuilt.series.daily[0].total;

    if (before === after) {
      console.log(`  ok    ${row.kpi_name} — already correct (daily[0] ${after})`);
      skipped += 1;
      continue;
    }

    const nextData = {
      ...data,
      calculated: {
        ...calculated,
        timeSeries: { ...rebuilt, series: { ...rebuilt.series, primary } },
      },
    };

    console.log(
      `  fix   ${String(row.kpi_name).slice(0, 30).padEnd(30)} daily[0] ${before} -> ${after}`
    );

    if (APPLY) {
      await pool.query('UPDATE processed_reports SET report_data = $2 WHERE id = $1', [
        row.id,
        JSON.stringify(nextData),
      ]);
    }
    changed += 1;
  }

  console.log(
    `\n${changed} report(s) ${APPLY ? 'updated' : 'would be updated'}, ${skipped} left as-is`
  );
  if (!APPLY && changed) console.log('Re-run with --apply to write the changes.');
  await pool.end();
}

main().catch((err) => {
  logger.error('Backfill failed', { error: err.message });
  process.exit(1);
});
