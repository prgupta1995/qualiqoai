const router = require('express').Router();
const ctrl   = require('../controllers/aiController');
const { validateTesttoriaApiKey } = require('../middleware/validateTesttoriaApiKey');

router.use(validateTesttoriaApiKey);

router.post('/generate-script', ctrl.generateScript);
router.post('/inspect-selector', ctrl.inspectElementSelector);
router.post('/inspect-selectors', ctrl.inspectElementSelectors);
router.post('/generate-script-from-recording', ctrl.generateScriptFromRecordingController);
router.post('/generate-testcases', ctrl.generateTestCases);
router.post('/generate-testcases-from-doc', ctrl.generateTestCasesFromDoc);
router.post('/refine-testcases', ctrl.refineGeneratedTestCases);
router.post('/generate-and-run', ctrl.generateAndRun);
router.post('/map-testcases-to-scripts', ctrl.mapTestCasesToScripts);

module.exports = router;
