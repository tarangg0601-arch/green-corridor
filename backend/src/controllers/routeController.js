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

function parseCoordinate(val, min, max) {
  if (val === undefined || val === null || val === '') return null;
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

exports.createCustom = async (req, res) => {
  try {
    const db = getDB();
    const { startAddress, endAddress, startLat, startLng, endLat, endLng, name } = req.body;

    const parsedStartLat = parseCoordinate(startLat, -90, 90);
    const parsedStartLng = parseCoordinate(startLng, -180, 180);
    const parsedEndLat = parseCoordinate(endLat, -90, 90);
    const parsedEndLng = parseCoordinate(endLng, -180, 180);

    let start = null;
    if (parsedStartLat !== null && parsedStartLng !== null) {
      start = { lat: parsedStartLat, lng: parsedStartLng, displayName: 'Start' };
    } else if (startAddress && typeof startAddress === 'string' && startAddress.trim().length > 0) {
      start = await geocodingService.geocode(startAddress.trim());
    } else {
      return res.status(400).json({ error: 'Start address or valid start coordinates (startLat, startLng) required' });
    }

    let end = null;
    if (parsedEndLat !== null && parsedEndLng !== null) {
      end = { lat: parsedEndLat, lng: parsedEndLng, displayName: 'End' };
    } else if (endAddress && typeof endAddress === 'string' && endAddress.trim().length > 0) {
      end = await geocodingService.geocode(endAddress.trim());
    } else {
      return res.status(400).json({ error: 'End address or valid end coordinates (endLat, endLng) required' });
    }

    const validStartLat = parseCoordinate(start.lat, -90, 90);
    const validStartLng = parseCoordinate(start.lng, -180, 180);
    const validEndLat = parseCoordinate(end.lat, -90, 90);
    const validEndLng = parseCoordinate(end.lng, -180, 180);

    if (validStartLat === null || validStartLng === null || validEndLat === null || validEndLng === null) {
      return res.status(400).json({ error: 'Could not resolve start and end locations' });
    }
    start.lat = validStartLat;
    start.lng = validStartLng;
    end.lat = validEndLat;
    end.lng = validEndLng;

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
