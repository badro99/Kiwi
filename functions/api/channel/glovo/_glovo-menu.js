/* Glovo · la carte Kiwi chez Glovo.
 *
 *   buildGlovoMenu     carte Kiwi (table menus, sanitizeMenu) → modèle « Menu »
 *                      de Glovo. Les identifiants sont ceux du catalogue Kiwi :
 *                      un produit garde l'id du plat, un attribut devient
 *                      « <groupe>.<choix> », un groupe « grp.<groupe> ». Une
 *                      commande Glovo revient donc avec les ids de la caisse.
 *   pushGlovoMenu      valide (POST /paris/menu/validate), puis donne à Glovo
 *                      l'adresse où lire la carte (POST /webhook/stores/{id}/menu
 *                      { menuUrl }) ; Glovo la lit sur
 *                      /api/channel/glovo/menu-feed avec « Authorization:
 *                      Bearer <jeton> ». 5 envois par jour et par adresse
 *                      (règle Glovo), comptés ici avant d'appeler.
 *   verifyGlovoMenu    GET /webhook/stores/{id}/menu/{transaction} ; au succès,
 *                      ce que Glovo sait (prix, dispo) devient la référence
 *                      des mises à jour en lot.
 *   syncGlovoItems     mise à jour en lot (POST …/menu/updates) de ce qui a
 *                      changé depuis : un plat épuisé à la caisse, un prix
 *                      revu ; seuls les champs qui changent partent (jamais
 *                      null, jamais une liste vide : règle de Glovo), 10 000
 *                      éléments au plus par appel.
 *   verifyGlovoBulk    GET …/menu/updates/{transaction} ; un élément refusé
 *                      quitte la référence, il repartira au prochain lot.
 *
 * Prix : centimes dans Kiwi et dans glovo_menu_state, dirhams (2 décimales)
 * dans le corps envoyé à Glovo, comme le demande leur modèle. */
import { sanitizeMenu } from '../../menu.js';
import { glovoCall } from './_glovo-api.js';

