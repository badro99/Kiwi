// /api/stock/lookup — « et dans l'autre boutique, il en reste ? »
//
//   GET ?from=<slug>&code=<code-barres>   → le même article dans TOUS les magasins du compte
//   GET ?from=<slug>&q=<texte>            → idem, recherche par nom / référence
//
// Le problème, tel qu'un commerçant le vit : deux boutiques, une cliente qui
// veut du 40 alors qu'il ne reste que du 38. Aujourd'hui la réponse est un coup
// de téléphone au deuxième magasin, ou un déplacement. Les deux inventaires sont
// pourtant déjà dans D1 (table `catalogs`) sous le même compte — il ne manquait
// que la question.
//
// Pourquoi un endpoint et pas un GET /api/catalog par magasin depuis le
// navigateur : /api/catalog renvoie l'inventaire ENTIER (tous les codes-barres,
// les coûts d'achat, les articles non publiés) d'un magasin où l'employé qui
// scanne ne travaille pas. Ici la réponse est cadrée à ce que la question
// justifie — un nom d'article, une déclinaison, un nombre, un prix — et rien de
// plus. Un vendeur de Casa n'a pas à se retrouver avec le fichier de Marrakech
// dans son onglet parce qu'il a scanné une chemise.
//
// Tenancy : `ownedStores` (api/_private.js). La liste des établissements ne
// vient JAMAIS du client — elle est relue depuis le registre à chaque appel. Le
// navigateur, lui, garde cette liste dans localStorage (kiwiCustomVenues), donc
// la lui faire confiance reviendrait à laisser n'importe qui nommer le magasin
// qu'il veut lire.
//
// Toujours fail-soft : pas de D1, table absente, JSON illisible → une réponse
// 200 avec `stores: []`. Le scan doit rester instantané et local ; ceci n'est
// qu'un complément, jamais un préalable.

import { json } from '../../auth/_lib.js';
import { ownedStores } from '../_private.js';

const MAX_STORES = 12;    // au-delà, ce n'est plus un commerçant, c'est une chaîne
const MAX_HITS = 12;      // articles rapportés par magasin sur une recherche texte

/* ── Équivalence GTIN — le même calcul que assets/barcode.js · gtinKey ────────
 * Une étiquette UPC-A sort « 036000291452 » d'une douchette et « 0036000291452 »
 * de la suivante ; un EAN-8 arrive parfois complété à 13. Ces chaînes désignent
 * le même article. Sans ce repli, un code enregistré à Casa ne se retrouve pas à
 * Marrakech et le panneau affiche « aucun stock » alors qu'il y en a.
 *
 * Réservé aux codes dont la clé de contrôle est VALIDE : une référence interne
 * « 0012 » reste opaque et ne doit jamais être confondue avec « 12 ». */
function checkDigitOk(s) {
  // GS1 pondère 3/1 depuis la DROITE, ce qui vaut pour EAN-13, UPC-A et EAN-8.
  let sum = 0;
  for (let i = s.length - 2; i >= 0; i--) {
    const d = s.charCodeAt(i) - 48;
    sum += ((s.length - i) % 2 === 0) ? d * 3 : d;
  }
  return ((10 - (sum % 10)) % 10) === (s.charCodeAt(s.length - 1) - 48);
}
function gtinKey(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!/^\d+$/.test(s)) return null;
  if (s.length !== 13 && s.length !== 12 && s.length !== 8) return null;
  if (!checkDigitOk(s)) return null;
  return s.replace(/^0+/, '') || '0';   // le zéro de tête n'est pas une information
}

const normCode = (v) => String(v == null ? '' : v).trim().toUpperCase().slice(0, 48);
/* La référence commune, repliée pour comparaison — MÊME calcul que
 * assets/boutique-catalog.js · skuKey. Les deux doivent bouger ensemble : une
 * divergence ici ne casse rien visiblement, elle fait juste cesser de
 * rapprocher deux magasins, et personne ne remarque une absence. */
const skuKey = (v) => String(v == null ? '' : v)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 48);
const fold = (v) => String(v == null ? '' : v)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/* Le catalogue d'un magasin, ou null. Chaque magasin est isolé dans son propre
 * try : un document illisible en cache un seul, jamais toute la réponse. */
