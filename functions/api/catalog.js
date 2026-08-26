// /api/catalog — l'inventaire PRIVÉ d'une boutique, synchronisé entre appareils.
//
// Le catalogue (produits, déclinaisons couleur × taille, stock, codes-barres) ne
// vivait que dans le localStorage du navigateur qui l'avait saisi. Fenêtre
// privée fermée, deuxième appareil, cache vidé : l'inventaire n'existait plus.
// Les deux surfaces qui l'éditent — le tableau de bord et la caisse appairée —
// écrivent déjà sous LE MÊME slug de boutique ; il ne leur manquait qu'un
// endroit commun où le poser. C'est ce fichier.
//
// Modèle de confiance — l'inverse de /api/menu :
//
//   · /api/menu  GET est PUBLIC (le client qui scanne un QR n'a ni compte ni
//     cookie de porte). Il ne renvoie donc que ce qu'une boutique CHOISIT de
//     publier.
//   · /api/catalog GET n'est JAMAIS public. C'est l'inventaire de travail —
//     stock réel, tous les codes-barres, articles non publiés. Être passé par la
//     porte du site ne suffit pas : la porte admet TOUS les commerçants
//     connectés et un mot de passe équipe partagé, et les slugs se devinent
//     depuis un nom d'enseigne. Il faut prouver son identité sur ce magasin —
//     session du compte propriétaire, caisse appairée, ou opérateur.
//
// Concurrence : un seul document JSON par boutique, remplacé à chaque écriture.
// `rev` s'incrémente côté serveur. Le client renvoie la révision sur laquelle il
// s'est basé ; si le serveur a bougé entre-temps, l'écriture est REFUSÉE (409)
// avec la copie serveur, jamais écrasée — le client fusionne et réessaie. Sans
// ce garde-fou, un produit scanné à la caisse disparaissait dès que le tableau
// de bord enregistrait une seconde plus tard.
//
// Toujours « fail-soft » : pas de D1, pas de table (migration pas encore
// passée), erreur base — on renvoie un 200 neutre côté lecture et un 503 côté
// écriture. Le client garde alors sa copie locale et retentera : il ne doit
// jamais perdre de stock parce que le serveur tousse.

import { json } from '../auth/_lib.js';
// La règle de tenancy vivait ici. Elle vaut maintenant aussi pour /api/store et
// /api/clients, qui exposent les mêmes données privées ; elle a donc déménagé
// dans _private.js pour qu'il n'en existe qu'UNE. Trois copies dérivent : on en
// corrige une, les deux autres restent ouvertes.
import { tenantFor } from './_private.js';

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const num = (v, max) => Math.max(0, Math.min(max, Number(v) || 0));
const signed = (v, max) => Math.max(-max, Math.min(max, Number(v) || 0));
/* Un INSTANT en millisecondes. Pas `num(...) | 0` : l'opérateur binaire ramène à
 * un entier 32 bits, et un horodatage d'aujourd'hui (~1,78 × 10¹²) y déborde —
 * il ressortait donc en une date arbitraire. C'est ce qui arrivait déjà à
 * `createdAt`, en silence, depuis toujours. */
const ts = (v) => Math.max(0, Math.min(1e15, Math.round(Number(v) || 0)));

/* Bornage du document. On fait confiance au commerçant (c'est son propre stock)
 * mais un client qui déraille ne doit pas pouvoir gonfler la ligne. Toute forme
 * inattendue est ramenée à du vide plutôt que rejetée — sauf le garde-fou de
 * forme dans onRequestPost, qui refuse un document qui n'est pas un catalogue. */
