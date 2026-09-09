const config = require('../config');
const { getIO } = require('../socketManager');
const geo = require('../utils/geo');
const etaService = require('./etaService');
const { getDB, saveDB } = require('../db/connection');
const tripModel = require('../models/trip');
const ambulanceModel = require('../models/ambulance');
const signalService = require('./signalService');
const logger = require('../utils/logger');

const activeSimulations = new Map();

function startSimulation(tripData) {
  const { tripId, ambulanceId, routeId, polyline, signals, vehicleNumber } = tripData;
  const totalDistance = geo.totalRouteDistance(polyline);

  // Pre-compute each signal's distance from the route start so we can
  // quickly compare against the ambulance's traveled distance each tick.
  const augmentedSignals = signals.map(s => {
    const distance = geo.distanceAlongRoute(polyline, 0, s.lat, s.lng);
    return {
      ...s,
      distanceFromStart: distance,
      isGreenForTrip: false,
      triggeredForTrip: false
    };
  });

  const sim = {
    tripId,
    ambulanceId,
    routeId,
    vehicleNumber,
    polyline,
    signals: augmentedSignals,
    distanceTraveled: 0,
    totalDistance,
    intervalId: null
  };

  logger.info(`Starting simulation for trip ${tripId} (distance: ${totalDistance.toFixed(2)} km)`);
  sim.intervalId = setInterval(() => tick(sim), config.simulationTickMs);
  activeSimulations.set(tripId, sim);
}

function tick(sim) {
  // Distance covered in one tick: speed (km/h) converted to km per tick interval
  const distanceIncrement = (config.ambulanceSpeedKmh / 3600) * (config.simulationTickMs / 1000);
  sim.distanceTraveled += distanceIncrement;

  if (sim.distanceTraveled >= sim.totalDistance) {
    completeTrip(sim.tripId);
    return;
  }

  const position = geo.interpolatePosition(sim.polyline, sim.distanceTraveled);
  const nextSignal = etaService.processSignals(sim);

  const io = getIO();
  if (io) {
    io.emit('ambulance:position', {
      tripId: sim.tripId,
      ambulanceId: sim.ambulanceId,
      vehicleNumber: sim.vehicleNumber,
      lat: position.lat,
      lng: position.lng,
      speed: config.ambulanceSpeedKmh,
      distanceTraveled: sim.distanceTraveled,
      totalDistance: sim.totalDistance,
      nextSignal: nextSignal ? { id: nextSignal.id, name: nextSignal.name } : null,
      eta: nextSignal ? Math.round(nextSignal.eta) : null
    });
  }
}

function completeTrip(tripId) {
  const sim = activeSimulations.get(tripId);
  if (!sim) return;

  clearInterval(sim.intervalId);
  activeSimulations.delete(tripId);

  const db = getDB();
  tripModel.updateStatus(db, tripId, 'completed', new Date().toISOString());
  ambulanceModel.updateStatus(db, sim.ambulanceId, 'arrived');
  signalService.resetRouteSignals(sim.routeId);
  saveDB();

  logger.info(`Trip ${tripId} completed.`);

  const io = getIO();
  if (io) {
    io.emit('trip:ended', { tripId });
  }
}

function stopSimulation(tripId) {
  const sim = activeSimulations.get(tripId);
  if (sim) {
    clearInterval(sim.intervalId);
    activeSimulations.delete(tripId);
    logger.info(`Simulation stopped for trip ${tripId}`);
  }
}

module.exports = { startSimulation, stopSimulation };
