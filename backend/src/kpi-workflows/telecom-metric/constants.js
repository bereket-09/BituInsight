const DEFAULT_THRESHOLD_PERCENT = 99;

function resolveThreshold(context = {}) {
  const t = Number(context.threshold);
  if (Number.isFinite(t) && t > 0 && t <= 100) return t;
  return DEFAULT_THRESHOLD_PERCENT;
}

module.exports = {
  DEFAULT_THRESHOLD_PERCENT,
  resolveThreshold,
};
