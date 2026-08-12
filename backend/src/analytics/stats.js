/**
 * Primitive statistics used across the analytics core.
 * Everything here is pure and side-effect free so it can be unit tested directly.
 */

function round(val, decimals = 2) {
  if (!Number.isFinite(val)) return 0;
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

function sum(values) {
  return values.reduce((acc, v) => acc + v, 0);
}

function mean(values) {
  if (!values.length) return 0;
  return sum(values) / values.length;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(sum(values.map((v) => (v - m) ** 2)) / values.length);
}

/**
 * Median absolute deviation — a robust spread measure that a single huge spike
 * cannot inflate the way it inflates standard deviation.
 */
function mad(values) {
  if (!values.length) return 0;
  const med = median(values);
  return median(values.map((v) => Math.abs(v - med)));
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Robust z-score. 0.6745 is the constant that makes MAD a consistent estimator
 * of sigma for normally distributed data, so the scale matches a classic z-score.
 * Falls back to standard deviation when MAD collapses to zero (very flat data).
 */
function robustScore(value, center, spread, fallbackSpread) {
  if (spread > 0) return (0.6745 * (value - center)) / spread;
  if (fallbackSpread > 0) return (value - center) / fallbackSpread;
  return 0;
}

/**
 * Ordinary least squares against the point index.
 * Returns slope per point, intercept, r-squared, and the residual standard error
 * used to build forecast bands.
 */
function linearRegression(values) {
  const n = values.length;
  if (n < 2) {
    return { slope: 0, intercept: values[0] || 0, r2: 0, residualStdError: 0, n };
  }

  const xs = values.map((_, i) => i);
  const xMean = mean(xs);
  const yMean = mean(values);

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    numerator += (xs[i] - xMean) * (values[i] - yMean);
    denominator += (xs[i] - xMean) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i += 1) {
    const predicted = intercept + slope * xs[i];
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - yMean) ** 2;
  }

  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const residualStdError = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;

  return { slope, intercept, r2, residualStdError, n };
}

module.exports = {
  round,
  sum,
  mean,
  median,
  stdDev,
  mad,
  quantile,
  robustScore,
  linearRegression,
};
