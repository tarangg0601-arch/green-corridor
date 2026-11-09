const config = require('../config');
const { getIO } = require('../socketManager');
const { getDB } = require('../db/connection');
const signalModel = require('../models/signal');
const logger = require('../utils/logger');

// signalId -> Set of tripIds currently traversing this signal's route
const signalTripMap = new Map();

// tripId -> Set of signalIds registered for this trip
const tripSignalMap = new Map();

// signalId -> Set of tripIds holding emergency green priority on this signal
const priorityHolds = new Map();

// signalId -> { state: 'red' | 'green', timerId: Timeout | null }
const signalCycleState = new Map();

function getRedDurationMs() {
  return (config.signalRedDurationS || 45) * 1000;
}

function getGreenDurationMs() {
  return (config.signalGreenDurationS || 30) * 1000;
}

function scheduleNextFlip(signalId, currentState) {
  const current = signalCycleState.get(signalId);
  if (!current) return;

  const nextState = currentState === 'red' ? 'green' : 'red';
  const delayMs = currentState === 'red' ? getRedDurationMs() : getGreenDurationMs();

  current.timerId = setTimeout(() => {
    // Check if emergency priority was triggered in the meantime
    const holds = priorityHolds.get(signalId);
    if (holds && holds.size > 0) {
      // Hold is active, suspend normal cycling
      return;
    }

    // Check if trips are still active on this signal
    const trips = signalTripMap.get(signalId);
    if (!trips || trips.size === 0) {
      return;
    }

    current.state = nextState;

    try {
      const db = getDB();
      signalModel.updateState(db, signalId, nextState);
    } catch (err) {
      logger.error(`Error updating signal state in cycle: ${err.message}`);
    }

    const io = getIO();
    if (io) {
      io.emit('signal:stateChange', { signalId, state: nextState });
    }

    scheduleNextFlip(signalId, nextState);
  }, delayMs);
}

function registerTripSignals(tripId, signalIds) {
  if (!signalIds || signalIds.length === 0) return;

  const tripSignals = tripSignalMap.get(tripId) || new Set();
  tripSignalMap.set(tripId, tripSignals);

  for (const sigId of signalIds) {
    tripSignals.add(sigId);

    let tripsForSignal = signalTripMap.get(sigId);
    if (!tripsForSignal) {
      tripsForSignal = new Set();
      signalTripMap.set(sigId, tripsForSignal);
    }
    tripsForSignal.add(tripId);

    // If signal is not yet cycling and not priority held, start cycling from RED
    if (!signalCycleState.has(sigId)) {
      const holds = priorityHolds.get(sigId);
      if (!holds || holds.size === 0) {
        signalCycleState.set(sigId, { state: 'red', timerId: null });
        scheduleNextFlip(sigId, 'red');
      }
    }
  }
}

function unregisterTripSignals(tripId) {
  const signals = tripSignalMap.get(tripId);
  if (!signals) return;

  for (const sigId of signals) {
    // Release any priority hold this trip had
    const holds = priorityHolds.get(sigId);
    if (holds) {
      holds.delete(tripId);
    }

    const trips = signalTripMap.get(sigId);
    if (trips) {
      trips.delete(tripId);
      if (trips.size === 0) {
        signalTripMap.delete(sigId);
        // No active trips remain on this signal: stop cycling
        const stateObj = signalCycleState.get(sigId);
        if (stateObj) {
          if (stateObj.timerId) clearTimeout(stateObj.timerId);
          signalCycleState.delete(sigId);

          // If it was left green, ensure reset to red
          try {
            const db = getDB();
            signalModel.updateState(db, sigId, 'red');
            const io = getIO();
            if (io) {
              io.emit('signal:stateChange', { signalId: sigId, state: 'red' });
            }
          } catch (e) {}
        }
      } else {
        // Other trips still using this signal. If priority was released, resume cycling from red
        if ((!holds || holds.size === 0) && !signalCycleState.has(sigId)) {
          signalCycleState.set(sigId, { state: 'red', timerId: null });
          try {
            const db = getDB();
            signalModel.updateState(db, sigId, 'red');
            const io = getIO();
            if (io) {
              io.emit('signal:stateChange', { signalId: sigId, state: 'red' });
            }
          } catch (e) {}
          scheduleNextFlip(sigId, 'red');
        }
      }
    }
  }

  tripSignalMap.delete(tripId);
}

function setPriority(signalId, tripId, isPriority) {
  let holds = priorityHolds.get(signalId);
  if (!holds) {
    holds = new Set();
    priorityHolds.set(signalId, holds);
  }

  if (isPriority) {
    holds.add(tripId);
    // Emergency priority active: suspend normal cycling timer
    const stateObj = signalCycleState.get(signalId);
    if (stateObj && stateObj.timerId) {
      clearTimeout(stateObj.timerId);
      stateObj.timerId = null;
    }
  } else {
    holds.delete(tripId);

    // If no more trips hold priority on this signal:
    if (holds.size === 0) {
      const trips = signalTripMap.get(signalId);
      if (trips && trips.size > 0) {
        // Active trips still using this signal: resume normal cycling from safe RED
        const stateObj = signalCycleState.get(signalId) || { state: 'red', timerId: null };
        stateObj.state = 'red';
        if (stateObj.timerId) clearTimeout(stateObj.timerId);
        signalCycleState.set(signalId, stateObj);

        try {
          const db = getDB();
          signalModel.updateState(db, signalId, 'red');
          const io = getIO();
          if (io) {
            io.emit('signal:stateChange', { signalId, state: 'red' });
          }
        } catch (e) {}

        scheduleNextFlip(signalId, 'red');
      } else {
        // No active trips on this signal
        const stateObj = signalCycleState.get(signalId);
        if (stateObj && stateObj.timerId) {
          clearTimeout(stateObj.timerId);
        }
        signalCycleState.delete(signalId);
      }
    }
  }
}

function reset() {
  for (const stateObj of signalCycleState.values()) {
    if (stateObj && stateObj.timerId) {
      clearTimeout(stateObj.timerId);
    }
  }
  signalCycleState.clear();
  signalTripMap.clear();
  tripSignalMap.clear();
  priorityHolds.clear();
}

module.exports = {
  registerTripSignals,
  unregisterTripSignals,
  setPriority,
  reset,
  _getState: (sigId) => signalCycleState.get(sigId),
  _getHolds: (sigId) => priorityHolds.get(sigId),
  _getTrips: (sigId) => signalTripMap.get(sigId)
};
