const { queryAll, queryOne } = require('../db/helpers');

module.exports = {
  getBySignalId: (db, signalId) => queryOne(db, `
    SELECT c.*, s.name as signal_name, s.lat, s.lng
    FROM checkpoints c
    JOIN signals s ON c.signal_id = s.id
    WHERE c.signal_id = ?
  `, [signalId]),
  getAll: (db) => queryAll(db, `
    SELECT c.*, s.name as signal_name, s.lat, s.lng
    FROM checkpoints c
    JOIN signals s ON c.signal_id = s.id
  `)
};
