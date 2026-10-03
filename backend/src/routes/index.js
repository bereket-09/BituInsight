const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const workflowController = require('../controllers/workflow.controller');
const workflowDefinitionController = require('../controllers/workflowDefinition.controller');
const reportController = require('../controllers/report.controller');
const aggregationController = require('../controllers/aggregation.controller');
const workbookController = require('../controllers/workbook.controller');
const mcpController = require('../controllers/mcp.controller');
const oauthConsentController = require('../controllers/oauthConsent.controller');
const ingestController = require('../controllers/ingest.controller');
const { authenticateIngestKey } = require('../middleware/ingestAuth.middleware');
const { handleMcpRequest } = require('../mcp-http');
const { requireMcpAuth } = require('../oauth');
const { authenticate } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'core-insight-api', timestamp: new Date().toISOString() });
});

router.post('/auth/login', authController.loginValidation, authController.login);
router.get('/auth/me', authenticate, authController.me);

router.get('/workflows', authenticate, workflowController.listWorkflows);
router.get('/workflows/:slug', authenticate, workflowController.getWorkflowDetails);

// Database-defined workflows. The literal paths are declared before '/:slug' so an
// example download is never read as a slug lookup.
router.get('/workflow-definitions', authenticate, workflowDefinitionController.listDefinitions);
router.get(
  '/workflow-definitions/examples/:name',
  authenticate,
  workflowDefinitionController.getExample
);
router.post(
  '/workflow-definitions/validate',
  authenticate,
  workflowDefinitionController.validateImport
);
router.post(
  '/workflow-definitions/import',
  authenticate,
  workflowDefinitionController.importDefinition
);
router.get('/workflow-definitions/:slug', authenticate, workflowDefinitionController.getDefinition);
router.delete(
  '/workflow-definitions/:slug',
  authenticate,
  workflowDefinitionController.removeDefinition
);

// What the platform knows about its own read-only MCP server, for the connect
// section in Settings. Reports no live client: an MCP client runs the server
// itself, on the user's machine, over stdio.
router.get('/mcp/connection', authenticate, mcpController.getConnectionInfo);

// The hosted MCP endpoint. Declared after /mcp/connection on purpose: router.use
// matches by prefix and would otherwise swallow that route, which is browser
// traffic carrying the app's own session rather than an OAuth bearer token.
//
// requireMcpAuth enforces the mcp:read scope and populates req.auth, from which
// the handler reads the account to scope every query to. It refuses rather than
// falling back to unscoped when that identity is absent.
router.use('/mcp', requireMcpAuth(), handleMcpRequest);

// The consent screen behind the OAuth authorization endpoint. Reading the
// request and refusing it are open, because the person arrives here straight
// from their assistant and may not be signed in yet; approving is not, and binds
// the grant to whoever the app's own login says they are.
router.get('/oauth/consent/:requestId', oauthConsentController.getConsentRequest);
router.post(
  '/oauth/consent/:requestId/approve',
  authenticate,
  oauthConsentController.approveConsent
);
router.post('/oauth/consent/:requestId/deny', oauthConsentController.denyConsent);

// Automatic imports. The first two are called by an automation (Power Automate)
// with an import key, not a signed-in session; the rest manage keys and show the
// import log to the signed-in user.
router.get('/ingest/ping', authenticateIngestKey, ingestController.ping);
router.post('/ingest/files', authenticateIngestKey, ingestController.ingestFile);
router.get('/ingest/events', authenticate, ingestController.listEvents);
router.get('/ingest/keys', authenticate, ingestController.listKeys);
router.post('/ingest/keys', authenticate, ingestController.createKey);
router.delete('/ingest/keys/:id', authenticate, ingestController.revokeKey);

router.get('/dashboard', authenticate, reportController.getDashboard);
router.get('/reports', authenticate, reportController.listReports);
router.get('/workbooks', authenticate, workbookController.listWorkbooks);
router.get('/workbooks/:id', authenticate, workbookController.getWorkbook);
router.get(
  '/workbooks/:id/export/pptx',
  authenticate,
  workbookController.exportWorkbookPptx
);
router.post(
  '/workbooks/:id/export/pptx',
  authenticate,
  workbookController.exportWorkbookPptx
);
router.patch(
  '/workbooks/:workbookId/kpis/:reportId/threshold',
  authenticate,
  workbookController.updateKpiThreshold
);
router.post(
  '/workbooks/preview',
  authenticate,
  upload.single('file'),
  workbookController.previewWorkbook
);
router.post(
  '/workbooks/upload',
  authenticate,
  upload.single('file'),
  workbookController.uploadWorkbook
);
router.get(
  '/reports/aggregate/:workflowSlug',
  authenticate,
  aggregationController.getWorkflowAggregate
);
router.get('/reports/:id', authenticate, reportController.getReport);
router.post(
  '/reports/upload',
  authenticate,
  upload.single('file'),
  reportController.uploadAndProcess
);
router.post(
  '/reports/preview',
  authenticate,
  upload.single('file'),
  reportController.previewFile
);
router.post(
  '/reports/validate',
  authenticate,
  upload.single('file'),
  reportController.validateOnly
);
router.get('/reports/:id/export/pptx', authenticate, reportController.exportReportPptx);
router.post('/reports/:id/export/pptx', authenticate, reportController.exportReportPptx);
router.post('/reports/:id/teams', authenticate, reportController.sendToTeams);
router.get('/reports/:id/download', authenticate, reportController.downloadReport);
router.get(
  '/reports/:id/charts/:chartId/download',
  authenticate,
  reportController.downloadChart
);

module.exports = router;
