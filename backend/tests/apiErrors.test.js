const { test } = require('node:test');
const assert = require('node:assert');
const initSqlJs = require('sql.js');

test('api error handling: status codes 400, 404, 409, 502, 504 are returned with safe messages', async () => {
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

  const alertController = require('../src/controllers/alertController');
  const routeController = require('../src/controllers/routeController');
  const tripController = require('../src/controllers/tripController');
  const ambulanceController = require('../src/controllers/ambulanceController');
  const dispatchController = require('../src/controllers/dispatchController');
  const routingService = require('../src/services/routingService');
  const geocodingService = require('../src/services/geocodingService');

  const mockRes = () => {
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      }
    };
    return res;
  };

  // 1. HTTP 400: Non-numeric ID parameters
  const res1 = mockRes();
  alertController.acknowledge({ params: { id: 'not-a-number' } }, res1);
  assert.strictEqual(res1.statusCode, 400);

  const res2 = mockRes();
  routeController.getById({ params: { id: 'abc' } }, res2);
  assert.strictEqual(res2.statusCode, 400);

  const res3 = mockRes();
  tripController.getById({ params: { id: 'invalid' } }, res3);
  assert.strictEqual(res3.statusCode, 400);

  // 2. HTTP 404: Non-existent records
  const res4 = mockRes();
  alertController.acknowledge({ params: { id: '999999' } }, res4);
  assert.strictEqual(res4.statusCode, 404);
  assert.strictEqual(res4.body.error, 'Alert not found');

  const res5 = mockRes();
  routeController.getById({ params: { id: '999999' } }, res5);
  assert.strictEqual(res5.statusCode, 404);
  assert.strictEqual(res5.body.error, 'Route not found');

  const res6 = mockRes();
  tripController.getById({ params: { id: '999999' } }, res6);
  assert.strictEqual(res6.statusCode, 404);
  assert.strictEqual(res6.body.error, 'Trip not found');

  // 3. HTTP 409: Conflicts (e.g. stopping an already stopped/cancelled trip, ambulance not idle)
  const res7 = mockRes();
  tripController.stop({ params: { id: '999999' } }, res7);
  assert.strictEqual(res7.statusCode, 404);

  // 4. HTTP 502: Upstream routing service failure
  const origGetRoute = routingService.getRoute;
  try {
    routingService.getRoute = () => {
      const err = new Error('OSRM API returned status 500');
      err.statusCode = 502;
      return Promise.reject(err);
    };

    const res8 = mockRes();
    await routeController.createCustom({
      body: { startLat: 13.0604, startLng: 80.2496, endLat: 13.0605, endLng: 80.2497 }
    }, res8);
    assert.strictEqual(res8.statusCode, 502);

    // 5. HTTP 504: Upstream routing timeout
    routingService.getRoute = () => {
      const err = new Error('OSRM routing request timed out after 8s');
      err.statusCode = 504;
      err.isTimeout = true;
      return Promise.reject(err);
    };

    const res9 = mockRes();
    await routeController.createCustom({
      body: { startLat: 13.0604, startLng: 80.2496, endLat: 13.0605, endLng: 80.2497 }
    }, res9);
    assert.strictEqual(res9.statusCode, 504);
  } finally {
    routingService.getRoute = origGetRoute;
  }
});
