const { queryAll, queryOne, run } = require('../db/helpers');

module.exports = {
  getAll: (db) => queryAll(db, 'SELECT * FROM ambulances'),
  getById: (db, id) => queryOne(db, 'SELECT * FROM ambulances WHERE id = ?', [id]),
  create: (db, { vehicleNumber, driverName, hospital }) => {
    const info = run(db, 'INSERT INTO ambulances (vehicle_number, driver_name, hospital) VALUES (?, ?, ?)', [vehicleNumber, driverName, hospital]);
    return queryOne(db, 'SELECT * FROM ambulances WHERE id = ?', [info.lastInsertRowid]);
  },
  updateStatus: (db, id, status) => {
    run(db, 'UPDATE ambulances SET status = ? WHERE id = ?', [status, id]);
  }
};
