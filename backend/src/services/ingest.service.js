const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db/pool');
const config = require('../config');
const logger = require('../utils/logger');
const { loadWorkbook } = require('../utils/workbookLoader');
const { findWorkflowForWorkbook, getWorkflow } = require('../kpi-workflows/registry');
const { previewExcel } = require('./workflowEngine.service');
const reportService = require('./report.service');
const cmmWorkbook = require('./cmmWorkbook.service');

/**
 * Automatic imports: a file arrives with no one at the upload page, so the
 * portal decides what it is and runs it through the same workflow a person
 * would have picked. The result lands in the key owner's reports exactly like a
 * manual upload; ingest_events records what happened to every file.
 */

const KEY_PREFIX = 'cik_';
const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls']);

// --- Schema ------------------------------------------------------------------

/**
 * Migrations run from the seed script, not on boot. A deploy that adds this
 * feature should work before anyone remembers to run it, so the (idempotent)
 * migration is applied on first use, once per instance.
 */
let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    const sql = fs.readFileSync(path.join(__dirname, '../db/migrations/006-ingest.sql'), 'utf8');
    schemaReady = pool.query(sql).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

// --- Keys --------------------------------------------------------------------

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function createKey(userId, name) {
  await ensureSchema();
  const key = `${KEY_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;
  const id = uuidv4();
  const label = String(name || '').trim().slice(0, 80) || 'Automation key';
  await pool.query(
    `INSERT INTO ingest_keys (id, user_id, name, key_prefix, key_hash) VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, label, key.slice(0, KEY_PREFIX.length + 6), hashKey(key)]
  );
  // The only time the key itself exists outside the caller's hands.
  return { id, name: label, key, keyPrefix: key.slice(0, KEY_PREFIX.length + 6) };
}

async function listKeys(userId) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT id, name, key_prefix, created_at, last_used_at, revoked_at
       FROM ingest_keys WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function revokeKey(userId, keyId) {
  await ensureSchema();
  const { rowCount } = await pool.query(
    `UPDATE ingest_keys SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [keyId, userId]
  );
  return rowCount > 0;
}

/** Resolves a presented key to its owner, or null. */
async function authenticateKey(presented) {
  if (!presented || !presented.startsWith(KEY_PREFIX)) return null;
  await ensureSchema();
  const { rows } = await pool.query(
    `UPDATE ingest_keys SET last_used_at = NOW()
      WHERE key_hash = $1 AND revoked_at IS NULL
      RETURNING id, user_id, name`,
    [hashKey(presented)]
  );
  return rows[0] || null;
}

// --- Events ------------------------------------------------------------------

async function recordEvent(fields) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO ingest_events
       (id, user_id, key_id, file_name, file_size, content_hash, status, workflow_slug, message, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      fields.userId,
      fields.keyId || null,
      fields.fileName,
      fields.fileSize || null,
      fields.contentHash,
      fields.status,
      fields.workflowSlug || null,
      fields.message || null,
      JSON.stringify(fields.source || {}),
    ]
  );
  return id;
}

async function completeEvent(id, fields) {
  await pool.query(
    `UPDATE ingest_events
        SET status = $2, workflow_slug = COALESCE($3, workflow_slug), report_id = $4,
            workbook_id = $5, message = $6, completed_at = NOW()
      WHERE id = $1`,
    [id, fields.status, fields.workflowSlug || null, fields.reportId || null, fields.workbookId || null, fields.message || null]
  );
}

async function listEvents(userId, { limit = 50 } = {}) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT e.id, e.file_name, e.file_size, e.status, e.workflow_slug, e.report_id, e.workbook_id,
            e.message, e.source, e.created_at, e.completed_at,
            k.name AS key_name, kw.name AS workflow_name,
            COALESCE(pr.status, wu.status) AS result_status
       FROM ingest_events e
       LEFT JOIN ingest_keys k ON k.id = e.key_id
       LEFT JOIN kpi_workflows kw ON kw.slug = e.workflow_slug
       LEFT JOIN processed_reports pr ON pr.id = e.report_id
       LEFT JOIN workbook_uploads wu ON wu.id = e.workbook_id
      WHERE e.user_id = $1
      ORDER BY e.created_at DESC
      LIMIT $2`,
    [userId, Math.min(Math.max(Number(limit) || 50, 1), 200)]
  );
  return rows;
}

// --- Detection ---------------------------------------------------------------

