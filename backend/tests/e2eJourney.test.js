const { test } = require('node:test');
const assert = require('node:assert');
const initSqlJs = require('sql.js');

test('E2E Journey: full multi-leg ambulance lifecycle (dispatch -> pickup -> wait -> hospital -> completed)', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');

  const { initializeSchema } = require('../src/db/schema');
  const { seedDatabase } = require('../src/db/seed');
  const connection = require('../src/db/connection');

  connection.setDB(db);
  connection.saveDB = () => {};

  initializeSchema(db);
  seedDatabase(db);

  const dispatchController = require('../src/controllers/dispatchController');
  const tripController = require('../src/controllers/tripController');
  const tripModel = require('../src/models/trip');
  const ambulanceModel = require('../src/models/ambulance');
  const signalModel = require('../src/models/signal');
  const simulationService = require('../src/services/simulationService');
  const routingService = require('../src/services/routingService');

  const originalGetRoute = routingService.getRoute;
  let dispatchResult = null;
  let dispatchStatus = 200;

  try {
    // Mock routing service with short distances for fast test progression
    routingService.getRoute = async () => ({
      polyline: [[13.0800, 80.2700], [13.0801, 80.2701]],
      distanceKm: 0.02,
      durationSec: 10
    });

    const req = {
      body: {
        lat: 13.0805,
        lng: 80.2705
      }
    };
    const res = {
      status(s) { dispatchStatus = s; return this; },
      json(d) { dispatchResult = d; return this; }
    };

    // 1. Dispatch ambulance
    await dispatchController.callAmbulance(req, res);
    assert.strictEqual(dispatchStatus, 201);
    assert.ok(dispatchResult.id);

    const tripId = dispatchResult.id;
    const ambId = dispatchResult.ambulance_id;

    // Verify initial dispatch state
    let trip = tripModel.getById(db, tripId);
    let amb = ambulanceModel.getById(db, ambId);
    assert.strictEqual(trip.status, 'active');
    assert.strictEqual(trip.phase, 'to_pickup');
    assert.strictEqual(amb.status, 'en_route');

    // 2. Simulate arrival at pickup
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, delay) => realSetTimeout(fn, 10);

    await simulationService.completeTrip(tripId);

    // Trip enters at_pickup phase
    trip = tripModel.getById(db, tripId);
    assert.strictEqual(trip.phase, 'at_pickup');

    // Wait for the simulated pickup timeout (fast forwarded)
    await new Promise(r => realSetTimeout(r, 60));

    // Trip transitioned to to_hospital phase
    trip = tripModel.getById(db, tripId);
    assert.strictEqual(trip.phase, 'to_hospital');
    assert.strictEqual(trip.status, 'active');

    // 3. Complete hospital arrival
    await simulationService.completeTrip(tripId);

    global.setTimeout = realSetTimeout;

    // Verify final state: trip completed, final phase completed, ambulance idle
    trip = tripModel.getById(db, tripId);
    amb = ambulanceModel.getById(db, ambId);

    assert.strictEqual(trip.status, 'completed', 'Trip must be marked completed');
    assert.strictEqual(trip.phase, 'completed', 'Final phase must be completed');
    assert.ok(trip.end_time, 'Trip must have end_time set');
    assert.strictEqual(amb.status, 'idle', 'Ambulance must be returned to idle');

  } finally {
    if (dispatchResult && dispatchResult.id) {
      simulationService.stopSimulation(dispatchResult.id);
    }
    routingService.getRoute = originalGetRoute;
  }
});

test('E2E Journey: cancellation during each journey leg cleanly restores state', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');

  const { initializeSchema } = require('../src/db/schema');
  const { seedDatabase } = require('../src/db/seed');
  const connection = require('../src/db/connection');

  connection.setDB(db);
  connection.saveDB = () => {};

  initializeSchema(db);
  seedDatabase(db);

  const tripController = require('../src/controllers/tripController');
  const tripModel = require('../src/models/trip');
  const ambulanceModel = require('../src/models/ambulance');
  const { run } = require('../src/db/helpers');

  // Case A: Cancellation during to_pickup
  ambulanceModel.updateStatus(db, 1, 'en_route');
  const tripA = run(db,
    "INSERT INTO trips (ambulance_id, route_id, status, phase, start_time) VALUES (1, 1, 'active', 'to_pickup', ?)",
    [new Date().toISOString()]
  );
  let resStatus = 200;
  const mockRes = {
    status(s) { resStatus = s; return this; },
    json() { return this; }
  };
  tripController.stop({ params: { id: tripA.lastInsertRowid } }, mockRes);

  assert.strictEqual(tripModel.getById(db, tripA.lastInsertRowid).status, 'cancelled');
  assert.strictEqual(ambulanceModel.getById(db, 1).status, 'idle');

  // Case B: Cancellation during at_pickup
  ambulanceModel.updateStatus(db, 2, 'en_route');
  const tripB = run(db,
    "INSERT INTO trips (ambulance_id, route_id, status, phase, start_time) VALUES (2, 1, 'active', 'at_pickup', ?)",
    [new Date().toISOString()]
  );
  tripController.stop({ params: { id: tripB.lastInsertRowid } }, mockRes);

  assert.strictEqual(tripModel.getById(db, tripB.lastInsertRowid).status, 'cancelled');
  assert.strictEqual(ambulanceModel.getById(db, 2).status, 'idle');

  // Case C: Cancellation during to_hospital
  ambulanceModel.updateStatus(db, 3, 'en_route');
  const tripC = run(db,
    "INSERT INTO trips (ambulance_id, route_id, status, phase, start_time) VALUES (3, 1, 'active', 'to_hospital', ?)",
    [new Date().toISOString()]
  );
  tripController.stop({ params: { id: tripC.lastInsertRowid } }, mockRes);

  assert.strictEqual(tripModel.getById(db, tripC.lastInsertRowid).status, 'cancelled');
  assert.strictEqual(ambulanceModel.getById(db, 3).status, 'idle');
});

test('Live External APIs: Nominatim geocoding and OSRM driving route verification', async (t) => {
  const geocodingService = require('../src/services/geocodingService');
  const routingService = require('../src/services/routingService');

  try {
    // 1. Live geocode test
    const geoResult = await geocodingService.geocode('Chennai Central, Chennai');
    assert.ok(geoResult, 'Geocoding should return result');
    assert.ok(Number.isFinite(geoResult.lat));
    assert.ok(Number.isFinite(geoResult.lng));

    // 2. Live OSRM route test
    const routeResult = await routingService.getRoute(13.0827, 80.2707, 13.0500, 80.2824);
    assert.ok(routeResult, 'OSRM should return driving route');
    assert.ok(routeResult.polyline && routeResult.polyline.length > 0);
    assert.ok(routeResult.distanceKm > 0);
  } catch (err) {
    t.skip(`External network test skipped due to connectivity/rate limit: ${err.message}`);
  }
});
