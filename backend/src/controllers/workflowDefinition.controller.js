/**
 * Import API for database-defined KPI workflows.
 *
 * This is the only way a definition reaches the database from outside the process.
 * An external AI writes JSON, a human pastes it here, and our validator — not the
 * AI — decides whether it becomes a row. The controller therefore does three things
 * and nothing else: it parses, it asks the validator, and it hands an accepted
 * document to the store. It never edits a definition to make it pass.
 *
 * Two rules are enforced here rather than in the store, because they are about the
 * shape of the catalogue rather than the shape of a document:
 *
 *   1. A built-in (code) workflow slug can never be imported. The registry already
 *      resolves code modules first, so an import could not change how a built-in
 *      behaves — but it would still overwrite that workflow's catalogue row, so the
 *      name and description users see would come from untrusted input. Rejected.
 *   2. A built-in slug can never be deleted. Deactivating the catalogue row would
 *      hide a workflow that is still fully functional in code, which looks exactly
 *      like data loss to the person who did it.
 *
 * The validate endpoint answers 200 with `valid: false` rather than 4xx: a dry run
 * that reports problems has done its job, and the UI needs the error list either
 * way. Only a malformed *request* (no definition at all) is a 400.
 */
const definitions = require('../kpi-definitions');
const { isBuiltIn } = require('../kpi-workflows/registry');
const logger = require('../utils/logger');

/**
 * Examples are required statically, not read from disk, so the serverless bundler
 * traces them as dependencies and they exist in the deployed function.
 */
const EXAMPLES = {
  'traffic-volume': require('../kpi-definitions/examples/traffic-volume.definition.json'),
  'cmg-data-throughput': require('../kpi-definitions/examples/cmg-data-throughput.definition.json'),
};

/** Shape a stored row for the list/detail views. Never leaks created_by identity. */
function serializeRow(row, { includeDefinition = false } = {}) {
  const out = {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    version: row.version,
    schemaVersion: row.schema_version,
    source: row.source,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeDefinition) {
    out.definition = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
  }
  return out;
}

/**
 * Accept either `{ definition: {...} }`, `{ definition: "<json text>" }`, or the
 * definition document posted at the top level. The AI-authored JSON the user pastes
 * is the document itself, and asking them to wrap it by hand is one more chance to
 * produce broken JSON.
 *
 * @returns {{ definition: unknown|null, errors: Array }}
 */
function readDefinitionFromBody(body) {
  if (!body || typeof body !== 'object') {
    return { definition: null, errors: [{ path: '', message: 'Request body is empty', expected: 'a JSON workflow definition' }] };
  }

  let candidate = Object.prototype.hasOwnProperty.call(body, 'definition') ? body.definition : body;

  if (typeof candidate === 'string') {
    const text = candidate.trim();
    if (!text) {
      return { definition: null, errors: [{ path: '', message: 'No definition was provided', expected: 'a JSON workflow definition' }] };
    }
    try {
      candidate = JSON.parse(text);
    } catch (err) {
      // A syntax error is reported at the same shape as a schema error so the UI
      // has one error list to render, not two.
      return {
        definition: null,
        errors: [{ path: '', message: `The text is not valid JSON — ${err.message}`, expected: 'a JSON object starting with { and ending with }' }],
      };
    }
  }

  if (candidate === null || candidate === undefined) {
    return { definition: null, errors: [{ path: '', message: 'No definition was provided', expected: 'a JSON workflow definition' }] };
  }

  return { definition: candidate, errors: [] };
}

/**
 * What the definition will create, in the words the user will see on the workflow
 * card. Built by compiling the (already validated) document, so the preview reflects
 * what the interpreter actually derives rather than a second reading of the JSON.
 */
function buildPreview(definition) {
  const compiled = definitions.compileDefinition(definition, { skipValidation: true });
  return {
    slug: compiled.slug,
    name: compiled.name,
    description: compiled.description,
    version: compiled.version,
    schemaVersion: definition.schemaVersion,
    metadata: compiled.metadata,
    requiredColumns: (compiled.requiredColumns || []).map((c) => ({
      key: c.key,
      label: c.label,
      type: c.type,
      required: c.required,
      aliasCount: Array.isArray(c.aliases) ? c.aliases.length : 0,
    })),
    metrics: (definition.metrics || []).map((m) => ({
      key: m.key,
      label: m.label || m.key,
      op: m.op,
      format: m.format || null,
      unit: m.unit || null,
    })),
    charts: (compiled.chartDefinitions || []).map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
    })),
    streams: (definition.series?.streams || []).map((s) => ({ key: s.key, label: s.label })),
    timestampField: definition.transform?.timestampField || null,
    valueField: definition.series?.valueField || null,
    highlightCount: (definition.presentation?.highlights || []).length,
  };
}

/** GET /api/workflow-definitions */
async function listDefinitions(req, res, next) {
  try {
    const rows = await definitions.store.listDefinitions({ activeOnly: false });
    res.json({
      definitions: rows.map((row) => serializeRow(row)),
      schemaVersion: definitions.SCHEMA_VERSION,
      supportedSchemaVersions: definitions.SUPPORTED_SCHEMA_VERSIONS,
      examples: Object.keys(EXAMPLES),
    });
  } catch (err) {
    next(err);
  }
}

