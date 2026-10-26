// Production minimum, migration 0016 checked on 26 October 2026.
export const MINIMUM_SCHEMA_VERSION = 16;
// One shared in-flight check per D1 binding per isolate. Failures retry after
// a minute so a migration can recover a warm isolate without redeployment.
const checks = new WeakMap();
export async function schemaCompatibility(db) {
  if (!db) return null; // local static development has no D1 binding
  let entry = checks.get(db);
  if (!entry || entry.until < Date.now()) {
    entry = {until: Infinity};
    entry.promise = (async () => {
      try {
        const out = await db.prepare('SELECT name FROM d1_migrations').all();
        const version = Math.max(0, ...(out.results || []).map(r => Number(/^(\d+)_/.exec(r.name || '')?.[1]) || 0));
        if (version >= MINIMUM_SCHEMA_VERSION) return null;
      } catch (_) { /* No SQL details or deployment metadata in the response. */ }
      entry.until = Date.now() + 60000;
      return {code: 'incompatible_schema', error: 'incompatible_schema'};
    })();
    checks.set(db, entry);
  }
  const failure = await entry.promise;
  return failure ? Response.json(failure, {status: 503, headers: {'Cache-Control':'no-store','Retry-After':'60'}}) : null;
}
