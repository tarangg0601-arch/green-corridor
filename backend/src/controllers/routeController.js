const { getDB, saveDB } = require('../db/connection');
const routeModel = require('../models/route');
const geocodingService = require('../services/geocodingService');
const routingService = require('../services/routingService');
const { run } = require('../db/helpers');
const logger = require('../utils/logger');
const config = require('../config');

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
    const routeId = parseInt(req.params.id, 10);
    if (!Number.isFinite(routeId)) {
      return res.status(400).json({ error: 'Valid route id required' });
    }
    const item = routeModel.getById(db, routeId);
    if (!item) return res.status(404).json({ error: 'Route not found' });
    res.json(item);
  } catch (err) {
    logger.error(`Failed to get route: ${err.message}`);
    res.status(500).json({ error: 'Failed to retrieve route' });
  }
};

function parseCoordinate(val, min, max) {
  if (val === undefined || val === null || val === '') return null;
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

async function resolveAndComputeRoute(body) {
  const { startAddress, endAddress, startLat, startLng, endLat, endLng, name } = body;

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
    const err = new Error('Start address or valid start coordinates (startLat, startLng) required');
    err.statusCode = 400;
    throw err;
  }

  let end = null;
  if (parsedEndLat !== null && parsedEndLng !== null) {
    end = { lat: parsedEndLat, lng: parsedEndLng, displayName: 'End' };
  } else if (endAddress && typeof endAddress === 'string' && endAddress.trim().length > 0) {
    end = await geocodingService.geocode(endAddress.trim());
  } else {
    const err = new Error('End address or valid end coordinates (endLat, endLng) required');
    err.statusCode = 400;
    throw err;
  }

  const validStartLat = parseCoordinate(start.lat, -90, 90);
  const validStartLng = parseCoordinate(start.lng, -180, 180);
  const validEndLat = parseCoordinate(end.lat, -90, 90);
  const validEndLng = parseCoordinate(end.lng, -180, 180);

  if (validStartLat === null || validStartLng === null || validEndLat === null || validEndLng === null) {
    const err = new Error('Could not resolve start and end locations');
    err.statusCode = 400;
    throw err;
  }
  start.lat = validStartLat;
  start.lng = validStartLng;
  end.lat = validEndLat;
  end.lng = validEndLng;

  // Get driving route from OSRM
  const routeData = await routingService.getRoute(start.lat, start.lng, end.lat, end.lng);

  // Validate maximum route distance
  if (config.maxRouteDistanceKm && routeData.distanceKm > config.maxRouteDistanceKm) {
    const err = new Error(`Route is ${routeData.distanceKm.toFixed(1)} km; maximum is ${config.maxRouteDistanceKm} km`);
    err.statusCode = 422;
    throw err;
  }

  // Generate virtual signals along the route
  const virtualSignals = routingService.generateVirtualSignals(routeData.polyline);

  // Build a name for the route
  const startLabel = (start.displayName || 'Start').split(',')[0].trim();
  const endLabel = (end.displayName || 'End').split(',')[0].trim();
  const routeName = name || `${startLabel} to ${endLabel}`;

  return {
    start,
    end,
    startLabel,
    endLabel,
    routeData,
    virtualSignals,
    routeName
  };
}

exports.previewCustom = async (req, res) => {
  try {
    const computed = await resolveAndComputeRoute(req.body);
    res.json({
      name: computed.routeName,
      start_name: computed.startLabel,
      end_name: computed.endLabel,
      polyline: computed.routeData.polyline,
      distanceKm: computed.routeData.distanceKm,
      durationSec: computed.routeData.durationSec,
      signals: computed.virtualSignals,
      is_custom: 1
    });
  } catch (err) {
    logger.error(`Custom route preview failed: ${err.message}`);
    const statusCode = err.statusCode || (err.isTimeout ? 504 : 500);
    res.status(statusCode).json({ error: err.message });
  }
};

exports.createCustom = async (req, res) => {
  try {
    const db = getDB();
    const computed = await resolveAndComputeRoute(req.body);

    // Save route to DB
    const info = run(db,
      'INSERT INTO routes (name, start_name, end_name, polyline, is_custom) VALUES (?, ?, ?, ?, 1)',
      [computed.routeName, computed.startLabel, computed.endLabel, JSON.stringify(computed.routeData.polyline)]
    );
    const routeId = info.lastInsertRowid;

    // Save virtual signals to DB
    for (const sig of computed.virtualSignals) {
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
    const statusCode = err.statusCode || (err.isTimeout ? 504 : 500);
    res.status(statusCode).json({ error: err.message });
  }
};
