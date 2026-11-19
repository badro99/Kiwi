// /api/stock-transfers — le stock qui voyage d'une boutique à l'autre
// (Santos Store Casablanca → Rabat, 19 nov. 2026).
//
// Deux boutiques d'une même famille de catalogue (_catalog-family.js : même
// compte, même métier, `sharedCatalog`) s'envoient des pièces :
//   send     la boutique qui envoie scanne les pièces une fois ; elles quittent
//            son stock (mouvements `transfert`) et le transfert est « en route » ;
//   receive  la boutique qui reçoit confirme : `all` (tout entre), `partial`
//            (ce qui est arrivé entre, le reste reste en route), `missing` (on
//            dit ce qui manque, le reste entre, le transfert se ferme avec
//            l'écart). Seule la boutique destinataire confirme.
// Un transfert ouvert depuis 3 jours est `overdue` (« non reçu »).
//
// `by` est le nom du caissier DÉCLARÉ par la caisse, au même titre que le
// caissier d'une vente : une indication, pas une preuve. Ce que le serveur
// vérifie, c'est la boutique (caisse appairée ou session du compte) : elle seule
// peut faire partir son stock, et seule la destinataire peut confirmer.
//
// Les transferts vivent dans le store_doc `stock-transfers` de la boutique qui
// envoie (aucune table nouvelle). Le stock et le transfert changent dans UNE
// transaction D1 : la mise à jour du catalogue exige la révision du document
// lue, celle du document exige que le catalogue porte le mouvement qu'on vient
// d'y écrire. L'un ne passe jamais sans l'autre.

import { json } from '../auth/_lib.js';
import { tenantFor } from './_private.js';
import { materialize, compactForWrite, mergeDocs } from './_rules-catalog.js';
import { catalogFamily, definitionsOf, seedFromFamily } from './_catalog-family.js';
import { __test as catalogRules } from './catalog.js';

const { sanitize } = catalogRules;
const FEATURE = 'stock-transfers';
const OVERDUE_MS = 3 * 86400000;
const KEEP_CLOSED = 200;
const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const EMPTY_DOC = '{"v":1,"list":[]}';

function bad(error, status, extra) { return json({ error, ...(extra || {}) }, status); }

function lineInput(raw) {
  const rows = Array.isArray(raw) ? raw.slice(0, 200) : [];
  const by = new Map();
  for (const l of rows) {
    const vid = str(l && l.vid, 40);
    const q = Number(l && l.qty);
    if (!vid || !Number.isFinite(q) || !Number.isInteger(q) || q < 1 || q > 10000) return null;
    by.set(vid, (by.get(vid) || 0) + q);
  }
  return by;
}

async function shopsOf(env, members) {
  const out = [];
  for (const m of members) {
    const r = await env.DB.prepare('SELECT name, city FROM merchant_config WHERE merchant = ?').bind(m).first();
    out.push({ merchant: m, name: String((r && (r.city || r.name)) || m) });
  }
  return out;
}

async function readDoc(env, merchant) {
  const r = await env.DB.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?').bind(merchant, FEATURE).first();
  let doc = { v: 1, list: [] };
  try { if (r && r.data) doc = JSON.parse(r.data) || doc; } catch (_) {}
  if (!Array.isArray(doc.list)) doc.list = [];
  return { doc, rev: r ? Number(r.rev) || 0 : null };
}
async function ensureDoc(env, merchant) {
  await env.DB.prepare('INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 0, ?)')
    .bind(merchant, FEATURE, EMPTY_DOC, Date.now()).run();
}
async function readCatalog(env, merchant) {
  const r = await env.DB.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').bind(merchant).first();
  if (!r || !r.data) return null;
  let data; try { data = sanitize(JSON.parse(r.data)); } catch (_) { return null; }
  return { data: materialize(data), rev: Number(r.rev) || 0 };
}

/* Les fermés les plus anciens partent ; un transfert ouvert ne part jamais. */
function trim(list) {
  const open = list.filter((t) => !t.closedAt);
  const closed = list.filter((t) => t.closedAt).sort((a, b) => b.closedAt - a.closedAt).slice(0, KEEP_CLOSED);
  return open.concat(closed).sort((a, b) => b.at - a.at);
}

function view(t, names, now) {
  const remaining = (t.lines || []).reduce((s, l) => s + Math.max(0, l.qty - (l.received || 0) - (l.missing || 0)), 0);
  return { ...t, fromName: names[t.from] || t.from, toName: names[t.to] || t.to, remaining,
    overdue: !t.closedAt && now - (Number(t.at) || 0) >= OVERDUE_MS };
}

