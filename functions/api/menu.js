// /api/menu — the customer self-order menu, published per merchant.
//
// Two halves, mirroring /api/config's trust model:
//
//   GET /api/menu?merchant=<slug>   — PUBLIC read. A customer who scanned a table
//     QR (kiwi-order.html?merchant=<slug>) has NO account and NO gate cookie, so
//     this path is allow-listed past the site gate (functions/_middleware.js).
//     It returns ONLY what a customer is meant to see — the display name, the
//     trade type, and the menu itself. It reads the `menus` table and NOTHING
//     else: never PINs, sales, or account data. Absent row / no DB ⇒ a neutral
//     200 { name:'', type:'', menu:null } so the client shows a clean
//     "menu coming soon" state instead of an error.
//
//   GET /api/menu?mine=1            — the MERCHANT reading its own carte back, to
//     rebuild it in a browser that has never seen it. Same row, but resolved from
//     the session instead of taken on the client's word, and it answers the raw
//     stored carte (an empty one included) plus the slug it resolved — the
//     dashboard has to be able to tell "no carte published" from "not reachable".
//     Without this the carte existed ONLY in the localStorage of the browser that
//     typed it: a phone, an iPad or a private window showed an empty menu, and
//     then published that emptiness back over the real one (see the POST guard).
//
//   POST /api/menu                  — the merchant's dashboard mirrors ITS OWN
//     menu up. The merchant is derived from the authenticated session, NEVER from
//     the body — a client can only ever publish its own slug (same rule as
//     /api/config POST). No session / no DB ⇒ neutral no-op (503) so static hosts
//     (GitHub Pages, local) are unaffected.

import { json, readSession, readCookie, SESS_COOKIE, slugMerchant } from '../auth/_lib.js';
import { storeSuspended, storeSubscriptionPending } from './_private.js';

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const OPTION_EMOJIS = new Set([
  '🍏', '🍎', '🍐', '🍊', '🍋', '🍋‍🟩', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈',
  '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🫒', '🥑', '🍆', '🥔', '🍠', '🥕',
  '🌽', '🌶️', '🫑', '🥒', '🥬', '🥦', '🧄', '🧅', '🥜', '🫘', '🌰', '🫛',
  '🫚', '🍄', '🌿', '🍀', '🌱', '🌾', '🍚', '🧂', '🧈', '🍯', '🥛', '🧀',
  '🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🥞', '🧇', '🥚', '🍳', '🍖', '🍗',
  '🥩', '🥓', '🐟', '🦐', '🦞', '🦀', '🦑', '🐙', '🦪', '🍤', '🍔', '🍟',
  '🍕', '🌭', '🥪', '🌮', '🌯', '🫔', '🥙', '🧆', '🥘', '🍲', '🫕', '🥣',
  '🥗', '🍿', '🥫', '🍝', '🍜', '🍛', '🍣', '🍱', '🥟', '🍙', '🍘', '🍥',
  '🥠', '🥮', '🍢', '🍡', '🥡',
  '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍩',
  '🍪', '🍼', '🥤', '🧋', '🧃', '🧉', '🫖', '🍵', '☕', '🍶', '🍺', '🍻',
  '🥂', '🍷', '🥃', '🍸', '🍹', '🍾', '🧊',
  '✅', '❌', '🚫', '⛔', '⚠️', '➕', '➖', '🔥', '♨️', '❄️', '💧', '⏱️',
  '🔪', '🥄', '🍴', '🥢', '🍽️', '📦', '🛍️', '🔔', '⭐', '❤️',
  '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚫', '⚪',
]);
const optionEmoji = (v) => {
  const value = str(v, 16).trim();
  return OPTION_EMOJIS.has(value) ? value : '';
};

