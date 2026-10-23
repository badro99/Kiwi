// Cloudflare Workers globals the backend uses that the standard "webworker"
// library does not describe. Types only: nothing here runs.
// Kept by hand rather than installing @cloudflare/workers-types, so the repo
// root stays dependency-free (CLAUDE.md §2).

interface CacheStorage {
  /** Cloudflare's per-colo default cache (caches.default). */
  readonly default: Cache;
}

// Handlers attach an HTTP status or a machine reason to thrown errors and
// read them back in their catch blocks.
interface Error {
  status?: number;
  code?: string;
  reason?: string;
  dependency?: string;
}
