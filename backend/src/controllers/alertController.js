const { getDB, saveDB } = require('../db/connection');
const { queryOne, queryAll } = require('../db/helpers');
const priorityEventModel = require('../models/priorityEvent');
const logger = require('../utils/logger');

exports.list = (req, res) => {
  try {
    const db = getDB();
    let limit = 50;
    if (req.query.limit !== undefined) {
      const parsed = parseInt(req.query.limit, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.min(parsed, 100);
      } else {
        return res.status(400).json({ error: 'Limit must be a positive integer' });
      }
    }
    const items = priorityEventModel.getRecent(db, limit);
    res.json(items);
  } catch (err) {
    logger.error(`Failed to list alerts: ${err.message}`);
    res.status(500).json({ error: 'Failed to retrieve alerts' });
  }
};

exports.acknowledge = (req, res) => {
  try {
    const db = getDB();
    const alertId = parseInt(req.params.id, 10);
    if (!Number.isFinite(alertId)) {
      return res.status(400).json({ error: 'Valid alert id required' });
    }

    const existing = queryOne(db, 'SELECT id FROM priority_events WHERE id = ?', [alertId]);
    if (!existing) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    priorityEventModel.acknowledge(db, alertId);
    saveDB();
    res.json({ success: true, message: 'Alert acknowledged' });
  } catch (err) {
    logger.error(`Failed to acknowledge alert: ${err.message}`);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
};

exports.summary = (req, res) => {
  try {
    const db = getDB();
    const stats = priorityEventModel.getStats(db);
    // Add computed fields the frontend expects
    const totalSignalsPrioritized = stats ? stats.total_events : 0;
    const completedTrips = stats ? stats.completed_trips : 0;
    const cancelledTrips = stats ? stats.cancelled_trips : 0;
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
      total_trips: completedTrips,
      completed_trips: completedTrips,
      cancelled_trips: cancelledTrips,
      all_trips_count: totalTrips,
      total_signals_prioritized: totalSignalsPrioritized,
      total_acknowledged: stats ? stats.total_acknowledged : 0,
      chart_data: chartData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