// Media are stored as URLs (uploaded to R2 via /api/media), never as bytes. Only
// same-origin /api/media/ paths are kept: a published menu is rendered on a
// stranger's phone, so it must never be able to point that phone at an
// arbitrary external host.
function mediaUrl(v) {
  const s = str(v, 300);
  return s.indexOf('/api/media/') === 0 ? s : '';
}

// Les horaires d'ouverture, publiés AVEC la carte parce qu'ils voyagent au même
// endroit : le téléphone d'un client. Sans eux la page de commande ne peut pas
// dire « fermé, nous rouvrons demain à 12:00 » — elle prend la commande d'un
// restaurant fermé, et c'est le commerçant qui découvre le problème le matin.
//
// Même discipline que le reste du fichier : une forme, des bornes, et rien qui
// vienne du client sans être recopié champ par champ. Sept jours, deux services
// par jour, quelques exceptions — c'est tout ce qu'une page publique a besoin
// de savoir, et surtout PAS les dérogations internes (qui a ouvert hors
// horaires, quand et pourquoi ne regardent pas le public).
const HHMM = /^([01]\d|2[0-4]):([0-5]\d)$/;
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function sanitizePeriods(raw) {
  return (Array.isArray(raw) ? raw.slice(0, 2) : [])
    .map((p) => ({ from: str(p && p.from, 5), to: str(p && p.to, 5) }))
    .filter((p) => HHMM.test(p.from) && HHMM.test(p.to) && p.from !== p.to);
}
function sanitizeHours(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const week = {};
  let any = false;
  const src = raw.week && typeof raw.week === 'object' ? raw.week : {};
  for (const d of DAY_KEYS) {
    const periods = sanitizePeriods(src[d] && src[d].periods);
    const open = !!(src[d] && src[d].open) && periods.length > 0;
    if (open) any = true;
    week[d] = { open, periods };
  }
  if (!any) return null;                       // une semaine vide n'est pas un horaire
  const exceptions = (Array.isArray(raw.exceptions) ? raw.exceptions.slice(0, 40) : [])
    .map((e) => ({
      from: str(e && e.from, 10), to: str(e && e.to, 10),
      kind: (e && e.kind) === 'hours' ? 'hours' : 'closed',
      label: str(e && e.label, 60),
      periods: sanitizePeriods(e && e.periods),
    }))
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.from) && /^\d{4}-\d{2}-\d{2}$/.test(e.to)
      && (e.kind === 'closed' || e.periods.length));
  return { v: 1, week, exceptions };
}

function sanitizeFormula(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rawSlots = Array.isArray(raw.slots) ? raw.slots.slice(0, 10) : [];
  const slots = rawSlots.map((s, idx) => {
    if (!s || typeof s !== 'object') return null;
    const id = str(s.id, 40) || ('sl_' + (idx + 1));
    const label = str(s.label, 60);
    let min = Math.max(0, Math.min(10, Math.round(Number(s.min) || 0)));
    let max = Math.max(1, Math.min(10, Math.round(Number(s.max) || 1)));
    if (min > max) min = max;
    const rawChoices = Array.isArray(s.choices) ? s.choices.slice(0, 20) : [];
    const choices = rawChoices.map((c) => ({
      itemId: str(c && c.itemId, 40),
      extra: Math.max(0, Math.min(1e5, Number(c && c.extra) || 0)),
    })).filter((c) => c.itemId);
    return { id, label, min, max, choices };
  }).filter((s) => s && s.id);
  if (!slots.length) return null;
  return { slots };
}

