const { getDB } = require('../db/connection');
const routeModel = require('../models/route');

exports.list = (req, res) => {
  try {
    const db = getDB();
    const items = routeModel.getAll(db);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getById = (req, res) => {
  try {
    const db = getDB();
    const item = routeModel.getById(db, parseInt(req.params.id));
    if (!item) return res.status(404).json({ error: 'Route not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
