const config = require('../config');
const { getIO } = require('../socketManager');
const geo = require('../utils/geo');
const etaService = require('./etaService');
const { getDB, saveDB } = require('../db/connection');
const tripModel = require('../models/trip');
const ambulanceModel = require('../models/ambulance');
const signalService = require('./signalService');
const signalCycleService = require('./signalCycleService');
const logger = require('../utils/logger');
const routingService = require('./routingService');
const { run, queryOne, queryAll } = require('../db/helpers');

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
    intervalId: null,
    abortController: new AbortController()
  };

  logger.info(`Starting simulation for trip ${tripId} (distance: ${totalDistance.toFixed(2)} km)`);
  sim.intervalId = setInterval(() => tick(sim), config.simulationTickMs);
  activeSimulations.set(tripId, sim);
  signalCycleService.registerTripSignals(tripId, sim.signals.map(s => s.id));
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
    completeTrip(sim.tripId).catch(err => {
      logger.error(`Error in completeTrip for trip ${sim.tripId}: ${err.message}`);
    });
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

  if (sim.intervalId) {
    clearInterval(sim.intervalId);
    sim.intervalId = null;
  }

  const db = getDB();
  const trip = tripModel.getById(db, tripId);
  if (!trip || trip.status !== 'active') {
    activeSimulations.delete(tripId);
    return;
  }
  
  if (trip.phase === 'to_pickup') {
    logger.info(`Trip ${tripId} arrived at pickup. Transitioning to hospital route in 15s.`);
    tripModel.updatePhase(db, tripId, 'at_pickup');

    // Revert any green signals on Leg 1 now that ambulance arrived at pickup
    for (const signal of sim.signals) {
      if (signal.isGreenForTrip) {
        if (!isSignalNeededByAnotherTrip(signal.id, tripId)) {
          signalService.revertSignal(signal.id);
        }
        signal.isGreenForTrip = false;
      }
    }
    saveDB();

    const io = getIO();
    if (io) {
      io.emit('trip:updated', tripModel.getById(db, tripId));
    }

    sim.timeoutId = setTimeout(async () => {
      sim.timeoutId = null;
      try {
        // Verify trip is still active and waiting at pickup
        const currentTrip = tripModel.getById(db, tripId);
        if (!currentTrip || currentTrip.status !== 'active' || currentTrip.phase !== 'at_pickup') {
          logger.info(`Trip ${tripId} is no longer active at pickup (status: ${currentTrip ? currentTrip.status : 'null'}). Aborting second leg.`);
          activeSimulations.delete(tripId);
        signalCycleService.unregisterTripSignals(tripId);
          return;
        }

        const destHospital = queryOne(db, 'SELECT * FROM hospitals WHERE id = ?', [currentTrip.dest_hospital_id]);
        if (!destHospital) throw new Error('No destination hospital found');
        
        const routeData = await routingService.getRoute(currentTrip.pickup_lat, currentTrip.pickup_lng, destHospital.lat, destHospital.lng, { signal: sim.abortController.signal });

        // Re-check trip status AFTER the async getRoute — cancellation may have
        // occurred while the OSRM request was in flight.
        const recheckTrip = tripModel.getById(db, tripId);
        if (!recheckTrip || recheckTrip.status !== 'active') {
          logger.info(`Trip ${tripId} was cancelled during hospital routing. Aborting leg 2.`);
          activeSimulations.delete(tripId);
        signalCycleService.unregisterTripSignals(tripId);
          return;
        }

        if (config.maxRouteDistanceKm && routeData.distanceKm > config.maxRouteDistanceKm) {
          const overLimitErr = new Error(`Hospital route is ${routeData.distanceKm.toFixed(1)} km; maximum is ${config.maxRouteDistanceKm} km`);
          overLimitErr.statusCode = 422;
          overLimitErr.isOverDistanceLimit = true;
          throw overLimitErr;
        }

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
        logger.error(`Failed to route to hospital for trip ${tripId}: ${err.message}`);

        // Only treat as user cancellation if the trip was actually stopped/cancelled
        // or the simulation's abortController was aborted by stopSimulation.
        const currentTripInCatch = tripModel.getById(db, tripId);
        const wasCancelledByUser = (sim && sim.abortController && sim.abortController.signal.aborted) ||
                                  (!currentTripInCatch || currentTripInCatch.status !== 'active');

        if (wasCancelledByUser) {
          logger.info(`Trip ${tripId} leg 2 routing aborted due to user cancellation (trip status: ${currentTripInCatch ? currentTripInCatch.status : 'not found'}).`);
          activeSimulations.delete(tripId);
        signalCycleService.unregisterTripSignals(tripId);
          return;
        }

        // Clean up signals for this trip
        if (sim && sim.signals) {
          for (const signal of sim.signals) {
            if (signal.isGreenForTrip) {
              if (!isSignalNeededByAnotherTrip(signal.id, tripId)) {
                signalService.revertSignal(signal.id);
              }
              signal.isGreenForTrip = false;
            }
          }
        }
        if (sim) {
          if (sim.intervalId) clearInterval(sim.intervalId);
          if (sim.timeoutId) clearTimeout(sim.timeoutId);
        }
        activeSimulations.delete(tripId);
        signalCycleService.unregisterTripSignals(tripId);

        const now = new Date().toISOString();
        tripModel.updateStatus(db, tripId, 'cancelled', now);
        ambulanceModel.updateStatus(db, trip.ambulance_id, 'idle');
        saveDB();

        const io = getIO();
        if (io) {
          const reason = err.isOverDistanceLimit
            ? 'leg2_distance_exceeded'
            : (err.isTimeout ? 'leg2_routing_timeout' : 'leg2_routing_failed');
          io.emit('trip:ended', { tripId, reason });
          io.emit('trip:updated', tripModel.getById(db, tripId));
        }
      }
    }, 15000);

  } else {
    activeSimulations.delete(tripId);
    tripModel.updateStatus(db, tripId, 'completed', new Date().toISOString());
    if (trip.phase) {
      tripModel.updatePhase(db, tripId, 'completed');
    }
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
    // Abort any in-flight OSRM/Nominatim requests for this trip
    if (sim.abortController) {
      sim.abortController.abort();
    }
    if (sim.intervalId) {
      clearInterval(sim.intervalId);
      sim.intervalId = null;
    }
    if (sim.timeoutId) {
      clearTimeout(sim.timeoutId);
      sim.timeoutId = null;
    }
    
    for (const signal of sim.signals) {
      if (signal.isGreenForTrip) {
        if (!isSignalNeededByAnotherTrip(signal.id, tripId)) {
          signalService.revertSignal(signal.id);
        }
        signal.isGreenForTrip = false;
      }
    }

    activeSimulations.delete(tripId);
    signalCycleService.unregisterTripSignals(tripId);
    saveDB();
    logger.info(`Simulation stopped for trip ${tripId}`);
  }
}

