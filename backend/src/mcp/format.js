/**
 * Response shaping helpers.
 *
 * Every tool returns a single compact JSON text block. JSON is emitted without
 * indentation on purpose: an MCP response is model context, and pretty-printing a
 * few hundred rows costs a meaningful number of tokens for zero information gain.
 */

/** Wrap a payload as an MCP text result carrying compact JSON. */
function jsonResult(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  };
}

/** A real failure (bad input, database error). Marked so the client sees it as an error. */
function errorResult(message, details) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: true, message, ...(details ? { details } : {}) }),
      },
    ],
    isError: true,
  };
}

/**
 * "Nothing matched" is a normal answer, not a failure, so it comes back as an
 * ordinary result the model can reason about instead of an exception.
 */
function notFoundResult(what, identifier, hint) {
  return jsonResult({
    found: false,
    message: `No ${what} found for ${JSON.stringify(identifier)}`,
    ...(hint ? { hint } : {}),
  });
}

/**
 * Bound an array and say so explicitly. Silent truncation would make a model
 * confidently reason about a partial series, so the omission is always reported.
 */
function truncateArray(array, limit, label = 'items') {
  const source = Array.isArray(array) ? array : [];
  if (source.length <= limit) {
    return { items: source, total: source.length, truncated: false };
  }
  return {
    items: source.slice(0, limit),
    total: source.length,
    truncated: true,
    truncationNote:
      `Returned the first ${limit} of ${source.length} ${label}; ` +
      `${source.length - limit} omitted. Raise "limit" or page through to see more.`,
  };
}

/** Keep only the requested keys of an object (used to trim wide JSONB blobs). */
function pick(source, keys) {
  if (!source || typeof source !== 'object') return source;
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

/** Drop null/undefined entries so empty columns do not cost tokens. */
function compact(object) {
  const out = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Replace a deeply nested value with a size marker once it exceeds `maxChars`
 * of JSON. Used for blobs like a full Chart.js config, where the model usually
 * wants to know the shape rather than every one of 288 labels.
 */
function summarizeLarge(value, maxChars, label) {
  const json = JSON.stringify(value);
  if (json === undefined) return value;
  if (json.length <= maxChars) return value;
  return {
    omitted: true,
    note: `${label} omitted: ${json.length} characters of JSON exceeds the ${maxChars} character inline limit.`,
    ...(Array.isArray(value) ? { arrayLength: value.length } : {}),
    ...(value && typeof value === 'object' && !Array.isArray(value)
      ? { keys: Object.keys(value) }
      : {}),
  };
}

/** Wrap a tool handler so unexpected failures surface as tool errors, never crashes. */
function safeTool(handler) {
  return async (args, extra) => {
    try {
      return await handler(args || {}, extra);
    } catch (err) {
      return errorResult(err.message || String(err), {
        code: err.code || undefined,
      });
    }
  };
}

module.exports = {
  jsonResult,
  errorResult,
  notFoundResult,
  truncateArray,
  pick,
  compact,
  summarizeLarge,
  safeTool,
};
