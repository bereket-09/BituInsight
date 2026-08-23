/**
 * Shared input schemas.
 *
 * Every tool input is validated and bounded here before any SQL runs: identifiers
 * must be UUIDs, free text is length-capped, page sizes have hard maximums, and all
 * option lists are closed enums. Values are only ever used as bound parameters.
 */

const { z } = require('zod');

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** UUID as a plain regex check, so the schema behaves identically on zod v3 and v4. */
const uuid = (label = 'id') =>
  z.string().regex(UUID_RE, `${label} must be a UUID`);

/** Bounded free text. Never interpolated into SQL — always a bound parameter. */
const text = (max = 200) => z.string().min(1).max(max);

/**
 * Integers arrive as strings from some MCP clients, so coerce, then clamp.
 * The maximum is a hard cap: an out-of-range value is rejected, not silently reduced.
 */
const boundedInt = (min, max, fallback) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const REPORT_STATUSES = ['pending', 'validating', 'processing', 'completed', 'failed'];

/**
 * The workflows defined in code (src/kpi-workflows/registry.js). Kept as a literal
 * rather than read from the registry so building a tool schema never has to touch
 * the database or the app's logger — stdout carries the MCP protocol. Add a slug
 * here if a new workflow module is added to the registry.
 */
const WORKFLOW_SLUGS = ['traffic-volume', 'telecom-metric', 'cmg-data-throughput'];
const FINDING_CATEGORIES = ['anomaly', 'data-quality', 'trend', 'capacity', 'distribution'];
const FINDING_SEVERITIES = ['critical', 'major', 'minor', 'info'];
const QUALITY_GRADES = ['good', 'acceptable', 'degraded', 'unreliable', 'unusable'];

/**
 * Sort options are a closed enum mapped to fixed SQL fragments in the tools, so an
 * ORDER BY clause can never be assembled from caller-supplied text.
 */
const REPORT_SORTS = ['created_desc', 'created_asc', 'completed_desc', 'kpi_asc', 'status_asc'];

/** ISO-8601 date or datetime; Postgres does the final parse via a bound parameter. */
const isoDate = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/,
    'expected an ISO-8601 date such as 2026-05-08 or 2026-05-08T12:00:00Z'
  );

module.exports = {
  z,
  uuid,
  text,
  boundedInt,
  isoDate,
  UUID_RE,
  REPORT_STATUSES,
  WORKFLOW_SLUGS,
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  QUALITY_GRADES,
  REPORT_SORTS,
};
