const { SITES, siteKey } = require('./netactNodes');

/**
 * Hourly / daily / weekly series for a counter reported per data centre.
 *
 * Both the Total Data Volume and the SAAU exports have the same shape: one row
 * per node per hour, two nodes, one in each data centre. The arithmetic that
 * turns that into "MDC1, MDC2 and combined, with a daily average and a daily
 * peak" is identical; only the fields, the unit and the scaling differ, and those
 * are arguments. Nothing in here knows what a terabyte or a bearer is — a
 * workflow passes its own `scale`, so a unit conversion can never leak from one
 * KPI into another.
 *
 * Two deliberate choices:
 *
 * - **Combined is paired at the timestamp.** The combined figure for an hour is
 *   MDC1 + MDC2 *of that hour*, never the sum of two separately-aggregated
 *   totals. A day's combined average is then the mean of those paired hours.
 * - **Everything is computed at full precision** and rounded once, at the point
 *   a value is written into a series point for display.
 *
 * An hour in which one data centre is missing from the export is a *partial*
 * hour. It is kept in the series — the gap is worth seeing — but it is left out
 * of every average, because counting a silent node as zero drags the mean down
 * and makes the quieter site look weaker than it was. Peaks still consider every
 * hour: a partial hour can only ever be lower, so it can never invent one. Each
 * bucket reports how many of its hours were partial, and a bucket with no
 * complete hour at all averages what it has rather than reporting nothing.
 *
 * Timestamps are read in UTC. A NetAct "Period start time" is a wall-clock value
 * with no zone, which ExcelJS surfaces as a UTC instant; bucketing it in UTC
 * reproduces the hours and days the export itself shows, whatever the zone of
 * the machine running the report.
 */

const UTC = { timeZone: 'UTC' };

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function hourKey(date) {
  return `${dayKey(date)}T${String(date.getUTCHours()).padStart(2, '0')}`;
}

