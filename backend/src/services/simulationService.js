const config = require('../config');
const { getIO } = require('../socketManager');
const geo = require('../utils/geo');
const etaService = require('./etaService');
const { getDB, saveDB } = require('../db/connection');
const tripModel = require('../models/trip');
const ambulanceModel = require('../models/ambulance');
const signalService = require('./signalService');
const logger = require('../utils/logger');
const routingService = require('./routingService');
const { run, queryOne } = require('../db/helpers');

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

function isSignalNeededByAnotherTrip(signalId, excludeTripId) {
  for (const [tripId, otherSim] of activeSimulations.entries()) {
    if (tripId === excludeTripId) continue;
    const sig = otherSim.signals.find(s => s.id === signalId);
    if (sig && sig.isGreenForTrip) return true;
  }
  return false;
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
  const nextSignal = etaService.processSignals(sim, (sigId) => isSignalNeededByAnotherTrip(sigId, sim.tripId));

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

async function completeTrip(tripId) {
  const sim = activeSimulations.get(tripId);
  if (!sim) return;

  clearInterval(sim.intervalId);

  const db = getDB();
  const trip = tripModel.getById(db, tripId);
  
  if (trip && trip.phase === 'to_pickup') {
    logger.info(`Trip ${tripId} arrived at pickup. Transitioning to hospital route in 15s.`);
    tripModel.updatePhase(db, tripId, 'at_pickup');
    saveDB();
    const io = getIO();
    if (io) {
      io.emit('trip:updated', tripModel.getById(db, tripId));
    }

    sim.timeoutId = setTimeout(async () => {
      try {
        const destHospital = queryOne(db, 'SELECT * FROM hospitals WHERE id = ?', [trip.dest_hospital_id]);
        if (!destHospital) throw new Error('No destination hospital found');
        
        const routeData = await routingService.getRoute(trip.pickup_lat, trip.pickup_lng, destHospital.lat, destHospital.lng);
        const virtualSignals = routingService.generateVirtualSignals(routeData.polyline);

        const routeName = `Pickup to ${destHospital.name}`;
        const info = run(db,
          'INSERT INTO routes (name, start_name, end_name, polyline, is_custom) VALUES (?, ?, ?, ?, 1)',
          [routeName, 'Emergency Location', destHospital.name, JSON.stringify(routeData.polyline)]
        );
        const newRouteId = info.lastInsertRowid;

        for (const sig of virtualSignals) {
          const sigInfo = run(db,
            'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)',
            [newRouteId, sig.name, sig.lat, sig.lng, sig.order_in_route]
          );
          sig.id = sigInfo.lastInsertRowid;
        }

        tripModel.updateRoute(db, tripId, newRouteId);
        tripModel.updatePhase(db, tripId, 'to_hospital');
        saveDB();

        const updatedTrip = tripModel.getById(db, tripId);
        if (io) {
          io.emit('trip:updated', updatedTrip);
        }

        startSimulation({
          tripId: updatedTrip.id,
          ambulanceId: updatedTrip.ambulance_id,
          routeId: newRouteId,
          polyline: routeData.polyline,
          signals: virtualSignals,
          vehicleNumber: updatedTrip.vehicle_number
        });
      } catch (err) {
        logger.error(`Failed to route to hospital: ${err.message}`);
      }
    }, 15000);

  } else {
    activeSimulations.delete(tripId);
    tripModel.updateStatus(db, tripId, 'completed', new Date().toISOString());
    ambulanceModel.updateStatus(db, sim.ambulanceId, 'idle');
    
    for (const signal of sim.signals) {
      if (signal.isGreenForTrip) {
        if (!isSignalNeededByAnotherTrip(signal.id, tripId)) {
          signalService.revertSignal(signal.id);
        }
        signal.isGreenForTrip = false;
      }
    }
    saveDB();

    logger.info(`Trip ${tripId} completed.`);

    const io = getIO();
    if (io) {
      io.emit('trip:ended', { tripId });
    }
  }
}

function stopSimulation(tripId) {
  const sim = activeSimulations.get(tripId);
  if (sim) {
    if (sim.intervalId) clearInterval(sim.intervalId);
    if (sim.timeoutId) clearTimeout(sim.timeoutId);
    
    for (const signal of sim.signals) {
      if (signal.isGreenForTrip) {
        if (!isSignalNeededByAnotherTrip(signal.id, tripId)) {
          signalService.revertSignal(signal.id);
        }
        signal.isGreenForTrip = false;
      }
    }

    activeSimulations.delete(tripId);
    logger.info(`Simulation stopped for trip ${tripId}`);
  }
}

module.exports = { startSimulation, stopSimulation };