// Keep the stored menu small and well-shaped. We trust the merchant (it's their
// own carte) but still bound sizes so a runaway client can't bloat the row.
function sanitizeMenu(raw) {
  const out = { cats: [], items: [], stations: [], kitchenId: '', opts: [] };
  if (!raw || typeof raw !== 'object') return out;
  // La cuisine — le poste qui reçoit tout ce qu'aucune catégorie n'envoie
  // ailleurs. Le nommer est LE réglage de routage du restaurant ; le laisser
  // tomber ici ferait retomber la caisse sur « le premier de la liste », et
  // l'ordre des onglets redeviendrait un routage déguisé.
  out.kitchenId = str(raw.kitchenId, 40);
  // Les postes de préparation, dans l'ordre voulu par le commerçant — c'est
  // l'ordre des onglets de l'écran cuisine. Un tri ou une déduplication qui le
  // bousculerait changerait ce que la cuisine voit sans qu'on l'ait demandé.
  const stations = Array.isArray(raw.stations) ? raw.stations.slice(0, 24) : [];
  out.stations = stations.map((s) => ({
    id: str(s && s.id, 40),
    name: str(s && s.name, 40),
    // #RRGGBB uniquement : cette valeur part dans un attribut style sur la
    // caisse ET sur la page client, donc rien qui ne soit pas une couleur.
    color: /^#[0-9a-fA-F]{6}$/.test(String((s && s.color) || '')) ? String(s.color) : '',
  })).filter((s) => s.id && s.name);
  // Les groupes d'options (« Type de lait », « Cuisson ») et leurs choix. C'est
  // le comptoir qui les pose au moment de la vente, donc les perdre ici ne se
  // verrait pas au tableau de bord — seulement au comptoir, où le produit
  // entrerait dans la note sans qu'on ait demandé quoi que ce soit.
  const opts = Array.isArray(raw.opts) ? raw.opts.slice(0, 40) : [];
  out.opts = opts.map((g) => ({
    id: str(g && g.id, 40),
    name: str(g && g.name, 60),
    // Deux règles seulement, et rien d'autre : un choix, ou plusieurs.
    kind: (g && g.kind) === 'many' ? 'many' : 'one',
    required: !!(g && g.required),
    choices: (Array.isArray(g && g.choices) ? g.choices.slice(0, 40) : []).map((c) => ({
      id: str(c && c.id, 40),
      name: str(c && c.name, 60),
      // Repère visuel facultatif pour le KDS. Additif : toutes les cartes
      // publiées avant cette clé continuent avec une chaîne vide.
      emoji: optionEmoji(c && c.emoji),
      price: Math.max(0, Math.min(1e6, Number(c && c.price) || 0)),
    })).filter((c) => c.id && c.name),
  })).filter((g) => g.id && g.name);
  const cats = Array.isArray(raw.cats) ? raw.cats.slice(0, 60) : [];
  out.cats = cats.map((c) => ({
    id: str(c && c.id, 40),
    name: str(c && c.name, 80),
    // Le poste de la catégorie : c'est ICI que vit le routage de la cuisine.
    // Vide = la cuisine. Le perdre au passage renverrait toute la carte au
    // même écran dès la prochaine relecture depuis un autre appareil.
    station: str(c && c.station, 40),
    sub: Array.isArray(c && c.sub) ? c.sub.slice(0, 40).map((s) => ({
      id: str(s && s.id, 40),
      name: str(s && s.name, 80),
    })) : [],
  })).filter((c) => c.id);
  const items = Array.isArray(raw.items) ? raw.items.slice(0, 1000) : [];
  out.items = items.map((it) => {
    const formula = sanitizeFormula(it && it.formula);
    const item = {
      id: str(it && it.id, 40),
      name: str(it && it.name, 120),
      price: Math.max(0, Math.min(1e7, Number(it && it.price) || 0)),
      catId: str(it && it.catId, 40) || null,
      subId: str(it && it.subId, 40) || null,
      desc: str(it && it.desc, 400),
      avail: !(it && it.avail === false),
      // Le poste de préparation (bar, cuisson, froid…). La caisse route le bon de
      // cuisine dessus ; sans ce champ dans la liste blanche il était retiré
      // silencieusement à la publication, et tous les plats d'un vrai restaurant
      // retombaient sur « cuisson ». Additif : les cartes publiées avant lui
      // renvoient une chaîne vide, et les deux pages client l'ignorent.
      station: str(it && it.station, 40),
      // Les groupes d'options portés par ce produit — des identifiants, pas des
      // copies : le libellé vit une seule fois, dans out.opts. Un groupe supprimé
      // laisse un identifiant orphelin, que la caisse écarte à la lecture.
      opts: (Array.isArray(it && it.opts) ? it.opts.slice(0, 12) : [])
        .map((x) => str(x, 40)).filter(Boolean),
      // OrderPro additions — a dish photo or a short vertical clip. Absent for
      // every menu published before they existed, and both pages fall back to
      // their icon tile, so this is purely additive.
      photo: mediaUrl(it && it.photo),
      video: mediaUrl(it && it.video),
    };
    if (formula) item.formula = formula;
    return item;
  }).filter((it) => it.id && it.name);
  if (raw.hours) { const h = sanitizeHours(raw.hours); if (h) out.hours = h; }
  return out;
}

