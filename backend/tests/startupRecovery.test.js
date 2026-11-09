const { test } = require('node:test');
const assert = require('node:assert');
const initSqlJs = require('sql.js');

test('startup recovery and legacy schema migration: preserves records, sets end_time, resets orphaned state', async () => {
  const SQL = await initSqlJs();
  // Using an isolated in-memory disposable database copy
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');

  const { queryAll, queryOne, run } = require('../src/db/helpers');

  // 1. Create a legacy database schema (Phase 1 schema missing Phase 2 columns)
  db.run(`CREATE TABLE hospitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL
  )`);

  db.run(`CREATE TABLE ambulances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_number TEXT UNIQUE NOT NULL,
    driver_name TEXT NOT NULL,
    hospital TEXT NOT NULL,
    status TEXT DEFAULT 'idle' CHECK(status IN ('idle', 'en_route', 'arrived'))
  )`);

  // Legacy routes table WITHOUT is_custom column
  db.run(`CREATE TABLE routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_name TEXT NOT NULL,
    end_name TEXT NOT NULL,
    polyline TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL REFERENCES routes(id),
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    order_in_route INTEGER NOT NULL,
    current_state TEXT DEFAULT 'red' CHECK(current_state IN ('red', 'green'))
  )`);

  // Legacy trips table WITHOUT phase, pickup_lat, pickup_lng, dest_hospital_id
  db.run(`CREATE TABLE trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ambulance_id INTEGER NOT NULL REFERENCES ambulances(id),
    route_id INTEGER NOT NULL REFERENCES routes(id),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
    start_time TEXT NOT NULL,
    end_time TEXT
  )`);

  db.run(`CREATE TABLE priority_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id),
    signal_id INTEGER NOT NULL REFERENCES signals(id),
    triggered_at TEXT NOT NULL,
    eta_at_trigger REAL NOT NULL,
    acknowledged INTEGER DEFAULT 0
  )`);

  // Seed legacy data
  run(db, "INSERT INTO hospitals (name, lat, lng) VALUES ('Test Hospital', 13.08, 80.27)");
  run(db, "INSERT INTO ambulances (vehicle_number, driver_name, hospital, status) VALUES ('TN-01-AA-1111', 'Driver A', 'Test Hospital', 'en_route')");
  run(db, "INSERT INTO ambulances (vehicle_number, driver_name, hospital, status) VALUES ('TN-01-BB-2222', 'Driver B', 'Test Hospital', 'en_route')"); // will be orphaned
  run(db, "INSERT INTO ambulances (vehicle_number, driver_name, hospital, status) VALUES ('TN-01-CC-3333', 'Driver C', 'Test Hospital', 'idle')");
  run(db, "INSERT INTO routes (name, start_name, end_name, polyline) VALUES ('Legacy Corridor', 'Origin', 'Destination', '[[13.08, 80.27], [13.09, 80.28]]')");
  run(db, "INSERT INTO signals (route_id, name, lat, lng, order_in_route, current_state) VALUES (1, 'Legacy Signal 1', 13.085, 80.275, 1, 'green')");
  run(db, "INSERT INTO signals (route_id, name, lat, lng, order_in_route, current_state) VALUES (1, 'Legacy Signal 2', 13.089, 80.279, 2, 'green')");

  const completedStartTime = '2026-01-01T10:00:00.000Z';
  const completedEndTime = '2026-01-01T10:15:00.000Z';
  run(db, "INSERT INTO trips (ambulance_id, route_id, status, start_time, end_time) VALUES (3, 1, 'completed', ?, ?)", [completedStartTime, completedEndTime]);

  const cancelledStartTime = '2026-01-02T11:00:00.000Z';
  const cancelledEndTime = '2026-01-02T11:05:00.000Z';
  run(db, "INSERT INTO trips (ambulance_id, route_id, status, start_time, end_time) VALUES (3, 1, 'cancelled', ?, ?)", [cancelledStartTime, cancelledEndTime]);

  // Active interrupted trip (associated with ambulance 1)
  const activeStartTime = '2026-01-03T12:00:00.000Z';
  run(db, "INSERT INTO trips (ambulance_id, route_id, status, start_time, end_time) VALUES (1, 1, 'active', ?, NULL)", [activeStartTime]);

  // 2. Run schema initialization & migration on the legacy database
  const { initializeSchema } = require('../src/db/schema');
  initializeSchema(db);

  // Verify migrated columns now exist
  const routeColumns = queryAll(db, 'PRAGMA table_info(routes)').map(c => c.name);
  assert.ok(routeColumns.includes('is_custom'), 'routes table must include migrated is_custom column');

  const tripColumns = queryAll(db, 'PRAGMA table_info(trips)').map(c => c.name);
  assert.ok(tripColumns.includes('phase'), 'trips table must include migrated phase column');
  assert.ok(tripColumns.includes('pickup_lat'), 'trips table must include migrated pickup_lat column');
  assert.ok(tripColumns.includes('pickup_lng'), 'trips table must include migrated pickup_lng column');
  assert.ok(tripColumns.includes('dest_hospital_id'), 'trips table must include migrated dest_hospital_id column');

  // Verify existing legacy route record was preserved and defaults to is_custom = 0
  const legacyRoute = queryOne(db, 'SELECT * FROM routes WHERE id = 1');
  assert.strictEqual(legacyRoute.name, 'Legacy Corridor');
  assert.strictEqual(legacyRoute.is_custom, 0);

  // 3. Run startup recovery
  const { recoverInterruptedTrips } = require('../src/services/simulationService');
  recoverInterruptedTrips(db);

  // Verify:
  // (a) Active trip was cancelled and has end_time set
  const recoveredActiveTrip = queryOne(db, 'SELECT * FROM trips WHERE id = 3');
  assert.strictEqual(recoveredActiveTrip.status, 'cancelled');
  assert.ok(recoveredActiveTrip.end_time, 'Recovered trip must have end_time set');
  assert.strictEqual(recoveredActiveTrip.start_time, activeStartTime);

  // (b) Ambulance 1 associated with active trip returned to idle
  const amb1 = queryOne(db, 'SELECT * FROM ambulances WHERE id = 1');
  assert.strictEqual(amb1.status, 'idle');

  // (c) Completed trip remains completely untouched with original timestamps
  const completedTrip = queryOne(db, 'SELECT * FROM trips WHERE id = 1');
  assert.strictEqual(completedTrip.status, 'completed');
  assert.strictEqual(completedTrip.start_time, completedStartTime);
  assert.strictEqual(completedTrip.end_time, completedEndTime);

  // (d) Cancelled trip remains untouched with original timestamps
  const cancelledTrip = queryOne(db, 'SELECT * FROM trips WHERE id = 2');
  assert.strictEqual(cancelledTrip.status, 'cancelled');
  assert.strictEqual(cancelledTrip.start_time, cancelledStartTime);
  assert.strictEqual(cancelledTrip.end_time, cancelledEndTime);

  // (e) Orphaned ambulance 2 returned to idle
  const amb2 = queryOne(db, 'SELECT * FROM ambulances WHERE id = 2');
  assert.strictEqual(amb2.status, 'idle', 'Orphaned en_route ambulance must be returned to idle');

  // (f) All green signals reset to red
  const greenSignals = queryAll(db, "SELECT * FROM signals WHERE current_state = 'green'");
  assert.strictEqual(greenSignals.length, 0, 'All stale green signals must be reset to red');
  const redSignals = queryAll(db, "SELECT * FROM signals WHERE current_state = 'red'");
  assert.strictEqual(redSignals.length, 2);
});
