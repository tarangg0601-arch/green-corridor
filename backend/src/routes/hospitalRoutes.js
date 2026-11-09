const express = require('express');
const router = express.Router();
const { getDB } = require('../db/connection');
const { queryAll } = require('../db/helpers');

router.get('/', (req, res) => {
  try {
    const db = getDB();
    const hospitals = queryAll(db, 'SELECT id, name, lat, lng FROM hospitals ORDER BY name ASC');
    res.json(hospitals);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load hospitals' });
  }
});

module.exports = router;
