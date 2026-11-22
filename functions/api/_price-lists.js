// Les TARIFS d'un commerce : plusieurs prix pour un même article.
//
// Un grossiste (jomla) n'achète pas au prix du rayon, la boutique en ligne
// peut vendre plus cher que le comptoir, Glovo prend sa commission sur un prix
// à part. Un tarif est une liste de prix nommée, liée à des canaux (caisse,
// en ligne, factures, livraison) ; un client peut en avoir un par défaut.
//
// Trois règles tiennent tout le reste :
//   · le tarif PRINCIPAL n'existe pas en double : c'est le prix du catalogue
//     (catalogs › products[].priceMAD). Son id est réservé : 'main' ;
//   · un article sans prix dans un tarif RETOMBE sur le prix principal. Un
//     tarif neuf, vide, vend donc exactement comme avant ;
//   · tout se résout côté serveur, dans le magasin résolu par la session ou la
//     caisse appairée, jamais d'après un identifiant de commerçant du corps.
//
// Les montants sont des centimes entiers ; le catalogue parle en MAD, la
// conversion se fait une fois, ici (Math.round(MAD × 100)).

import { __test as catalogFns } from './catalog.js';
import { loadParts } from './_catalog-parts.js';
import { catalogFamily } from './_catalog-family.js';

export const MAIN_ID = 'main';
export const CHANNELS = ['till', 'online', 'invoices', 'delivery'];
export const STEPS = [0, 10, 50, 100, 500, 1000];        // centimes : 0,10 · 0,50 · 1 · 5 · 10 MAD
export const MAX_PRICE_CENTS = 1000000000;                // 10 000 000 MAD, la borne du catalogue
export const MAX_ROWS = 5000;                             // une écriture en masse
export const MAX_LISTS = 40;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KEY_RE = /^[^\u0000-\u001f]{1,80}$/;

export const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
export const isId = (v) => typeof v === 'string' && ID_RE.test(v);
export const isKey = (v) => typeof v === 'string' && KEY_RE.test(v);
const parse = (text, fallback) => { try { const v = JSON.parse(text); return v == null ? fallback : v; } catch (_) { return fallback; } };

export function cleanChannels(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return CHANNELS.filter((c) => list.includes(c));
}
export function cleanSites(raw, selfSlug) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const s of list) {
    const slug = String(s || '').toLowerCase().slice(0, 64);
    if (/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug) && slug !== selfSlug && !out.includes(slug)) out.push(slug);
    if (out.length >= 20) break;
  }
  return out;
}

/* ── L'ARITHMÉTIQUE ────────────────────────────────────────────────────────
 * Un tarif dérivé du principal : ± un pourcentage, arrondi au pas le plus
 * proche (0,50 · 1 · 5 MAD). Tout en centimes entiers ; le pourcentage garde
 * deux décimales. Jamais négatif, jamais au-delà de la borne du catalogue.
 * Un article payant ne devient JAMAIS gratuit par arrondi : quand le pas
 * ramènerait le prix à 0 (un article à 0,40 MAD arrondi au dirham), le prix
 * calculé garde ses centimes, et au moins un centime. Seul le patron rend un
 * article gratuit, explicitement (`free`). */
export function roundToStep(cents, step) {
  const c = Math.max(0, Math.round(Number(cents) || 0));
  const s = Math.round(Number(step) || 0);
  if (!(s > 0)) return Math.min(MAX_PRICE_CENTS, c);
  return Math.min(MAX_PRICE_CENTS, Math.round(c / s) * s);
}
export function derivePrice(mainCents, pct, step) {
  const p = Math.round((Number(pct) || 0) * 100);          // centièmes de pour cent
  const main = Math.max(0, Math.round(Number(mainCents) || 0));
  const raw = Math.round(main * (10000 + p) / 10000);
  if (!(main > 0)) return 0;
  const floor = Math.min(MAX_PRICE_CENTS, Math.max(1, raw));
  const rounded = roundToStep(floor, step);
  return rounded > 0 ? rounded : floor;
}
export function cleanPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < -90 || n > 500) return null;
  return Math.round(n * 100) / 100;
}
export function cleanStep(v) {
  const n = Math.round(Number(v) || 0);
  return STEPS.includes(n) ? n : null;
}
export function cleanPrice(v) {
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_PRICE_CENTS) return undefined;
  return n;
}
/* Un nom de tarif principal par défaut, que l'écran traduit (FR/EN/AR). */
export const MAIN_DEFAULT_NAME = 'Prix principal';

