const config = require('../config');
const { getDB, saveDB } = require('../db/connection');
const signalService = require('./signalService');
const alertService = require('./alertService');
const priorityEventModel = require('../models/priorityEvent');
const logger = require('../utils/logger');

/**
 * Processes all signals on the route for a given simulation tick.
 * For each signal ahead of the ambulance, calculates ETA and triggers
 * priority mode when the ambulance is within the configured threshold.
 * Returns info about the next upcoming signal for the position broadcast.
 */
function processSignals(sim) {
  const db = getDB();
  let nextSignal = null;

  for (const signal of sim.signals) {
    // Distance to signal = signal's pre-computed distance from start minus ambulance's traveled distance
    const distanceToSignal = signal.distanceFromStart - sim.distanceTraveled;

    if (distanceToSignal < -0.05) {
      // Ambulance has passed this signal (with 50m tolerance)
      if (signal.isGreenForTrip) {
        signalService.revertSignal(signal.id);
        signal.isGreenForTrip = false;
      }
      continue;
    }

    if (distanceToSignal >= 0) {
      // Convert distance to time: ETA(seconds) = distance(km) / speed(km/s)
      const etaSeconds = distanceToSignal / (config.ambulanceSpeedKmh / 3600);

      // Track the nearest upcoming signal
      if (!nextSignal || etaSeconds < nextSignal.eta) {
        nextSignal = { id: signal.id, name: signal.name, eta: etaSeconds };
      }

      // Trigger priority if within threshold and not already triggered for this trip
      if (etaSeconds <= config.priorityThresholdSeconds && !signal.triggeredForTrip) {
        signalService.triggerPriority(signal.id);
        signal.isGreenForTrip = true;
        signal.triggeredForTrip = true;

        const event = priorityEventModel.create(db, {
          tripId: sim.tripId,
          signalId: signal.id,
          triggeredAt: new Date().toISOString(),
          etaAtTrigger: Math.round(etaSeconds)
        });

        alertService.broadcastAlert({
          id: event.id,
          signalId: signal.id,
          signalName: signal.name,
          tripId: sim.tripId,
          ambulanceId: sim.ambulanceId,
          vehicleNumber: sim.vehicleNumber,
          eta: Math.round(etaSeconds),
          timestamp: new Date().toISOString()
        });

        saveDB();
        logger.info(`Priority triggered for signal '${signal.name}' (ETA: ${etaSeconds.toFixed(1)}s)`);
      }
    }
  }

  return nextSignal;
}

module.exports = { processSignals };
