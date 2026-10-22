/**
 * Node identity and cell coercion for NetAct exports.
 *
 * Every NetAct "Data for …" sheet names its node the same way — an IP address,
 * an "@", then a hostname that carries the data centre: "10.43.3.64@MDC1-NK-CMG-CP01".
 * The Peak Attach Users workflow worked this out first; the Total Data Volume and
 * SAAU workflows need exactly the same reading, so it lives here rather than
 * being written a third and fourth time.
 */

/** The two data centres these exports cover, in report order. */
const SITES = ['MDC1', 'MDC2'];

/** "10.43.3.64@MDC1-NK-CMG-CP01" → "MDC1"; anything unrecognised → null. */
function siteOf(nodeName) {
  const m = String(nodeName || '').match(/mdc\s*([12])/i);
  return m ? `MDC${m[1]}` : null;
}

/** The series key a site contributes to: "MDC1" → "mdc1". */
function siteKey(site) {
  return site ? String(site).toLowerCase() : null;
}

/** Short node name for display: drop the IP prefix. */
function shortNode(nodeName) {
  const name = String(nodeName || '').trim();
  const at = name.lastIndexOf('@');
  return (at >= 0 ? name.slice(at + 1) : name).toUpperCase();
}

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value == null || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null || value === '') return null;
  const n = parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

module.exports = { SITES, siteOf, siteKey, shortNode, toDate, toNumber };
