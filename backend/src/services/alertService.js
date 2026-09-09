const { getIO } = require('../socketManager');
const db = require('../db/connection');
const priorityEventModel = require('../models/priorityEvent');

function broadcastAlert(alertData) {
  const io = getIO();
  if (io) {
    io.emit('alert:new', alertData);
  }
}

module.exports = { broadcastAlert };