function sanitize(raw) {
  const out = { v: 1, categories: [], products: [], variants: [], seq: 0, removed: {}, moves: [] };
  if (!raw || typeof raw !== 'object') return out;

  out.seq = num(raw.seq, 1e12) | 0;

  /* ── LES SUPPRESSIONS ──────────────────────────────────────────────────────
   * La carte des ids supprimés, avec l'instant. Elle doit traverser le serveur,
   * sinon l'appareil d'à côté ne peut PAS apprendre qu'un article a été
   * supprimé : il le renverrait, et la fusion le ferait réapparaître. C'est
   * exactement ce qui se passait — un article supprimé revenait à la
   * synchronisation suivante, indéfiniment.
   * Bornée à 20 000 entrées : au-delà, on garde les plus récentes, ce sont
   * celles que l'autre appareil n'a pas encore vues. */
  if (raw.removed && typeof raw.removed === 'object' && !Array.isArray(raw.removed)) {
    Object.keys(raw.removed)
      .map((id) => [str(id, 40), ts(raw.removed[id])])
      .filter(([id, t]) => id && t > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20000)
      .forEach(([id, t]) => { out.removed[id] = t; });
  }

  /* ── LE JOURNAL DES MOUVEMENTS ────────────────────────────────────────────
   * Une vente, un retour, une réception : chacun une écriture immuable avec un
   * id unique par appareil. C'est l'union de ces journaux qui fait que deux
   * ventes simultanées s'ADDITIONNENT au lieu de s'écraser — donc ils doivent
   * traverser le serveur, sinon chaque appareil ne connaît que ses propres
   * ventes et on retombe sur un arbitrage entre deux nombres absolus.
   * 12 000 mouvements, les plus RÉCENTS d'abord. This slice is a read-side
   * corruption guard only; POST refuses an oversized un-compacted journal rather
   * than pretending discarded sales were already folded into the base. */
  out.moves = (Array.isArray(raw.moves) ? raw.moves : [])
    .map((m) => {
      const row = {
        id: str(m && m.id, 64),
        vid: str(m && m.vid, 40),
        d: Math.max(-1e6, Math.min(1e6, Math.round(Number(m && m.d) || 0))),
        at: ts(m && m.at),
        why: str(m && m.why, 16),
      };
      if (m && m.actor) row.actor = str(m.actor, 64);
      if (m && m.ref) row.ref = str(m.ref, 64);
      return row;
    })
    .filter((m) => m.id && m.vid && m.d && m.at)
    .sort((a, b) => b.at - a.at)
    .slice(0, 12000);

  // Les champs sont énumérés un par un, et ils doivent refléter EXACTEMENT la
  // forme de assets/boutique-catalog.js. Un champ oublié ici ne provoque pas une
  // erreur : il disparaît silencieusement au premier aller-retour par le serveur.
  // `colorLabel`/`colorHex` (l'étiquette couleur affichée) et surtout le drapeau
  // `primary` d'un code-barres (celui qu'on imprime sur l'étiquette) en font
  // partie — les perdre casserait l'impression sans rien afficher d'anormal.
  out.categories = (Array.isArray(raw.categories) ? raw.categories.slice(0, 200) : [])
    .map((c) => ({
      id: str(c && c.id, 40),
      name: str(c && c.name, 80),
      color: str(c && c.color, 24),
      order: num(c && c.order, 1e4) | 0,
      metaAt: ts(c && c.metaAt),
    }))
    .filter((c) => c.id);

  out.products = (Array.isArray(raw.products) ? raw.products.slice(0, 5000) : [])
    .map((p) => ({
      id: str(p && p.id, 40),
      legacyId: str(p && p.legacyId, 40),
      name: str(p && p.name, 120),
      categoryId: str(p && p.categoryId, 40) || null,
      priceMAD: num(p && p.priceMAD, 1e7),
      cost: num(p && p.cost, 1e7),
      art: str(p && p.art, 40),
      kind: str(p && p.kind, 24),
      flag: str(p && p.flag, 60),
      grad: p && typeof p.grad === 'string' ? str(p.grad, 200) : null,
      marque: str(p && p.marque, 80),
      format: p && p.format === 'service' ? 'service' : 'piece',
      servicePieces: p && p.servicePieces != null ? Math.max(1, num(p.servicePieces, 1e5) | 0) : null,
      piecePriceMAD: p && p.piecePriceMAD != null ? num(p.piecePriceMAD, 1e7) : null,
      motif: str(p && p.motif, 80),
      fragile: !!(p && p.fragile),
      ownership: p && p.ownership === 'consignment' ? 'consignment' : 'outright',
      consignor: str(p && p.consignor, 120),
      sku: str(p && p.sku, 48),
      // Médias : des URLs (/api/media/…), jamais des octets.
      photo: str(p && p.photo, 300),
      video: str(p && p.video, 300),
      mediaAt: ts(p && p.mediaAt),
      createdAt: ts(p && p.createdAt),
      archived: !!(p && p.archived),
      metaAt: ts(p && p.metaAt),
    }))
    .filter((p) => p.id && p.name);

  out.variants = (Array.isArray(raw.variants) ? raw.variants.slice(0, 20000) : [])
    .map((v) => ({
      id: str(v && v.id, 40),
      productId: str(v && v.productId, 40),
      // La couleur tient en trois champs qu'il ne faut pas confondre :
      //  · colorId     — l'IDENTITÉ, brute, telle que créée ou importée. Deux
      //                  variantes arrivées en « navy » et « blue » gardent deux
      //                  identifiants, donc deux stocks et deux codes-barres.
      //  · colorFamily — ce que les écrans AFFICHENT (la famille générale).
      //  · colorSource — les mots d'origine, gardés quand ils diffèrent.
      // Oublier l'un d'eux ici ne lève aucune erreur : il disparaît au premier
      // aller-retour serveur, et un appareil retrouverait « Bleu nuit » quand
      // l'autre affiche « Bleu ».
      colorId: str(v && v.colorId, 40),
      colorFamily: str(v && v.colorFamily, 24),
      colorSource: str(v && v.colorSource, 40),
      colorSourceHex: str(v && v.colorSourceHex, 9),
      colorWas: str(v && v.colorWas, 40),
      colorLabel: str(v && v.colorLabel, 40),
      colorHex: str(v && v.colorHex, 9),
      size: str(v && v.size, 12),
      // `stock` est MATÉRIALISÉ : socle + mouvements postérieurs. On le transporte
      // parce que cent lecteurs s'en servent tel quel, mais ce n'est pas la
      // source de vérité — `base`/`baseAt` et le journal `moves` le sont.
      stock: num(v && v.stock, 1e6) | 0,
      // LE SOCLE : un comptage absolu (création, inventaire physique, saisie
      // directe) et son instant. Le plus récent des deux appareils gagne, parce
      // qu'un comptage à la main ne cède pas devant un chiffre de la veille.
      // A signed base preserves a temporary oversold deficit through compaction.
      // `stock` stays clamped at zero for every user-facing reader.
      base: Math.round(v && v.base != null ? signed(v.base, 1e6) : num(v && v.stock, 1e6)),
      baseAt: ts(v && v.baseAt),
      // Gardé le temps que tous les appareils passent au journal : un client qui
      // n'a pas encore rechargé envoie encore `stockAt`, et baseAtOf() sait le
      // lire. Le supprimer d'ici remettrait son stock à l'arbitrage d'avant.
      stockAt: ts(v && v.stockAt),
      sku: str(v && v.sku, 40),
      // Précision facultative : ce qui distingue deux variantes de même couleur.
      note: str(v && v.note, 60),
      metaAt: ts(v && v.metaAt),
      barcodeRemoved: (() => {
        const removed = {};
        if (v && v.barcodeRemoved && typeof v.barcodeRemoved === 'object' && !Array.isArray(v.barcodeRemoved)) {
          Object.keys(v.barcodeRemoved).slice(0, 24).forEach((code) => {
            const key = str(code, 40), at = ts(v.barcodeRemoved[code]);
            if (key && at) removed[key] = at;
          });
        }
        return removed;
      })(),
      // Un EAN-13 maison généré ici (`primary`, celui de l'étiquette) et les
      // codes de l'ancien système relevés à la douchette, gardés tels quels —
      // c'est ce qui fait qu'un ancien scan résout encore.
      barcodes: (Array.isArray(v && v.barcodes) ? v.barcodes.slice(0, 12) : [])
        .map((b) => (typeof b === 'string'
          ? { code: str(b, 40), type: 'imported', primary: false }
          : {
            code: str(b && b.code, 40),
            type: str(b && b.type, 16) || 'imported',
            sym: str(b && b.sym, 16),
            primary: !!(b && b.primary),
            at: ts(b && b.at),
          }))
        .filter((b) => b.code),
    }))
    .filter((v) => v.id && v.productId);

  return out;
}