// A boutique publishes stock, not a carte: products × colour × size, each with a
// count and its barcodes. Same trust model and the same bounding as sanitizeMenu.
// Shape mirrors assets/boutique-catalog.js so OrderPro's boutique vertical can
// answer the only two questions a shopper has — how much, and is my size left.
function sanitizeShop(raw) {
  const out = { categories: [], products: [], variants: [], colors: [] };
  if (!raw || typeof raw !== 'object') return out;
  out.categories = (Array.isArray(raw.categories) ? raw.categories.slice(0, 60) : [])
    .map((c) => ({ id: str(c && c.id, 40), name: str(c && c.name, 80) }))
    .filter((c) => c.id);
  out.products = (Array.isArray(raw.products) ? raw.products.slice(0, 1000) : [])
    .map((p) => ({
      id: str(p && p.id, 40),
      name: str(p && p.name, 120),
      categoryId: str(p && p.categoryId, 40) || null,
      priceMAD: Math.max(0, Math.min(1e7, Number(p && p.priceMAD) || 0)),
      photo: mediaUrl(p && p.photo),
      video: mediaUrl(p && p.video),
    }))
    .filter((p) => p.id && p.name);
  out.variants = (Array.isArray(raw.variants) ? raw.variants.slice(0, 6000) : [])
    .map((v) => ({
      id: str(v && v.id, 40),
      productId: str(v && v.productId, 40),
      colorId: str(v && v.colorId, 40),
      size: str(v && v.size, 12),
      stock: Math.max(0, Math.min(1e6, Number(v && v.stock) || 0)),
      barcodes: (Array.isArray(v && v.barcodes) ? v.barcodes.slice(0, 8) : [])
        .map((b) => str((b && b.code) != null ? b.code : b, 40)).filter(Boolean),
    }))
    .filter((v) => v.id && v.productId);
  out.colors = (Array.isArray(raw.colors) ? raw.colors.slice(0, 60) : [])
    .map((c) => ({ id: str(c && c.id, 40), label: str(c && c.label, 40), hex: str(c && c.hex, 9) }))
    .filter((c) => c.id);
  if (raw.hours) { const h = sanitizeHours(raw.hours); if (h) out.hours = h; }
  return out;
}

const isShop = (type) => String(type || '').toLowerCase() === 'boutique';

// Une carte vide n'est pas une carte : ni plat, ni catégorie. Sert au garde-fou
// du POST — refuser d'écraser une vraie carte par du vide.
const menuEmpty = (d) => !d || (!(d.items && d.items.length) && !(d.cats && d.cats.length));
const shopEmpty = (d) => !d || !(d.products && d.products.length);

