// Подмена expo-sqlite на встроенную в Node SQLite — чтобы запускать НАСТОЯЩИЕ db/database.js и db/queries.js
const { DatabaseSync } = require('node:sqlite');
function openDatabaseSync() {
  const d = new DatabaseSync(':memory:');
  const norm = (p) => (Array.isArray(p) ? p : []).map(v => (v === undefined ? null : v));
  return {
    execSync: (sql) => { d.exec(sql); },
    runSync: (sql, params) => { const r = d.prepare(sql).run(...norm(params)); return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) }; },
    getFirstSync: (sql, params) => { const r = d.prepare(sql).get(...norm(params)); return r === undefined ? null : { ...r }; },
    getAllSync: (sql, params) => d.prepare(sql).all(...norm(params)).map(r => ({ ...r })),
  };
}
module.exports = { openDatabaseSync };