function materialize(data) {
  const by = new Map();
  for (const v of data.variants || []) {
    by.set(v.id, { v, n: Number(v.base != null ? v.base : v.stock) || 0, at: Number(v.baseAt || v.stockAt) || 0 });
  }
  for (const m of data.moves || []) {
    const slot = m && by.get(m.vid);
    if (slot && Number(m.at) > slot.at) slot.n += Number(m.d) || 0;
  }
  for (const { v, n } of by.values()) v.stock = Math.max(0, Math.round(n));
  return data;
}

function compactForWrite(data) {
  const moves = Array.isArray(data.moves) ? data.moves.slice() : [];
  if (moves.length <= 11000) return data;
  const by = new Map((data.variants || []).map((v) => [v.id, v]));
  const foldable = moves.filter((m) => m && m.why !== 'reserve')
    .sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
  const foldIds = new Set(foldable.slice(0, Math.max(0, moves.length - 10000)).map((m) => m.id));
  const folded = new Map();
  for (const m of moves) {
    if (!foldIds.has(m.id)) continue;
    const v = by.get(m.vid);
    if (!v || Number(m.at || 0) <= Number(v.baseAt || v.stockAt || 0)) continue;
    const f = folded.get(v.id) || { d: 0, at: Number(v.baseAt || v.stockAt || 0) };
    f.d += Number(m.d) || 0; f.at = Math.max(f.at, Number(m.at) || 0); folded.set(v.id, f);
  }
  for (const [id, f] of folded) {
    const v = by.get(id); v.base = Number(v.base != null ? v.base : v.stock) + f.d; v.baseAt = f.at;
  }
  data.moves = moves.filter((m) => !foldIds.has(m.id));
  return materialize(data);
}

