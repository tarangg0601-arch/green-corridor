const { test } = require('node:test');
const assert = require('node:assert');
const initSqlJs = require('sql.js');

test('routing lifecycle: leg 2 response body timeout is not mistaken for user cancellation and terminates trip safely', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');

  const { initializeSchema } = require('../src/db/schema');
  const { seedDatabase } = require('../src/db/seed');
  const connection = require('../src/db/connection');

  connection.getDB = () => db;
  connection.saveDB = () => {};

  initializeSchema(db);
  seedDatabase(db);

  const tripModel = require('../src/models/trip');
  const ambulanceModel = require('../src/models/ambulance');
  const simulationService = require('../src/services/simulationService');
  const routingService = require('../src/services/routingService');
  const { run } = require('../src/db/helpers');

  const originalGetRoute = routingService.getRoute;

  try {
    ambulanceModel.updateStatus(db, 1, 'en_route');
    const tripInfo = run(db,
      `INSERT INTO trips (ambulance_id, route_id, status, phase, pickup_lat, pickup_lng, dest_hospital_id, start_time)
       VALUES (?, ?, 'active', 'to_pickup', ?, ?, ?, ?)`,
      [1, 1, 13.0605, 80.2497, 1, new Date().toISOString()]
    );
    const tripId = tripInfo.lastInsertRowid;

    // Simulate response body timeout from routing service
    routingService.getRoute = () => {
      const err = new Error('OSRM routing request timed out after 8s');
      err.isTimeout = true;
      err.statusCode = 504;
      return Promise.reject(err);
    };

    const polyline = [[13.0604, 80.2496], [13.0605, 80.2497]];
    simulationService.startSimulation({
      tripId,
      ambulanceId: 1,
      routeId: 1,
      polyline,
      signals: [{ id: 1, name: 'Signal 1', lat: 13.06045, lng: 80.24965, isGreenForTrip: true }],
      vehicleNumber: 'TN-01-AB-1234'
    });

    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, delay) => realSetTimeout(fn, 10);

    await simulationService.completeTrip(tripId);
    await new Promise(r => realSetTimeout(r, 60));

    // Must be transitioned to cancelled, not left active
    const trip = tripModel.getById(db, tripId);
    assert.strictEqual(trip.status, 'cancelled', 'Trip must be marked cancelled on timeout');

    const amb = ambulanceModel.getById(db, 1);
    assert.strictEqual(amb.status, 'idle', 'Ambulance must be restored to idle on timeout');

    global.setTimeout = realSetTimeout;
  } finally {
    routingService.getRoute = originalGetRoute;
  }
});

test('routing lifecycle: leg 1 dispatch failure does not strand reserved ambulance', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');

  const { initializeSchema } = require('../src/db/schema');
  const { seedDatabase } = require('../src/db/seed');
  const connection = require('../src/db/connection');

  connection.getDB = () => db;
  connection.saveDB = () => {};

  initializeSchema(db);
  seedDatabase(db);

  const ambulanceModel = require('../src/models/ambulance');
  const routingService = require('../src/services/routingService');
  const dispatchController = require('../src/controllers/dispatchController');

  const originalGetRoute = routingService.getRoute;

  try {
    // Simulate routing failure during dispatch
    routingService.getRoute = () => {
      const err = new Error('OSRM network connection failed');
      err.statusCode = 502;
      return Promise.reject(err);
    };

    let statusCode = null;
    let jsonResult = null;

    await dispatchController.callAmbulance(
      { body: { lat: 13.0605, lng: 80.2497 } },
      {
        status: (code) => {
          statusCode = code;
          return { json: (data) => { jsonResult = data; } };
        },
        json: (data) => { jsonResult = data; }
      }
    );

    assert.strictEqual(statusCode, 502);
    assert.ok(jsonResult.error.includes('OSRM network connection failed'));

    // Check all ambulances: none must remain en_route
    const ambulances = ambulanceModel.getAll(db);
    for (const amb of ambulances) {
      assert.strictEqual(amb.status, 'idle', `Ambulance ${amb.id} must be idle after dispatch failure`);
    }
  } finally {
    routingService.getRoute = originalGetRoute;
  }
});