function recoverInterruptedTrips(db) {
  signalCycleService.reset();
  const activeTrips = queryAll(db, "SELECT * FROM trips WHERE status = 'active'");
  if (activeTrips.length > 0) {
    const now = new Date().toISOString();
    logger.warn(`Startup recovery: found ${activeTrips.length} interrupted active trip(s). Recovering...`);
    for (const trip of activeTrips) {
      tripModel.updateStatus(db, trip.id, 'cancelled', now);
      ambulanceModel.updateStatus(db, trip.ambulance_id, 'idle');
      logger.info(`Startup recovery: Trip ${trip.id} marked as cancelled; ambulance ${trip.ambulance_id} released to idle.`);
    }
  }

  // Reset any signals that were left in green state back to red
  const greenSignals = queryAll(db, "SELECT id FROM signals WHERE current_state = 'green'");
  if (greenSignals.length > 0) {
    logger.info(`Startup recovery: resetting ${greenSignals.length} green signal(s) back to red.`);
    run(db, "UPDATE signals SET current_state = 'red' WHERE current_state = 'green'");
  }

  // Ensure any orphaned en_route ambulances (without active trips) are restored to idle
  const orphanedAmbs = queryAll(db, "SELECT id FROM ambulances WHERE status = 'en_route'");
  if (orphanedAmbs.length > 0) {
    logger.info(`Startup recovery: resetting ${orphanedAmbs.length} orphaned en_route ambulance(s) back to idle.`);
    run(db, "UPDATE ambulances SET status = 'idle' WHERE status = 'en_route'");
  }
}

module.exports = { startSimulation, stopSimulation, recoverInterruptedTrips, completeTrip };
