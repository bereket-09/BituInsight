const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const workflowController = require('../controllers/workflow.controller');
const reportController = require('../controllers/report.controller');
const aggregationController = require('../controllers/aggregation.controller');
const workbookController = require('../controllers/workbook.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'bituinsight-api', timestamp: new Date().toISOString() });
});

router.post('/auth/login', authController.loginValidation, authController.login);
router.get('/auth/me', authenticate, authController.me);

router.get('/workflows', authenticate, workflowController.listWorkflows);
router.get('/workflows/:slug', authenticate, workflowController.getWorkflowDetails);

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