async function readCatalog(env, merchant) {
  try {
    const row = await env.DB.prepare('SELECT data FROM catalogs WHERE merchant = ?')
      .bind(merchant).first();
    if (!row || !row.data) return null;
    const db = JSON.parse(row.data);
    if (!db || !Array.isArray(db.products) || !Array.isArray(db.variants)) return null;
    return db;
  } catch (_) { return null; }
}

/* Ce qu'on rapporte d'une variante trouvée. Volontairement pauvre : le nom, la
 * déclinaison, le nombre, le prix de vente. Pas de coût d'achat (c'est la marge
 * du magasin), pas de codes-barres (c'est son fichier), pas d'identifiants
 * internes exploitables ailleurs. */
function hitOf(db, v, byProd) {
  const p = db.products.find((x) => x && x.id === v.productId);
  if (!p || p.archived) return null;
  const all = byProd[v.productId] || [];
  return {
    product: String(p.name || ''),
    color: String(v.colorLabel || v.colorId || ''),
    size: String(v.size || ''),
    stock: Math.max(0, v.stock | 0),
    price: +p.priceMAD || 0,
    // Le total toutes déclinaisons confondues : « 4 en M, 12 au total » évite un
    // second appel quand la taille demandée est justement celle qui manque.
    total: all.reduce((n, x) => n + Math.max(0, (x && x.stock) | 0), 0),
  };
}

function groupByProduct(db) {
  const by = {};
  for (const v of db.variants) {
    if (!v || !v.productId) continue;
    (by[v.productId] || (by[v.productId] = [])).push(v);
  }
  return by;
}

/* ── Un code peut-il servir à RAPPROCHER DEUX MAGASINS ? ─────────────────────
 * Non, s'il a été imprimé par le magasin lui-même.
 *
 * GS1 réserve les préfixes 02 et 20-29 à la « circulation restreinte dans
 * l'entreprise » : ces numéros ne sont attribués par personne, chaque commerce
 * les fabrique dans son coin. Kiwi imprime en 20 + un compteur qui vit dans le
 * localStorage DU TERMINAL et repart de zéro par magasin — la première étiquette
 * de Casa et la première étiquette de Rabat sont donc la même chaîne,
 * 2000000000015, pour deux articles qui n'ont rien à voir.
 *
 * Sans ce garde-fou, scanner un jean à Casa affichait le stock de la chemise que
 * Rabat avait étiquetée en premier. Un vrai code fabricant, lui, désigne le même
 * article partout : c'est celui-là qu'on croise. Pour le reste il y a la
 * référence commune, que le propriétaire pose lui-même.
 *
 * Le magasin d'où part la question garde le droit de chercher par code chez lui :
 * là, l'étiquette est la sienne et veut dire exactement ce qu'elle dit. */
function crossable(code) {
  const s = String(code == null ? '' : code).trim();
  if (!/^\d+$/.test(s)) return true;            // référence texte : pas un GTIN
  const g = s.length === 12 ? '0' + s : s;      // UPC-A se lit comme l'EAN-13 équivalent
  if (g.length !== 13) return true;             // EAN-8 : hors de la plage interne
  const p2 = g.slice(0, 2);
  return !(p2 === '02' || (p2 >= '20' && p2 <= '29'));
}

/* Recherche par RÉFÉRENCE COMMUNE. C'est le seul lien que le propriétaire a
 * posé lui-même entre deux fiches de deux catalogues séparés, donc le seul qui
 * survit à des étiquettes différentes de part et d'autre.
 * Comparaison repliée (casse, accents, tirets, espaces) : la référence est
 * saisie à la main dans chaque magasin, « JEAN 501 » et « jean-501 » sont la
 * même intention. */
function findBySku(db, sku) {
  if (!sku) return [];
  const byProd = groupByProduct(db);
  const out = [];
  for (const p of db.products) {
    if (!p || p.archived) continue;
    if (skuKey(p.sku) !== sku) continue;
    const all = byProd[p.id] || [];
    out.push({
      product: String(p.name || ''),
      color: '', size: '',
      stock: all.reduce((n, x) => n + Math.max(0, (x && x.stock) | 0), 0),
      price: +p.priceMAD || 0,
      total: all.reduce((n, x) => n + Math.max(0, (x && x.stock) | 0), 0),
      sizes: all.filter((x) => x && (x.stock | 0) > 0)
                .slice(0, 12)
                .map((x) => ({ size: String(x.size || ''), color: String(x.colorLabel || ''), stock: x.stock | 0 })),
    });
    if (out.length >= MAX_HITS) break;
  }
  return out;
}

