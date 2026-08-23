/**
 * Parse a KPI target typed into a number input.
 *
 * Zero is a legitimate target — some KPIs are "we want none of this" — so the
 * common `Number(value) || fallback` shortcut is wrong here: it treats a typed 0
 * as empty and silently substitutes the default.
 *
 * An empty or unparseable field falls back; 0 does not.
 */
export function parseTarget(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}
