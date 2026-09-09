require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const config = require('./config');
const logger = require('./utils/logger');
const { initDB, getDB, saveDB } = require('./db/connection');
const { initializeSchema } = require('./db/schema');
const { seedDatabase } = require('./db/seed');
const { setIO } = require('./socketManager');

const ambulanceRoutes = require('./routes/ambulanceRoutes');
const routeRoutes = require('./routes/routeRoutes');
const tripRoutes = require('./routes/tripRoutes');
const alertRoutes = require('./routes/alertRoutes');

async function main() {
  // Initialize database
  const db = await initDB();
  initializeSchema(db);
  seedDatabase(db);
  saveDB();

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Mount API routes
  app.use('/api/ambulances', ambulanceRoutes);
  app.use('/api/routes', routeRoutes);
  app.use('/api/trips', tripRoutes);
  app.use('/api/alerts', alertRoutes);

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' }
  });
  setIO(io);

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);
    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  // Periodically save database to disk
  setInterval(() => saveDB(), 5000);

  server.listen(config.port, () => {
    logger.info(`Green Corridor Backend running on port ${config.port}`);
  });
}

main().catch(err => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