const stockColorMatch = (v, color) => String(v.colorId || '') === String(color || '')
  || String(v.colorFamily || '') === String(color || '');

function stockMutation(data, body, now) {
  compactForWrite(data);
  const action = str(body && body.stockAction, 16);
  const ref = str(body && body.ref, 64);
  if (!ref || !['reserve', 'confirm', 'release'].includes(action)) return { error: 'bad-stock-action', status: 400 };
  materialize(data);
  const own = (data.moves || []).filter((m) => m && m.ref === ref);
  const paid = own.some((m) => m.why === 'vente');
  const held = own.filter((m) => m.why === 'reserve');
  const released = own.some((m) => m.why === 'release');

  if (action === 'confirm') {
    if (paid) return { ok: true, data };
    if (released || !held.length) return { error: released ? 'reservation-released' : 'reservation-missing', status: 409 };
    held.forEach((m) => { m.why = 'vente'; });
    return { ok: true, data };
  }
  if (action === 'release') {
    if (paid) return { error: 'reservation-confirmed', status: 409 };
    if (released || !held.length) return { ok: true, data };
    let at = now;
    held.forEach((m) => {
      const v = (data.variants || []).find((x) => x.id === m.vid);
      at = Math.max(at + 1, Number(v && v.baseAt) + 1 || 0, Number(m.at) + 1 || 0);
      data.moves.push({ id: `rel-${String(m.id).slice(0, 60)}`, vid: m.vid, d: -m.d, at, why: 'release', ref });
    });
    materialize(data);
    return { ok: true, data };
  }

  if (paid || (held.length && !released)) return { ok: true, data };
  if (released) return { error: 'reservation-released', status: 409 };
  const lines = Array.isArray(body && body.lines) ? body.lines.slice(0, 40) : [];
  if (!lines.length) return { error: 'empty-stock-lines', status: 400 };
  const grouped = new Map();
  for (const raw of lines) {
    const pid = str(raw && raw.pid, 40), size = str(raw && raw.size, 12), color = str(raw && raw.color, 40);
    const qty = Math.max(0, Math.min(1e6, Math.round(Number(raw && raw.qty) || 0)));
    if (!pid || !size || !color || !qty) return { error: 'bad-stock-line', status: 400 };
    const key = JSON.stringify([pid, size, color]);
    const row = grouped.get(key) || { pid, size, color, qty: 0, price: Number(raw && raw.price) || 0 };
    row.qty += qty; grouped.set(key, row);
  }
  for (const row of grouped.values()) {
    const product = (data.products || []).find((p) => p.id === row.pid);
    if (!product || product.archived) {
      return { error: 'stock-insufficient', status: 409, issue: { pid: row.pid, size: row.size, color: row.color, needed: row.qty, onHand: 0 } };
    }
    if (Math.round(Number(product.priceMAD || 0) * 100) !== Math.round(Number(row.price || 0) * 100)) {
      return { error: 'catalog-stale', status: 409, issue: { pid: row.pid, price: product.priceMAD } };
    }
    const variants = (data.variants || []).filter((v) => v.productId === row.pid
      && String(v.size) === row.size && stockColorMatch(v, row.color));
    const available = variants.reduce((sum, v) => sum + Math.max(0, Number(v.stock) || 0), 0);
    if (available < row.qty) {
      return { error: 'stock-insufficient', status: 409, issue: { pid: row.pid, size: row.size, color: row.color, needed: row.qty, onHand: available } };
    }
  }
  let at = now, seq = 0;
  for (const row of grouped.values()) {
    let remaining = row.qty;
    const variants = (data.variants || []).filter((v) => v.productId === row.pid
      && String(v.size) === row.size && stockColorMatch(v, row.color))
      .sort((a, b) => (String(b.colorId) === row.color ? 1 : 0) - (String(a.colorId) === row.color ? 1 : 0));
    for (const v of variants) {
      if (!remaining) break;
      const qty = Math.min(remaining, Math.max(0, Number(v.stock) || 0));
      if (!qty) continue;
      at = Math.max(at + 1, Number(v.baseAt) + 1 || 0);
      data.moves.push({ id: `rsv-${ref.slice(0, 36)}-${seq++}`, vid: v.id, d: -qty, at, why: 'reserve', ref });
      v.stock = Math.max(0, Number(v.stock) - qty);
      remaining -= qty;
    }
  }
  materialize(data);
  return { ok: true, data };
}

