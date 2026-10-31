// Production minimum: migration 0019 (web_orders, Kiwi Commerce) applied by the
// owner on 31 October 2026, d1_migrations read in production the same day.
export const MINIMUM_SCHEMA_VERSION = 19;
// One shared in-flight check per D1 binding per isolate. Only a successful read
// below the minimum refuses (503, rechecked after a minute so a migration can
// recover a warm isolate); a failed read lets requests through.
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
      } catch (_) {
        /* A failed read is not proof of an old schema: a D1 blip must never
           refuse every sale for a minute. Let requests through, look again soon. */
        entry.until = Date.now() + 5000;
        return null;
      }
      entry.until = Date.now() + 60000;
      return {code: 'incompatible_schema', error: 'incompatible_schema'};
    })();
    checks.set(db, entry);
  }
  const failure = await entry.promise;
  return failure ? Response.json(failure, {status: 503, headers: {'Cache-Control':'no-store','Retry-After':'60'}}) : null;
}