export const MENU_UPLOADS_PER_DAY = 5;
const BULK_MAX = 10000;
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const clean = (v, n) => String(v == null ? '' : v).replace(EMOJI, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const toCents = (mad) => Math.round((Number(mad) || 0) * 100);
const toMad = (c) => Math.round(c) / 100;
export const attrId = (groupId, choiceId) => String(groupId) + '.' + String(choiceId);
export const groupId = (g) => 'grp.' + String(g);

export async function readKiwiMenu(env, merchant, now = Date.now()) {
  try {
    const row = await env.DB.prepare('SELECT type, data FROM menus WHERE merchant = ?').bind(String(merchant)).first();
    if (!row || !row.data) return null;
    if (String(row.type || '').toLowerCase() === 'boutique') return null;
    return sanitizeMenu(JSON.parse(row.data), now);
  } catch (_) { return null; }
}

function imageOf(photo, origin) {
  const p = String(photo || '');
  if (/^https:\/\//i.test(p)) return p.length <= 511 ? p : null;
  if (p.startsWith('/') && /^https:\/\//i.test(String(origin || ''))) {
    const u = String(origin).replace(/\/+$/, '') + p;
    return u.length <= 511 ? u : null;
  }
  return null;
}

/** @returns {{menu: object, skipped: Array<{id:string, name:string, why:string}>, state: Array<{kind:string,id:string,priceCents:number,available:boolean}>}} */
export function buildGlovoMenu(kiwi, opts = {}) {
  const origin = opts.origin || '';
  const skipped = [];
  const groups = new Map();
  for (const g of (kiwi && kiwi.opts) || []) if (g && g.id && Array.isArray(g.choices) && g.choices.length) groups.set(String(g.id), g);

  const attributes = [], attribute_groups = [], usedGroups = new Set();
  const products = [];
  const itemsOk = [];
  for (const it of (kiwi && kiwi.items) || []) {
    if (!it || !it.id || it.archived) continue;
    if (it.formulaOnly) { skipped.push({ id: it.id, name: it.name, why: 'formule seulement' }); continue; }
    const cents = toCents(it.price);
    if (!(cents > 0)) { skipped.push({ id: it.id, name: it.name, why: 'prix à 0' }); continue; }
    const name = clean(it.name, 255);
    if (!name) { skipped.push({ id: it.id, name: it.name, why: 'nom vide' }); continue; }
    const gs = (Array.isArray(it.opts) ? it.opts : []).map(String).filter((g) => groups.has(g));
    gs.forEach((g) => usedGroups.add(g));
    products.push({
      id: String(it.id), name, price: toMad(cents), image_url: imageOf(it.photo, origin),
      description: clean(it.desc, 2000) || null, attributes_groups: gs.map(groupId), available: it.avail !== false,
    });
    itemsOk.push(it);
  }
  for (const gid of usedGroups) {
    const g = groups.get(gid);
    const ids = [];
    for (const c of g.choices) {
      const n = clean(c.name, 255);
      if (!c.id || !n) continue;
      const id = attrId(g.id, c.id);
      ids.push(id);
      attributes.push({ id, name: n, price_impact: toMad(toCents(c.price)), selected_by_default: false, available: true });
    }
    if (!ids.length) continue;
    const many = g.kind === 'many';
    const min = Number.isInteger(g.min) ? g.min : (g.required ? 1 : 0);
    const max = many ? Math.max(1, min, Number.isInteger(g.max) ? g.max : ids.length) : 1;
    attribute_groups.push({ id: groupId(g.id), name: clean(g.name, 255) || 'Options', min: Math.min(min, max), max,
      collapse: false, multiple_selection: many, attributes: ids });
  }

  /* Une collection par catégorie, une section par sous-catégorie (ou une seule). */
  const collections = [];
  const cats = ((kiwi && kiwi.cats) || []).filter((c) => c && c.id);
  const byCat = new Map();
  for (const it of itemsOk) {
    const key = cats.some((c) => c.id === it.catId) ? it.catId : '';
    if (!byCat.has(key)) byCat.set(key, []);
    byCat.get(key).push(it);
  }
  let pos = 0;
  for (const c of [...cats, { id: '', name: 'Autres', sub: [] }]) {
    const list = byCat.get(c.id) || [];
    if (!list.length) continue;
    const subs = (c.sub || []).filter((s) => s && s.id);
    const sections = [];
    let sp = 0;
    for (const s of subs) {
      const ids = list.filter((it) => it.subId === s.id).map((it) => String(it.id));
      if (ids.length) sections.push({ name: clean(s.name, 255) || clean(c.name, 255) || 'Carte', position: sp++, products: ids });
    }
    const rest = list.filter((it) => !subs.some((s) => s.id === it.subId)).map((it) => String(it.id));
    if (rest.length) sections.push({ name: clean(c.name, 255) || 'Carte', position: sp++, products: rest });
    collections.push({ name: clean(c.name, 255) || 'Carte', position: pos++, sections });
  }

  const state = products.map((p) => ({ kind: 'product', id: p.id, priceCents: toCents(p.price), available: p.available }))
    .concat(attributes.map((a) => ({ kind: 'attribute', id: a.id, priceCents: toCents(a.price_impact), available: a.available })));
  return { menu: { attributes, attribute_groups, products, collections }, skipped, state };
}

/* ── Envoi de la carte entière ─────────────────────────────────────────────── */
async function storeRow(env, merchant, storeId) {
  try {
    return await env.DB.prepare(
      `SELECT store_id, status, menu_tx, menu_status, menu_day, menu_count, bulk_tx, bulk_status, bulk_ts FROM glovo_stores WHERE store_id = ? AND merchant = ?`
    ).bind(String(storeId || ''), String(merchant)).first();
  } catch (_) { return { migrationNeeded: true }; }
}

export function menuUrlFor(origin, storeId) {
  return String(origin).replace(/\/+$/, '') + '/api/channel/glovo/menu-feed?store=' + encodeURIComponent(storeId);
}

export async function pushGlovoMenu(env, merchant, storeId, origin, now = Date.now(), deps = {}) {
  const s = await storeRow(env, merchant, storeId);
  if (!s) return { ok: false, status: 404, error: 'unknown-store' };
  if (s.migrationNeeded) return { ok: false, status: 503, error: 'migration-needed' };
  if (!/^https:\/\//i.test(String(origin || ''))) return { ok: false, status: 400, error: 'https-origin-required' };
  const kiwi = await readKiwiMenu(env, merchant, now);
  if (!kiwi) return { ok: false, status: 409, error: 'menu-not-published' };
  const built = buildGlovoMenu(kiwi, { origin });
  if (!built.menu.products.length) return { ok: false, status: 409, error: 'menu-empty', skipped: built.skipped };
  const day = new Date(now).toISOString().slice(0, 10);
  const used = s.menu_day === day ? Number(s.menu_count) || 0 : 0;
  if (used >= MENU_UPLOADS_PER_DAY) return { ok: false, status: 429, error: 'daily-limit', used };

  /* Le validateur de Glovo d'abord : un menu refusé ne coûte pas un des 5 envois du jour. */
  const v = await glovoCall(env, s.store_id, { method: 'POST', path: '/paris/menu/validate', body: built.menu }, Object.assign({ now }, deps));
  if (v.ok && v.data && v.data.valid === false) {
    const errors = (Array.isArray(v.data.errors) ? v.data.errors : []).slice(0, 10).map((e) => clean(typeof e === 'string' ? e : JSON.stringify(e), 200));
    await env.DB.prepare('UPDATE glovo_stores SET menu_status = ?, menu_ts = ?, menu_detail = ? WHERE store_id = ?')
      .bind('INVALID', now, JSON.stringify({ errors }).slice(0, 2000), s.store_id).run();
    return { ok: false, status: 422, error: 'menu-invalid', errors, skipped: built.skipped };
  }
  const up = await glovoCall(env, s.store_id, { method: 'POST', path: '/webhook/stores/' + encodeURIComponent(s.store_id) + '/menu', body: { menuUrl: menuUrlFor(origin, s.store_id) } }, Object.assign({ now }, deps));
  if (!up.ok) {
    await env.DB.prepare('UPDATE glovo_stores SET menu_status = ?, menu_ts = ?, menu_detail = ? WHERE store_id = ?')
      .bind('refused', now, JSON.stringify({ error: up.error }).slice(0, 2000), s.store_id).run();
    return { ok: false, status: 502, error: up.error };
  }
  const tx = String((up.data && up.data.transaction_id) || '').slice(0, 80);
  await env.DB.prepare('UPDATE glovo_stores SET menu_tx = ?, menu_status = ?, menu_ts = ?, menu_detail = ?, menu_day = ?, menu_count = ? WHERE store_id = ?')
    .bind(tx, 'PROCESSING', now, JSON.stringify({ skipped: built.skipped.slice(0, 20) }).slice(0, 2000), day, used + 1, s.store_id).run();
  return { ok: true, transactionId: tx, products: built.menu.products.length, skipped: built.skipped, usedToday: used + 1 };
}

async function saveState(env, storeId, state, now) {
  const stmts = state.map((x) => env.DB.prepare(
    `INSERT INTO glovo_menu_state (store_id, kind, item_id, price_cents, available, updated_ts) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(store_id, kind, item_id) DO UPDATE SET price_cents = excluded.price_cents, available = excluded.available, updated_ts = excluded.updated_ts`
  ).bind(String(storeId), x.kind, x.id, x.priceCents, x.available ? 1 : 0, now));
  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
}

export async function verifyGlovoMenu(env, merchant, storeId, now = Date.now(), deps = {}) {
  const s = await storeRow(env, merchant, storeId);
  if (!s) return { ok: false, status: 404, error: 'unknown-store' };
  if (s.migrationNeeded) return { ok: false, status: 503, error: 'migration-needed' };
  if (!s.menu_tx) return { ok: true, status: s.menu_status || null };
  const r = await glovoCall(env, s.store_id, { method: 'GET', path: '/webhook/stores/' + encodeURIComponent(s.store_id) + '/menu/' + encodeURIComponent(s.menu_tx) }, Object.assign({ now }, deps));
  if (!r.ok) return { ok: false, status: 502, error: r.error };
  const status = String((r.data && r.data.status) || 'PROCESSING').slice(0, 40);
  const details = (Array.isArray(r.data && r.data.details) ? r.data.details : []).slice(0, 10).map((d) => clean(d, 200));
  await env.DB.prepare('UPDATE glovo_stores SET menu_status = ?, menu_ts = ?, menu_detail = ? WHERE store_id = ? AND menu_tx = ?')
    .bind(status, now, JSON.stringify({ details }).slice(0, 2000), s.store_id, s.menu_tx).run();
  if (status === 'SUCCESS') {
    /* Glovo a la carte entière : elle devient la référence des lots suivants. */
    const kiwi = await readKiwiMenu(env, merchant, now);
    if (kiwi) {
      await env.DB.prepare('DELETE FROM glovo_menu_state WHERE store_id = ?').bind(s.store_id).run();
      await saveState(env, s.store_id, buildGlovoMenu(kiwi).state, now);
    }
  }
  return { ok: true, status, details };
}

/* ── Mises à jour en lot (dispo, prix) ─────────────────────────────────────── */
export function diffState(current, known) {
  const prev = new Map(known.map((k) => [k.kind + ':' + k.id, k]));
  const products = [], attributes = [], changed = [];
  for (const x of current) {
    const k = prev.get(x.kind + ':' + x.id);
    if (!k) continue;                              // inconnu de Glovo : il faut renvoyer la carte entière
    const out = { id: x.id };
    if (Number(k.priceCents) !== x.priceCents) out[x.kind === 'product' ? 'price' : 'price_impact'] = toMad(x.priceCents);
    if (Number(k.available) === -1 || !!Number(k.available) !== x.available) out.available = x.available;
    if (Object.keys(out).length === 1) continue;
    (x.kind === 'product' ? products : attributes).push(out);
    changed.push(x);
  }
  const unknown = current.filter((x) => !prev.has(x.kind + ':' + x.id)).length;
  return { products, attributes, changed, unknown };
}

export async function syncGlovoItems(env, merchant, now = Date.now(), deps = {}) {
  if (!env || !env.GLOVO_TOKEN) return { ok: true, skipped: 'not-configured' };
  let stores;
  try {
    const rs = await env.DB.prepare("SELECT store_id FROM glovo_stores WHERE merchant = ? AND status = 'active' AND menu_status = 'SUCCESS'").bind(String(merchant)).all();
    stores = (rs && rs.results) || [];
  } catch (_) { return { ok: true, skipped: 'unmigrated' }; }
  if (!stores.length) return { ok: true, skipped: 'no-store-with-menu' };
  const kiwi = await readKiwiMenu(env, merchant, now);
  if (!kiwi) return { ok: true, skipped: 'no-menu' };
  const current = buildGlovoMenu(kiwi).state;
  const out = [];
  for (const { store_id: storeId } of stores) {
    const rs = await env.DB.prepare('SELECT kind, item_id AS id, price_cents AS priceCents, available FROM glovo_menu_state WHERE store_id = ?').bind(storeId).all();
    const d = diffState(current, (rs && rs.results) || []);
    if (!d.products.length && !d.attributes.length) { out.push({ storeId, sent: 0, unknown: d.unknown }); continue; }
    const body = {};
    if (d.products.length) body.products = d.products.slice(0, BULK_MAX);
    if (d.attributes.length) body.attributes = d.attributes.slice(0, Math.max(0, BULK_MAX - (body.products ? body.products.length : 0)));
    if (body.attributes && !body.attributes.length) delete body.attributes;
    const r = await glovoCall(env, storeId, { method: 'POST', path: '/webhook/stores/' + encodeURIComponent(storeId) + '/menu/updates', body }, Object.assign({ now }, deps));
    if (!r.ok) {
      await env.DB.prepare('UPDATE glovo_stores SET bulk_status = ?, bulk_ts = ?, bulk_detail = ? WHERE store_id = ?')
        .bind('refused', now, JSON.stringify({ error: r.error }).slice(0, 2000), storeId).run();
      out.push({ storeId, error: r.error });
      continue;
    }
    const tx = String((r.data && r.data.transaction_id) || '').slice(0, 80);
    const sentIds = new Set([...(body.products || []).map((p) => 'product:' + p.id), ...(body.attributes || []).map((a) => 'attribute:' + a.id)]);
    await saveState(env, storeId, d.changed.filter((x) => sentIds.has(x.kind + ':' + x.id)), now);
    await env.DB.prepare('UPDATE glovo_stores SET bulk_tx = ?, bulk_status = ?, bulk_ts = ?, bulk_detail = ? WHERE store_id = ?')
      .bind(tx, 'PROCESSING', now, JSON.stringify({ products: (body.products || []).length, attributes: (body.attributes || []).length }), storeId).run();
    out.push({ storeId, sent: sentIds.size, transactionId: tx, unknown: d.unknown });
  }
  return { ok: true, stores: out };
}

/* « Products not updated: [a, b] » → ['a', 'b'] (le format des details de Glovo). */
export function notUpdated(details) {
  const out = { product: [], attribute: [] };
  for (const line of Array.isArray(details) ? details : []) {
    const m = /^(Products|Attributes) not updated:\s*\[(.*)\]\s*$/i.exec(String(line));
    if (!m) continue;
    const ids = m[2].split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    out[/^product/i.test(m[1]) ? 'product' : 'attribute'].push(...ids);
  }
  return out;
}

export async function verifyGlovoBulk(env, merchant, storeId, now = Date.now(), deps = {}) {
  const s = await storeRow(env, merchant, storeId);
  if (!s) return { ok: false, status: 404, error: 'unknown-store' };
  if (s.migrationNeeded) return { ok: false, status: 503, error: 'migration-needed' };
  if (!s.bulk_tx) return { ok: true, status: s.bulk_status || null };
  const r = await glovoCall(env, s.store_id, { method: 'GET', path: '/webhook/stores/' + encodeURIComponent(s.store_id) + '/menu/updates/' + encodeURIComponent(s.bulk_tx) }, Object.assign({ now }, deps));
  if (!r.ok) return { ok: false, status: 502, error: r.error };
  const status = String((r.data && r.data.status) || 'PROCESSING').slice(0, 40);
  const details = (Array.isArray(r.data && r.data.details) ? r.data.details : []).slice(0, 10).map((d) => clean(d, 200));
  const failed = notUpdated(r.data && r.data.details);
  /* Un élément que Glovo n'a pas pris redevient « inconnu en prix et en dispo »
     (-1) : le prochain lot renverra ses deux champs. Un lot entier refusé
     marque ainsi tout ce qu'il portait (ses lignes datent de son envoi). */
  const stale = 'UPDATE glovo_menu_state SET price_cents = -1, available = -1 WHERE store_id = ?';
  const drop = [...failed.product.map((id) => ['product', id]), ...failed.attribute.map((id) => ['attribute', id])];
  if (status === 'NOT_PROCESSED' || status === 'GLOVO_ERROR') {
    await env.DB.prepare(stale + ' AND updated_ts >= ?').bind(s.store_id, Number(s.bulk_ts) || 0).run().catch(() => {});
  } else if (drop.length) {
    await env.DB.batch(drop.slice(0, 500).map(([k, id]) => env.DB.prepare(stale + ' AND kind = ? AND item_id = ?').bind(s.store_id, k, String(id).slice(0, 80))));
  }
  await env.DB.prepare('UPDATE glovo_stores SET bulk_status = ?, bulk_ts = ?, bulk_detail = ? WHERE store_id = ? AND bulk_tx = ?')
    .bind(status, now, JSON.stringify({ details }).slice(0, 2000), s.store_id, s.bulk_tx).run();
  return { ok: true, status, details };
}
