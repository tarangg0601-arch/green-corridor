const { queryAll, queryOne, run } = require('../db/helpers');

module.exports = {
  getByRouteId: (db, routeId) => queryAll(db, 'SELECT * FROM signals WHERE route_id = ? ORDER BY order_in_route ASC', [routeId]),
  getById: (db, id) => queryOne(db, 'SELECT * FROM signals WHERE id = ?', [id]),
  updateState: (db, id, state) => {
    run(db, 'UPDATE signals SET current_state = ? WHERE id = ?', [state, id]);
  },
  resetRouteSignals: (db, routeId) => {
    run(db, 'UPDATE signals SET current_state = ? WHERE route_id = ?', ['red', routeId]);
  }
};
