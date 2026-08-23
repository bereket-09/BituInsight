/**
 * Persistence for database-defined KPI workflows.
 *
 * The only write path for a definition is saveDefinition(), and it validates before
 * it touches Postgres. That is the whole point of the design: an external AI writes
 * JSON, a human imports it, and *our* validator decides whether it becomes a row.
 * Nothing else in the codebase inserts into workflow_definitions.
 */
const pool = require('../db/pool');
const logger = require('../utils/logger');
const { validateDefinition, formatErrors, SCHEMA_VERSION } = require('./validator');

const SELECT_COLUMNS = `
  id, slug, name, description, version, schema_version, definition,
  source, is_active, created_by, created_at, updated_at
`;

async function listDefinitions({ activeOnly = true } = {}) {
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLUMNS} FROM workflow_definitions
     ${activeOnly ? 'WHERE is_active = TRUE' : ''}
     ORDER BY name`
  );
  return rows;
}

async function getDefinition(slug) {
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLUMNS} FROM workflow_definitions WHERE slug = $1`,
    [slug]
  );
  return rows[0] || null;
}

/**
 * Validate and upsert a definition, and make sure the kpi_workflows catalogue row
 * exists so uploads can reference it. One transaction: a definition that is visible
 * in the catalogue but missing its definition row (or vice versa) would be a
 * half-installed KPI.
 *
 * @param {Object} definition   parsed JSON definition
 * @param {Object} opts
 * @param {string} opts.source  'imported' (default) or 'builtin'
 * @param {string} opts.createdBy  user id, or null
 * @returns {Promise<{ row: Object }>}
 * @throws  Error with .validationErrors when the definition is rejected
 */
async function saveDefinition(definition, { source = 'imported', createdBy = null } = {}) {
  const { valid, errors } = validateDefinition(definition);
  if (!valid) {
    const err = new Error(`Workflow definition rejected:\n${formatErrors(errors)}`);
    err.status = 400;
    err.validationErrors = errors;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO workflow_definitions
         (slug, name, description, version, schema_version, definition, source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         version = EXCLUDED.version,
         schema_version = EXCLUDED.schema_version,
         definition = EXCLUDED.definition,
         is_active = TRUE,
         updated_at = NOW()
       RETURNING ${SELECT_COLUMNS}`,
      [
        definition.slug,
        definition.name,
        definition.description || null,
        definition.version || '1.0.0',
        definition.schemaVersion || SCHEMA_VERSION,
        JSON.stringify(definition),
        source,
        createdBy,
      ]
    );
    const row = rows[0];

    await client.query(
      `INSERT INTO kpi_workflows (slug, name, description, version, metadata, is_active, definition_id)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         version = EXCLUDED.version,
         metadata = EXCLUDED.metadata,
         definition_id = EXCLUDED.definition_id,
         is_active = TRUE,
         updated_at = NOW()`,
      [
        definition.slug,
        definition.name,
        definition.description || null,
        definition.version || '1.0.0',
        JSON.stringify({ ...(definition.metadata || {}), definitionDriven: true }),
        row.id,
      ]
    );

    await client.query('COMMIT');
    logger.info('Workflow definition saved', { slug: definition.slug, source });
    return { row };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Soft delete. Reports already produced from the definition stay readable. */
async function setDefinitionActive(slug, isActive) {
  const { rows } = await pool.query(
    `UPDATE workflow_definitions SET is_active = $2, updated_at = NOW()
     WHERE slug = $1 RETURNING ${SELECT_COLUMNS}`,
    [slug, isActive]
  );
  if (rows[0]) {
    await pool.query('UPDATE kpi_workflows SET is_active = $2, updated_at = NOW() WHERE slug = $1', [slug, isActive]);
  }
  return rows[0] || null;
}

module.exports = {
  listDefinitions,
  getDefinition,
  saveDefinition,
  setDefinitionActive,
};
