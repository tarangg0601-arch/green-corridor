const { test } = require('node:test');
const assert = require('node:assert');
const initSqlJs = require('sql.js');

test('route distance validation: preview does not persist and over-limit routes reject with 422', async () => {
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

  const routeController = require('../src/controllers/routeController');
  const dispatchController = require('../src/controllers/dispatchController');
  const routingService = require('../src/services/routingService');
  const ambulanceModel = require('../src/models/ambulance');
  const tripModel = require('../src/models/trip');
  const simulationService = require('../src/services/simulationService');
  const { queryAll, queryOne, run } = require('../src/db/helpers');

  const initialRouteCount = queryAll(db, 'SELECT id FROM routes').length;
  const initialSignalCount = queryAll(db, 'SELECT id FROM signals').length;

  const originalGetRoute = routingService.getRoute;

  try {
    // 1. Preview custom route does NOT create DB records
    routingService.getRoute = async () => ({
      polyline: [[13.08, 80.27], [13.09, 80.28]],
      distanceKm: 5.2,
      durationSec: 600
    });

    let previewResult = null;
    let previewStatus = 200;
    const reqPreview = {
      body: {
        startLat: 13.08,
        startLng: 80.27,
        endLat: 13.09,
        endLng: 80.28,
        name: 'Preview Route Test'
      }
    };
    const resPreview = {
      status(s) { previewStatus = s; return this; },
      json(data) { previewResult = data; return this; }
    };

    await routeController.previewCustom(reqPreview, resPreview);
    assert.strictEqual(previewStatus, 200);
    assert.strictEqual(previewResult.name, 'Preview Route Test');
    assert.strictEqual(previewResult.distanceKm, 5.2);
    assert.strictEqual(previewResult.is_custom, 1);

    // Verify DB count has NOT changed
    const routesAfterPreview = queryAll(db, 'SELECT id FROM routes').length;
    const signalsAfterPreview = queryAll(db, 'SELECT id FROM signals').length;
    assert.strictEqual(routesAfterPreview, initialRouteCount, 'Preview should not add routes to DB');
    assert.strictEqual(signalsAfterPreview, initialSignalCount, 'Preview should not add signals to DB');

    // 2. Custom route over distance limit (e.g. 32 km > 25 km) is rejected with 422
    routingService.getRoute = async () => ({
      polyline: [[13.0, 80.2], [13.3, 80.4]],
      distanceKm: 32.5,
      durationSec: 3600
    });

    let overLimitResult = null;
    let overLimitStatus = 200;
    const reqOverLimit = {
      body: {
        startLat: 13.0,
        startLng: 80.2,
        endLat: 13.3,
        endLng: 80.4,
        name: 'Over Limit Route'
      }
    };
    const resOverLimit = {
      status(s) { overLimitStatus = s; return this; },
      json(data) { overLimitResult = data; return this; }
    };

    await routeController.createCustom(reqOverLimit, resOverLimit);
    assert.strictEqual(overLimitStatus, 422, 'Over-limit route must return 422');
    assert.match(overLimitResult.error, /maximum is 25 km/);

    const routesAfterOverLimit = queryAll(db, 'SELECT id FROM routes').length;
    assert.strictEqual(routesAfterOverLimit, initialRouteCount, 'Over-limit route must not be saved');

    // 3. Custom route under limit (e.g. 12 km <= 25 km) succeeds with 201
    routingService.getRoute = async () => ({
      polyline: [[13.05, 80.24], [13.08, 80.27]],
      distanceKm: 12.0,
      durationSec: 1200
    });

    let underLimitResult = null;
    let underLimitStatus = 200;
    const reqUnderLimit = {
      body: {
        startLat: 13.05,
        startLng: 80.24,
        endLat: 13.08,
        endLng: 80.27,
        name: 'Under Limit Route'
      }
    };
    const resUnderLimit = {
      status(s) { underLimitStatus = s; return this; },
      json(data) { underLimitResult = data; return this; }
    };

    await routeController.createCustom(reqUnderLimit, resUnderLimit);
    assert.strictEqual(underLimitStatus, 201, 'Under-limit route must return 201');
    assert.strictEqual(underLimitResult.name, 'Under Limit Route');

    // 4. Dispatch Leg 1 over limit returns 422 and reverts reserved ambulance to idle
    const idleAmbsBefore = queryAll(db, "SELECT * FROM ambulances WHERE status = 'idle'");
    assert.ok(idleAmbsBefore.length > 0);

    routingService.getRoute = async () => ({
      polyline: [[13.0, 80.2], [13.4, 80.5]],
      distanceKm: 42.0,
      durationSec: 4500
    });

    let dispatchStatus = 200;
    let dispatchResult = null;
    const reqDispatch = {
      body: {
        lat: 13.08,
        lng: 80.27
      }
    };
    const resDispatch = {
      status(s) { dispatchStatus = s; return this; },
      json(data) { dispatchResult = data; return this; }
    };

    await dispatchController.callAmbulance(reqDispatch, resDispatch);
    assert.strictEqual(dispatchStatus, 422, 'Over-limit dispatch leg 1 must return 422');
    assert.match(dispatchResult.error, /maximum is 25 km/);

    const idleAmbsAfter = queryAll(db, "SELECT * FROM ambulances WHERE status = 'idle'");
    assert.strictEqual(idleAmbsAfter.length, idleAmbsBefore.length, 'All ambulances must remain idle after failed leg 1');

    // 5. Dispatch Leg 2 over limit cancels trip with reason leg2_distance_exceeded
    // Create an active dispatch trip waiting at pickup
    ambulanceModel.updateStatus(db, 1, 'en_route');
    const tripInfo = run(db,
      `INSERT INTO trips (ambulance_id, route_id, status, phase, pickup_lat, pickup_lng, dest_hospital_id, start_time)
       VALUES (?, ?, 'active', 'to_pickup', ?, ?, ?, ?)`,
      [1, 1, 13.0605, 80.2497, 1, new Date().toISOString()]
    );
    const tripId = tripInfo.lastInsertRowid;

    // Leg 2 returns route exceeding max distance
    routingService.getRoute = async () => ({
      polyline: [[13.0605, 80.2497], [13.5, 80.8]],
      distanceKm: 48.0,
      durationSec: 5000
    });

    simulationService.startSimulation({
      tripId,
      ambulanceId: 1,
      routeId: 1,
      polyline: [[13.0604, 80.2496], [13.0605, 80.2497]],
      signals: [{ id: 1, name: 'Signal 1', lat: 13.06045, lng: 80.24965, isGreenForTrip: true }],
      vehicleNumber: 'TN-01-AB-1234'
    });

    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, delay) => realSetTimeout(fn, 10);

    await simulationService.completeTrip(tripId);
    await new Promise(r => realSetTimeout(r, 60));

    global.setTimeout = realSetTimeout;

    const finalTrip = tripModel.getById(db, tripId);
    const finalAmb = ambulanceModel.getById(db, 1);

    assert.strictEqual(finalTrip.status, 'cancelled', 'Trip must be cancelled when leg 2 exceeds distance limit');
    assert.strictEqual(finalAmb.status, 'idle', 'Ambulance must be reverted to idle');

  } finally {
    routingService.getRoute = originalGetRoute;
  }
});
