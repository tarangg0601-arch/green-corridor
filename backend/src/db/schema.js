const logger = require('../utils/logger');
const { queryAll } = require('./helpers');

function ensureColumn(db, table, column, definition) {
  const columns = queryAll(db, `PRAGMA table_info(${table})`);
  const exists = columns.some(col => col.name === column);
  if (!exists) {
    logger.info(`Migrating schema: adding column ${column} to table ${table}`);
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function initializeSchema(db) {
  logger.info('Initializing database schema...');
  
  db.run(`CREATE TABLE IF NOT EXISTS hospitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS ambulances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_number TEXT UNIQUE NOT NULL,
    driver_name TEXT NOT NULL,
    hospital TEXT NOT NULL,
    status TEXT DEFAULT 'idle' CHECK(status IN ('idle', 'en_route', 'arrived'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_name TEXT NOT NULL,
    end_name TEXT NOT NULL,
    polyline TEXT NOT NULL,
    is_custom INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_id INTEGER NOT NULL REFERENCES routes(id),
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    order_in_route INTEGER NOT NULL,
    current_state TEXT DEFAULT 'red' CHECK(current_state IN ('red', 'green'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    signal_id INTEGER NOT NULL REFERENCES signals(id),
    officer_name TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ambulance_id INTEGER NOT NULL REFERENCES ambulances(id),
    route_id INTEGER NOT NULL REFERENCES routes(id),
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
    phase TEXT DEFAULT NULL,
    pickup_lat REAL DEFAULT NULL,
    pickup_lng REAL DEFAULT NULL,
    dest_hospital_id INTEGER DEFAULT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS priority_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id INTEGER NOT NULL REFERENCES trips(id),
    signal_id INTEGER NOT NULL REFERENCES signals(id),
    triggered_at TEXT NOT NULL,
    eta_at_trigger REAL NOT NULL,
    acknowledged INTEGER DEFAULT 0
  )`);

  // Safe migrations for legacy databases
  ensureColumn(db, 'routes', 'is_custom', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'trips', 'phase', 'TEXT DEFAULT NULL');
  ensureColumn(db, 'trips', 'pickup_lat', 'REAL DEFAULT NULL');
  ensureColumn(db, 'trips', 'pickup_lng', 'REAL DEFAULT NULL');
  ensureColumn(db, 'trips', 'dest_hospital_id', 'INTEGER DEFAULT NULL');

  logger.info('Schema initialized.');
}

module.exports = { initializeSchema };