function weekStart(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

function bucketKeyFor(date, bucket) {
  if (bucket === 'day') return dayKey(date);
  if (bucket === 'week') return dayKey(weekStart(date));
  return hourKey(date);
}

function formatLabel(date, bucket) {
  if (bucket === 'day') {
    return date.toLocaleDateString('en-GB', { ...UTC, weekday: 'short', day: 'numeric', month: 'short' });
  }
  if (bucket === 'week') {
    return `Week of ${date.toLocaleDateString('en-GB', { ...UTC, day: 'numeric', month: 'short' })}`;
  }
  return date.toLocaleString('en-GB', {
    ...UTC,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatSpanLabel(start, end) {
  if (!start || !end) return '—';
  const s = new Date(start);
  const e = new Date(end);
  const opts = { ...UTC, day: 'numeric', month: 'short', year: 'numeric' };
  if (dayKey(s) === dayKey(e)) return s.toLocaleDateString('en-GB', opts);
  return `${s.toLocaleDateString('en-GB', opts)} – ${e.toLocaleDateString('en-GB', opts)}`;
}

/** `HH:00` in UTC, for the hour-of-day profile. */
function hourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

/**
 * Add every node's reading for an hour together, and split the headline measure
 * by data centre.
 *
 * `records` are `{ date, site, node, values: { total, …breakdown } }`.
 * Returns unrounded internals: `{ date, sums, sites, nodes }`.
 */
function collectHours(records, fields, expected) {
  const byHour = new Map();

  for (const r of records) {
    const key = hourKey(r.date);
    if (!byHour.has(key)) {
      const date = new Date(r.date);
      date.setUTCMinutes(0, 0, 0);
      byHour.set(key, {
        key,
        date,
        sums: Object.fromEntries(fields.map((f) => [f, 0])),
        sites: Object.fromEntries(SITES.map((s) => [siteKey(s), 0])),
        reporting: new Set(),
        nodes: new Set(),
      });
    }
    const hour = byHour.get(key);
    for (const f of fields) hour.sums[f] += r.values[f] || 0;
    const key2 = siteKey(r.site);
    if (key2 && key2 in hour.sites) {
      hour.sites[key2] += r.values.total || 0;
      hour.reporting.add(key2);
    }
    hour.nodes.add(r.node);
  }

  const hours = [...byHour.values()].sort((a, b) => a.date - b.date);
  for (const hour of hours) hour.complete = hour.reporting.size >= expected.length;
  return hours;
}

/** The hours every expected data centre reported — what averages are taken over. */
function completeOf(hours) {
  const complete = hours.filter((h) => h.complete);
  return complete.length ? complete : hours;
}

/**
 * Days or weeks: how the hours combine depends on what is being measured.
 *
 * A data volume is cumulative — a day is the hours added up, and averaging them
 * would report a typical hour while calling it a day. A count of concurrent
 * bearers is not cumulative: adding 24 hourly SAAU figures would describe
 * nothing real, so those are averaged. Peaks are the busiest hour either way.
 */
function collectBuckets(hours, bucket, fields, dailyAggregate = 'avg') {
  const groups = new Map();
  for (const h of hours) {
    const key = bucketKeyFor(h.date, bucket);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => {
      const start = bucket === 'week' ? weekStart(group[0].date) : new Date(`${dayKey(group[0].date)}T00:00:00.000Z`);
      // Averages are taken over the hours every data centre reported, so a gap
      // in one node's export does not pull the other's average down.
      const whole = completeOf(group);
      // A sum counts every hour that was recorded; an average is taken only over
      // the hours all sites reported, so one node's gap cannot drag it down.
      const summing = dailyAggregate === 'sum';
      const basis = summing ? group : whole;
      const combine = summing
        ? (values) => values.reduce((a, b) => a + b, 0)
        : mean;
      const avg = Object.fromEntries(fields.map((f) => [f, combine(basis.map((h) => h.sums[f]))]));
      const avgSites = Object.fromEntries(
        SITES.map((s) => [siteKey(s), combine(basis.map((h) => h.sites[siteKey(s)]))])
      );
      const peakHour = group.reduce((best, h) => (h.sums.total > best.sums.total ? h : best), group[0]);
      const peakSites = Object.fromEntries(
        SITES.map((s) => {
          const k = siteKey(s);
          const best = group.reduce((b, h) => (h.sites[k] > b.sites[k] ? h : b), group[0]);
          return [k, { value: best.sites[k], date: best.date }];
        })
      );
      return {
        key,
        date: start,
        sums: avg,
        sites: avgSites,
        hours: group.length,
        completeHours: whole.length,
        partialHours: group.filter((h) => !h.complete).length,
        peak: { value: peakHour.sums.total, date: peakHour.date, sites: { ...peakHour.sites } },
        peakSites,
      };
    });
}

function emit(raw, { bucket, fields, scale, decimals }) {
  const out = {
    timestamp: raw.date.toISOString(),
    bucketKey: raw.key,
    label: formatLabel(raw.date, bucket),
  };
  for (const f of fields) out[f] = round(raw.sums[f] * scale, decimals);
  for (const s of SITES) {
    const k = siteKey(s);
    out[k] = round(raw.sites[k] * scale, decimals);
  }
  // `value` is what the generic engine, the data table and the analytics layer
  // read as "the number for this point".
  out.value = out.total;
  const total = raw.sums.total;
  for (const s of SITES) {
    const k = siteKey(s);
    out[`${k}SharePct`] = total > 0 ? round((raw.sites[k] / total) * 100, 1) : 0;
  }

  if (bucket === 'hour') {
    out.nodeCount = raw.nodes.size;
    out.sitesReporting = raw.reporting.size;
    out.complete = raw.complete;
  } else {
    out.hours = raw.hours;
    out.completeHours = raw.completeHours;
    out.partialHours = raw.partialHours;
    out.peakTotal = round(raw.peak.value * scale, decimals);
    out.peakAt = formatLabel(raw.peak.date, 'hour');
    out.peakAtTimestamp = raw.peak.date.toISOString();
    out.peakHourOfDay = hourLabel(raw.peak.date.getUTCHours());
    for (const s of SITES) {
      const k = siteKey(s);
      // The combined peak hour broken down, and each site's own busiest hour —
      // which need not be the same hour.
      out[`peakHour${s}`] = round(raw.peak.sites[k] * scale, decimals);
      out[`peak${s}`] = round(raw.peakSites[k].value * scale, decimals);
      out[`peak${s}At`] = formatLabel(raw.peakSites[k].date, 'hour');
    }
  }
  return out;
}

function findBest(series, field, compare) {
  if (!series?.length) return null;
  const best = series.reduce((b, p) => (compare(p[field], b[field]) ? p : b), series[0]);
  return { ...best, volume: best[field] };
}

/**
 * Build every view of a per-site counter.
 *
 * @param {Array}  records  `{ date, site, node, values: { total, …fields } }`
 * @param {Object} config
 * @param {string[]} config.fields    every summed field, `total` included
 * @param {number} config.scale       multiplier applied to every raw value (1 = none)
 * @param {number} config.decimals    display rounding
 * @param {'sum'|'avg'} [config.dailyAggregate='avg']  how hours combine into a
 *   day or week: 'sum' for a cumulative measure such as data volume, 'avg' for
 *   a level such as concurrent bearers.
 */
function buildSiteTimeSeries(records, { fields, scale = 1, decimals = 0, dailyAggregate = 'avg' }) {
  // "Every data centre" means every one this export actually carries, so a
  // single-site file is not read as 100% partial.
  const expected = SITES.filter((site) => records.some((r) => r.site === site));
  const hoursRaw = collectHours(records, fields, expected.length ? expected : SITES);
  const dailyRaw = collectBuckets(hoursRaw, 'day', fields, dailyAggregate);
  const weeklyRaw = dailyRaw.length > 7 ? collectBuckets(hoursRaw, 'week', fields, dailyAggregate) : [];

  const opts = { fields, scale, decimals };
  const native = hoursRaw.map((h) => emit(h, { ...opts, bucket: 'hour' }));
  const daily = dailyRaw.map((d) => emit(d, { ...opts, bucket: 'day' }));
  const weekly = weeklyRaw.map((w) => emit(w, { ...opts, bucket: 'week' }));

  const spanStart = native[0]?.timestamp;
  const spanEnd = native[native.length - 1]?.timestamp;

  const options = [
    { id: 'native', label: `Hourly (${native.length} hours)`, granularity: 'hourly', pointCount: native.length },
  ];
  if (daily.length > 1) {
    options.push({
      id: 'daily',
      label: `Daily average (${daily.length} days)`,
      granularity: 'daily',
      pointCount: daily.length,
    });
  }
  if (weekly.length > 1) {
    options.push({
      id: 'weekly',
      label: `Weekly average (${weekly.length} weeks)`,
      granularity: 'weekly',
      pointCount: weekly.length,
    });
  }

  return {
    detected: {
      key: 'hourly',
      label: 'Hourly',
      bucket: 'hour',
      pointCount: native.length,
      spanStart,
      spanEnd,
      spanLabel: formatSpanLabel(spanStart, spanEnd),
      periodLabel: 'hour',
      dayCount: daily.length,
      expectedSites: expected,
      partialHours: native.filter((p) => !p.complete).length,
      timeZoneNote: 'Hours and days follow the period start times in the export (UTC).',
    },
    series: { native, daily, weekly, primary: native },
    availableSpans: { auto: 'native', options },
    peak: findBest(native, 'total', (a, b) => a > b),
    min: findBest(native, 'total', (a, b) => a < b),
    peaksByView: {
      native: findBest(native, 'total', (a, b) => a > b),
      daily: findBest(daily, 'peakTotal', (a, b) => a > b),
      weekly: findBest(weekly, 'peakTotal', (a, b) => a > b),
    },
    dailyPeaks: daily.map((d) => ({
      dayLabel: d.label,
      periodLabel: d.peakAt,
      hourOfDay: d.peakHourOfDay,
      total: d.peakTotal,
      average: d.total,
    })),
  };
}

/** The hours of a finished series in which every data centre reported. */
function wholeHours(native) {
  const complete = (native || []).filter((p) => p.complete !== false);
  return complete.length ? complete : native || [];
}

/** The shape of a typical day: each hour of day averaged across the report. */
function buildHourProfile(native, fields, decimals = 0) {
  const byHour = new Map();
  for (const p of wholeHours(native)) {
    const hour = new Date(p.timestamp).getUTCHours();
    if (!byHour.has(hour)) byHour.set(hour, []);
    byHour.get(hour).push(p);
  }
  return [...byHour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, points]) => {
      const row = { hour, label: hourLabel(hour) };
      for (const f of [...fields, 'mdc1', 'mdc2']) {
        row[f] = round(mean(points.map((p) => p[f])), decimals);
      }
      row.peakTotal = round(Math.max(...points.map((p) => p.total)), decimals);
      return row;
    });
}

/**
 * Overall peak / average / lowest of one field across the hourly series.
 *
 * The peak looks at every hour; the average and the low look only at the hours
 * every data centre reported, so a gap in the export is not read as a quiet hour.
 */
function statOf(native, field, decimals = 0) {
  if (!native.length) return { peak: 0, peakAt: 'N/A', average: 0, min: 0, minAt: 'N/A' };
  const whole = wholeHours(native);
  const peak = native.reduce((b, p) => (p[field] > b[field] ? p : b), native[0]);
  const min = whole.reduce((b, p) => (p[field] < b[field] ? p : b), whole[0]);
  return {
    peak: peak[field],
    peakAt: peak.label,
    peakTimestamp: peak.timestamp,
    average: round(mean(whole.map((p) => p[field])), decimals),
    min: min[field],
    minAt: min.label,
    hoursAveraged: whole.length,
  };
}

module.exports = {
  SITES,
  round,
  mean,
  dayKey,
  formatLabel,
  formatSpanLabel,
  buildSiteTimeSeries,
  buildHourProfile,
  wholeHours,
  statOf,
};
