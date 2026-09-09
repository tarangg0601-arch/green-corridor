const { queryAll, queryOne } = require('../db/helpers');

module.exports = {
  getAll: (db) => {
    const routes = queryAll(db, 'SELECT * FROM routes');
    return routes.map(r => {
      const parsed = { ...r, polyline: JSON.parse(r.polyline) };
      // Include signals for each route
      parsed.signals = queryAll(db, `
        SELECT s.*, c.officer_name
        FROM signals s
        LEFT JOIN checkpoints c ON s.id = c.signal_id
        WHERE s.route_id = ?
        ORDER BY s.order_in_route ASC
      `, [r.id]);
      return parsed;
    });
  },
  getById: (db, id) => {
    const route = queryOne(db, 'SELECT * FROM routes WHERE id = ?', [id]);
    if (!route) return null;
    route.polyline = JSON.parse(route.polyline);
    route.signals = queryAll(db, `
      SELECT s.*, c.officer_name
      FROM signals s
      LEFT JOIN checkpoints c ON s.id = c.signal_id
      WHERE s.route_id = ?
      ORDER BY s.order_in_route ASC
    `, [id]);
    return route;
  },
  create: (db, { name, startName, endName, polyline }) => {
    const { run: dbRun } = require('../db/helpers');
    const info = dbRun(db, 'INSERT INTO routes (name, start_name, end_name, polyline) VALUES (?, ?, ?, ?)', [name, startName, endName, JSON.stringify(polyline)]);
    return module.exports.getById(db, info.lastInsertRowid);
  }
};
