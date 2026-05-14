const router = require('express').Router();
const ctrl = require('../controllers/selectorController');
const { validateTesttoriaApiKey } = require('../middleware/validateTesttoriaApiKey');

router.use(validateTesttoriaApiKey);

router.post('/scan', ctrl.scanSelectors);
router.post('/generate-manual', ctrl.generateManual);

module.exports = router;
