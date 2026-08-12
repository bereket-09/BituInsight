const { median, mad, stdDev } = require('./stats');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Minimum observations per seasonal bucket before we trust that bucket's baseline.
 * Below this the profile is too thin and we fall back to a coarser one.
 */
const MIN_SAMPLES_PER_BUCKET = 3;

/**
 * Normalize a workflow time-series point into the shape the analytics core uses.
 * Both traffic-volume and cmg-data-throughput emit { timestamp, label, total }.
 */
function normalizePoints(series, valueKey = 'total') {
  if (!Array.isArray(series)) return [];

  return series
    .map((p) => {
      const value = Number(p[valueKey]);
      const date = p.timestamp ? new Date(p.timestamp) : null;
      if (!date || Number.isNaN(date.getTime()) || !Number.isFinite(value)) return null;
      return { date, timestamp: p.timestamp, label: p.label || '', value };
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
}

/**
 * Median gap between consecutive points. Median (not mean) so a single data gap
 * doesn't drag the estimate.
 */
function detectCadence(points) {
  if (points.length < 2) {
    return { intervalMs: 0, label: 'Unknown', pointsPerDay: 0 };
  }

  const gaps = [];
  for (let i = 1; i < points.length; i += 1) {
    gaps.push(points[i].date - points[i - 1].date);
  }

  const intervalMs = median(gaps.filter((g) => g > 0));
  if (!intervalMs) return { intervalMs: 0, label: 'Unknown', pointsPerDay: 0 };

  let label;
  if (intervalMs <= 5 * MINUTE) label = '5-minute';
  else if (intervalMs <= 15 * MINUTE) label = '15-minute';
  else if (intervalMs <= 45 * MINUTE) label = '30-minute';
  else if (intervalMs <= 3 * HOUR) label = 'Hourly';
  else if (intervalMs <= 36 * HOUR) label = 'Daily';
  else if (intervalMs <= 10 * DAY) label = 'Weekly';
  else label = 'Monthly';

  return { intervalMs, label, pointsPerDay: DAY / intervalMs };
}

const PROFILES = {
  // Local hours, not UTC: the workflow time series renders its point labels in
  // local time, so bucketing on UTC would report "expected for 22:00" next to a
  // point labelled 01:45. The grouping is equivalent either way; only the label
  // the reader sees differs, and it has to match.
  hourOfDay: {
    id: 'hourOfDay',
    label: 'hour-of-day',
    describe: (key) => `${String(key).padStart(2, '0')}:00`,
    keyOf: (point) => point.date.getHours(),
  },
  dayOfWeek: {
    id: 'dayOfWeek',
    label: 'day-of-week',
    describe: (key) =>
      ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][key],
    keyOf: (point) => point.date.getDay(),
  },
  global: {
    id: 'global',
    label: 'flat',
    describe: () => 'whole series',
    keyOf: () => 'all',
  },
};

/**
 * Pick the finest seasonal profile the data can actually support.
 *
 * Sub-daily data gets an hour-of-day baseline, so the evening busy hour is compared
 * against other evenings rather than against 3am. Daily data spanning multiple weeks
 * gets a day-of-week baseline (weekends legitimately differ from weekdays).
 * Anything thinner falls back to a single flat baseline.
 */
function chooseProfile(points, cadence) {
  if (points.length < 2 * MIN_SAMPLES_PER_BUCKET) return PROFILES.global;

  const spanMs = points[points.length - 1].date - points[0].date;

  if (cadence.intervalMs > 0 && cadence.intervalMs < 12 * HOUR) {
    const spanDays = spanMs / DAY;
    if (spanDays >= 2 && hasEnoughSamples(points, PROFILES.hourOfDay)) {
      return PROFILES.hourOfDay;
    }
  }

  if (cadence.intervalMs >= 12 * HOUR && cadence.intervalMs <= 36 * HOUR) {
    const spanDays = spanMs / DAY;
    if (spanDays >= 21 && hasEnoughSamples(points, PROFILES.dayOfWeek)) {
      return PROFILES.dayOfWeek;
    }
  }

  return PROFILES.global;
}

function hasEnoughSamples(points, profile) {
  const counts = new Map();
  for (const p of points) {
    const key = profile.keyOf(p);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (!counts.size) return false;
  // Every populated bucket must clear the threshold; a profile is only useful
  // if it can speak for the whole series, not just its busiest slice.
  return [...counts.values()].every((c) => c >= MIN_SAMPLES_PER_BUCKET);
}

/**
 * Build the baseline: per-bucket median (the expected value) and MAD (the expected
 * spread), plus a global fallback for buckets that never populated.
 */
function buildBaseline(points, cadence) {
  const profile = chooseProfile(points, cadence);
  const values = points.map((p) => p.value);

  const globalStats = {
    center: median(values),
    spread: mad(values),
    fallbackSpread: stdDev(values),
    count: values.length,
  };

  const buckets = new Map();
  if (profile.id !== 'global') {
    const grouped = new Map();
    for (const p of points) {
      const key = profile.keyOf(p);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(p.value);
    }
    for (const [key, vals] of grouped) {
      buckets.set(key, {
        key,
        label: profile.describe(key),
        center: median(vals),
        spread: mad(vals),
        fallbackSpread: stdDev(vals),
        count: vals.length,
      });
    }
  }

  return {
    profileId: profile.id,
    profileLabel: profile.label,
    global: globalStats,
    buckets,
    /** Expected value + spread for one point, falling back to the global baseline. */
    expectedFor(point) {
      if (profile.id === 'global') return globalStats;
      const bucket = buckets.get(profile.keyOf(point));
      if (!bucket || bucket.count < MIN_SAMPLES_PER_BUCKET) return globalStats;
      return bucket;
    },
    describeFor(point) {
      if (profile.id === 'global') return 'series baseline';
      return profile.describe(profile.keyOf(point));
    },
  };
}

/**
 * Busy-hour profile: the average shape of a day, used for capacity planning
 * and to name the busiest and quietest hours.
 */
function buildDailyShape(points, cadence) {
  if (!cadence.intervalMs || cadence.intervalMs >= 12 * HOUR) return null;

  const grouped = new Map();
  for (const p of points) {
    const hour = p.date.getHours();
    if (!grouped.has(hour)) grouped.set(hour, []);
    grouped.get(hour).push(p.value);
  }
  if (grouped.size < 4) return null;

  const hours = [...grouped.entries()]
    .map(([hour, vals]) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      median: median(vals),
      samples: vals.length,
    }))
    .sort((a, b) => a.hour - b.hour);

  const busiest = hours.reduce((a, b) => (b.median > a.median ? b : a));
  const quietest = hours.reduce((a, b) => (b.median < a.median ? b : a));

  return { hours, busiest, quietest };
}

module.exports = {
  normalizePoints,
  detectCadence,
  buildBaseline,
  buildDailyShape,
  MIN_SAMPLES_PER_BUCKET,
  HOUR,
  DAY,
};
