const DEFAULT_THRESHOLD_PERCENT = 99;

/**
 * Resolve a KPI target from context.
 *
 * Zero is a legitimate target — plenty of telecom KPIs are "we want none of this"
 * (dropped calls, failed handovers, packet loss). It must therefore be preserved
 * rather than treated as absent, which previously turned a target of 0 silently
 * into 99.
 *
 * "Not set" is checked before the numeric conversion, because Number(null) and
 * Number('') are both 0 and would otherwise be mistaken for a deliberate zero.
 */
function isUnset(value) {
  return value === null || value === undefined || value === '';
}

function resolveThreshold(context = {}) {
  if (isUnset(context.threshold)) return DEFAULT_THRESHOLD_PERCENT;
  const t = Number(context.threshold);
  if (Number.isFinite(t) && t >= 0 && t <= 100) return t;
  return DEFAULT_THRESHOLD_PERCENT;
}

module.exports = {
  DEFAULT_THRESHOLD_PERCENT,
  resolveThreshold,
  isUnset,
};
