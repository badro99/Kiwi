// Bridge for older partial route fixtures: missing tables come exclusively from
// the migration history, never from route helpers or a second handwritten DDL.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const dir = path.resolve(__dirname, '../../migrations');
const sql = fs.readdirSync(dir).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort()
  .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
function migrated(db) { db.exec(sql); return db; }
const reference = migrated(new DatabaseSync(':memory:'));
const objects = reference.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL AND type IN ('table','index') ORDER BY type DESC").all();
function missingMigratedTables(db) {
  const missing = new Set(objects.filter(o => o.type === 'table' && !db.prepare("SELECT 1 FROM sqlite_master WHERE name=?").get(o.name)).map(o => o.name));
  for (const object of objects) if (missing.has(object.tbl_name)) db.exec(object.sql);
  return db;
}
module.exports = { migrated, missingMigratedTables };