/* Recherche par code-barres : exact d'abord (ce que l'employé a scanné, au
 * caractère près), équivalence GTIN ensuite. Toutes les variantes qui portent le
 * code sont rapportées — une même référence peut exister en plusieurs tailles. */
function findByCode(db, code, key) {
  const byProd = groupByProduct(db);
  const exact = [];
  const near = [];
  for (const v of db.variants) {
    if (!v || !Array.isArray(v.barcodes)) continue;
    for (const b of v.barcodes) {
      const c = normCode(b && b.code);
      if (!c) continue;
      if (c === code) { exact.push(v); break; }
      if (key && gtinKey(c) === key) { near.push(v); break; }
    }
  }
  const list = exact.length ? exact : near;
  return list.map((v) => hitOf(db, v, byProd)).filter(Boolean).slice(0, MAX_HITS);
}

/* Recherche texte : une ligne par PRODUIT (pas par variante), sinon une chemise
 * en 5 couleurs × 6 tailles noie le panneau sous 30 lignes identiques. */
function findByText(db, q) {
  const byProd = groupByProduct(db);
  const out = [];
  for (const p of db.products) {
    if (!p || p.archived) continue;
    const hay = fold(p.name) + ' ' + fold(p.art || '');
    if (hay.indexOf(q) < 0) continue;
    const all = byProd[p.id] || [];
    out.push({
      product: String(p.name || ''),
      color: '', size: '',
      stock: all.reduce((n, x) => n + Math.max(0, (x && x.stock) | 0), 0),
      price: +p.priceMAD || 0,
      total: all.reduce((n, x) => n + Math.max(0, (x && x.stock) | 0), 0),
      // Le détail par taille, pour que « il en reste 3 » dise LESQUELLES.
      sizes: all.filter((x) => x && (x.stock | 0) > 0)
                .slice(0, 12)
                .map((x) => ({ size: String(x.size || ''), color: String(x.colorLabel || ''), stock: x.stock | 0 })),
    });
    if (out.length >= MAX_HITS) break;
  }
  return out;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const from = (url.searchParams.get('from') || '').trim().toLowerCase().slice(0, 64);
  const code = normCode(url.searchParams.get('code'));
  const q = fold(url.searchParams.get('q')).slice(0, 48);
  const sku = skuKey(url.searchParams.get('sku'));

  if (!code && !sku && q.length < 2) return json({ error: 'code-or-query-required' }, 400);
  if (!env.DB) return json({ ok: true, code, stores: [], unconfigured: true });

  const owned = await ownedStores(request, env, from);
  // Rien de prouvé → 403, jamais une liste vide qui se lirait « vous n'avez
  // qu'un magasin » alors que la vraie réponse est « je ne sais pas qui vous êtes ».
  if (!owned.aid) return json({ error: 'forbidden' }, 403);

  const key = code ? gtinKey(code) : null;
  const stores = [];

  for (const s of owned.stores.slice(0, MAX_STORES)) {
    const db = await readCatalog(env, s.merchant);
    /* L'ordre est un ordre de CONFIANCE, pas de commodité.
     *  1. le code, quand il veut dire quelque chose au-delà de ce magasin ;
     *  2. la référence commune, posée à la main par le propriétaire ;
     *  3. le texte, qui n'est qu'un dernier recours et peut se tromper.
     * Un code interne (préfixe 20-29) ne cherche PAS par code : voir
     * crossable(). On tombe directement sur la référence. */
    const self = s.merchant === from;
    let hits = [];
    if (db) {
      if (code && (self || crossable(code))) hits = findByCode(db, code, key);
      if (!hits.length && sku) hits = findBySku(db, sku);
      if (!hits.length && !code && q.length >= 2) hits = findByText(db, q);
    }
    stores.push({
      merchant: s.merchant,
      name: s.name || s.merchant,
      self: s.merchant === from,
      // `known:false` = ce magasin n'a pas (encore) d'inventaire en base. Le dire
      // explicitement évite d'afficher « 0 en stock », qui est un mensonge : on
      // ne sait pas, ce n'est pas la même chose que zéro.
      known: !!db,
      hits,
    });
  }

  return json({ ok: true, code, q, stores });
}
