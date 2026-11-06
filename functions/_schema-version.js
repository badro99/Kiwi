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
// One shared in-flight check per D1 binding per isolate.
// - ledger readable and complete: let requests through, look again in ten minutes;
// - ledger absent ("no such table") or readable but incomplete: refuse (503),
//   rechecked after a minute so a migration can recover a warm isolate;
// - any other failed read (a D1 blip, a timeout): not proof of an old schema, so
//   requests go through and the ledger is read again in a few seconds.
const checks = new WeakMap();
const absentLedger = (err) => /no\s+such\s+table/i.test(String((err && err.message) || err || ''));
export async function schemaCompatibility(db) {
  if (!db) return null; // local static development has no D1 binding
  let entry = checks.get(db);
  if (!entry || entry.until < Date.now()) {
    entry = {until: Infinity};
    entry.promise = (async () => {
      try {
        const out = await db.prepare('SELECT name FROM d1_migrations').all();
        const have = new Set((out.results || []).map(r => Number(/^(\d+)_/.exec(r.name || '')?.[1]) || 0));
        const version = Math.max(0, ...have);
        if (version >= MINIMUM_SCHEMA_VERSION && REQUIRED_MIGRATIONS.every(n => have.has(n))) {
          entry.until = Date.now() + RECHECK_OK_MS;
          return null;
        }
      } catch (err) {
        if (!absentLedger(err)) {
          entry.until = Date.now() + RECHECK_BLIP_MS;
          return null;
        }
        /* The ledger table itself is missing: an untracked or very old database. */
      }
      entry.until = Date.now() + RECHECK_REFUSED_MS;
      return {code: 'incompatible_schema', error: 'incompatible_schema'};
    })();
    checks.set(db, entry);
  }
  const failure = await entry.promise;
  return failure ? Response.json(failure, {status: 503, headers: {'Cache-Control':'no-store','Retry-After':'60'}}) : null;
}
