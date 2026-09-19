const { getDB, saveDB } = require('../db/connection');
const routeModel = require('../models/route');
const geocodingService = require('../services/geocodingService');
const routingService = require('../services/routingService');
const { run } = require('../db/helpers');
const logger = require('../utils/logger');

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

exports.createCustom = async (req, res) => {
  try {
    const db = getDB();
    const { startAddress, endAddress, startLat, startLng, endLat, endLng, name } = req.body;

    let start = { lat: startLat, lng: startLng, displayName: 'Start' };
    let end = { lat: endLat, lng: endLng, displayName: 'End' };

    // Geocode addresses if coordinates aren't provided directly
    if (startAddress && (!startLat || !startLng)) {
      start = await geocodingService.geocode(startAddress);
    }
    if (endAddress && (!endLat || !endLng)) {
      end = await geocodingService.geocode(endAddress);
    }

    if (!start.lat || !start.lng || !end.lat || !end.lng) {
      return res.status(400).json({ error: 'Could not resolve start and end locations' });
    }

    // Get driving route from OSRM
    const routeData = await routingService.getRoute(start.lat, start.lng, end.lat, end.lng);

    // Generate virtual signals along the route
    const virtualSignals = routingService.generateVirtualSignals(routeData.polyline);

    // Build a name for the route
    const routeName = name || `${start.displayName.split(',')[0]} to ${end.displayName.split(',')[0]}`;

    // Save route to DB
    const info = run(db,
      'INSERT INTO routes (name, start_name, end_name, polyline, is_custom) VALUES (?, ?, ?, ?, 1)',
      [routeName, start.displayName.split(',')[0], end.displayName.split(',')[0], JSON.stringify(routeData.polyline)]
    );
    const routeId = info.lastInsertRowid;

    // Save virtual signals to DB
    for (const sig of virtualSignals) {
      run(db,
        'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)',
        [routeId, sig.name, sig.lat, sig.lng, sig.order_in_route]
      );
    }

    saveDB();

    // Return the full route object (same shape as seeded routes)
    const saved = routeModel.getById(db, routeId);
    res.status(201).json(saved);
  } catch (err) {
    logger.error(`Custom route creation failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};