/* Quel magasin de ce compte ? — même règle que /api/config, en PLUS STRICTE.
 *
 * Un login peut tenir plusieurs établissements, et le QR client imprime le slug
 * du MAGASIN (assets/order-qr.js), pas celui du compte : une boutique nommée
 * autrement que la raison sociale publiait donc sa carte dans une ligne que le
 * client ne lisait jamais. Le corps peut désormais nommer le magasin — mais on
 * ne le croit que si la base dit qu'il appartient déjà à ce compte.
 *
 * /api/config accepte en plus un slug SANS fiche (owner null), parce qu'il est
 * lui-même ce qui enregistre un magasin. Ici on refuse : cette ligne se lit
 * PUBLIQUEMENT par slug, et sur une base pas encore migrée storeOwner() répond
 * null pour tout — n'importe quel compte connecté pourrait publier une fausse
 * carte sous le slug d'un autre restaurant. En cas de doute on retombe sur le
 * slug du compte, c'est-à-dire exactement le comportement d'aujourd'hui. */
async function storeOwner(env, slug) {
  try {
    const row = await env.DB.prepare('SELECT account_id FROM merchant_config WHERE merchant = ?')
      .bind(slug).first();
    return row ? (row.account_id || '') : null;
  } catch (_) { return null; }
}
async function resolveMerchant(env, aid, accSlug, wanted, strict) {
  const w = str(wanted, 80).trim();
  if (!w || w === accSlug) return accSlug;
  if ((await storeOwner(env, w)) === aid) return w;
  /* En PUBLICATION, un slug que le registre ne reconnaît pas n'autorise pas à
   * écrire dans le magasin principal du compte : c'est comme ça que la ligne
   * `menus` de la boutique d'Amira s'est retrouvée à porter le nom de son café,
   * le jour où le café renommé s'est présenté sous un slug encore inconnu. En
   * lecture, le repli reste : montrer sa propre carte vaut mieux qu'une page
   * vide. */
  return strict ? '' : accSlug;
}

