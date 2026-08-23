const { quantile, round } = require('./stats');
const { DAY } = require('./seasonality');

/**
 * Capacity view of the series.
 *
 * Uses the 95th percentile rather than the absolute maximum as the planning peak —
 * a single freak sample shouldn't drive a capacity decision, but the busy period must.
 *
 * `threshold` is optional: without one we still report the peak and the growth
 * rate, we just can't say how much headroom is left.
 */
function analyzeCapacity(points, trend, options = {}) {
  if (points.length < 4) {
    return { available: false, reason: 'Not enough points for a capacity view' };
  }

  const values = points.map((p) => p.value);
  const planningPeak = quantile(values, 0.95);
  const observedPeak = Math.max(...values);
  const typical = quantile(values, 0.5);

  const result = {
    available: true,
    planningPeak: round(planningPeak),
    observedPeak: round(observedPeak),
    typical: round(typical),
    peakToTypicalRatio: typical > 0 ? round(planningPeak / typical, 2) : null,
    threshold: null,
    headroomPct: null,
    daysToSaturation: null,
    saturationDate: null,
  };

  // Unset is checked before conversion: Number(null) and Number('') are both 0,
  // which would otherwise be read as a deliberate target of zero.
  const rawThreshold = options.threshold;
  const thresholdUnset =
    rawThreshold === null || rawThreshold === undefined || rawThreshold === '';
  const threshold = Number(rawThreshold);
  if (thresholdUnset || !Number.isFinite(threshold) || threshold < 0) return result;

  result.threshold = round(threshold);

  // A target of zero is meaningful ("we want none of this"), but the ratios below
  // divide by it. Report the pass/fail state directly instead of dividing.
  if (threshold === 0) {
    const breached = planningPeak > 0;
    result.headroomPct = breached ? 0 : 100;
    result.utilizationPct = breached ? 100 : 0;
    result.atZeroTarget = true;
    return result;
  }

  result.headroomPct = round(((threshold - planningPeak) / threshold) * 100, 1);
  result.utilizationPct = round((planningPeak / threshold) * 100, 1);

  // Only project a saturation date when the trend is real and rising — otherwise
  // "days to saturation" is an arbitrary number dressed up as a forecast.
  if (
    trend.available &&
    trend.direction === 'rising' &&
    trend.slopePerDay > 0 &&
    planningPeak < threshold
  ) {
    const days = (threshold - planningPeak) / trend.slopePerDay;
    if (Number.isFinite(days) && days > 0 && days < 3650) {
      result.daysToSaturation = round(days, 0);
      result.saturationDate = new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
      result.saturationConfidence = trend.confidence;
    }
  }

  return result;
}

module.exports = { analyzeCapacity };