/* Une écriture couplée : catalogue (si des pièces bougent) + document des transferts. */
async function commit(env, cat, catMerchant, docMerchant, docRev, nextDoc, firstMove) {
  const now = Date.now();
  const docSql = env.DB.prepare(
    `UPDATE store_docs SET data = ?, rev = rev + 1, updated_ts = ? WHERE merchant = ? AND feature = ? AND rev = ?`
    + (firstMove ? ' AND instr((SELECT data FROM catalogs WHERE merchant = ?), ?) > 0' : ''),
  );
  const docArgs = [JSON.stringify(nextDoc), now, docMerchant, FEATURE, docRev].concat(firstMove ? [catMerchant, firstMove] : []);
  if (!firstMove) {
    const r = await docSql.bind(...docArgs).run();
    return !!(r && r.meta && Number(r.meta.changes) === 1);
  }
  const catSql = env.DB.prepare(
    `UPDATE catalogs SET data = ?, rev = rev + 1, updated_ts = ? WHERE merchant = ? AND rev = ?
       AND (SELECT rev FROM store_docs WHERE merchant = ? AND feature = ?) = ?`,
  ).bind(JSON.stringify(cat.data), now, catMerchant, cat.rev, docMerchant, FEATURE, docRev);
  const out = await env.DB.batch([catSql, docSql.bind(...docArgs)]);
  return !!(out && out[0] && out[1] && Number(out[0].meta.changes) === 1 && Number(out[1].meta.changes) === 1);
}

async function send(env, merchant, family, body) {
  const to = str(body.to, 64);
  if (!to || to === merchant || !family.members.includes(to)) return bad('not-in-family', 403);
  const ref = str(body.ref, 64);
  if (!ref) return bad('missing-ref', 400);
  const want = lineInput(body.lines);
  if (!want || !want.size) return bad('bad-lines', 400);
  const by = str(body.by, 60);
  const names = Object.fromEntries((await shopsOf(env, family.members)).map((s) => [s.merchant, s.name]));
  for (let attempt = 0; attempt < 5; attempt++) {
    await ensureDoc(env, merchant);
    const { doc, rev } = await readDoc(env, merchant);
    const again = doc.list.find((t) => t.ref === ref);
    if (again) return json({ ok: true, transfer: view(again, names, Date.now()) });
    const cat = await readCatalog(env, merchant);
    if (!cat) return bad('catalog-missing', 409);
    const now = Date.now();
    const id = 'trf_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const lines = [];
    let i = 0, first = '';
    for (const [vid, qty] of want) {
      const v = cat.data.variants.find((x) => x.id === vid);
      const p = v && cat.data.products.find((x) => x.id === v.productId);
      if (!v || !p) return bad('variant-unknown', 409, { issue: { vid } });
      if ((Number(v.stock) || 0) < qty) return bad('stock-insufficient', 409, { issue: { vid, needed: qty, onHand: Number(v.stock) || 0 } });
      const moveId = `trf-${id}-o${i++}`;
      first = first || moveId;
      cat.data.moves.push({ id: moveId, vid, d: -qty, at: Math.max(now, (Number(v.baseAt) || 0) + 1), why: 'transfert', ref: id });
      lines.push({ vid, pid: p.id, name: str(p.name, 80), size: str(v.size, 12), color: str(v.colorLabel || v.colorFamily || v.colorId, 40),
        qty, received: 0, missing: 0 });
    }
    compactForWrite(cat.data); materialize(cat.data);
    const transfer = { id, ref, from: merchant, to, at: now, by, status: 'en-route', lines,
      events: [{ at: now, kind: 'envoi', by }] };
    const next = { v: 1, list: trim([transfer].concat(doc.list)) };
    if (await commit(env, cat, merchant, merchant, rev, next, first)) return json({ ok: true, transfer: view(transfer, names, now) });
  }
  return bad('contention', 409);
}

