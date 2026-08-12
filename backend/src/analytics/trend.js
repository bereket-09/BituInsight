const { linearRegression, median, round, mean } = require('./stats');
const { DAY } = require('./seasonality');

/**
 * Collapse sub-daily points to one value per day before fitting a trend.
 * Without this, intra-day seasonality dominates the regression and the slope
 * mostly reflects where in the day the series happens to start and end.
 */
function toDailyMedians(points) {
  const byDay = new Map();
  for (const p of points) {
    const key = p.timestamp.slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, { key, date: p.date, values: [] });
    byDay.get(key).values.push(p.value);
  }
  return [...byDay.values()]
    .sort((a, b) => a.date - b.date)
    .map((d) => ({ key: d.key, date: d.date, value: median(d.values) }));
}

/**
 * Fit a linear trend and project it forward.
 *
 * `r2` is reported alongside the slope so a caller can tell a real trend from a
 * line drawn through noise — a steep slope with r2 of 0.05 means nothing.
 */
function analyzeTrend(points, cadence) {
  if (points.length < 4) {
    return { available: false, reason: 'Not enough points to fit a trend' };
  }

  const subDaily = cadence.intervalMs > 0 && cadence.intervalMs < 12 * 60 * 60 * 1000;
  const daily = subDaily ? toDailyMedians(points) : null;
  const useDaily = Boolean(daily && daily.length >= 4);

  const seriesForFit = useDaily ? daily : points;
  const values = seriesForFit.map((p) => p.value);
  const fit = linearRegression(values);

  const stepMs = useDaily ? DAY : cadence.intervalMs || DAY;
  const slopePerDay = stepMs > 0 ? fit.slope * (DAY / stepMs) : 0;

  const baseLevel = mean(values);
  const slopePerDayPct = baseLevel !== 0 ? (slopePerDay / baseLevel) * 100 : 0;

  const spanDays = (points[points.length - 1].date - points[0].date) / DAY;
  const totalChange = fit.slope * (values.length - 1);
  const totalChangePct = baseLevel !== 0 ? (totalChange / baseLevel) * 100 : 0;

  // r2 below 0.3 means the line explains almost none of the variation; call it flat
  // rather than inventing a direction from noise.
  let direction = 'flat';
  if (fit.r2 >= 0.3 && Math.abs(slopePerDayPct) >= 0.5) {
    direction = slopePerDay > 0 ? 'rising' : 'falling';
  }

  return {
    available: true,
    basis: useDaily ? 'daily medians' : 'native cadence',
    pointsFitted: values.length,
    spanDays: round(spanDays, 1),
    slopePerDay: round(slopePerDay, 3),
    slopePerDayPct: round(slopePerDayPct, 2),
    totalChange: round(totalChange),
    totalChangePct: round(totalChangePct, 1),
    r2: round(fit.r2, 3),
    confidence: fit.r2 >= 0.6 ? 'high' : fit.r2 >= 0.3 ? 'moderate' : 'low',
    direction,
    _fit: fit,
    _stepMs: stepMs,
    _lastIndex: values.length - 1,
    _lastDate: seriesForFit[seriesForFit.length - 1].date,
  };
}

/**
 * Project the fitted line forward with a 95% prediction band derived from the
 * residual spread of the fit itself.
 */
function forecast(trend, horizonSteps = 7) {
  if (!trend.available || trend.confidence === 'low') {
    return {
      available: false,
      reason: trend.available
        ? 'Trend is too weak to project (r² below 0.3)'
        : trend.reason,
    };
  }

  const { _fit: fit, _stepMs: stepMs, _lastIndex: lastIndex, _lastDate: lastDate } = trend;
  const band = 1.96 * fit.residualStdError;
  const projections = [];

  for (let step = 1; step <= horizonSteps; step += 1) {
    const index = lastIndex + step;
    const value = fit.intercept + fit.slope * index;
    const date = new Date(lastDate.getTime() + step * stepMs);
    projections.push({
      step,
      timestamp: date.toISOString(),
      date: date.toISOString().slice(0, 10),
      value: round(Math.max(0, value)),
      low: round(Math.max(0, value - band)),
      high: round(Math.max(0, value + band)),
    });
  }

  return {
    available: true,
    unitLabel: stepMs === DAY ? 'day' : 'period',
    horizon: horizonSteps,
    confidence: trend.confidence,
    bandWidth: round(band),
    projections,
  };
}

module.exports = { analyzeTrend, forecast, toDailyMedians };
