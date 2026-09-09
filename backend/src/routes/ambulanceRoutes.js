const express = require('express');
const router = express.Router();
const controller = require('../controllers/ambulanceController');

router.get('/', controller.list);
router.post('/', controller.create);

module.exports = router;
