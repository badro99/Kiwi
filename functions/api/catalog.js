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

/* Bornage du document. On fait confiance au commerçant (c'est son propre stock)
 * mais un client qui déraille ne doit pas pouvoir gonfler la ligne. Toute forme
 * inattendue est ramenée à du vide plutôt que rejetée — sauf le garde-fou de
 * forme dans onRequestPost, qui refuse un document qui n'est pas un catalogue. */
function sanitize(raw) {
  const out = { v: 1, categories: [], products: [], variants: [], seq: 0 };
  if (!raw || typeof raw !== 'object') return out;

  out.seq = num(raw.seq, 1e12) | 0;

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
      // Médias : des URLs (/api/media/…), jamais des octets.
      photo: str(p && p.photo, 300),
      video: str(p && p.video, 300),
      createdAt: num(p && p.createdAt, 1e15) | 0 || 0,
      archived: !!(p && p.archived),
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
      stock: num(v && v.stock, 1e6) | 0,
      sku: str(v && v.sku, 40),
      // Précision facultative : ce qui distingue deux variantes de même couleur.
      note: str(v && v.note, 60),
      // Un EAN-13 maison généré ici (`primary`, celui de l'étiquette) et les
      // codes de l'ancien système relevés à la douchette, gardés tels quels —
      // c'est ce qui fait qu'un ancien scan résout encore.
      barcodes: (Array.isArray(v && v.barcodes) ? v.barcodes.slice(0, 12) : [])
        .map((b) => (typeof b === 'string'
          ? { code: str(b, 40), type: 'imported', primary: false }
          : {
            code: str(b && b.code, 40),
            type: str(b && b.type, 16) || 'imported',
            primary: !!(b && b.primary),
          }))
        .filter((b) => b.code),
    }))
    .filter((v) => v.id && v.productId);

  return out;
}

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

  const raw = (body && body.data) || null;

  // Garde-fou de forme. Un document qui ne ressemble pas à un catalogue passerait
  // le sanitizer en devenant vide — et écraserait silencieusement le stock réel.
  // C'est une perte de données muette : on refuse. Un catalogue honnêtement vide
  // (le commerçant a tout supprimé) porte quand même ses tableaux, donc il passe.
  if (!raw || typeof raw !== 'object'
      || !(Array.isArray(raw.products) || Array.isArray(raw.variants))) {
    return json({ error: 'shape-mismatch', expected: 'catalog' }, 409);
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
    await env.DB.prepare(
      `INSERT INTO catalogs (merchant, data, rev, updated_ts)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(merchant) DO UPDATE SET
         data = excluded.data, rev = excluded.rev, updated_ts = excluded.updated_ts`
    ).bind(merchant, JSON.stringify(data), rev, now).run();
  } catch (_) { return json({ error: 'write-failed' }, 500); }

  return json({
    ok: true, merchant, rev, updated_ts: now,
    products: data.products.length, variants: data.variants.length,
  });
}
