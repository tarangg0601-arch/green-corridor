const { getIO } = require('../socketManager');
function broadcastAlert(alertData) {
  const io = getIO();
  if (io) {
    io.emit('alert:new', alertData);
  }
}

module.exports = { broadcastAlert };