/* ── LE CATALOGUE : le prix principal ─────────────────────────────────────── */
export async function readCatalogDoc(env, merchant) {
  const row = await loadParts(env.DB, merchant, await env.DB.prepare('SELECT data FROM catalogs WHERE merchant = ?').bind(merchant).first());
  if (!row || !row.data) return null;
  const data = catalogFns.sanitize(JSON.parse(row.data));
  catalogFns.materialize(data);
  return data;
}
/* Map item_key → { cents, name }. Les articles archivés restent lisibles : une
 * facture ou un retour peut encore les citer. */
export async function mainPrices(env, merchant, catalog) {
  const doc = catalog || await readCatalogDoc(env, merchant).catch(() => null);
  const out = new Map();
  for (const p of (doc && doc.products) || []) {
    if (!p || !p.id) continue;
    const cost = Number(p.cost);
    const entry = { cents: Math.round((Number(p.priceMAD) || 0) * 100), name: p.name || '', archived: !!p.archived, categoryId: p.categoryId || null,
      costCents: cost > 0 ? Math.round(cost * 100) : null };
    out.set(p.id, entry);
    if (p.legacyId && !out.has(p.legacyId)) out.set(p.legacyId, entry);
  }
  return out;
}

/* ── LES TARIFS ───────────────────────────────────────────────────────────── */
function shapeList(row, viewer) {
  const owner = String(row.merchant || viewer);
  return {
    id: String(row.id), name: String(row.name || ''), isMain: Number(row.is_main) === 1,
    channels: cleanChannels(parse(row.channels, [])), sites: Array.isArray(parse(row.sites, [])) ? parse(row.sites, []) : [],
    archived: Number(row.archived) === 1,
    sort: Number(row.sort) || 0, createdTs: Number(row.created_ts) || 0, updatedTs: Number(row.updated_ts) || 0,
    owner, shared: owner !== viewer,
  };
}
export function virtualMain(row) {
  return {
    id: MAIN_ID, name: row && row.name ? String(row.name) : MAIN_DEFAULT_NAME, isMain: true, defaultName: !(row && row.name),
    channels: CHANNELS.slice(), sites: [], archived: false, sort: -1,
    createdTs: 0, updatedTs: row ? Number(row.updated_ts) || 0 : 0, owner: row ? String(row.merchant) : '', shared: false,
  };
}

/* Les tarifs que VOIT un magasin : les siens, plus ceux d'une boutique soeur
 * (même famille de catalogue, donc mêmes articles) qui le nomme dans `sites`.
 * Le principal d'abord, toujours présent, même sans ligne en base. */
export async function visibleLists(env, merchant, opts) {
  const withArchived = !!(opts && opts.archived);
  let rows = [];
  try {
    rows = ((await env.DB.prepare('SELECT * FROM price_lists WHERE merchant = ? ORDER BY sort, created_ts').bind(merchant).all()).results) || [];
  } catch (_) { rows = []; }
  let mainRow = null;
  const own = [];
  for (const r of rows) { if (Number(r.is_main) === 1) mainRow = r; else own.push(shapeList(r, merchant)); }
  const shared = [];
  try {
    const fam = await catalogFamily(env, merchant);
    for (const sister of (fam && fam.members) || []) {
      if (sister === merchant) continue;
      const rs = ((await env.DB.prepare('SELECT * FROM price_lists WHERE merchant = ? AND is_main = 0 AND archived = 0').bind(sister).all()).results) || [];
      for (const r of rs) if (parse(r.sites, []).includes(merchant)) shared.push(shapeList(r, merchant));
    }
  } catch (_) { /* pas de famille : rien de partagé */ }
  const lists = [virtualMain(mainRow ? { ...mainRow } : null), ...own, ...shared];
  if (lists[0].owner === '') lists[0].owner = merchant;
  return withArchived ? lists : lists.filter((l) => !l.archived);
}
export async function findList(env, merchant, id, opts) {
  if (!isId(id)) return null;
  const lists = await visibleLists(env, merchant, opts);
  return lists.find((l) => l.id === id) || null;
}

