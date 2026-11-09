import { test } from 'node:test';
import assert from 'node:assert';
import { normalizeAlert } from '../src/utils/normalizeAlert.js';

test('normalizeAlert correctly normalizes REST snake_case payload', () => {
  const restAlert = {
    id: 12,
    trip_id: 3,
    signal_id: 5,
    signal_name: 'Anna Salai Junction',
    vehicle_number: 'TN-01-AB-1234',
    eta_at_trigger: 28,
    triggered_at: '2026-11-02T10:15:30.000Z',
    acknowledged: 0
  };

  const normalized = normalizeAlert(restAlert);

  assert.strictEqual(normalized.id, 12);
  assert.strictEqual(normalized.signal_name, 'Anna Salai Junction');
  assert.strictEqual(normalized.signalName, 'Anna Salai Junction');
  assert.strictEqual(normalized.vehicle_number, 'TN-01-AB-1234');
  assert.strictEqual(normalized.vehicleNumber, 'TN-01-AB-1234');
  assert.strictEqual(normalized.eta, 28);
  assert.strictEqual(normalized.eta_at_trigger, 28);
  assert.strictEqual(normalized.acknowledged, false);
  assert.ok(normalized.timeFormatted && normalized.timeFormatted !== 'Invalid Date');
});

test('normalizeAlert correctly normalizes WebSocket camelCase payload', () => {
  const socketAlert = {
    id: 15,
    tripId: 4,
    signalId: 8,
    signalName: 'Mount Road Crossing',
    vehicleNumber: 'TN-09-EF-9012',
    eta: 18,
    timestamp: '2026-11-02T10:20:00.000Z',
    acknowledged: false
  };

  const normalized = normalizeAlert(socketAlert);

  assert.strictEqual(normalized.id, 15);
  assert.strictEqual(normalized.signal_name, 'Mount Road Crossing');
  assert.strictEqual(normalized.signalName, 'Mount Road Crossing');
  assert.strictEqual(normalized.vehicle_number, 'TN-09-EF-9012');
  assert.strictEqual(normalized.vehicleNumber, 'TN-09-EF-9012');
  assert.strictEqual(normalized.eta, 18);
  assert.strictEqual(normalized.acknowledged, false);
  assert.ok(normalized.timeFormatted && normalized.timeFormatted !== 'Invalid Date');
});

test('normalizeAlert handles missing, null, or invalid dates and missing ETA gracefully', () => {
  const malformedAlert = {
    id: 99,
    timestamp: 'not-a-valid-date-string',
    eta: null
  };

  const normalized = normalizeAlert(malformedAlert);

  assert.strictEqual(normalized.id, 99);
  assert.strictEqual(normalized.signal_name, 'Traffic Signal');
  assert.strictEqual(normalized.vehicle_number, 'Ambulance');
  assert.strictEqual(normalized.eta, null);
  assert.notStrictEqual(normalized.timeFormatted, 'Invalid Date');
  assert.ok(normalized.timeFormatted.length > 0);
});

test('normalizeAlert correctly maps acknowledged states (numbers, booleans)', () => {
  assert.strictEqual(normalizeAlert({ acknowledged: 1 }).acknowledged, true);
  assert.strictEqual(normalizeAlert({ acknowledged: true }).acknowledged, true);
  assert.strictEqual(normalizeAlert({ acknowledged: 0 }).acknowledged, false);
  assert.strictEqual(normalizeAlert({ acknowledged: false }).acknowledged, false);
  assert.strictEqual(normalizeAlert({ acknowledged: null }).acknowledged, false);
});
