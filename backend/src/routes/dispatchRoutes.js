const express = require('express');
const router = express.Router();
const controller = require('../controllers/dispatchController');

router.post('/call', controller.callAmbulance);

module.exports = router;