async function receive(env, merchant, family, body) {
  const id = str(body.id, 64);
  const mode = str(body.mode, 12);
  if (!['all', 'partial', 'missing'].includes(mode)) return bad('bad-mode', 400);
  const given = mode === 'all' ? new Map() : lineInput(body.lines);
  if (!given || (mode !== 'all' && !given.size)) return bad('bad-lines', 400);
  const by = str(body.by, 60);
  const names = Object.fromEntries((await shopsOf(env, family.members)).map((s) => [s.merchant, s.name]));
  for (let attempt = 0; attempt < 5; attempt++) {
    let from = '', found = null, doc = null, rev = 0;
    for (const m of family.members) {
      if (m === merchant) continue;
      const d = await readDoc(env, m);
      const t = d.doc.list.find((x) => x.id === id && x.to === merchant);
      if (t) { from = m; found = t; doc = d.doc; rev = d.rev; break; }
    }
    if (!found) return bad('transfer-not-found', 404);
    if (found.closedAt) return bad('transfer-closed', 409, { transfer: view(found, names, Date.now()) });
    const left = (l) => Math.max(0, l.qty - (l.received || 0) - (l.missing || 0));
    for (const vid of given.keys()) {
      const l = found.lines.find((x) => x.vid === vid);
      if (!l || given.get(vid) > left(l)) return bad('more-than-en-route', 409, { issue: { vid, enRoute: l ? left(l) : 0 } });
    }
    const arrive = new Map(), missing = new Map();
    for (const l of found.lines) {
      const r = left(l);
      if (!r) continue;
      if (mode === 'all') arrive.set(l.vid, r);
      else if (mode === 'partial') { if (given.get(l.vid)) arrive.set(l.vid, given.get(l.vid)); }
      else { const m = given.get(l.vid) || 0; if (m) missing.set(l.vid, m); if (r - m) arrive.set(l.vid, r - m); }
    }
    const now = Date.now();
    let cat = null, first = '';
    if (arrive.size) {
      cat = await readCatalog(env, merchant);
      if (!cat) {
        await seedFromFamily(env, merchant, family, sanitize).catch(() => null);
        cat = await readCatalog(env, merchant);
        if (!cat) return bad('catalog-missing', 409);
      }
      /* Un article créé là-bas et pas encore arrivé ici : sa fiche vient avec les pièces. */
      if ([...arrive.keys()].some((vid) => !cat.data.variants.find((v) => v.id === vid))) {
        const src = await readCatalog(env, from);
        if (src) cat.data = materialize(sanitize(mergeDocs(cat.data, definitionsOf(src.data), now).doc));
      }
      const n = (found.events || []).length;
      let i = 0;
      for (const [vid, q] of arrive) {
        const v = cat.data.variants.find((x) => x.id === vid);
        if (!v) return bad('variant-unknown', 409, { issue: { vid } });
        const moveId = `trf-${id}-r${n}-${i++}`;
        first = first || moveId;
        cat.data.moves.push({ id: moveId, vid, d: q, at: Math.max(now, (Number(v.baseAt) || 0) + 1), why: 'transfert', ref: id });
      }
      compactForWrite(cat.data); materialize(cat.data);
    }
    const t = JSON.parse(JSON.stringify(found));
    for (const l of t.lines) {
      l.received = (l.received || 0) + (arrive.get(l.vid) || 0);
      l.missing = (l.missing || 0) + (missing.get(l.vid) || 0);
    }
    const open = t.lines.some((l) => left(l) > 0);
    const short = t.lines.some((l) => l.missing > 0);
    t.status = open ? 'partiel' : (short ? 'manque' : 'recu');
    if (!open) t.closedAt = now;
    t.events = (t.events || []).concat([{ at: now, kind: mode, by,
      lines: [...arrive].map(([vid, qty]) => ({ vid, qty })).concat([...missing].map(([vid, qty]) => ({ vid, qty, missing: true }))) }]);
    const next = { v: 1, list: trim(doc.list.map((x) => (x.id === id ? t : x))) };
    if (await commit(env, cat, merchant, from, rev, next, first)) return json({ ok: true, transfer: view(t, names, now) });
  }
  return bad('contention', 409);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) return json({ incoming: [], outgoing: [], shops: [] });
  const merchant = await tenantFor(request, env, new URL(request.url).searchParams.get('merchant'));
  if (!merchant) return bad('unauthorized', 401);
  const family = await catalogFamily(env, merchant);
  if (!family) return json({ merchant, incoming: [], outgoing: [], shops: [] });
  try {
    const shops = await shopsOf(env, family.members);
    const names = Object.fromEntries(shops.map((s) => [s.merchant, s.name]));
    const now = Date.now();
    const incoming = [], outgoing = [];
    for (const m of family.members) {
      const { doc } = await readDoc(env, m);
      for (const t of doc.list) {
        if (m === merchant && t.from === merchant) outgoing.push(view(t, names, now));
        else if (t.to === merchant) incoming.push(view(t, names, now));
      }
    }
    const byDate = (a, b) => b.at - a.at;
    return json({ merchant, incoming: incoming.sort(byDate).slice(0, 100), outgoing: outgoing.sort(byDate).slice(0, 100),
      self: shops.find((s) => s.merchant === merchant), shops: shops.filter((s) => s.merchant !== merchant) });
  } catch (_) { return json({ merchant, incoming: [], outgoing: [], shops: [], unavailable: true }); }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return bad('not-configured', 503);
  let body;
  try { body = await request.json(); } catch (_) { return bad('bad-json', 400); }
  const merchant = await tenantFor(request, env, body && body.merchant, { strict: true });
  if (!merchant) return bad('unauthorized', 401);
  if (body.merchant && String(body.merchant) !== merchant) return bad('forbidden', 403);
  const family = await catalogFamily(env, merchant);
  if (!family) return bad('not-in-family', 403);
  try {
    if (body.action === 'send') return await send(env, merchant, family, body);
    if (body.action === 'receive') return await receive(env, merchant, family, body);
  } catch (_) { return bad('unavailable', 503); }
  return bad('bad-action', 400);
}
