const ingestService = require('../services/ingest.service');

/**
 * Machine authentication for automatic imports. Accepts the key as
 * `Authorization: Bearer cik_…` or `X-API-Key: cik_…`, so it fits whatever the
 * sending tool makes easiest. A user's session token is not accepted here, and an
 * import key is not accepted anywhere else.
 */
async function authenticateIngestKey(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const presented = header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : String(req.headers['x-api-key'] || '').trim();
    if (!presented) {
      return res.status(401).json({ error: 'API key required (Authorization: Bearer cik_… or X-API-Key)' });
    }
    const key = await ingestService.authenticateKey(presented);
    if (!key) return res.status(401).json({ error: 'Invalid or revoked API key' });
    req.ingestKey = key;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticateIngestKey };
