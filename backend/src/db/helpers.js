/**
 * Helper functions to make sql.js queries look more like better-sqlite3.
 * sql.js returns results in a columnar format; these helpers convert
 * them to the familiar array-of-objects format.
 */

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(db, sql, params = []) {
  const results = queryAll(db, sql, params);
  return results.length > 0 ? results[0] : null;
}

function run(db, sql, params = []) {
  db.run(sql, params);
  // sql.js doesn't return lastInsertRowid from run() directly.
  // We need to query it separately.
  const result = queryOne(db, 'SELECT last_insert_rowid() as id');
  return { lastInsertRowid: result ? result.id : null };
}

module.exports = { queryAll, queryOne, run };
