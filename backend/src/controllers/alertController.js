const { getDB } = require('../db/connection');
const { saveDB } = require('../db/connection');
const priorityEventModel = require('../models/priorityEvent');

exports.list = (req, res) => {
  try {
    const db = getDB();
    const items = priorityEventModel.getRecent(db, parseInt(req.query.limit || '50'));
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.acknowledge = (req, res) => {
  try {
    const db = getDB();
    priorityEventModel.acknowledge(db, parseInt(req.params.id));
    saveDB();
    res.json({ success: true, message: 'Alert acknowledged' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.summary = (req, res) => {
  try {
    const db = getDB();
    const stats = priorityEventModel.getStats(db);
    // Add computed fields the frontend expects
    const totalSignalsPrioritized = stats ? stats.total_events : 0;
    const totalTrips = stats ? stats.total_trips : 0;
    
    // Build chart data from recent trips
    const chartData = [];
    const tripEvents = require('../db/helpers').queryAll(db, `
      SELECT t.id, r.name as route_name, COUNT(p.id) as signal_count
      FROM trips t
      JOIN routes r ON t.route_id = r.id
      LEFT JOIN priority_events p ON p.trip_id = t.id
      WHERE t.status IN ('completed', 'active')
      GROUP BY t.id
      ORDER BY t.id DESC
      LIMIT 10
    `);
    tripEvents.forEach((te, i) => {
      chartData.push({ trip: `Trip ${te.id}`, signals: te.signal_count });
    });

    res.json({
      total_trips: totalTrips,
      total_signals_prioritized: totalSignalsPrioritized,
      total_acknowledged: stats ? stats.total_acknowledged : 0,
      chart_data: chartData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
