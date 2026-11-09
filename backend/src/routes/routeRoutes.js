const express = require('express');
const router = express.Router();
const controller = require('../controllers/routeController');

router.get('/', controller.list);
router.post('/preview', controller.previewCustom);
router.post('/custom', controller.createCustom);
router.get('/:id', controller.getById);

module.exports = router;
