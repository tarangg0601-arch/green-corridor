require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT || '3001', 10),
  dbPath: process.env.DB_PATH || './data/green_corridor.db',
  simulationTickMs: parseInt(process.env.SIMULATION_TICK_MS || '2000', 10),
  ambulanceSpeedKmh: parseInt(process.env.AMBULANCE_SPEED_KMH || '45', 10),
  priorityThresholdSeconds: parseInt(process.env.PRIORITY_THRESHOLD_SECONDS || '30', 10),
  signalGreenDurationS: parseInt(process.env.SIGNAL_GREEN_DURATION_S || '30', 10),
  signalRedDurationS: parseInt(process.env.SIGNAL_RED_DURATION_S || '45', 10),
};
