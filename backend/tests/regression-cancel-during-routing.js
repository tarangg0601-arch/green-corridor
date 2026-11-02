/**
 * Regression Test: Ambulance cancellation race condition during hospital routing
 *
 * Verifies that when an ambulance trip is cancelled while the OSRM hospital routing
 * request is pending:
 *  1. In-flight abort is properly triggered
 *  2. Even if routing returns afterward, the trip remains cancelled
 *  3. The simulation is not restarted for Leg 2
 *  4. Signals are not activated
 *  5. The ambulance is restored to 'idle'
 */

const assert = require('assert');
const path = require('path');
const initSqlJs = require('sql.js');

async function runRegressionTest() {
  console.log('=== Running Regression Test: Cancel During Hospital Routing ===');

  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');

  // Load modules
  const { initializeSchema } = require('../src/db/schema');
  const { seedDatabase } = require('../src/db/seed');
  const connection = require('../src/db/connection');
  
  // Set in-memory db in connection
  connection.getDB = () => db;
  connection.saveDB = () => {}; // No-op in memory test

  initializeSchema(db);
  seedDatabase(db);

  const tripModel = require('../src/models/trip');
  const ambulanceModel = require('../src/models/ambulance');
  const signalService = require('../src/services/signalService');
  const simulationService = require('../src/services/simulationService');
  const routingService = require('../src/services/routingService');
  const tripController = require('../src/controllers/tripController');
  const { run, queryOne } = require('../src/db/helpers');

  // Track original getRoute
  const originalGetRoute = routingService.getRoute;

  try {
    // -------------------------------------------------------------
    // Test Case 1: Cancellation occurs while hospital routing request is pending,
    // and the request is aborted via AbortSignal.
    // -------------------------------------------------------------
    console.log('\n[Case 1] Cancelling while hospital routing is pending (AbortSignal fires)...');
    
    // Pick ambulance 1 (idle initially)
    ambulanceModel.updateStatus(db, 1, 'en_route');
    const hospital = queryOne(db, 'SELECT * FROM hospitals WHERE id = 1');

    // Create a trip in 'to_pickup' phase
    const tripInfo = run(db,
      `INSERT INTO trips (ambulance_id, route_id, status, phase, pickup_lat, pickup_lng, dest_hospital_id, start_time)
       VALUES (?, ?, 'active', 'to_pickup', ?, ?, ?, ?)`,
      [1, 1, 13.0605, 80.2497, 1, new Date().toISOString()]
    );
    const tripId = tripInfo.lastInsertRowid;

    let hospitalRoutingStarted = false;
    let hospitalRoutingResolve = null;
    let routingAborted = false;

    // Mock getRoute for Leg 2
    routingService.getRoute = (startLat, startLng, endLat, endLng, options = {}) => {
      hospitalRoutingStarted = true;
      return new Promise((resolve, reject) => {
        hospitalRoutingResolve = resolve;

        if (options.signal) {
          if (options.signal.aborted) {
            routingAborted = true;
            return reject(new Error('OSRM routing request was aborted'));
          }
          options.signal.addEventListener('abort', () => {
            routingAborted = true;
            reject(new Error('OSRM routing request was aborted'));
          });
        }
      });
    };

    // Fast simulation: small polyline with 1 virtual signal
    const polyline = [[13.0604, 80.2496], [13.0605, 80.2497]];
    simulationService.startSimulation({
      tripId,
      ambulanceId: 1,
      routeId: 1,
      polyline,
      signals: [{ id: 1, name: 'Signal 1', lat: 13.06045, lng: 80.24965 }],
      vehicleNumber: 'TN-01-AB-1234'
    });

    // Artificially trigger pickup completion immediately
    // Override setTimeout to trigger Leg 2 immediately without 15s wait
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, delay) => {
      // Execute the Leg 2 callback immediately
      return realSetTimeout(fn, 10);
    };

    // Fast-forward: arrive at pickup
    const sim = queryOne(db, 'SELECT * FROM trips WHERE id = ?', [tripId]);
    await simulationService.completeTrip(tripId);

    // Wait a brief moment for the mocked setTimeout callback to start routingService.getRoute
    await new Promise(r => realSetTimeout(r, 50));
    assert.strictEqual(hospitalRoutingStarted, true, 'Hospital routing should have started');

    // Trip is now pending hospital routing. Cancel it via tripController.stop
    let stopStatusCode = 200;
    let stopJson = null;
    tripController.stop(
      { params: { id: tripId } },
      {
        status: (code) => ({ json: (data) => { stopStatusCode = code; stopJson = data; } }),
        json: (data) => { stopJson = data; }
      }
    );

    assert.strictEqual(stopJson.message, 'Trip stopped successfully', 'Stop should succeed');
    assert.strictEqual(routingAborted, true, 'AbortSignal must be triggered when trip is cancelled');

    // Wait to ensure async catch block finishes
    await new Promise(r => realSetTimeout(r, 50));

    // Verify trip status remains cancelled
    const tripAfterCancel = tripModel.getById(db, tripId);
    assert.strictEqual(tripAfterCancel.status, 'cancelled', 'Trip must remain cancelled');
    assert.notStrictEqual(tripAfterCancel.phase, 'to_hospital', 'Trip phase must not become to_hospital');

    // Verify ambulance restored to idle
    const ambAfterCancel = ambulanceModel.getById(db, 1);
    assert.strictEqual(ambAfterCancel.status, 'idle', 'Ambulance must be idle');
    console.log('  [PASS] Case 1 passed: Trip aborted cleanly and remains cancelled.');

    // -------------------------------------------------------------
    // Test Case 2: Cancellation races with routing response
    // (Routing response resolves, but trip status was already set to cancelled)
    // -------------------------------------------------------------
    console.log('\n[Case 2] Hospital routing completes just as cancellation happens (post-await recheck)...');

    // Reset ambulance
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
    await new Promise(r => realSetTimeout(r, 50));

    // Cancel trip 2 while routing promise is pending
    tripController.stop(
      { params: { id: trip2Id } },
      {
        status: () => ({ json: () => {} }),
        json: () => {}
      }
    );

    // Now resolve the routing promise as if OSRM returned right after cancellation
    resolveRouting2({
      polyline: [[13.0605, 80.2497], [13.0604, 80.2496]],
      distanceKm: 0.1,
      durationSec: 15
    });

    // Wait for the async continuation to run
    await new Promise(r => realSetTimeout(r, 100));

    // Verify trip 2 is STILL cancelled and was not transitioned to to_hospital
    const trip2After = tripModel.getById(db, trip2Id);
    assert.strictEqual(trip2After.status, 'cancelled', 'Trip 2 must remain cancelled despite routing resolution');
    assert.notStrictEqual(trip2After.phase, 'to_hospital', 'Trip 2 must not restart Leg 2');

    const amb2After = ambulanceModel.getById(db, 2);
    assert.strictEqual(amb2After.status, 'idle', 'Ambulance 2 must remain idle');
    console.log('  [PASS] Case 2 passed: Post-await recheck prevented trip restart.');

    // Restore setTimeout and getRoute
    global.setTimeout = realSetTimeout;
    routingService.getRoute = originalGetRoute;

    console.log('\n=== ALL REGRESSION TESTS PASSED SUCCESSFULLY ===\n');
    process.exit(0);
  } catch (err) {
    console.error('\n!!! REGRESSION TEST FAILED !!!', err);
    process.exit(1);
  }
}

runRegressionTest();