/** GET /api/workflow-definitions/examples/:name */
function getExample(req, res) {
  const example = EXAMPLES[req.params.name];
  if (!example) {
    return res.status(404).json({ error: `No example definition named "${req.params.name}"`, available: Object.keys(EXAMPLES) });
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}.definition.json"`);
  res.send(JSON.stringify(example, null, 2));
}

/** GET /api/workflow-definitions/:slug */
async function getDefinition(req, res, next) {
  try {
    const row = await definitions.store.getDefinition(req.params.slug);
    if (!row) {
      return res.status(404).json({ error: `No stored definition for "${req.params.slug}"` });
    }
    res.json({ definition: serializeRow(row, { includeDefinition: true }) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/workflow-definitions/validate
 * Dry run. Nothing is written, nothing is cached, no slug is reserved.
 */
async function validateImport(req, res, next) {
  try {
    const { definition, errors: parseErrors } = readDefinitionFromBody(req.body);
    if (parseErrors.length) {
      return res.json({ valid: false, errors: parseErrors });
    }

    const { valid, errors } = definitions.validateDefinition(definition);
    if (!valid) {
      return res.json({ valid: false, errors });
    }

    const slug = definition.slug;
    if (isBuiltIn(slug)) {
      return res.json({
        valid: false,
        errors: [
          {
            path: 'slug',
            message: `"${slug}" is a built-in workflow and cannot be replaced by an import`,
            expected: 'a slug that is not one of the built-in workflows',
          },
        ],
      });
    }

    let preview;
    try {
      preview = buildPreview(definition);
    } catch (err) {
      // The validator passed but the interpreter could not bind the document. That
      // is a bug on our side rather than the author's, so say so plainly instead of
      // pretending it is a schema error.
      logger.error('Validated definition failed to compile', { slug, error: err.message });
      return res.json({
        valid: false,
        errors: [{ path: '', message: `The definition passed validation but could not be compiled — ${err.message}` }],
      });
    }

    const existing = await definitions.store.getDefinition(slug);
    res.json({
      valid: true,
      errors: [],
      preview,
      replaces: existing ? serializeRow(existing) : null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/workflow-definitions/import
 * Validate, persist, refresh the compiled cache. The workflow is usable for uploads
 * the moment this returns.
 */
async function importDefinition(req, res, next) {
  try {
    const { definition, errors: parseErrors } = readDefinitionFromBody(req.body);
    if (parseErrors.length) {
      return res.status(400).json({ error: parseErrors[0].message, errors: parseErrors });
    }

    const { valid, errors } = definitions.validateDefinition(definition);
    if (!valid) {
      return res.status(400).json({ error: 'The workflow definition was rejected', errors });
    }

    const slug = definition.slug;
    if (isBuiltIn(slug)) {
      return res.status(409).json({
        error: `"${slug}" is a built-in workflow. Built-in workflows cannot be replaced or shadowed by an import — choose a different slug.`,
        errors: [
          {
            path: 'slug',
            message: `"${slug}" is a built-in workflow and cannot be replaced by an import`,
            expected: 'a slug that is not one of the built-in workflows',
          },
        ],
      });
    }

    const { row } = await definitions.importDefinition(definition, {
      // The client never chooses the source. Only a seed script writes 'builtin'.
      source: 'imported',
      createdBy: req.user?.id || null,
    });

    logger.info('Workflow definition imported', { slug: row.slug, userId: req.user?.id });
    res.status(201).json({
      definition: serializeRow(row, { includeDefinition: true }),
      preview: buildPreview(definition),
    });
  } catch (err) {
    if (err.validationErrors) {
      return res.status(400).json({ error: 'The workflow definition was rejected', errors: err.validationErrors });
    }
    next(err);
  }
}

/**
 * DELETE /api/workflow-definitions/:slug
 * Deactivates rather than deletes: reports already produced from the definition stay
 * readable, and re-importing the same slug brings it back.
 */
async function removeDefinition(req, res, next) {
  try {
    const { slug } = req.params;

    if (isBuiltIn(slug)) {
      return res.status(409).json({
        error: `"${slug}" is a built-in workflow and is not managed through imports. It cannot be removed.`,
      });
    }

    const existing = await definitions.store.getDefinition(slug);
    if (!existing) {
      return res.status(404).json({ error: `No stored definition for "${slug}"` });
    }
    if (existing.source === 'builtin') {
      return res.status(409).json({
        error: `"${slug}" was installed as a built-in definition and cannot be removed through the import UI.`,
      });
    }

    const row = await definitions.store.setDefinitionActive(slug, false);
    definitions.invalidate(slug);

    logger.info('Workflow definition deactivated', { slug, userId: req.user?.id });
    res.json({ definition: serializeRow(row) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listDefinitions,
  getDefinition,
  getExample,
  validateImport,
  importDefinition,
  removeDefinition,
};