/* Les prix d'un tarif : Map `item|` → centimes (un prix par article, comme le
 * catalogue ; aucune ligne de déclinaison n'est lue). Un prix à 0 n'existe que
 * posé exprès (`free`) : sinon il est ignoré et l'article retombe sur le
 * principal. `out.free` liste les articles offerts exprès. */
export async function listPrices(env, list) {
  const out = new Map();
  out.free = new Set();
  if (!list || list.isMain) return out;
  const rs = ((await env.DB.prepare("SELECT item_key, price_cents, free FROM item_prices WHERE merchant = ? AND list_id = ? AND variant_key = ''")
    .bind(list.owner, list.id).all()).results) || [];
  for (const r of rs) {
    const cents = Number(r.price_cents);
    if (!(cents > 0) && Number(r.free) !== 1) continue;
    out.set(r.item_key + '|', cents);
    if (!(cents > 0)) out.free.add(r.item_key);
  }
  return out;
}

export async function clientDefault(env, merchant, clientId) {
  const id = typeof clientId === 'string' ? clientId.trim().slice(0, 64) : '';
  if (!id) return null;
  try {
    const row = await env.DB.prepare('SELECT list_id FROM price_list_clients WHERE merchant = ? AND client_id = ?').bind(merchant, id).first();
    return row ? String(row.list_id) : null;
  } catch (_) { return null; }
}

/* Quel tarif s'applique : celui qu'on nomme (s'il est visible et actif), sinon
 * celui de la fiche client, sinon le tarif lié au canal, sinon le principal.
 * `why` dit lequel a gagné, pour l'écran et pour l'audit. */
export async function pickList(env, merchant, want) {
  const w = want || {};
  const lists = await visibleLists(env, merchant);
  const main = lists[0];
  if (w.listId != null && w.listId !== '') {
    const hit = lists.find((l) => l.id === w.listId);
    return hit ? { list: hit, why: hit.isMain ? 'main' : 'asked' } : { list: null, why: 'unknown-list' };
  }
  const fromClient = await clientDefault(env, merchant, w.clientId);
  if (fromClient) {
    const hit = lists.find((l) => l.id === fromClient);
    if (hit) return { list: hit, why: 'client-default' };
  }
  if (w.channel && CHANNELS.includes(w.channel)) {
    const hit = lists.find((l) => !l.isMain && l.channels.includes(w.channel));
    if (hit) return { list: hit, why: 'channel' };
  }
  return { list: main, why: 'main' };
}

/* Le prix d'une ligne : (article) → principal. Une déclinaison (taille,
 * couleur) a le prix de son article, au comptoir comme au catalogue. */
export function priceOf(main, prices, itemKey) {
  const base = main.get(itemKey);
  const mainCents = base ? base.cents : null;
  const i = prices.get(itemKey + '|');
  if (i != null) return { cents: i, mainCents, source: 'list' };
  return { cents: mainCents, mainCents, source: mainCents == null ? 'unknown' : 'main' };
}

/* Un panier entier, côté serveur. Une ligne inconnue du catalogue n'est pas
 * devinée : elle revient `unknown`, sans prix, et le total la laisse de côté. */
export async function resolveCart(env, merchant, want, items) {
  const pick = await pickList(env, merchant, want);
  if (!pick.list) return { error: 'unknown-list' };
  const main = await mainPrices(env, merchant);
  const prices = await listPrices(env, pick.list);
  let totalCents = 0;
  const lines = (Array.isArray(items) ? items : []).slice(0, 500).map((it) => {
    const itemKey = str(it && it.itemKey, 80), variantKey = str(it && it.variantKey, 80);
    const qty = Math.max(0, Math.min(1e6, Number(it && it.qty) || 1));
    const p = priceOf(main, prices, itemKey);
    const line = { itemKey, variantKey, qty, unitCents: p.cents, mainCents: p.mainCents, source: p.source };
    if (p.cents != null) { line.totalCents = Math.round(p.cents * qty); totalCents += line.totalCents; }
    return line;
  });
  return { list: { id: pick.list.id, name: pick.list.name, isMain: pick.list.isMain }, why: pick.why, lines, totalCents };
}

