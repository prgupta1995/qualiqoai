const router = require('express').Router();
const ctrl   = require('../controllers/testRunController');

router.get('/',      ctrl.listRuns);    // GET    /api/runs        (history, filterable)
router.get('/:id',   ctrl.getRun);     // GET    /api/runs/:id    (single run + logs)
router.delete('/:id',ctrl.deleteRun);  // DELETE /api/runs/:id

module.exports = router;
