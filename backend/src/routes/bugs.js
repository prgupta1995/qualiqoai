const router = require('express').Router();
const ctrl   = require('../controllers/bugController');

router.get('/',        ctrl.listBugs);    // GET    /api/bugs
router.get('/:id',     ctrl.getBug);      // GET    /api/bugs/:id
router.post('/',       ctrl.createBug);   // POST   /api/bugs  (manual creation)
router.put('/:id',     ctrl.updateBug);   // PUT    /api/bugs/:id
router.delete('/:id',  ctrl.deleteBug);   // DELETE /api/bugs/:id

module.exports = router;
