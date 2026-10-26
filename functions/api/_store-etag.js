// ETag of a GET /api/store answer (docs/ops/CPU.md, "Store revalidation").
/* The validator of a store document: who it belongs to, which document, and
 * the three facts every writer moves (rev, updated_ts, byte length). Weak, so
 * an edge that recompresses the body may keep it. */
const STORE_TAG = /^W\/"s1\.([a-z0-9-]{1,64})\.([a-z0-9-]{1,64})\.(\d{1,15})\.(\d{1,15})\.(\d{1,15})"$/;
export function storeEtag(merchant, feature, row) {
  const m = String(merchant || ''), f = String(feature || '');
  if (!/^[a-z0-9-]{1,64}$/.test(m) || !/^[a-z0-9-]{1,64}$/.test(f)) return null;
  const rev = Number(row && row.rev) || 0, updated = Number(row && row.updated_ts) || 0, bytes = Number(row && row.bytes) || 0;
  if (![rev, updated, bytes].every(n => Number.isSafeInteger(n) && n >= 0)) return null;
  return `W/"s1.${m}.${f}.${rev}.${updated}.${bytes}"`;
}
export function storeTag(header) {
  /* One validator only: a browser revalidating its own cached copy sends
   * exactly one. Anything else gets a full answer. */
  const m = STORE_TAG.exec(String(header || '').trim().replace(/^"/, 'W/"'));
  return m ? { merchant: m[1], feature: m[2], rev: Number(m[3]), updated: Number(m[4]), bytes: Number(m[5]) } : null;
}
