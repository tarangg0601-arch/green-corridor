const { getDB } = require('../db/connection');
const { queryOne } = require('../db/helpers');
const ambulanceModel = require('../models/ambulance');
const logger = require('../utils/logger');

exports.list = (req, res) => {
  try {
    const db = getDB();
    const items = ambulanceModel.getAll(db);
    res.json(items);
  } catch (err) {
    logger.error(`Failed to list ambulances: ${err.message}`);
    res.status(500).json({ error: 'Failed to retrieve ambulances' });
  }
};

exports.create = (req, res) => {
  try {
    const db = getDB();
    const { vehicleNumber, driverName, hospital } = req.body;
    if (!vehicleNumber || typeof vehicleNumber !== 'string' || !vehicleNumber.trim() ||
        !driverName || typeof driverName !== 'string' || !driverName.trim() ||
        !hospital || typeof hospital !== 'string' || !hospital.trim()) {
      return res.status(400).json({ error: 'vehicleNumber, driverName, and hospital are required' });
    }

    const cleanVehicle = vehicleNumber.trim();
    const cleanDriver = driverName.trim();
    const cleanHospital = hospital.trim();

    // Validate that hospital exists in hospitals table
    const matchingHospital = queryOne(db, 'SELECT id, name FROM hospitals WHERE name = ? COLLATE NOCASE', [cleanHospital]);
    if (!matchingHospital) {
      return res.status(400).json({ error: 'Hospital not recognized. Please select a valid hospital from the list.' });
    }

    // Check for duplicate vehicle number
    const existingVehicle = queryOne(db, 'SELECT id FROM ambulances WHERE vehicle_number = ?', [cleanVehicle]);
    if (existingVehicle) {
      return res.status(409).json({ error: 'An ambulance with this vehicle number is already registered' });
    }

    const ambulance = ambulanceModel.create(db, {
      vehicleNumber: cleanVehicle,
      driverName: cleanDriver,
      hospital: matchingHospital.name
    });

    res.status(201).json(ambulance);
  } catch (err) {
    logger.error(`Failed to create ambulance: ${err.message}`);
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'An ambulance with this vehicle number is already registered' });
    }
    res.status(500).json({ error: 'Failed to register ambulance' });
  }
};