/* ── LE CANAL EN LIGNE ─────────────────────────────────────────────────────
 * La boutique en ligne lit le catalogue via shop/_lib.js › readCatalog. Un
 * tarif lié au canal `online` y remplace le prix. Le document est modifié en
 * place, avant que la page ET le contrôle des commandes ne le lisent : les
 * deux voient le même prix. (Pas de prix barré : la vitrine, projet
 * kiwi-storefronts, n'en affiche pas ; un champ que personne ne montre
 * n'est pas servi.) */
export async function applyOnlinePrices(env, merchant, catalog) {
  if (!catalog || !Array.isArray(catalog.products)) return catalog;
  let pick;
  try { pick = await pickList(env, merchant, { channel: 'online' }); } catch (_) { return catalog; }
  if (!pick || !pick.list || pick.list.isMain) return catalog;
  const prices = await listPrices(env, pick.list).catch(() => new Map());
  for (const p of catalog.products) {
    if (!p || !p.id) continue;
    const own = prices.get(p.id + '|');
    if (own != null) p.priceMAD = own / 100;   // 0 seulement offert exprès (listPrices)
  }
  catalog.priceList = { id: pick.list.id, name: pick.list.name };
  return catalog;
}

/* ── QUI GÈRE LES TARIFS ───────────────────────────────────────────────────
 * Décider d'un prix, c'est décider de la marge : le patron, ou l'appareil du
 * patron déverrouillé par un gérant, ou un opérateur Kiwi nommé. Jamais une
 * caisse appairée ni un employé. La lecture, elle, suit tenantFor (la caisse
 * en a besoin pour vendre). */
/* Les tables de 0030 sont-elles là ? Avant que le patron n'applique la
 * migration, une écriture répond « pending-migration » (503) au lieu d'une
 * erreur 500 : l'écran Tarifs le dit en clair. */
export async function tablesReady(env) {
  try { await env.DB.prepare('SELECT 1 FROM item_prices LIMIT 1').bind().first(); await env.DB.prepare('SELECT 1 FROM price_lists LIMIT 1').bind().first(); return true; }
  catch (_) { return false; }
}

export async function canManage(request, env, merchant, deps) {
  const { isOperator, sessionTierAtLeast, ownerMerchant } = deps;
  try { if (await isOperator(request, env)) return true; } catch (_) { /* pas opérateur */ }
  try { if (!(await sessionTierAtLeast(request, env, 'manager'))) return false; } catch (_) { return false; }
  try { return (await ownerMerchant(request, env, merchant, { strict: true })) === merchant; } catch (_) { return false; }
}

export function newListId() {
  return 'pl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

/* D1 batch par paquets : une écriture de 5 000 prix ne passe pas en une fois. */
export async function runBatches(db, statements, size) {
  const n = size || 90;
  for (let i = 0; i < statements.length; i += n) {
    const chunk = statements.slice(i, i + n);
    if (db.batch) await db.batch(chunk);
    else for (const s of chunk) await s.run();
  }
}

/* ── LES FACTURES ET DEVIS ─────────────────────────────────────────────────
 * Le tarif d'un document : `priceListId` du corps s'il est donné (null ou
 * 'main' = principal), sinon, à la CRÉATION seulement, le tarif par défaut de
 * la fiche client (`customer.clientId`), sinon ce que le document avait déjà.
 * Un tarif inconnu du magasin est refusé, jamais deviné. `fail` est celui de
 * invoices/_shared.js (lève une erreur que la route sait rendre). */
export async function invoicePriceList(env, merchant, body, base, customer, fail) {
  const had = base && base.price_list_id ? String(base.price_list_id) : null;
  if (body && body.priceListId !== undefined) {
    const id = body.priceListId == null || body.priceListId === '' ? MAIN_ID : str(body.priceListId, 64);
    if (id === MAIN_ID) return null;
    let list;
    try { list = await findList(env, merchant, id); }
    catch (_) { return null; }   // tables des tarifs absentes (base à 0027) : la facture s'enregistre sans tarif
    if (!list) throw fail(400, 'unknown-price-list', 'Tarif inconnu.');
    return list.id;
  }
  if (base && base.id) return had;
  const fromClient = await clientDefault(env, merchant, customer && customer.clientId).catch(() => null);
  if (!fromClient) return null;
  const list = await findList(env, merchant, fromClient).catch(() => null);
  return list ? list.id : null;
}
