const { test } = require('node:test');
const assert = require('node:assert');
const initSqlJs = require('sql.js');
const config = require('../src/config');

test('signalCycleService: cycle timing, priority override, safe red resumption, and multi-trip sharing', async () => {
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

  const signalCycleService = require('../src/services/signalCycleService');
  const signalModel = require('../src/models/signal');

  // Use fast durations for testing
  const origRed = config.signalRedDurationS;
  const origGreen = config.signalGreenDurationS;
  config.signalRedDurationS = 0.05; // 50ms
  config.signalGreenDurationS = 0.05; // 50ms

  signalCycleService.reset();

  try {
    const sigId = 1;
    assert.strictEqual(signalModel.getById(db, sigId).current_state, 'red');

    // 1. Inactive signals without active trips should NOT cycle
    await new Promise(r => setTimeout(r, 70));
    assert.strictEqual(signalCycleService._getState(sigId), undefined);
    assert.strictEqual(signalModel.getById(db, sigId).current_state, 'red');

    // 2. Register trip 101 on signal 1 -> Starts cycling from RED
    signalCycleService.registerTripSignals(101, [sigId]);
    assert.ok(signalCycleService._getState(sigId));
    assert.strictEqual(signalCycleService._getState(sigId).state, 'red');

    // Wait 60ms -> Flips to GREEN
    await new Promise(r => setTimeout(r, 65));
    assert.strictEqual(signalModel.getById(db, sigId).current_state, 'green');
    assert.strictEqual(signalCycleService._getState(sigId).state, 'green');

    // Wait another 60ms -> Flips back to RED
    await new Promise(r => setTimeout(r, 65));
    assert.strictEqual(signalModel.getById(db, sigId).current_state, 'red');
    assert.strictEqual(signalCycleService._getState(sigId).state, 'red');

    // 3. Priority Override: Trip 101 triggers emergency green priority
    signalCycleService.setPriority(sigId, 101, true);
    signalModel.updateState(db, sigId, 'green');

    // Wait 120ms (longer than 2 cycle intervals) -> must STAY GREEN, cycle timer suspended
    await new Promise(r => setTimeout(r, 120));
    assert.strictEqual(signalModel.getById(db, sigId).current_state, 'green', 'Priority hold must keep signal green');

    // 4. Multi-trip sharing: Trip 102 also joins and needs signal 1
    signalCycleService.registerTripSignals(102, [sigId]);
    signalCycleService.setPriority(sigId, 102, true);

    // Trip 101 passes and releases priority
    signalCycleService.setPriority(sigId, 101, false);

    // Because Trip 102 still holds priority, signal must remain GREEN
    await new Promise(r => setTimeout(r, 70));
    assert.strictEqual(signalModel.getById(db, sigId).current_state, 'green', 'Signal must stay green while trip 102 holds priority');

    // 5. Trip 102 releases priority -> resumes cycling from safe RED
    signalCycleService.setPriority(sigId, 102, false);
    assert.strictEqual(signalModel.getById(db, sigId).current_state, 'red', 'Releasing priority must immediately restore safe RED');

    // Cycling resumes for Trip 101 & 102
    await new Promise(r => setTimeout(r, 65));
    assert.strictEqual(signalModel.getById(db, sigId).current_state, 'green', 'Cycling resumes and flips to green');

    // 6. Trip 101 ends, but Trip 102 is still active
    signalCycleService.unregisterTripSignals(101);
    assert.ok(signalCycleService._getState(sigId), 'Cycling must continue while trip 102 is active');

    // Trip 102 ends -> Cycling stops and signal resets to RED
    signalCycleService.unregisterTripSignals(102);
    assert.strictEqual(signalCycleService._getState(sigId), undefined, 'Cycling stops when no active trips remain');
    assert.strictEqual(signalModel.getById(db, sigId).current_state, 'red');

  } finally {
    signalCycleService.reset();
    config.signalRedDurationS = origRed;
    config.signalGreenDurationS = origGreen;
  }
});
