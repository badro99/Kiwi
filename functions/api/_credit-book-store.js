// The customer credit book (carnet de crédit) in its own store document.
//
// The book used to live inside the shared `verticalops` snapshot, at
// verticals.epicerie.data.carnet. Every trade's state shared its revision, so a
// pressing or kitchen edit on one device turned a credit entry noted on another
// device into a conflict, and the book counted against the snapshot's size.
//
// Now the book is the store_docs row (merchant, 'creditbook'), data
// { carnet: [...] }, with its own revision. Clients are unchanged: GET
// verticalops splices the book back at its old path, POST verticalops takes it
// out and writes it here. The book is append-only (an entry, once written,
// never changes or disappears: creditRefundEdit refuses both), so a device
// that missed another device's entries is not a conflict: its new entries are
// added to the stored book, entry by entry, and every stored entry stays.
//
// Lazy move: a merchant whose book is still inside verticalops keeps it there
// until the first verticalops write, which copies it here (INSERT ... ON
// CONFLICT DO NOTHING: two devices racing create one row) and only then strips
// it from verticalops. Reads fall back to the legacy copy while no row exists.
//
// Reversal: copy creditbook.data.carnet back to
// verticalops.data.verticals.epicerie.data.carnet, then delete the creditbook
// row (tools/credit-book-store-test.mjs shows both steps on a fixture).
import { json } from '../auth/_lib.js';
import { creditRefundEdit, creditSettlementAlerts } from './_credit-book-refund.js';
import { storeEtag, storeTag } from './_store-etag.js';

export const BOOK_FEATURE = 'creditbook';
export const BOOK_MAX = 1500000;

const clone = (v) => JSON.parse(JSON.stringify(v));

// The book inside a verticalops document, or undefined when the path is absent.
export function legacyBook(doc) {
  const carnet = doc && doc.verticals && doc.verticals.epicerie && doc.verticals.epicerie.data
    ? doc.verticals.epicerie.data.carnet : undefined;
  return Array.isArray(carnet) ? carnet : undefined;
}

// A copy of a verticalops document with the book at its old path.
export function withBook(doc, carnet) {
  if (!Array.isArray(carnet)) return doc;
  const out = doc && typeof doc === 'object' ? clone(doc) : { verticals: {}, commands: [], seq: 0 };
  out.verticals = out.verticals && typeof out.verticals === 'object' ? out.verticals : {};
  const ep = out.verticals.epicerie && typeof out.verticals.epicerie === 'object' ? out.verticals.epicerie : (out.verticals.epicerie = {});
  ep.data = ep.data && typeof ep.data === 'object' ? ep.data : {};
  ep.data.carnet = clone(carnet);
  return out;
}

// A copy of a verticalops document without the book.
export function withoutBook(doc) {
  if (legacyBook(doc) === undefined) return doc;
  const out = clone(doc);
  delete out.verticals.epicerie.data.carnet;
  return out;
}

const asDoc = (carnet) => ({ verticals: { epicerie: { data: { carnet } } } });
const entryKey = (c, h) => String(c.id) + ':' + (h.id || JSON.stringify([h.type, h.amt, h.at, h.label]));

// Add the entries of `incoming` that `stored` lacks. Stored entries are never
// touched. Customer fields (name, phone, limit) follow the incoming copy only
// when that copy holds every stored entry of the customer: a device that has
// not yet seen another device's entries does not overwrite its edits either.
// Returns { carnet, edited } where `edited` names an entry the incoming copy
// changed in place (refused by the caller, as before).
export function unionBook(stored, incoming) {
  const out = clone(Array.isArray(stored) ? stored : []);
  const byId = new Map(out.filter((c) => c && c.id != null).map((c) => [String(c.id), c]));
  for (const c of Array.isArray(incoming) ? incoming : []) {
    if (!c || c.id == null) continue;
    const have = byId.get(String(c.id));
    if (!have) {
      const copy = clone(c);
      delete copy.creditAlerts;
      out.push(copy);
      byId.set(String(c.id), copy);
      continue;
    }
    const known = new Map((have.hist || []).map((h) => [entryKey(have, h), h]));
    const theirs = new Set((c.hist || []).map((h) => entryKey(c, h)));
    for (const h of c.hist || []) {
      const key = entryKey(c, h);
      const old = known.get(key);
      if (old && JSON.stringify(old) !== JSON.stringify(h)) return { carnet: null, edited: key };
    }
    const seenAll = [...known.keys()].every((key) => theirs.has(key));
    if (seenAll) {
      for (const k of Object.keys(c)) if (k !== 'hist' && k !== 'creditAlerts' && k !== 'id') have[k] = clone(c[k]);
    }
    for (const h of c.hist || []) {
      const key = entryKey(c, h);
      if (known.has(key)) continue;
      (have.hist || (have.hist = [])).push(clone(h));
      known.set(key, h);
    }
  }
  return { carnet: out, edited: null };
}

// The stored book: the creditbook row when it exists, else the legacy copy.
export async function readBook(env, merchant, legacyDoc) {
  const row = await env.DB.prepare('SELECT data, rev, updated_ts FROM store_docs WHERE merchant = ? AND feature = ?')
    .bind(merchant, BOOK_FEATURE).first();
  if (row) {
    let data = null;
    try { data = JSON.parse(row.data); } catch (_) { data = null; }
    if (!data || !Array.isArray(data.carnet)) throw Object.assign(new Error('credit-book-corrupt'), { code: 'credit-book-unavailable' });
    return { exists: true, rev: Number(row.rev) || 0, carnet: data.carnet };
  }
  return { exists: false, rev: 0, carnet: legacyBook(legacyDoc) || [] };
}

