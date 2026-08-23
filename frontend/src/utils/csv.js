/**
 * CSV export helpers.
 *
 * Two things bite repeatedly when exporting report data, so they are solved once
 * here rather than in each table:
 *
 *   1. Escaping. A KPI title, a sheet name or a period label can contain a comma,
 *      a quote or a newline. RFC 4180 says: wrap the field in quotes and double
 *      any quote inside it. Anything less produces a file that silently shifts
 *      columns the first time a title contains a comma.
 *   2. Non-ASCII. Chart and KPI titles in this app contain en/em dashes, and a
 *      non-ASCII byte in a filename or a Content-Disposition header has already
 *      broken downloads here once. Filenames are folded to ASCII before use.
 *
 * The payload itself is UTF-8 with a byte-order mark: Excel assumes the local
 * ANSI code page for a BOM-less CSV and mangles anything above ASCII.
 */
import { downloadBlob } from './downloadBlob';

const BOM = '\uFEFF';

/** RFC 4180 field escaping. */
export function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Rows are arrays of primitives; returns the CSV body without the BOM. */
export function buildCsv(headers, rows) {
  const lines = [];
  if (headers?.length) lines.push(headers.map(csvEscape).join(','));
  for (const row of rows || []) lines.push(row.map(csvEscape).join(','));
  // CRLF is what RFC 4180 specifies and what Excel is happiest with.
  return lines.join('\r\n');
}

/**
 * Fold one filename fragment to a lowercase ASCII slug. Dashes of every flavour
 * (en, em, figure, minus) collapse to a plain hyphen first so a title like
 * "CMG throughput — 8 May" does not lose the separator entirely.
 */
export function toAsciiFilePart(value, fallback = '') {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C-\u201F\u2033]/g, '"')
    // Strip whatever survived normalisation (combining marks, CJK, emoji).
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return slug || fallback;
}

/** Join fragments into an ASCII-safe `.csv` name, dropping empty ones. */
export function buildCsvFilename(parts, extension = 'csv') {
  const joined = (Array.isArray(parts) ? parts : [parts])
    .map((part) => toAsciiFilePart(part))
    .filter(Boolean)
    .join('-');
  return `${joined || 'export'}.${extension}`;
}

/** Build and hand the CSV to the browser. */
export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([BOM + buildCsv(headers, rows)], {
    type: 'text/csv;charset=utf-8',
  });
  downloadBlob(blob, filename);
}
