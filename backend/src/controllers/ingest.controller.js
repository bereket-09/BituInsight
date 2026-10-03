const ingestService = require('../services/ingest.service');
const logger = require('../utils/logger');

/** POST /api/ingest/files — one file from an automation, processed on arrival. */
async function ingestFile(req, res) {
  try {
    const result = await ingestService.ingestFile(req.ingestKey, req.body || {});
    res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) logger.error('Automatic import failed', { error: err.message });
    // Always JSON with a readable reason: this is read in a Power Automate run log.
    res.status(status).json({ status: status === 422 ? 'rejected' : 'error', error: err.message, eventId: err.eventId });
  }
}

/** GET /api/ingest/ping — lets a flow check its key before sending real files. */
function ping(req, res) {
  res.json({ ok: true, key: req.ingestKey.name, message: 'Key accepted. Send files to POST /api/ingest/files.' });
}

async function listEvents(req, res, next) {
  try {
    res.json({ events: await ingestService.listEvents(req.user.id, { limit: req.query.limit }) });
  } catch (err) {
    next(err);
  }
}

async function listKeys(req, res, next) {
  try {
    res.json({ keys: await ingestService.listKeys(req.user.id) });
  } catch (err) {
    next(err);
  }
}

async function createKey(req, res, next) {
  try {
    res.status(201).json(await ingestService.createKey(req.user.id, req.body?.name));
  } catch (err) {
    next(err);
  }
}

async function revokeKey(req, res, next) {
  try {
    const revoked = await ingestService.revokeKey(req.user.id, req.params.id);
    if (!revoked) return res.status(404).json({ error: 'Key not found or already revoked' });
    res.json({ revoked: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { ingestFile, ping, listEvents, listKeys, createKey, revokeKey };