// Write `incoming` into the book, appending what it adds. Compare-and-swap on
// the book's own revision, retried on a lost race. `guard(next, current, text)`
// is the tenant guard, run on what is about to be written.
/**
 * @param {any} env
 * @param {string} merchant
 * @param {any} legacyDoc
 * @param {any[]} incoming
 * @param {{ guard?: (next: any, current: any, text: string) => Promise<any>, keepHistory?: () => Promise<any>, now?: number }} [options]
 */
export async function commitBook(env, merchant, legacyDoc, incoming, { guard, keepHistory, now = Date.now() } = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const book = await readBook(env, merchant, legacyDoc);
    const merged = unionBook(book.carnet, incoming);
    if (!merged.carnet) return { error: 'credit-refund-use-operation', status: 409 };
    if (creditRefundEdit(asDoc(book.carnet), asDoc(merged.carnet))) return { error: 'credit-refund-use-operation', status: 409 };
    creditSettlementAlerts(asDoc(merged.carnet));
    const next = { carnet: merged.carnet };
    const text = JSON.stringify(next);
    if (text.length > BOOK_MAX) return { error: 'too-large', status: 413 };
    if (book.exists && text === JSON.stringify({ carnet: book.carnet })) return { ok: true, exists: true, carnet: book.carnet, rev: book.rev, changed: false };
    // A merchant without any credit customer gets no row: the legacy path (an
    // empty list, or none) stays where the device wrote it.
    if (!book.exists && !merged.carnet.length) return { ok: true, exists: false, carnet: merged.carnet, rev: 0, changed: false };
    if (guard) {
      const foreign = await guard(next, { carnet: book.carnet }, text);
      if (foreign) return { error: 'foreign-document', status: 409 };
    }
    let written;
    if (book.exists) {
      if (keepHistory) await keepHistory();
      written = await env.DB.prepare('UPDATE store_docs SET data=?, rev=?, updated_ts=? WHERE merchant=? AND feature=? AND rev=?')
        .bind(text, book.rev + 1, now, merchant, BOOK_FEATURE, book.rev).run();
    } else {
      written = await env.DB.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?) ON CONFLICT(merchant,feature) DO NOTHING')
        .bind(merchant, BOOK_FEATURE, text, 1, now).run();
    }
    if (Number(written && written.meta && written.meta.changes) === 1) {
      return { ok: true, exists: true, carnet: merged.carnet, rev: book.exists ? book.rev + 1 : 1, changed: true };
    }
  }
  return { error: 'credit-book-busy', status: 409 };
}

/* verticalops se lit avec son carnet de crédit, rangé dans son propre document
 * (functions/api/_credit-book-store.js) et remis à son ancienne place pour les
 * appareils. L'ETag couvre les deux lignes : la somme des révisions monte à
 * chaque écriture de l'une ou de l'autre, une dette notée ne reste donc jamais
 * cachée derrière un 304. */
export async function getVerticalOps(request, env, merchant) {
  const feature = 'verticalops';
  try {
    const meta = await env.DB.prepare(
      'SELECT feature, rev, updated_ts, length(data) AS bytes FROM store_docs WHERE merchant = ? AND feature IN (?, ?)'
    ).bind(merchant, feature, BOOK_FEATURE).all();
    const rows = (meta && meta.results) || [];
    const ops = rows.find((r) => r.feature === feature);
    const bookRow = rows.find((r) => r.feature === BOOK_FEATURE);
    if (!ops && !bookRow) return json({ feature, merchant, data: null, rev: 0 });
    const facts = {
      rev: (Number(ops && ops.rev) || 0) + (Number(bookRow && bookRow.rev) || 0),
      updated_ts: Math.max(Number(ops && ops.updated_ts) || 0, Number(bookRow && bookRow.updated_ts) || 0),
      bytes: (Number(ops && ops.bytes) || 0) + (Number(bookRow && bookRow.bytes) || 0),
    };
    const tag = storeEtag(merchant, feature, facts);
    const cacheHeaders = tag ? { 'Cache-Control': 'private, no-cache', ETag: tag } : undefined;
    const known = storeTag(request.headers.get('If-None-Match'));
    if (tag && known && known.merchant === merchant && known.feature === feature && known.rev === facts.rev
      && known.updated === facts.updated_ts && known.bytes === facts.bytes) {
      return new Response(null, { status: 304, headers: cacheHeaders });
    }
    const full = await env.DB.prepare('SELECT feature, data FROM store_docs WHERE merchant = ? AND feature IN (?, ?)')
      .bind(merchant, feature, BOOK_FEATURE).all();
    const dataOf = (name) => {
      const row = ((full && full.results) || []).find((r) => r.feature === name);
      try { return row ? JSON.parse(row.data) : null; } catch (_) { return null; }
    };
    let data = dataOf(feature);
    const stored = dataOf(BOOK_FEATURE);
    if (stored && Array.isArray(stored.carnet)) data = withBook(data, stored.carnet);
    return json({ feature, merchant, data, rev: Number(ops && ops.rev) || 0, updated_ts: facts.updated_ts }, 200, cacheHeaders);
  } catch (_) {
    return json({ feature, merchant, data: null, rev: 0, unmigrated: true });
  }
}
