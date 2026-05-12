const router = require('express').Router();
const ctrl   = require('../controllers/testCaseController');

// CRUD
router.get('/',         ctrl.listTestCases);   // GET  /api/tests
router.get('/:id',      ctrl.getTestCase);     // GET  /api/tests/:id
router.post('/',        ctrl.createTestCase);  // POST /api/tests
router.post('/bulk-create', ctrl.bulkCreateTestCases); // POST /api/tests/bulk-create
router.put('/:id',      ctrl.updateTestCase);  // PUT  /api/tests/:id
router.patch('/:id/script', ctrl.updateTestCaseScript); // PATCH /api/tests/:id/script
router.delete('/bulk-delete', ctrl.bulkDeleteTestCases); // DELETE /api/tests/bulk-delete
router.delete('/:id',   ctrl.deleteTestCase);  // DELETE /api/tests/:id

// Execution
router.post('/:id/run', ctrl.runTest);         // POST /api/tests/:id/run

module.exports = router;
