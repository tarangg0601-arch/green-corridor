const { getDB } = require('../db/connection');
const ambulanceModel = require('../models/ambulance');

exports.list = (req, res) => {
  try {
    const db = getDB();
    const items = ambulanceModel.getAll(db);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = (req, res) => {
  try {
    const db = getDB();
    const { vehicleNumber, driverName, hospital } = req.body;
    if (!vehicleNumber || !driverName || !hospital) {
      return res.status(400).json({ error: 'vehicleNumber, driverName, and hospital are required' });
    }
    const ambulance = ambulanceModel.create(db, { vehicleNumber, driverName, hospital });
    res.status(201).json(ambulance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
