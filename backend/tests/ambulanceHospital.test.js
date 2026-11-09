const { test } = require('node:test');
const assert = require('node:assert');
const initSqlJs = require('sql.js');

test('ambulance and hospital: registration validation and concurrent dispatch safety', async () => {
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

  const ambulanceController = require('../src/controllers/ambulanceController');
  const dispatchController = require('../src/controllers/dispatchController');
  const routingService = require('../src/services/routingService');
  const { queryAll } = require('../src/db/helpers');

  const originalGetRoute = routingService.getRoute;

  // Mock getRoute to return fast mock polyline
  routingService.getRoute = () => Promise.resolve({
    polyline: [[13.0604, 80.2496], [13.0605, 80.2497]],
    distanceKm: 0.05,
    durationSec: 10
  });

  try {
    // 1. Unknown hospital returns 400
    let status400 = null;
    let json400 = null;
    ambulanceController.create(
      { body: { vehicleNumber: 'TN-99-XX-9999', driverName: 'Test Driver', hospital: 'Imaginary Hospital' } },
      {
        status: (code) => ({
          json: (data) => { status400 = code; json400 = data; }
        })
      }
    );
    assert.strictEqual(status400, 400);
    assert.ok(json400.error.includes('Hospital not recognized'));

    // 2. Duplicate vehicle number returns 409
    let status409 = null;
    let json409 = null;
    ambulanceController.create(
      { body: { vehicleNumber: 'TN-01-AB-1234', driverName: 'Duplicate Driver', hospital: 'Apollo Hospital' } },
      {
        status: (code) => ({
          json: (data) => { status409 = code; json409 = data; }
        })
      }
    );
    assert.strictEqual(status409, 409);
    assert.ok(json409.error.includes('already registered'));

    // 3. Valid registration succeeds
    let status201 = null;
    let json201 = null;
    ambulanceController.create(
      { body: { vehicleNumber: 'TN-99-NEW-1111', driverName: 'Good Driver', hospital: 'Apollo Hospital' } },
      {
        status: (code) => ({
          json: (data) => { status201 = code; json201 = data; }
        })
      }
    );
    assert.strictEqual(status201, 201);
    assert.strictEqual(json201.vehicle_number, 'TN-99-NEW-1111');

    // 4. Test concurrent dispatch: 5 simultaneous dispatch calls
    // The DB has 4 ambulances total now (3 seeded + 1 newly registered).
    // Exactly 4 should succeed with distinct ambulances, and the 5th should receive HTTP 409 (no idle ambulances).
    const results = [];
    const dispatchPromises = [1, 2, 3, 4, 5].map(async (i) => {
      let code = null;
      let body = null;
      await dispatchController.callAmbulance(
        { body: { lat: 13.0605, lng: 80.2497 } },
        {
          status: (c) => ({
            json: (b) => { code = c; body = b; }
          }),
          json: (b) => { code = 201; body = b; }
        }
      );
      results.push({ code, body });
    });

    await Promise.all(dispatchPromises);

    const successfulDispatches = results.filter(r => r.code === 201);
    const exhaustedDispatches = results.filter(r => r.code === 409);

    assert.strictEqual(successfulDispatches.length, 4, 'All 4 available ambulances should be dispatched');
    assert.strictEqual(exhaustedDispatches.length, 1, '5th dispatch must receive 409 (no idle ambulances)');

    // Ensure all 4 assigned ambulance IDs are completely unique (no double reservations)
    const assignedIds = successfulDispatches.map(r => r.body.ambulance_id);
    const uniqueIds = new Set(assignedIds);
    assert.strictEqual(uniqueIds.size, 4, 'Each dispatch must reserve a distinct ambulance without collision');

    // Clean up created simulations so background timers do not keep test runner alive
    const simulationService = require('../src/services/simulationService');
    for (const r of successfulDispatches) {
      if (r.body && r.body.id) {
        simulationService.stopSimulation(r.body.id);
      }
    }
  } finally {
    routingService.getRoute = originalGetRoute;
  }
});
