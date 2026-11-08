// Production minimum: migration 0023 (sale received_ts). 0020 to 0023 (client
// spend in centimes, sale client_id, pay statements, trusted clock) must be
// applied by the owner before this code deploys; below it every route answers 503.
export const MINIMUM_SCHEMA_VERSION = 23;
// The migrations whose columns and tables this code reads. They were applied by
// hand, so the highest number alone proves nothing: a ledger that holds 0023 but
// lacks 0021 still lacks sales.client_id. Every one of them must be recorded.
export const REQUIRED_MIGRATIONS = [20, 21, 22, 23];
const RECHECK_OK_MS = 10 * 60000;
const RECHECK_REFUSED_MS = 60000;
const RECHECK_BLIP_MS = 5000;
// A ledger that cannot be read this many times in a row, with no good read ever
// seen on this binding, is an unknown state, not a blip.
const COLD_FAULT_LIMIT = 3;
// The physical shape the critical routes read, one zero-row SELECT per table
// (it fails to prepare on a missing table or column, exactly what a
// PRAGMA table_info would report). One entry per required migration:
// 0020 clients.spend_cents, 0021 sales.client_id, 0022 pay_statements,
// 0023 sales.received_ts. The ledger is a claim; this is the proof.
export const SHAPE_PROBES = [
  'SELECT spend_cents FROM clients LIMIT 0',
  'SELECT client_id, received_ts FROM sales LIMIT 0',
  'SELECT id, merchant, number, member_id, issued_ts, issued_by FROM pay_statements LIMIT 0',
];
// One shared in-flight check per D1 binding per isolate.
// - ledger readable, complete and the physical shape present: let requests through, look again in ten minutes;
// - ledger absent ("no such table"), readable but incomplete, or complete but a
//   required table/column physically missing: refuse (503), rechecked after a
//   minute so a migration can recover a warm isolate;
// - any other failed ledger read (a D1 blip, a timeout) is not proof of an old
//   schema, so requests go through and the ledger is read again in a few seconds,
//   UNLESS this binding was last seen refused (a fault is no evidence that the
//   migration landed) or has never once been read successfully and keeps faulting
//   (COLD_FAULT_LIMIT reads in a row): then the schema is unknown and we refuse.
const checks = new WeakMap();
const verdicts = new WeakMap(); // db -> {state: 'ok' | 'refused', faults: n}
const absentLedger = (err) => /no\s+such\s+table/i.test(String((err && err.message) || err || ''));
const absentShape = (err) => /no\s+such\s+(?:table|column)|has\s+no\s+column/i.test(String((err && err.message) || err || ''));
async function shapePresent(db) {
  for (const sql of SHAPE_PROBES) {
    try { await db.prepare(sql).all(); }
    catch (err) { if (absentShape(err)) return false; /* a fault is not proof of absence */ }
  }
  return true;
}
export async function schemaCompatibility(db) {
  if (!db) return null; // local static development has no D1 binding
  let entry = checks.get(db);
  if (!entry || entry.until < Date.now()) {
    entry = {until: Infinity};
    const seen = verdicts.get(db) || {state: '', faults: 0};
    entry.promise = (async () => {
      try {
        const out = await db.prepare('SELECT name FROM d1_migrations').all();
        const have = new Set((out.results || []).map(r => Number(/^(\d+)_/.exec(r.name || '')?.[1]) || 0));
        const version = Math.max(0, ...have);
        if (version >= MINIMUM_SCHEMA_VERSION && REQUIRED_MIGRATIONS.every(n => have.has(n)) && await shapePresent(db)) {
          entry.until = Date.now() + RECHECK_OK_MS;
          verdicts.set(db, {state: 'ok', faults: 0});
          return null;
        }
      } catch (err) {
        if (!absentLedger(err)) {
          const faults = seen.faults + 1;
          const unknown = seen.state === 'refused' || (seen.state !== 'ok' && faults >= COLD_FAULT_LIMIT);
          if (!unknown) {
            entry.until = Date.now() + RECHECK_BLIP_MS;
            verdicts.set(db, {state: seen.state, faults});
            return null;
          }
          entry.until = Date.now() + RECHECK_BLIP_MS;
          verdicts.set(db, {state: 'refused', faults});
          return {code: 'incompatible_schema', error: 'incompatible_schema'};
        }
        /* The ledger table itself is missing: an untracked or very old database. */
      }
      entry.until = Date.now() + RECHECK_REFUSED_MS;
      verdicts.set(db, {state: 'refused', faults: 0});
      return {code: 'incompatible_schema', error: 'incompatible_schema'};
    })();
    checks.set(db, entry);
  }
  const failure = await entry.promise;
  return failure ? Response.json(failure, {status: 503, headers: {'Cache-Control':'no-store','Retry-After':'60'}}) : null;
}
