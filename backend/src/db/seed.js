const logger = require('../utils/logger');
const { queryOne, run } = require('./helpers');

function seedDatabase(db) {
  const count = queryOne(db, 'SELECT COUNT(*) as c FROM ambulances');
  if (count && count.c > 0) {
    logger.info('Database already seeded. Skipping seed.');
    return;
  }

  logger.info('Seeding database with sample data...');

  // Ambulances
  run(db, 'INSERT INTO ambulances (vehicle_number, driver_name, hospital) VALUES (?, ?, ?)', ['TN-01-AB-1234', 'Rajesh Kumar', 'Apollo Hospital']);
  run(db, 'INSERT INTO ambulances (vehicle_number, driver_name, hospital) VALUES (?, ?, ?)', ['TN-01-CD-5678', 'Priya Sharma', 'MIOT Hospital']);
  run(db, 'INSERT INTO ambulances (vehicle_number, driver_name, hospital) VALUES (?, ?, ?)', ['TN-09-EF-9012', 'Suresh Babu', 'Rajiv Gandhi Government Hospital']);

  // Route 1: Apollo Hospital to Adyar Signal
  const route1 = run(db, 'INSERT INTO routes (name, start_name, end_name, polyline) VALUES (?, ?, ?, ?)', [
    'Apollo Hospital to Adyar Signal',
    'Apollo Hospital',
    'Adyar Signal',
    JSON.stringify([
      [13.0604, 80.2496], [13.0580, 80.2510], [13.0555, 80.2525],
      [13.0510, 80.2540], [13.0470, 80.2555], [13.0430, 80.2565],
      [13.0390, 80.2570], [13.0340, 80.2580], [13.0300, 80.2590],
      [13.0250, 80.2600], [13.0200, 80.2610], [13.0060, 80.2570]
    ])
  ]);

  const s1_1 = run(db, 'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)', [route1.lastInsertRowid, 'Gemini Flyover Signal', 13.0510, 80.2540, 1]);
  const s1_2 = run(db, 'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)', [route1.lastInsertRowid, 'Cathedral Road Junction', 13.0470, 80.2555, 2]);
  const s1_3 = run(db, 'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)', [route1.lastInsertRowid, 'Nandanam Signal', 13.0390, 80.2570, 3]);
  const s1_4 = run(db, 'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)', [route1.lastInsertRowid, 'Adyar Signal', 13.0200, 80.2610, 4]);

  // Route 2: MIOT Hospital to Guindy
  const route2 = run(db, 'INSERT INTO routes (name, start_name, end_name, polyline) VALUES (?, ?, ?, ?)', [
    'MIOT Hospital to Guindy',
    'MIOT Hospital',
    'Guindy',
    JSON.stringify([
      [13.0320, 80.2080], [13.0300, 80.2100], [13.0280, 80.2130],
      [13.0260, 80.2160], [13.0240, 80.2190], [13.0220, 80.2220],
      [13.0200, 80.2250], [13.0180, 80.2280], [13.0160, 80.2310],
      [13.0120, 80.2350], [13.0100, 80.2380]
    ])
  ]);

  const s2_1 = run(db, 'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)', [route2.lastInsertRowid, 'Ramapuram Signal', 13.0240, 80.2190, 1]);
  const s2_2 = run(db, 'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)', [route2.lastInsertRowid, 'DLF IT Park Signal', 13.0200, 80.2250, 2]);
  const s2_3 = run(db, 'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)', [route2.lastInsertRowid, 'Guindy Signal', 13.0120, 80.2350, 3]);

  // Route 3: Rajiv Gandhi Hospital to Central Station
  const route3 = run(db, 'INSERT INTO routes (name, start_name, end_name, polyline) VALUES (?, ?, ?, ?)', [
    'Rajiv Gandhi Hospital to Central Station',
    'Rajiv Gandhi Government Hospital',
    'Chennai Central Station',
    JSON.stringify([
      [13.0510, 80.2750], [13.0530, 80.2730], [13.0560, 80.2710],
      [13.0590, 80.2690], [13.0620, 80.2670], [13.0660, 80.2650],
      [13.0700, 80.2630], [13.0740, 80.2610], [13.0770, 80.2600],
      [13.0800, 80.2590], [13.0830, 80.2680], [13.0835, 80.2710],
      [13.0828, 80.2740]
    ])
  ]);

  const s3_1 = run(db, 'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)', [route3.lastInsertRowid, 'EVR Periyar Signal', 13.0620, 80.2670, 1]);
  const s3_2 = run(db, 'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)', [route3.lastInsertRowid, 'Kilpauk Signal', 13.0700, 80.2630, 2]);
  const s3_3 = run(db, 'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)', [route3.lastInsertRowid, 'Egmore Signal', 13.0770, 80.2600, 3]);
  const s3_4 = run(db, 'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)', [route3.lastInsertRowid, 'Poonamallee High Road Signal', 13.0830, 80.2680, 4]);
  const s3_5 = run(db, 'INSERT INTO signals (route_id, name, lat, lng, order_in_route) VALUES (?, ?, ?, ?, ?)', [route3.lastInsertRowid, 'Central Station Signal', 13.0835, 80.2710, 5]);

  // Checkpoints
  const officers = [
    'Inspector Venkat', 'SI Murugan', 'Inspector Lakshmi', 'SI Arjun',
    'Inspector Deepa', 'SI Karthik', 'Inspector Meena', 'SI Ravi',
    'Inspector Anitha', 'SI Prakash', 'Inspector Divya', 'SI Ganesh'
  ];
  const signalIds = [
    s1_1, s1_2, s1_3, s1_4,
    s2_1, s2_2, s2_3,
    s3_1, s3_2, s3_3, s3_4, s3_5
  ].map(res => res.lastInsertRowid);

  for (let i = 0; i < signalIds.length; i++) {
    run(db, 'INSERT INTO checkpoints (signal_id, officer_name) VALUES (?, ?)', [signalIds[i], officers[i % officers.length]]);
  }

  logger.info('Database seeding complete.');
}

module.exports = { seedDatabase };
