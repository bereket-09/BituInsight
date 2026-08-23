/**
 * Rebuild bucketed time-series views after the week/day bucket-key fix.
 *
 * The week key kept each row's time of day and then read a UTC date string, so a
 * single week could produce several keys — a three-day file advertised four
 * weeks. The day key had the mirror-image problem, bucketing by UTC date while
 * the labels beside it were local. Both now work in local time.
 *
 * Reports processed before the fix still carry the old views. This rebuilds them
 * from each report's own native points, so no access to the original upload is
 * needed. The native series is the source of truth and is never modified.
 *
 *   DATABASE_URL=... node scripts/backfill-bucket-keys.js [--apply]
 *
 * Without --apply nothing is written.
 */
const pool = require('../src/db/pool');
const logger = require('../src/utils/logger');
const { buildTimeSeries } = require('../src/kpi-workflows/traffic-volume/timeSeries');
const {
  buildThroughputTimeSeries,
} = require('../src/kpi-workflows/cmg-data-throughput/timeSeries');

const APPLY = process.argv.includes('--apply');

/**
 * Re-run the workflow's own builder over the stored native points.
 * Returns the rebuilt timeSeries, or null when the report cannot be rebuilt.
 */
function rebuild(slug, calculated) {
  const series = calculated.timeSeries && calculated.timeSeries.series;
  const native = series && series.native;
  if (!Array.isArray(native) || native.length === 0) return null;

  if (slug === 'cmg-data-throughput') {
    // The throughput builder takes per-period node totals, which is exactly what
    // a native point carries.
    const periods = native.map((p) => ({
      date: new Date(p.timestamp),
      periodKey: p.bucketKey,
      MDC1: Number(p.mdc1) || 0,
      MDC2: Number(p.mdc2) || 0,
      rowCount: 1,
    }));
    return buildThroughputTimeSeries(periods);
  }

  // traffic-volume and telecom-metric share the volume builder. A percentage is
  // an average, not a total.
  const records = native.map((p) => ({
    date: new Date(p.timestamp),
    volume2g3g: Number(p.volume2g3g) || 0,
    volume4g: Number(p.volume4g) || 0,
    totalVolume: Number(p.total) || 0,
    plmnName: p.plmnName,
  }));
  const aggregate = calculated.valueType === 'percent' ? 'avg' : 'sum';
  const rebuilt = buildTimeSeries(records, { aggregate });

  if (slug === 'telecom-metric') {
    // That calculator decorates primary with `value`; reproduce it.
    return {
      ...rebuilt,
      series: {
        ...rebuilt.series,
        primary: rebuilt.series.primary.map((p) => ({ ...p, value: p.total, label: p.label })),
      },
    };
  }
  return rebuilt;
}

const weeklyCount = (ts) => (ts && ts.series && ts.series.weekly ? ts.series.weekly.length : 0);
const dailyCount = (ts) => (ts && ts.series && ts.series.daily ? ts.series.daily.length : 0);

async function main() {
  const { rows } = await pool.query(
    `SELECT pr.id, pr.kpi_name, kw.slug, pr.report_data
     FROM processed_reports pr
     JOIN kpi_workflows kw ON pr.workflow_id = kw.id
     WHERE pr.status = 'completed'
       AND pr.report_data->'calculated'->'timeSeries' IS NOT NULL`
  );

  console.log(`${rows.length} completed report(s) to inspect\n`);
  let changed = 0;
  let unchanged = 0;
  let skipped = 0;

  for (const row of rows) {
    const data = row.report_data || {};
    const calculated = data.calculated || {};
    let rebuilt;
    try {
      rebuilt = rebuild(row.slug, calculated);
    } catch (err) {
      console.log(`  skip  ${row.kpi_name || row.slug} — ${err.message}`);
      skipped += 1;
      continue;
    }
    if (!rebuilt) {
      skipped += 1;
      continue;
    }

    const before = { w: weeklyCount(calculated.timeSeries), d: dailyCount(calculated.timeSeries) };
    const after = { w: weeklyCount(rebuilt), d: dailyCount(rebuilt) };

    if (before.w === after.w && before.d === after.d) {
      unchanged += 1;
      continue;
    }

    console.log(
      `  fix   ${String(row.kpi_name || row.slug).slice(0, 28).padEnd(28)} weekly ${before.w} -> ${after.w}   daily ${before.d} -> ${after.d}`
    );

    if (APPLY) {
      await pool.query('UPDATE processed_reports SET report_data = $2 WHERE id = $1', [
        row.id,
        JSON.stringify({ ...data, calculated: { ...calculated, timeSeries: rebuilt } }),
      ]);
    }
    changed += 1;
  }

  console.log(
    `\n${changed} report(s) ${APPLY ? 'updated' : 'would be updated'}, ${unchanged} already correct, ${skipped} skipped`
  );
  if (!APPLY && changed) console.log('Re-run with --apply to write the changes.');
  await pool.end();
}

main().catch((err) => {
  logger.error('Bucket-key backfill failed', { error: err.message });
  process.exit(1);
});