async function applyStockAction(env, merchant, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    let row;
    try {
      row = await env.DB.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').bind(merchant).first();
    } catch (_) { return json({ error: 'unmigrated' }, 503); }
    if (!row || !row.data) return json({ error: 'catalog-missing' }, 409);
    let data;
    try { data = sanitize(JSON.parse(row.data)); } catch (_) { return json({ error: 'catalog-invalid' }, 409); }
    const changed = stockMutation(data, body, Date.now());
    if (!changed.ok) return json({ error: changed.error, issue: changed.issue || null, data, rev: Number(row.rev || 0) }, changed.status || 409);
    const next = Number(row.rev || 0) + 1;
    let write;
    try {
      write = await env.DB.prepare(
        'UPDATE catalogs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND rev = ?'
      ).bind(JSON.stringify(data), next, Date.now(), merchant, Number(row.rev || 0)).run();
    } catch (_) { return json({ error: 'write-failed' }, 500); }
    if (write && write.meta && Number(write.meta.changes) === 1) {
      return json({ ok: true, merchant, rev: next, data });
    }
  }
  return json({ error: 'stock-contention' }, 409);
}

/* Pure contract hooks. Cloudflare ignores this named export; the repository test
 * executes the exact sanitizer and reservation arithmetic instead of copying
 * their business rules into a fake implementation. */
export const __test = { sanitize, materialize, stockMutation, compactForWrite };