/**
 * Which pipeline a file belongs to, in the order a person would reason about it:
 *   1. an explicit workflow from the sender wins;
 *   2. a workflow built for this export (Peak Attach Users, CMG throughput);
 *   3. a CMM workbook with at least one valid KPI sheet;
 *   4. otherwise it is not something the portal knows how to read.
 */
async function detectRoute(filePath, requestedWorkflow) {
  if (requestedWorkflow === 'cmm-workbook') return { kind: 'workbook', slug: 'cmm-workbook' };
  if (requestedWorkflow) {
    getWorkflow(requestedWorkflow); // throws for an unknown slug
    return { kind: 'report', slug: requestedWorkflow, reason: 'requested by sender' };
  }

  const workbook = await loadWorkbook(filePath);
  const sheetNames = workbook.worksheets.map((ws) => ws.name);
  const dedicated = findWorkflowForWorkbook(sheetNames);
  if (dedicated) return { kind: 'report', slug: dedicated.slug, reason: `recognised as ${dedicated.name}` };

  const preview = await cmmWorkbook.previewWorkbook(filePath);
  if (preview.validCount > 0) {
    return {
      kind: 'workbook',
      slug: 'cmm-workbook',
      reason: `CMM workbook with ${preview.validCount} valid KPI sheet${preview.validCount === 1 ? '' : 's'}`,
    };
  }

  const reasons = (preview.invalidKpis || [])
    .slice(0, 3)
    .map((k) => `${k.sheetName}: ${k.errors?.[0]?.message || 'invalid'}`);
  return {
    kind: 'unknown',
    reason:
      preview.dataSheetCount > 0
        ? `No workflow matches this file, and none of its ${preview.dataSheetCount} Data sheets is a valid CMM KPI (${reasons.join('; ')}).`
        : 'No workflow matches this file: it has no "Data for …" sheets and no recognised export layout.',
  };
}

/** For a single-sheet workflow, the sheet and rows the preview would have picked. */
async function parseOptionsFor(slug, filePath) {
  const workflow = getWorkflow(slug);
  if (workflow.loadSource) return {};
  const preview = await previewExcel(filePath, slug);
  const sheet = preview.sheets?.find((s) => s.isRecommended) || preview.sheets?.[0];
  if (!sheet) return {};
  return {
    sheetIndex: sheet.index,
    headerRowIndex: sheet.suggestedHeaderRow,
    dataStartRowIndex: sheet.suggestedDataStartRow,
  };
}

// --- Ingest ------------------------------------------------------------------

function decodeContent(body) {
  // Outlook attachments arrive as contentBytes; anything else may send contentBase64.
  const raw = body.contentBase64 ?? body.contentBytes ?? body.content;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const cleaned = raw.includes(',') && raw.startsWith('data:') ? raw.split(',')[1] : raw;
  const buffer = Buffer.from(cleaned, 'base64');
  return buffer.length ? buffer : null;
}

function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

/**
 * @param {Object} key   { id, user_id } from authenticateKey
 * @param {Object} body  { fileName, contentBase64 | contentBytes, workflow?, notifyTeams?, source? }
 */
