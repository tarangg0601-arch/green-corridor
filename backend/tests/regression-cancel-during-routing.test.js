const { test } = require('node:test');
const assert = require('node:assert');
const initSqlJs = require('sql.js');

test('regression: cancellation during pending hospital routing keeps trip cancelled and ambulance idle', async () => {
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
  const tripController = require('../src/controllers/tripController');
  const { run, queryOne } = require('../src/db/helpers');

  const originalGetRoute = routingService.getRoute;

  try {
    // Case 1: In-flight cancellation aborts routing
    ambulanceModel.updateStatus(db, 1, 'en_route');
    const tripInfo = run(db,
      `INSERT INTO trips (ambulance_id, route_id, status, phase, pickup_lat, pickup_lng, dest_hospital_id, start_time)
       VALUES (?, ?, 'active', 'to_pickup', ?, ?, ?, ?)`,
      [1, 1, 13.0605, 80.2497, 1, new Date().toISOString()]
    );
    const tripId = tripInfo.lastInsertRowid;

    let hospitalRoutingStarted = false;
    let routingAborted = false;

    routingService.getRoute = (startLat, startLng, endLat, endLng, options = {}) => {
      hospitalRoutingStarted = true;
      return new Promise((resolve, reject) => {
        if (options.signal) {
          if (options.signal.aborted) {
            routingAborted = true;
            const err = new Error('OSRM routing request was aborted');
            err.name = 'AbortError';
            return reject(err);
          }
          options.signal.addEventListener('abort', () => {
            routingAborted = true;
            const err = new Error('OSRM routing request was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    };

    const polyline = [[13.0604, 80.2496], [13.0605, 80.2497]];
    simulationService.startSimulation({
      tripId,
      ambulanceId: 1,
      routeId: 1,
      polyline,
      signals: [{ id: 1, name: 'Signal 1', lat: 13.06045, lng: 80.24965 }],
      vehicleNumber: 'TN-01-AB-1234'
    });

    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, delay) => realSetTimeout(fn, 10);

    await simulationService.completeTrip(tripId);
    await new Promise(r => realSetTimeout(r, 60));
    assert.strictEqual(hospitalRoutingStarted, true, 'Hospital routing should have started');

    let stopJson = null;
    tripController.stop(
      { params: { id: tripId } },
      {
        status: (code) => ({ json: (data) => { stopJson = data; } }),
        json: (data) => { stopJson = data; }
      }
    );

    assert.strictEqual(stopJson.message, 'Trip stopped successfully');
    assert.strictEqual(routingAborted, true, 'AbortSignal must be triggered when trip is stopped');

    await new Promise(r => realSetTimeout(r, 60));

    const tripAfterCancel = tripModel.getById(db, tripId);
    assert.strictEqual(tripAfterCancel.status, 'cancelled');
    assert.notStrictEqual(tripAfterCancel.phase, 'to_hospital');

    const ambAfterCancel = ambulanceModel.getById(db, 1);
    assert.strictEqual(ambAfterCancel.status, 'idle');

    // Case 2: Post-await status recheck prevents race condition when routing resolves
    ambulanceModel.updateStatus(db, 2, 'en_route');
    const trip2Info = run(db,
      `INSERT INTO trips (ambulance_id, route_id, status, phase, pickup_lat, pickup_lng, dest_hospital_id, start_time)
       VALUES (?, ?, 'active', 'to_pickup', ?, ?, ?, ?)`,
      [2, 1, 13.0605, 80.2497, 1, new Date().toISOString()]
    );
    const trip2Id = trip2Info.lastInsertRowid;

    let resolveRouting2;
    routingService.getRoute = () => {
      return new Promise((resolve) => {
        resolveRouting2 = resolve;
      });
    };

    simulationService.startSimulation({
      tripId: trip2Id,
      ambulanceId: 2,
      routeId: 1,
      polyline,
      signals: [{ id: 1, name: 'Signal 1', lat: 13.06045, lng: 80.24965 }],
      vehicleNumber: 'TN-01-CD-5678'
    });

    await simulationService.completeTrip(trip2Id);
    await new Promise(r => realSetTimeout(r, 60));

    tripController.stop(
      { params: { id: trip2Id } },
      {
        status: () => ({ json: () => {} }),
        json: () => {}
      }
    );

    resolveRouting2({
      polyline: [[13.0605, 80.2497], [13.0604, 80.2496]],
      distanceKm: 0.1,
      durationSec: 15
    });

    await new Promise(r => realSetTimeout(r, 100));

    const trip2After = tripModel.getById(db, trip2Id);
    assert.strictEqual(trip2After.status, 'cancelled');
    assert.notStrictEqual(trip2After.phase, 'to_hospital');

    const amb2After = ambulanceModel.getById(db, 2);
    assert.strictEqual(amb2After.status, 'idle');

    global.setTimeout = realSetTimeout;
  } finally {
    routingService.getRoute = originalGetRoute;
  }
});
