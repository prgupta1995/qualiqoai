const express = require('express');
const ctrl = require('../controllers/dashboardController');

const router = express.Router();

router.get('/summary', ctrl.getSummary);

module.exports = router;
