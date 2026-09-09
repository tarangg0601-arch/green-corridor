const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');

let db = null;

async function initDB() {
  const SQL = await initSqlJs();
  
  const dbDir = path.dirname(path.resolve(config.dbPath));
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbFilePath = path.resolve(config.dbPath);
  
  if (fs.existsSync(dbFilePath)) {
    const buffer = fs.readFileSync(dbFilePath);
    db = new SQL.Database(buffer);
    logger.info(`Database loaded from ${dbFilePath}`);
  } else {
    db = new SQL.Database();
    logger.info(`New database created at ${dbFilePath}`);
  }

  // Enable WAL mode for better concurrency
  db.run('PRAGMA journal_mode = WAL');
  
  return db;
}

function getDB() {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

// Persist database to disk
function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  const dbFilePath = path.resolve(config.dbPath);
  fs.writeFileSync(dbFilePath, buffer);
}

module.exports = { initDB, getDB, saveDB };
