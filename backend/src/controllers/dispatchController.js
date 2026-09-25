const { getDB, saveDB } = require('../db/connection');
const { run, queryAll, queryOne } = require('../db/helpers');
const geocodingService = require('../services/geocodingService');
const routingService = require('../services/routingService');
const simulationService = require('../services/simulationService');
const tripModel = require('../models/trip');
const ambulanceModel = require('../models/ambulance');
const geo = require('../utils/geo');
const { getIO } = require('../socketManager');
const logger = require('../utils/logger');

exports.callAmbulance = async (req, res) => {
  try {
    const db = getDB();
    const { address, lat, lng } = req.body;

    let pickup = { lat, lng, displayName: 'Emergency Location' };
    if (address && (!lat || !lng)) {
      pickup = await geocodingService.geocode(address);
    }

    if (!pickup.lat || !pickup.lng) {
      return res.status(400).json({ error: 'Could not resolve pickup location' });
    }

    // 1. Find nearest hospital to the pickup location
    const hospitals = queryAll(db, 'SELECT * FROM hospitals');
    let nearestHospital = null;
    let minHospDist = Infinity;
    hospitals.forEach(h => {
      const dist = geo.haversineDistance(pickup.lat, pickup.lng, h.lat, h.lng);
      if (dist < minHospDist) {
        minHospDist = dist;
        nearestHospital = h;
      }
    });

    if (!nearestHospital) return res.status(500).json({ error: 'No hospitals available' });

    // 2. Find nearest idle ambulance (approximate ambulance location as its base hospital)
    const idleAmbs = queryAll(db, "SELECT * FROM ambulances WHERE status = 'idle'");
    if (idleAmbs.length === 0) return res.status(404).json({ error: 'No idle ambulances available' });

    let nearestAmb = null;
    let minAmbDist = Infinity;
    let ambBaseLat = null;
    let ambBaseLng = null;

    idleAmbs.forEach(amb => {
      // Find hospital for this ambulance
      const h = hospitals.find(hosp => hosp.name === amb.hospital);
      if (h) {
        const dist = geo.haversineDistance(pickup.lat, pickup.lng, h.lat, h.lng);
        if (dist < minAmbDist) {
          minAmbDist = dist;
          nearestAmb = amb;
          ambBaseLat = h.lat;
          ambBaseLng = h.lng;
        }
      }
    });

    if (!nearestAmb) return res.status(500).json({ error: 'Could not determine ambulance location' });

    // 3. Leg 1: Route from ambulance base to pickup
    const routeData = await routingService.getRoute(ambBaseLat, ambBaseLng, pickup.lat, pickup.lng);
    const virtualSignals = routingService.generateVirtualSignals(routeData.polyline);

    const routeName = `Dispatch to ${pickup.displayName.split(',')[0]}`;
    const info = run(db,
      'INSERT INTO routes (name, start_name, end_name, polyline, is_custom) VALUES (?, ?, ?, ?, 1)',
      [routeName, nearestAmb.hospital, pickup.displayName.split(',')[0], JSON.stringify(routeData.polyline)]
    );
    const routeId = info.lastInsertRowid;

    for (const sig of virtualSignals) {
      run(db,
        'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)',
        [routeId, sig.name, sig.lat, sig.lng, sig.order_in_route]
      );
    }

    // 4. Create Trip with Phase 'to_pickup'
    const now = new Date().toISOString();
    const tripInfo = run(db, 
      "INSERT INTO trips (ambulance_id, route_id, start_time, status, phase, pickup_lat, pickup_lng, dest_hospital_id) VALUES (?, ?, ?, 'active', 'to_pickup', ?, ?, ?)", 
      [nearestAmb.id, routeId, now, pickup.lat, pickup.lng, nearestHospital.id]
    );
    const tripId = tripInfo.lastInsertRowid;

    ambulanceModel.updateStatus(db, nearestAmb.id, 'en_route');
    saveDB();

    const trip = tripModel.getById(db, tripId);

    // 5. Start Simulation
    simulationService.startSimulation({
      tripId: trip.id,
      ambulanceId: nearestAmb.id,
      routeId,
      polyline: routeData.polyline,
      signals: virtualSignals,
      vehicleNumber: nearestAmb.vehicle_number
    });

    const io = getIO();
    if (io) {
      io.emit('trip:started', trip);
    }

    res.status(201).json(trip);
  } catch (err) {
    logger.error(`Dispatch failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};