// Is the Order Pro add-on switched on for this merchant?
//
// NOTE this inverts the usual merchant_config rule. Everywhere else a MISSING
// key means the module is ON, because those modules are part of the interface a
// client already pays for. Order Pro is a paid add-on that turns a phone into an
// ordering terminal, so it is OFF unless an operator explicitly set it true.
// Absent row, missing key, bad JSON, DB error → false.
async function orderProEnabled(env, merchant) {
  try {
    const row = await env.DB.prepare(
      'SELECT features FROM merchant_config WHERE merchant = ?'
    ).bind(merchant).first();
    if (!row || !row.features) return false;
    return (JSON.parse(row.features) || {}).orderpro === true;
  } catch (_) { return false; }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  let merchant = (url.searchParams.get('merchant') || '').trim();

  /* ?mine=1 — le commerçant relit SA carte pour la reconstruire dans un
   * navigateur neuf. Le slug demandé n'est qu'une requête : il passe par la même
   * résolution que le POST, donc on relit toujours la ligne où l'on écrit. Sans
   * ce drapeau, rien ne change pour la page client (kiwi-order.html), qui n'a ni
   * session ni compte et continue de lire par slug public. */
  const mine = url.searchParams.get('mine') === '1';
  if (mine) {
    if (!env.DB || !env.AUTH_SECRET) return json({ merchant: '', menu: null, shop: null, unreachable: true });
    let sess = null;
    try { sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET); } catch (_) {}
    if (!sess || !sess.aid) return json({ error: 'unauthorized' }, 401);
    const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(sess.aid).first();
    if (!acc) return json({ error: 'unauthorized' }, 401);
    merchant = await resolveMerchant(env, sess.aid, slugMerchant(acc.business), merchant);

    let row = null;
    try {
      row = await env.DB.prepare('SELECT name, type, data, updated_ts FROM menus WHERE merchant = ?').bind(merchant).first();
    } catch (_) { return json({ merchant, menu: null, shop: null, unreachable: true }); }

    let parsed = null;
    try { parsed = row && row.data ? JSON.parse(row.data) : null; } catch (_) {}
    const type = (row && row.type) || '';
    // Ici on rend la carte TELLE QUELLE, vide comprise : le tableau de bord doit
    // distinguer « rien de publié » (il peut pousser) de « injoignable » (il ne
    // doit surtout pas pousser, il effacerait).
    return json({
      merchant,
      name: (row && row.name) || '',
      type,
      menu: parsed && !isShop(type) ? sanitizeMenu(parsed) : null,
      shop: parsed && isShop(type) ? sanitizeShop(parsed) : null,
      published: !!row,
      updatedTs: +(row && row.updated_ts) || 0,
    });
  }

  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!env.DB) return json({ name: '', type: '', menu: null }); // no backend → neutral

  let name = '';
  let type = '';
  let menu = null;
  let shop = null;
  try {
    const row = await env.DB.prepare(
      `SELECT name, type, data FROM menus WHERE merchant = ?`
    ).bind(merchant).first();
    if (row) {
      name = row.name || '';
      type = row.type || '';
      if (row.data) {
        try {
          const parsed = JSON.parse(row.data);
          // A boutique publishes stock instead of a carte. Both live in the same
          // row; `type` says which one to read back.
          if (isShop(type)) shop = sanitizeShop(parsed);
          else menu = sanitizeMenu(parsed);
        } catch (_) { menu = null; shop = null; }
      }
    }
  } catch (_) { /* table missing / db error → neutral (menu stays null) */ }

  // A published-but-empty menu is treated as "nothing to show yet" too.
  if (menu && !(menu.items && menu.items.length)) menu = null;
  if (shop && !(shop.products && shop.products.length)) shop = null;

  // `orderpro` is additive: kiwi-order.html (the QR page) ignores it and keeps
  // working for every merchant exactly as before. OrderPro.html — the NFC
  // white-label app — refuses to open unless it is true, and POST /api/order
  // enforces the same rule server-side.
  /* Établissement suspendu ⇒ la page publique s'éteint. Un QR sur une table ou
   * une puce NFC sur un comptoir continue d'exister dans le monde physique bien
   * après qu'un compte a cessé de payer ; laisser la carte se servir toute seule
   * ferait prendre des commandes que personne n'ira préparer. */
  if (await storeSuspended(env, merchant)) {
    return json({ name, type, menu: null, shop: null, orderpro: false, suspended: true });
  }

  const orderpro = await orderProEnabled(env, merchant);
  return json({ name, type, menu, shop, orderpro });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  const sess = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
  if (!sess || !sess.aid) return json({ error: 'unauthorized' }, 401);

  const acc = await env.DB.prepare('SELECT business FROM accounts WHERE id = ?').bind(sess.aid).first();
  if (!acc) return json({ error: 'unauthorized' }, 401);
  const accSlug = slugMerchant(acc.business);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  // Le corps peut nommer LEQUEL des établissements de ce compte publie — refusé
  // et rabattu sur le slug du compte si la base ne confirme pas la propriété.
  const merchant = await resolveMerchant(env, sess.aid, accSlug, body && body.merchant, true);
  if (!merchant) return json({ error: 'merchant-unknown' }, 404);
  if (await storeSubscriptionPending(env, merchant)) {
    return json({ error: 'subscription-required', merchant }, 402);
  }

  // The display name defaults to the account's own business; a client may send a
  // trimmed override but never another merchant's identity (slug is session-bound).
  const name = String((body && body.name) || acc.business || '').trim().slice(0, 80) || (acc.business || '');
  const type = String((body && body.type) || '').trim().slice(0, 24);

  // One row, two payload shapes — a restaurant publishes its carte, a boutique
  // publishes its stock. `type` decides which sanitizer runs, so a boutique's
  // products can never be flattened by the menu sanitizer (or vice-versa).
  const shop = isShop(type);
  const raw = (body && body.data) || {};

  // Shape guard. Two modules publish into this row (menu-catalog.js for a carte,
  // orderpro-publish.js for stock) and they run in the same page. If one of them
  // posts the WRONG shape for the declared type — a boutique labelled payload
  // carrying {cats,items} instead of {products} — the sanitizer would happily
  // reduce it to empty and wipe the store's real catalogue. That is a silent
  // data loss, so refuse it rather than write it. An honestly empty catalogue
  // still publishes: this only rejects a mismatch, never emptiness.
  const looksShop = Array.isArray(raw.products) || Array.isArray(raw.variants);
  const looksMenu = Array.isArray(raw.items) || Array.isArray(raw.cats);
  if (shop && !looksShop && looksMenu) return json({ error: 'shape-mismatch', expected: 'shop' }, 409);
  if (!shop && !looksMenu && looksShop) return json({ error: 'shape-mismatch', expected: 'menu' }, 409);

  const data = shop ? sanitizeShop(raw) : sanitizeMenu(raw);

  /* ═══ NE JAMAIS EFFACER UNE CARTE PUBLIÉE PAR DU VIDE ═══════════════════════
   * Le tableau de bord republie sa carte au démarrage. Tant que cette carte ne
   * vivait que dans le localStorage, ouvrir le tableau de bord dans un
   * navigateur neuf — un téléphone, un iPad, une fenêtre privée — envoyait ici
   * un { cats:[], items:[] } tout neuf, et cette ligne écrasait la vraie carte.
   * Le client qui scannait le QR de sa table tombait alors sur « bientôt
   * disponible » : la panne était invisible côté commerçant.
   *
   * Le garde-fou vit ICI, pas seulement dans le client, parce que le déploiement
   * n'est pas instantané : un onglet resté ouvert sur l'ancien build publierait
   * encore du vide demain matin.
   *
   * Vider sa carte reste évidemment permis — mais il faut le dire (allowEmpty),
   * et seul un client qui a d'abord RELU la carte du serveur l'affirme. */
  const wasEmpty = shop ? shopEmpty(data) : menuEmpty(data);
  if (wasEmpty) {
    let cur = null;
    let currentUpdatedTs = 0;
    try {
      const row = await env.DB.prepare('SELECT type, data, updated_ts FROM menus WHERE merchant = ?').bind(merchant).first();
      if (row && row.data) {
        currentUpdatedTs = +row.updated_ts || 0;
        const parsed = JSON.parse(row.data);
        cur = isShop(row.type) ? sanitizeShop(parsed) : sanitizeMenu(parsed);
        if (isShop(row.type) ? shopEmpty(cur) : menuEmpty(cur)) cur = null;
      }
    } catch (_) { cur = null; }   // pas de table / base absente → rien à protéger
    if (cur) {
      /* `allowEmpty:true` tout seul n'est pas une preuve : les anciennes
       * versions l'envoyaient automatiquement au démarrage. Pour effacer une
       * vraie carte, le navigateur doit nommer la révision exacte qu'il vient
       * de lire. Un onglet neuf, ancien ou en retard ne peut donc plus vider la
       * fiche du serveur. */
      const expected = +(body && body.expectedUpdatedTs) || 0;
      if (!(body && body.allowEmpty === true) || !expected || expected !== currentUpdatedTs) {
        return json({ error: 'refused-empty', merchant, data: cur, updatedTs: currentUpdatedTs }, 409);
      }
    }
  }

  const updatedTs = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO menus (merchant, name, type, data, updated_ts)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(merchant) DO UPDATE SET
         name = excluded.name, type = excluded.type,
         data = excluded.data, updated_ts = excluded.updated_ts`
    ).bind(merchant, name, type, JSON.stringify(data), updatedTs).run();
  } catch (_) { return json({ error: 'write-failed' }, 500); }

  return shop
    ? json({ ok: true, merchant, products: data.products.length, variants: data.variants.length, updatedTs })
    : json({ ok: true, merchant, items: data.items.length, cats: data.cats.length, updatedTs });
}
