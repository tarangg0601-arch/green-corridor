const express = require('express');
const router = express.Router();
const controller = require('../controllers/alertController');

router.get('/', controller.list);
router.get('/summary', controller.summary);
router.patch('/:id/acknowledge', controller.acknowledge);

module.exports = router;
