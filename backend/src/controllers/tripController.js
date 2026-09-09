const { getDB } = require('../db/connection');
const { saveDB } = require('../db/connection');
const tripModel = require('../models/trip');
const ambulanceModel = require('../models/ambulance');
const routeModel = require('../models/route');
const signalModel = require('../models/signal');
const simulationService = require('../services/simulationService');
const { getIO } = require('../socketManager');

exports.list = (req, res) => {
  try {
    const db = getDB();
    const { status } = req.query;
    const items = tripModel.getAll(db, status);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getById = (req, res) => {
  try {
    const db = getDB();
    const item = tripModel.getById(db, parseInt(req.params.id));
    if (!item) return res.status(404).json({ error: 'Trip not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.start = (req, res) => {
  try {
    const db = getDB();
    const { ambulanceId, routeId } = req.body;
    if (!ambulanceId || !routeId) return res.status(400).json({ error: 'ambulanceId and routeId required' });

    const ambulance = ambulanceModel.getById(db, ambulanceId);
    if (!ambulance) return res.status(404).json({ error: 'Ambulance not found' });
    if (ambulance.status !== 'idle') return res.status(400).json({ error: 'Ambulance is not idle' });

    const route = routeModel.getById(db, routeId);
    if (!route) return res.status(404).json({ error: 'Route not found' });

    const trip = tripModel.create(db, { ambulanceId, routeId });
    ambulanceModel.updateStatus(db, ambulanceId, 'en_route');
    saveDB();

    simulationService.startSimulation({
      tripId: trip.id,
      ambulanceId,
      routeId,
      polyline: route.polyline,
      signals: route.signals,
      vehicleNumber: ambulance.vehicle_number
    });

    // Broadcast trip started event
    const io = getIO();
    if (io) {
      io.emit('trip:started', trip);
    }

    res.status(201).json(trip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.stop = (req, res) => {
  try {
    const db = getDB();
    const trip = tripModel.getById(db, parseInt(req.params.id));
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.status !== 'active') return res.status(400).json({ error: 'Trip is not active' });

    tripModel.updateStatus(db, trip.id, 'cancelled', new Date().toISOString());
    ambulanceModel.updateStatus(db, trip.ambulance_id, 'idle');
    signalModel.resetRouteSignals(db, trip.route_id);
    saveDB();

    simulationService.stopSimulation(trip.id);

    // Broadcast signal resets
    const io = getIO();
    if (io) {
      const signals = signalModel.getByRouteId(db, trip.route_id);
      signals.forEach(s => io.emit('signal:stateChange', { signalId: s.id, state: 'red' }));
      io.emit('trip:ended', { tripId: trip.id });
    }

    res.json({ message: 'Trip stopped successfully', tripId: trip.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
