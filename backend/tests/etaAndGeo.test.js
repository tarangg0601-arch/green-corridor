const { test } = require('node:test');
const assert = require('node:assert');
const initSqlJs = require('sql.js');
const geo = require('../src/utils/geo');
const config = require('../src/config');

test('geo.js: haversine, distance, interpolation, and segment helpers calculate accurately', () => {
  // 1. haversineDistance: Chennai Central (13.0827, 80.2707) to Marina Beach (13.0500, 80.2824)
  const dist = geo.haversineDistance(13.0827, 80.2707, 13.0500, 80.2824);
  assert.ok(dist > 3.0 && dist < 4.5, `Haversine distance ${dist} km should be ~3.8 km`);

  // Zero distance between identical points
  const zeroDist = geo.haversineDistance(13.08, 80.27, 13.08, 80.27);
  assert.strictEqual(zeroDist, 0);

  // 2. totalRouteDistance
  const polyline = [
    [13.0800, 80.2700],
    [13.0810, 80.2710],
    [13.0820, 80.2720]
  ];
  const total = geo.totalRouteDistance(polyline);
  const seg1 = geo.haversineDistance(polyline[0][0], polyline[0][1], polyline[1][0], polyline[1][1]);
  const seg2 = geo.haversineDistance(polyline[1][0], polyline[1][1], polyline[2][0], polyline[2][1]);
  assert.ok(Math.abs(total - (seg1 + seg2)) < 0.0001);

  // 3. interpolatePosition
  assert.strictEqual(geo.interpolatePosition([], 10), null);
  const startPos = geo.interpolatePosition(polyline, 0);
  assert.strictEqual(startPos.lat, 13.0800);
  assert.strictEqual(startPos.lng, 80.2700);

  const endPos = geo.interpolatePosition(polyline, total + 10);
  assert.strictEqual(endPos.lat, 13.0820);
  assert.strictEqual(endPos.lng, 80.2720);

  const midPos = geo.interpolatePosition(polyline, seg1);
  assert.ok(Math.abs(midPos.lat - 13.0810) < 0.001);
  assert.ok(Math.abs(midPos.lng - 80.2710) < 0.001);

  // 4. findNearestSegment
  const nearest = geo.findNearestSegment(polyline, 13.0801, 80.2701);
  assert.strictEqual(nearest, 0);

  // 5. distanceAlongRoute
  const distAlong = geo.distanceAlongRoute(polyline, 0, 13.0820, 80.2720);
  assert.ok(distAlong > 0);
});

test('etaService.processSignals: threshold trigger, once per trip, passing revert, and shared signal respect', async () => {
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

  const etaService = require('../src/services/etaService');
  const signalService = require('../src/services/signalService');
  const signalModel = require('../src/models/signal');

  // Track signal priority triggers and reverts
  const triggeredSignals = [];
  const revertedSignals = [];

  const origTrigger = signalService.triggerPriority;
  const origRevert = signalService.revertSignal;

  signalService.triggerPriority = (id) => {
    triggeredSignals.push(id);
    origTrigger(id);
  };
  signalService.revertSignal = (id) => {
    revertedSignals.push(id);
    origRevert(id);
  };

  const { run } = require('../src/db/helpers');
  const tripInfo = run(db, "INSERT INTO trips (ambulance_id, route_id, status, start_time) VALUES (1, 1, 'active', ?)", [new Date().toISOString()]);
  const tripId = tripInfo.lastInsertRowid;

  try {
    // Ambulance speed: 45 km/h = 12.5 m/s = 0.0125 km/s
    // Priority threshold: 30 seconds = 30 * 0.0125 = 0.375 km
    const sim = {
      tripId,
      ambulanceId: 1,
      vehicleNumber: 'TN-01-AB-1234',
      distanceTraveled: 0,
      signals: [
        {
          id: 1,
          name: 'Signal Alpha',
          distanceFromStart: 1.0, // 1 km ahead: ETA = 80s (> 30s threshold)
          isGreenForTrip: false,
          triggeredForTrip: false
        },
        {
          id: 2,
          name: 'Signal Beta',
          distanceFromStart: 0.25, // 0.25 km ahead: ETA = 20s (<= 30s threshold)
          isGreenForTrip: false,
          triggeredForTrip: false
        }
      ]
    };

    // 1. Initial tick: Signal Alpha is far (no trigger), Signal Beta is close (triggers priority)
    const nextSig = etaService.processSignals(sim, () => false);
    assert.ok(nextSig);
    assert.strictEqual(nextSig.id, 2);
    assert.strictEqual(triggeredSignals.length, 1);
    assert.strictEqual(triggeredSignals[0], 2);
    assert.strictEqual(sim.signals[1].isGreenForTrip, true);
    assert.strictEqual(sim.signals[1].triggeredForTrip, true);

    // Verify signal state in DB is now green
    const sigBetaDB = signalModel.getById(db, 2);
    assert.strictEqual(sigBetaDB.current_state, 'green');

    // 2. Next tick at same position: trigger should NOT fire again (trigger only once per trip)
    etaService.processSignals(sim, () => false);
    assert.strictEqual(triggeredSignals.length, 1, 'Priority should not re-trigger on subsequent ticks');

    // 3. Ambulance moves past Signal Beta: distanceTraveled = 0.35 km (passed by 0.10 km > 0.05 km tolerance)
    sim.distanceTraveled = 0.35;
    // Test that signal needed by another trip is NOT reverted
    const checkSignalNeeded = (sigId) => (sigId === 2); // Pretend another trip needs signal 2
    etaService.processSignals(sim, checkSignalNeeded);
    assert.strictEqual(revertedSignals.length, 0, 'Signal needed by another trip must not be reverted');
    assert.strictEqual(sim.signals[1].isGreenForTrip, false);

    // 4. Passing another signal that is NOT needed by any other trip: should revert to red
    sim.signals[1].isGreenForTrip = true; // simulate green state
    etaService.processSignals(sim, () => false); // no other trip needs it
    assert.strictEqual(revertedSignals.length, 1);
    assert.strictEqual(revertedSignals[0], 2);

    const sigBetaAfterRevert = signalModel.getById(db, 2);
    assert.strictEqual(sigBetaAfterRevert.current_state, 'red');

  } finally {
    signalService.triggerPriority = origTrigger;
    signalService.revertSignal = origRevert;
  }
});
