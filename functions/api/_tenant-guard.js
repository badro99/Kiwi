/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · TENANT GUARD — no store may publish another store's records
 * ---------------------------------------------------------------------------
 * Every leak between merchants seen so far took the same road. A browser holds
 * a local copy of store A's document (a shared local key, a till re-paired to
 * another merchant, an operator tab), the sync layer files it under store B,
 * and B's server row now carries A's records. When B had nothing online the
 * device simply uploaded its copy as B's first version (assets/cloud-doc.js ›
 * pull, "rien en ligne : c'est ce navigateur qui fait référence").
 *
 * Found in production on 2026-09-26:
 *   · pasta-corner   ← amira-cafe       menu, costs, recipes, reservations
 *   · santos-store   ← amira-cafe       recipes (2026-08-12), two bookings
 *   · art-de-table…  ← amira-boutique   returns, credit note AV-2033 (#0095)
 *
 * The client paths that caused them are fixed one by one, but the next one
 * will be a path nobody has thought of yet. So the server refuses the RESULT,
 * whatever the path: a write that ADDS records which are byte-for-byte the
 * records of exactly one other store.
 *
 * Why this does not refuse honest writes:
 *   · Only records the write ADDS are examined. A record already on this
 *     store's server copy is never re-judged, so an old leak cannot lock a
 *     store out of its own document (clean those up separately).
 *   · A record only counts when it is ≥ 80 characters AND carries a real
 *     millisecond timestamp. Seeded templates (reservations.js `tpl-*`, the
 *     pressing catalogue) stamp `updatedAt: 0`; anything a person created or
 *     edited carries its time. Two stores cannot type the same record with the
 *     same id at the same millisecond.
 *   · Content held by two or more other stores is a shared template, not a
 *     copy, and is ignored.
 *
 * Restaurant menus are the exception to the timestamp rule: a dish carries no
 * time ({id,name,price,catId,…}), so any ≥ 80-character dish counts, and the
 * bar is higher: at least three dishes, and half of what the write adds, must
 * be one other restaurant's. A single dish that happens to match is never
 * refused; a whole carte swapped for a neighbour's (52 dishes on 2026-09-26)
 * always is. Boutique catalogues are not judged at all: they are built from
 * the shared shelf templates (assets/store-templates.js) with sequential ids,
 * so two honest boutiques can publish identical products.
 *
 * `briefing` is exempt: its days are keyed per venue inside every store's
 * document (a known, non-sensitive cross-filing of empty days), and refusing
 * it would drop the merchant's dismissals.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const GUARD_EXEMPT = new Set(['briefing']);

const MIN_RECORD = 80;
const MIN_DOC = 256;
const SAMPLES = 6;
const EPOCH_MS = /(?<!\d)(?:1[6-9]\d{11}|20\d{11})(?!\d)/;

/* The records of a document: a top-level array's elements, every array held
 * by a top-level key ({list:[…]}, {bookings:[…]}), and every map of objects
 * ({items:{it_1:{…}}}). Nested deeper than that is part of the record. */
export function recordsOf(value) {
  const out = [];
  const take = (e) => { if (e && typeof e === 'object' && !Array.isArray(e)) out.push(JSON.stringify(e)); };
  if (Array.isArray(value)) { value.forEach(take); return out; }
  if (!value || typeof value !== 'object') return out;
  for (const k of Object.keys(value)) {
    const x = value[k];
    if (Array.isArray(x)) x.forEach(take);
    else if (x && typeof x === 'object') {
      const vals = Object.values(x);
      if (vals.length && vals.every((y) => y && typeof y === 'object' && !Array.isArray(y))) vals.forEach(take);
    }
  }
  return out;
}

export function distinctive(text, needsTime = true) {
  return typeof text === 'string' && text.length >= MIN_RECORD && (!needsTime || EPOCH_MS.test(text));
}

/* The distinctive records `next` adds to `current`, longest first. */
export function addedSamples(next, current, needsTime = true, limit = SAMPLES) {
  const had = new Set(recordsOf(current));
  const seen = new Set();
  return recordsOf(next)
    .filter((t) => distinctive(t, needsTime) && !had.has(t) && !seen.has(t) && seen.add(t))
    .sort((a, b) => b.length - a.length)
    .slice(0, limit);
}

/* Pure decision, given who else holds each sample. `strict` is the menu bar:
 * three matches minimum AND half of the samples. Exported for the tests. */
export function judge(holdersPerSample, wholeHolders, strict = false) {
  if (wholeHolders && wholeHolders.length === 1) {
    return { from: wholeHolders[0], matched: 1, of: 1, whole: true };
  }
  const counts = new Map();
  let considered = 0;
  for (const holders of holdersPerSample) {
    if (holders.length >= 2) continue;            // shared template
    considered++;
    if (holders.length === 1) counts.set(holders[0], (counts.get(holders[0]) || 0) + 1);
  }
  const need = strict ? Math.max(3, Math.ceil(considered / 2)) : Math.min(2, considered);
  if (!need) return null;
  for (const [from, n] of counts) {
    if (n >= need) return { from, matched: n, of: holdersPerSample.length, whole: false };
  }
  return null;
}

const SQL = {
  store: {
    part: 'SELECT merchant FROM store_docs WHERE feature = ? AND merchant <> ? AND instr(data, ?) > 0 LIMIT 3',
    whole: 'SELECT merchant FROM store_docs WHERE feature = ? AND merchant <> ? AND data = ? LIMIT 3',
    args: (feature, merchant, s) => [feature, merchant, s],
  },
  menu: {
    part: 'SELECT merchant FROM menus WHERE merchant <> ? AND instr(data, ?) > 0 LIMIT 3',
    whole: 'SELECT merchant FROM menus WHERE merchant <> ? AND data = ? LIMIT 3',
    args: (_feature, merchant, s) => [merchant, s],
    menu: true,
  },
};

/* Returns null when the write is this store's own, or
 * { from, matched, of, whole } naming the store whose records it carries.
 * Fails OPEN on a database error: the guard must never become the outage. */
export async function foreignCopy(env, { table, merchant, feature, next, current, text }) {
  if (!env || !env.DB || GUARD_EXEMPT.has(feature)) return null;
  const q = SQL[table];
  if (!q) return null;
  const menu = !!q.menu;
  const samples = addedSamples(next, current, !menu, menu ? 8 : SAMPLES);
  /* The whole-document comparison only judges a store's FIRST real version:
   * that is how every leak so far arrived (a device uploading its copy to an
   * empty row). Judging later saves too would let a stale copy held elsewhere
   * lock the true owner out of re-saving its own document. */
  const firstVersion = current == null || (!recordsOf(current).length && JSON.stringify(current).length < MIN_DOC);
  const checkWhole = firstVersion && typeof text === 'string' && text.length >= MIN_DOC && (menu || EPOCH_MS.test(text));
  if (!samples.length && !checkWhole) return null;
  try {
    const stmts = samples.map((s) => env.DB.prepare(q.part).bind(...q.args(feature, merchant, s)));
    if (checkWhole) stmts.push(env.DB.prepare(q.whole).bind(...q.args(feature, merchant, text)));
    const res = await env.DB.batch(stmts);
    const holders = res.map((r) => [...new Set(((r && r.results) || []).map((x) => String(x.merchant)))]);
    const wholeHolders = checkWhole ? holders.pop() : null;
    const verdict = judge(holders, wholeHolders, menu);
    if (verdict) await logRefusal(env, { merchant, feature, table, ...verdict });
    return verdict;
  } catch (_) {
    return null;
  }
}

/* Every refusal is kept: God Mode shows them (functions/api/admin/_workspace.js),
 * because a refused copy means some device, somewhere, still holds one. */
async function logRefusal(env, v) {
  try {
    await env.DB.prepare(
      'INSERT INTO tenant_guard_events (ts, merchant, feature, source_merchant, kind, matched, sampled) VALUES (?,?,?,?,?,?,?)'
    ).bind(Date.now(), v.merchant, v.table === 'menu' ? 'menu' : v.feature, v.from,
      v.whole ? 'whole' : 'records', v.matched, v.of).run();
  } catch (_) {}
}

/* ── HISTORY ──────────────────────────────────────────────────────────────
 * Recovering Pasta Corner took two whole-database Time Travel rollbacks during
 * service, because nothing kept the previous version of a document. Before a
 * store document or a menu is overwritten, its current version is copied here
 * — at most once per 10 minutes per document (so a burst keeps the state from
 * before the burst), 30 versions kept. Never served by any route. */
const HISTORY_EVERY_MS = 10 * 60 * 1000;
const HISTORY_KEEP = 30;

export async function keepHistory(env, kind, merchant, feature) {
  if (!env || !env.DB) return;
  const now = Date.now();
  const source = kind === 'menu'
    ? "SELECT merchant, 'menu', 'menu', data, 0, updated_ts, ? FROM menus WHERE merchant = ?"
    : "SELECT merchant, 'store', feature, data, rev, updated_ts, ? FROM store_docs WHERE merchant = ? AND feature = ?";
  const key = kind === 'menu' ? 'menu' : feature;
  try {
    const recent = await env.DB.prepare(
      'SELECT 1 FROM doc_history WHERE merchant = ? AND kind = ? AND feature = ? AND saved_ts > ? LIMIT 1'
    ).bind(merchant, kind, key, now - HISTORY_EVERY_MS).first();
    if (recent) return;
    const args = kind === 'menu' ? [now, merchant] : [now, merchant, feature];
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO doc_history (merchant, kind, feature, data, rev, updated_ts, saved_ts) ${source}`).bind(...args),
      env.DB.prepare(
        `DELETE FROM doc_history WHERE merchant = ? AND kind = ? AND feature = ? AND saved_ts NOT IN
           (SELECT saved_ts FROM doc_history WHERE merchant = ? AND kind = ? AND feature = ? ORDER BY saved_ts DESC LIMIT ${HISTORY_KEEP})`
      ).bind(merchant, kind, key, merchant, kind, key),
    ]);
  } catch (_) {}
}