const empty = (d) => !d || !(d.products && d.products.length) && !(d.variants && d.variants.length);

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  // Pas de backend (hébergement statique, préview sans secrets) → neutre. Le
  // client garde son localStorage et continue de vendre.
  if (!env.DB) return json({ merchant: '', data: null, rev: 0 });

  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  try {
    const row = await env.DB.prepare(
      'SELECT data, rev, updated_ts FROM catalogs WHERE merchant = ?'
    ).bind(merchant).first();
    if (!row) return json({ merchant, data: null, rev: 0 });
    let data = null;
    try { data = sanitize(JSON.parse(row.data)); } catch (_) { data = null; }
    return json({ merchant, data, rev: row.rev || 0, updated_ts: row.updated_ts || 0 });
  } catch (_) {
    // Table absente (migration pas encore passée) → neutre, surtout pas une
    // erreur : le client doit continuer à fonctionner en local.
    return json({ merchant, data: null, rev: 0, unmigrated: true });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const merchant = await tenantFor(request, env, body && body.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  if (body && body.stockAction) return applyStockAction(env, merchant, body);

  const raw = (body && body.data) || null;

  // Garde-fou de forme. Un document qui ne ressemble pas à un catalogue passerait
  // le sanitizer en devenant vide — et écraserait silencieusement le stock réel.
  // C'est une perte de données muette : on refuse. Un catalogue honnêtement vide
  // (le commerçant a tout supprimé) porte quand même ses tableaux, donc il passe.
  if (!raw || typeof raw !== 'object'
      || !(Array.isArray(raw.products) || Array.isArray(raw.variants))) {
    return json({ error: 'shape-mismatch', expected: 'catalog' }, 409);
  }
  /* Never silently slice an un-compacted ledger. The browser folds entries into
   * the signed base before it crosses this limit; accepting and truncating an
   * oversized document would make a new till load stock without the discarded
   * sales. */
  if (Array.isArray(raw.moves) && raw.moves.length > 12000) {
    return json({ error: 'moves-uncompacted', max: 12000 }, 413);
  }

  const data = sanitize(raw);
  const baseRev = Math.max(0, Number(body && body.baseRev) || 0);
  const now = Date.now();

  let current = null;
  try {
    current = await env.DB.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?')
      .bind(merchant).first();
  } catch (_) {
    // Table absente : la migration n'est pas passée. 503 → le client garde tout
    // en local et retentera au prochain enregistrement.
    return json({ error: 'unmigrated' }, 503);
  }

  const serverRev = (current && current.rev) || 0;

  // Écriture basée sur une révision périmée : on ne l'applique PAS. On renvoie la
  // copie serveur pour que le client fusionne et repropose. Sans ça, deux
  // appareils qui vendent en même temps se recouvrent l'un l'autre.
  if (serverRev && baseRev !== serverRev) {
    let mine = null;
    try { mine = sanitize(JSON.parse(current.data)); } catch (_) { mine = null; }
    return json({ error: 'stale', rev: serverRev, data: mine }, 409);
  }

  // Un premier envoi VIDE ne doit pas effacer un catalogue déjà en ligne : c'est
  // la signature d'un navigateur neuf qui pousse avant d'avoir hydraté.
  if (serverRev && empty(data)) {
    let mine = null;
    try { mine = sanitize(JSON.parse(current.data)); } catch (_) { mine = null; }
    if (!empty(mine)) return json({ error: 'refused-empty', rev: serverRev, data: mine }, 409);
  }

  const rev = serverRev + 1;
  try {
    let write;
    if (serverRev) {
      /* The earlier SELECT is only a snapshot. The revision predicate on the
       * UPDATE is the actual compare-and-swap: two requests may both read N, but
       * only one is allowed to turn N into N+1. */
      write = await env.DB.prepare(
        `UPDATE catalogs SET data = ?, rev = ?, updated_ts = ?
          WHERE merchant = ? AND rev = ?`
      ).bind(JSON.stringify(data), rev, now, merchant, serverRev).run();
    } else {
      write = await env.DB.prepare(
        `INSERT OR IGNORE INTO catalogs (merchant, data, rev, updated_ts)
         VALUES (?, ?, ?, ?)`
      ).bind(merchant, JSON.stringify(data), rev, now).run();
    }
    if (!write || !write.meta || Number(write.meta.changes) !== 1) {
      const latest = await env.DB.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').bind(merchant).first();
      let mine = null;
      try { mine = latest && latest.data ? sanitize(JSON.parse(latest.data)) : null; } catch (_) {}
      return json({ error: 'stale', rev: Number(latest && latest.rev) || 0, data: mine }, 409);
    }
  } catch (_) { return json({ error: 'write-failed' }, 500); }

  return json({
    ok: true, merchant, rev, updated_ts: now,
    products: data.products.length, variants: data.variants.length,
  });
}
