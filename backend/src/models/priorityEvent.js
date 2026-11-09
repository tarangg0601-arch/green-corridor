const { queryAll, queryOne, run } = require('../db/helpers');

module.exports = {
  create: (db, { tripId, signalId, triggeredAt, etaAtTrigger }) => {
    const info = run(db, 'INSERT INTO priority_events (trip_id, signal_id, triggered_at, eta_at_trigger, acknowledged) VALUES (?, ?, ?, ?, 0)', [tripId, signalId, triggeredAt, etaAtTrigger]);
    return queryOne(db, 'SELECT * FROM priority_events WHERE id = ?', [info.lastInsertRowid]);
  },
  getByTripId: (db, tripId) => queryAll(db, `
    SELECT p.*, s.name as signal_name
    FROM priority_events p
    JOIN signals s ON p.signal_id = s.id
    WHERE p.trip_id = ?
    ORDER BY p.triggered_at DESC
  `, [tripId]),
  getRecent: (db, limit = 50) => queryAll(db, `
    SELECT p.*, s.name as signal_name, a.vehicle_number, t.start_time
    FROM priority_events p
    JOIN signals s ON p.signal_id = s.id
    JOIN trips t ON p.trip_id = t.id
    JOIN ambulances a ON t.ambulance_id = a.id
    ORDER BY p.triggered_at DESC
    LIMIT ?
  `, [limit]),
  acknowledge: (db, id) => {
    run(db, 'UPDATE priority_events SET acknowledged = 1 WHERE id = ?', [id]);
  },
  getStats: (db) => queryOne(db, `
    SELECT
      (SELECT COUNT(*) FROM priority_events) as total_events,
      (SELECT COUNT(*) FROM trips WHERE status = 'completed') as completed_trips,
      (SELECT COUNT(*) FROM trips WHERE status = 'cancelled') as cancelled_trips,
      (SELECT COUNT(*) FROM trips) as total_trips,
      (SELECT COUNT(*) FROM priority_events WHERE acknowledged = 1) as total_acknowledged
  `)
};
