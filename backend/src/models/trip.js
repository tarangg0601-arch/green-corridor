const { queryAll, queryOne, run } = require('../db/helpers');

module.exports = {
  getAll: (db, statusFilter) => {
    let query = `
      SELECT t.*, a.vehicle_number, a.driver_name, a.hospital, r.name as route_name, r.id as rid, h.name as dest_hospital_name,
        (SELECT COUNT(*) FROM priority_events p WHERE p.trip_id = t.id) as signals_prioritized
      FROM trips t
      JOIN ambulances a ON t.ambulance_id = a.id
      JOIN routes r ON t.route_id = r.id
      LEFT JOIN hospitals h ON t.dest_hospital_id = h.id
    `;
    const params = [];
    if (statusFilter) {
      query += ' WHERE t.status = ?';
      params.push(statusFilter);
    }
    query += ' ORDER BY t.id DESC';
    return queryAll(db, query, params);
  },
  getById: (db, id) => {
    const trip = queryOne(db, `
      SELECT t.*, a.vehicle_number, a.driver_name, a.hospital, r.name as route_name, r.id as rid, h.name as dest_hospital_name,
        (SELECT COUNT(*) FROM priority_events p WHERE p.trip_id = t.id) as signals_prioritized
      FROM trips t
      JOIN ambulances a ON t.ambulance_id = a.id
      JOIN routes r ON t.route_id = r.id
      LEFT JOIN hospitals h ON t.dest_hospital_id = h.id
      WHERE t.id = ?
    `, [id]);
    if (trip) {
      trip.priority_events = queryAll(db, `
        SELECT p.*, s.name as signal_name
        FROM priority_events p
        JOIN signals s ON p.signal_id = s.id
        WHERE p.trip_id = ?
      `, [id]);
    }
    return trip;
  },
  create: (db, { ambulanceId, routeId }) => {
    const now = new Date().toISOString();
    const info = run(db, "INSERT INTO trips (ambulance_id, route_id, start_time, status) VALUES (?, ?, ?, 'active')", [ambulanceId, routeId, now]);
    return module.exports.getById(db, info.lastInsertRowid);
  },
  updateStatus: (db, id, status, endTime = null) => {
    if (endTime) {
      run(db, 'UPDATE trips SET status = ?, end_time = ? WHERE id = ?', [status, endTime, id]);
    } else {
      run(db, 'UPDATE trips SET status = ? WHERE id = ?', [status, id]);
    }
  },
  updatePhase: (db, id, phase) => {
    run(db, 'UPDATE trips SET phase = ? WHERE id = ?', [phase, id]);
  },
  updateRoute: (db, id, routeId) => {
    run(db, 'UPDATE trips SET route_id = ? WHERE id = ?', [routeId, id]);
  }
};