async function ingestFile(key, body = {}) {
  await ensureSchema();

  const fileName = String(body.fileName || body.name || '').trim();
  if (!fileName) throw httpError(400, 'fileName is required');
  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw httpError(415, `Only Excel files are accepted (.xlsx, .xls); got "${fileName}"`);
  }
  const buffer = decodeContent(body);
  if (!buffer) throw httpError(400, 'contentBase64 (or contentBytes) is required and must be base64');
  if (buffer.length > config.maxFileSizeMb * 1024 * 1024) {
    throw httpError(413, `File is larger than ${config.maxFileSizeMb} MB`);
  }

  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const source = {
    from: body.source?.from || body.from || null,
    subject: body.source?.subject || body.subject || null,
    receivedAt: body.source?.receivedAt || body.receivedAt || null,
    messageId: body.source?.messageId || body.messageId || null,
    via: body.source?.via || 'api',
  };
  const base = { userId: key.user_id, keyId: key.id, fileName, fileSize: buffer.length, contentHash, source };

  // The same file twice (a re-sent mail, a flow retry) is answered with the first result.
  const { rows: prior } = await pool.query(
    `SELECT id, workflow_slug, report_id, workbook_id FROM ingest_events
      WHERE user_id = $1 AND content_hash = $2 AND status = 'processed'
      ORDER BY created_at DESC LIMIT 1`,
    [key.user_id, contentHash]
  );
  if (prior.length && body.allowDuplicate !== true) {
    const first = prior[0];
    const eventId = await recordEvent({
      ...base,
      status: 'duplicate',
      workflowSlug: first.workflow_slug,
      message: 'Same file already imported; not processed again.',
    });
    return {
      status: 'duplicate',
      eventId,
      workflow: first.workflow_slug,
      reportId: first.report_id,
      workbookId: first.workbook_id,
      message: 'This exact file was already imported; returning the earlier result.',
    };
  }

  const eventId = await recordEvent({ ...base, status: 'received' });

  if (!fs.existsSync(config.uploadDir)) fs.mkdirSync(config.uploadDir, { recursive: true });
  const storedPath = path.join(config.uploadDir, `${uuidv4()}${ext}`);
  fs.writeFileSync(storedPath, buffer);
  const fileInfo = {
    originalname: fileName,
    path: storedPath,
    size: buffer.length,
    mimetype:
      ext === '.xls'
        ? 'application/vnd.ms-excel'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };

  let route;
  try {
    route = await detectRoute(storedPath, body.workflow ? String(body.workflow).trim() : null);
  } catch (err) {
    await completeEvent(eventId, { status: 'rejected', message: err.message });
    throw httpError(422, err.message, { eventId });
  }

  if (route.kind === 'unknown') {
    await completeEvent(eventId, { status: 'rejected', message: route.reason });
    fs.rm(storedPath, { force: true }, () => {});
    throw httpError(422, route.reason, { eventId });
  }

  try {
    if (route.kind === 'workbook') {
      const thresholdOptions = { defaultThreshold: body.defaultThreshold, kpiThresholds: body.kpiThresholds };
      const { workbook, preview } = await cmmWorkbook.createWorkbookUpload(key.user_id, fileInfo, thresholdOptions);
      await cmmWorkbook.processWorkbookAsync(
        workbook.id,
        key.user_id,
        storedPath,
        fileInfo,
        cmmWorkbook.parseWorkbookThresholds(thresholdOptions)
      );
      const message = `${route.reason}; ${preview.validCount} KPI report${preview.validCount === 1 ? '' : 's'} created.`;
      await completeEvent(eventId, { status: 'processed', workflowSlug: route.slug, workbookId: workbook.id, message });
      return { status: 'processed', eventId, workflow: route.slug, workbookId: workbook.id, kpiCount: preview.validCount, message };
    }

    const parseOptions = await parseOptionsFor(route.slug, storedPath);
    const report = await reportService.createReport(key.user_id, route.slug, fileInfo);
    await reportService.processReportAsync(report.id, route.slug, storedPath, parseOptions);

    const { rows } = await pool.query(
      `SELECT status, error_message FROM processed_reports WHERE id = $1`,
      [report.id]
    );
    const reportStatus = rows[0]?.status || 'pending';
    const failed = reportStatus === 'failed';
    const message = failed
      ? `${route.reason}; processing failed: ${rows[0]?.error_message || 'see the report'}`
      : `${route.reason}.`;

    await completeEvent(eventId, {
      status: failed ? 'failed' : 'processed',
      workflowSlug: route.slug,
      reportId: report.id,
      message,
    });

    let teams = null;
    if (!failed && body.notifyTeams && reportStatus === 'completed') {
      try {
        // Only the server's configured webhook: a key holder cannot point it elsewhere.
        await reportService.sendReportToTeams(report.id, key.user_id);
        teams = 'sent';
      } catch (err) {
        teams = `not sent: ${err.message}`;
        logger.warn('Imported report could not be sent to Teams', { reportId: report.id, error: err.message });
      }
    }

    return {
      status: failed ? 'failed' : 'processed',
      eventId,
      workflow: route.slug,
      reportId: report.id,
      reportStatus,
      teams,
      message,
    };
  } catch (err) {
    await completeEvent(eventId, { status: 'failed', workflowSlug: route.slug, message: err.message });
    throw httpError(500, `Import failed: ${err.message}`, { eventId });
  }
}

module.exports = {
  ensureSchema,
  createKey,
  listKeys,
  revokeKey,
  authenticateKey,
  ingestFile,
  listEvents,
  detectRoute,
  KEY_PREFIX,
};
