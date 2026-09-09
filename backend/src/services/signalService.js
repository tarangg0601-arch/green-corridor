const { getIO } = require('../socketManager');
const { getDB } = require('../db/connection');
const signalModel = require('../models/signal');

function triggerPriority(signalId) {
  const db = getDB();
  signalModel.updateState(db, signalId, 'green');
  const io = getIO();
  if (io) {
    io.emit('signal:stateChange', { signalId, state: 'green' });
  }
}

function revertSignal(signalId) {
  const db = getDB();
  signalModel.updateState(db, signalId, 'red');
  const io = getIO();
  if (io) {
    io.emit('signal:stateChange', { signalId, state: 'red' });
  }
}

function resetRouteSignals(routeId) {
  const db = getDB();
  signalModel.resetRouteSignals(db, routeId);
  const io = getIO();
  if (io) {
    const signals = signalModel.getByRouteId(db, routeId);
    signals.forEach(s => {
      io.emit('signal:stateChange', { signalId: s.id, state: 'red' });
    });
  }
}

module.exports = { triggerPriority, revertSignal, resetRouteSignals };
