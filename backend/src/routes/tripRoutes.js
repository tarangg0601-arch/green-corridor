const express = require('express');
const router = express.Router();
const controller = require('../controllers/tripController');

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/start', controller.start);
router.post('/:id/stop', controller.stop);

module.exports = router;
