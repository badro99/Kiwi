// functions/api/order/_lib.js — ce que les trois moitiés du relais partagent.
//
// Le relais OrderPro a trois portes : /api/order (le téléphone dépose),
// /api/order/session (le téléphone s'assoit et demande s'il est encore le
// bienvenu) et /api/order/queue (le comptoir lit et décide). Elles avaient déjà
// commencé à recopier les mêmes règles — `startOfDay` existait mot pour mot en
// trois endroits, `orderProEnabled` en deux — et une règle recopiée est une
// règle qu'on corrigera une fois sur trois.
//
// Le préfixe « _ » exclut ce fichier du routage Pages : ce n'est pas une URL,
// c'est la bibliothèque des trois autres (même convention que functions/auth/_lib.js).

/* ── Le jour d'ouverture ───────────────────────────────────────────────────
 * Les numéros de ticket repartent à 1 chaque jour. Le Maroc est à UTC+1 toute
 * l'année, donc la frontière se calcule à +1h : une commande de 00h30
 * appartient au jour qui commence, pas à la numérotation de la veille.
 * (Ce n'est PAS le « jour commercial » du rapport Z, qui suit les horaires
 * saisis par le commerçant — deux notions voisines et volontairement distinctes.) */
export function startOfDay(now) {
  const shifted = now + 3600000;
  return Math.floor(shifted / 86400000) * 86400000 - 3600000;
}

/* ── L'option est-elle ouverte chez ce commerçant ? ────────────────────────
 * ATTENTION, cette clé inverse la convention de merchant_config : partout
 * ailleurs une clé ABSENTE veut dire « module allumé », parce que ces modules
 * font partie de l'interface déjà payée. Order Pro est une option payante qui
 * transforme le téléphone d'un inconnu en terminal de commande : elle est
 * ÉTEINTE tant qu'un opérateur n'a pas écrit `true`.
 * Ligne absente, clé absente, JSON cassé, base en panne → false. */
export async function orderProEnabled(env, merchant) {
  try {
    const row = await env.DB.prepare(
      'SELECT features FROM merchant_config WHERE merchant = ?'
    ).bind(merchant).first();
    if (!row || !row.features) return false;
    return (JSON.parse(row.features) || {}).orderpro === true;
  } catch (_) { return false; }
}

/* ── Le numéro de table ────────────────────────────────────────────────────
 * L'ancienne règle était `replace(/\D/g,'')` : elle ne gardait que les
 * chiffres. Or le plan de salle laisse le patron nommer ses tables librement —
 * « T7 », « Terrasse 2 », « Bar ». Ces trois-là devenaient « 7 », « 2 » et « »
 * (vide), donc une commande de la terrasse 2 se posait sur la table 2 de la
 * salle, et le bar ne se rattachait à rien du tout.
 * On garde donc les lettres, et on borne : c'est une étiquette de table, pas
 * un champ libre. La normalisation (majuscules, espaces resserrés) sert au
 * rapprochement avec le plan, où « t7 » et « T7 » désignent la même table. */
export function normTable(v) {
  return String(v == null ? '' : v)
    .replace(/[^\p{L}\p{N} .\-_]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
}
/* La clé de rapprochement, jamais ce qu'on affiche. */
export function tableKey(v) {
  return normTable(v).toUpperCase().replace(/\s+/g, '');
}

/* ── L'identifiant de session ──────────────────────────────────────────────
 * Il EST la capacité : le téléphone n'a pas de compte, pas de mot de passe et
 * pas de cookie garanti (navigation privée, cookies coupés). C'est donc 132
 * bits tirés au sort et non un compteur — un identifiant devinable rendrait la
 * révocation décorative, puisqu'il suffirait de deviner la session suivante. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function newSessionId() {
  const bytes = new Uint8Array(22);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return 'tsx-' + out;
}
export const SESSION_ID = /^tsx-[A-Za-z0-9]{22}$/;

/* ── La présence du comptoir ───────────────────────────────────────────────
 * C'est la seule protection sérieuse contre « je garde le lien et je commande
 * de chez moi ». Elle ne peut pas venir du téléphone, qui ment ; elle vient de
 * la caisse, qui interroge déjà sa file toutes les six secondes avec une
 * requête authentifiée. On note l'heure de ce passage, et ouvrir une session
 * exige que le comptoir ait donné signe de vie récemment.
 *
 * Commerce fermé ⇒ caisse éteinte ⇒ plus aucune session ne s'ouvre. Une porte
 * qui se ferme toute seule le soir, sans horaire à saisir et sans horloge à
 * régler.
 *
 * Le repli est délibéré et documenté : une base où `order_desk` n'existe pas
 * encore, ou un commerçant dont la caisse n'a JAMAIS sondé, laisse passer. Le
 * serveur ne peut pas distinguer « fermé » de « migration pas encore faite »,
 * et refuser dans le doute couperait la commande chez quelqu'un qui vient
 * d'activer l'option. Dès que la caisse a sondé une seule fois, la règle mord. */
export const DESK_FRESH_MS = 5 * 60 * 1000;   // le comptoir sonde toutes les 6 s

export async function deskTouch(env, merchant) {
  try {
    await env.DB.prepare(
      `INSERT INTO order_desk (merchant, seen_ts) VALUES (?, ?)
         ON CONFLICT(merchant) DO UPDATE SET seen_ts = excluded.seen_ts`
    ).bind(merchant, Date.now()).run();
  } catch (_) { /* table pas encore migrée → la présence reste inconnue, on laisse passer */ }
}

export async function deskOpen(env, merchant) {
  try {
    const row = await env.DB.prepare(
      'SELECT seen_ts FROM order_desk WHERE merchant = ?'
    ).bind(merchant).first();
    if (!row) return true;                 // jamais vue ⇒ inconnue, pas « fermée »
    return (Date.now() - (row.seen_ts || 0)) < DESK_FRESH_MS;
  } catch (_) { return true; }             // table absente ⇒ idem
}

/* ── Le prix, décidé ici et nulle part ailleurs ────────────────────────────
 * Le téléphone envoyait son propre total et ses propres prix unitaires, et on
 * les écrivait tels quels. Une requête modifiée créait donc une commande à
 * 1 MAD pour un plat à 250, avec le nom qu'on voulait — et le ticket cuisine
 * sortait avec le faux prix. C'était le plus gros trou du relais.
 *
 * Désormais le téléphone n'envoie que des IDENTIFIANTS et des quantités. On
 * ouvre la carte publiée par le commerçant, on y lit le nom et le prix, et on
 * recalcule le total. Ce que le téléphone prétendait n'est plus qu'un
 * commentaire qu'on compare pour le journal.
 *
 * ── Ce que le repli « aucune carte publiée » coûtait vraiment ───────────────
 * Il existait un chemin où l'on reprenait le prix ET le nom du téléphone : quand
 * aucun index ne pouvait être construit. Présenté comme le cas du commerçant qui
 * n'a rien publié, c'était en réalité le MÊME trou derrière quatre conditions,
 * dont une vertical entière :
 *   · une BOUTIQUE publie {categories, products, variants, colors} avec
 *     `priceMAD` et AUCUNE clé `items` — donc toute boutique avec Order Pro
 *     allumé se tarifait depuis le téléphone du client ;
 *   · une carte publiée avec des catégories mais zéro plat passe `menuEmpty` ;
 *   · un JSON illisible en base ;
 *   · une simple panne de lecture sur `menus`.
 * Dans les quatre cas, un inconnu tenant le slug fixait le prix ET le libellé
 * imprimé sur le ticket cuisine, sur un point d'entrée non authentifié.
 *
 * Deux corrections, donc. On sait désormais lire les DEUX formes de catalogue —
 * la carte d'un restaurant et le stock d'une boutique. Et quand il n'y a
 * décidément rien contre quoi vérifier, on REFUSE au lieu de croire : Order Pro
 * est une option qu'un opérateur a explicitement allumée, et « allumée sans
 * catalogue » est une erreur de configuration qui se corrige en trente
 * secondes — pas une raison de laisser le client nommer son prix. Le refus est
 * explicite (`menu-not-published`), donc réparable ; l'ancien silence ne
 * l'était pas. */
const MAX_LINE_QTY = 99;

export async function priceOrder(env, merchant, rawLines) {
  let menuRow = null;
  try {
    menuRow = await env.DB.prepare(
      'SELECT data, updated_ts FROM menus WHERE merchant = ?'
    ).bind(merchant).first();
  } catch (_) { menuRow = null; }

  let index = null;
  let menuRev = null;
  if (menuRow && menuRow.data) {
    try {
      const parsed = JSON.parse(menuRow.data);
      const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
      if (items.length) {
        index = new Map();
        for (const it of items) {
          if (!it || !it.id) continue;
          index.set(String(it.id), {
            name: String(it.name || ''),
            price: Math.max(0, Math.round(Number(it.price) || 0)),
            avail: it.avail !== false,
          });
        }
        menuRev = menuRow.updated_ts || null;
      } else {
        /* La forme BOUTIQUE. `priceMAD` au lieu de `price`, et la disponibilité
         * vient du stock : un article dont toutes les déclinaisons sont à zéro
         * est épuisé, exactement comme un plat marqué indisponible. Un produit
         * SANS déclinaison du tout reste commandable — tous les catalogues ne
         * suivent pas les tailles, et refuser dans le doute fermerait la
         * boutique au lieu de la protéger. */
        const products = Array.isArray(parsed && parsed.products) ? parsed.products : [];
        if (products.length) {
          const stock = new Map();
          const variants = Array.isArray(parsed && parsed.variants) ? parsed.variants : [];
          for (const v of variants) {
            if (!v || !v.productId) continue;
            const k = String(v.productId);
            stock.set(k, (stock.get(k) || 0) + Math.max(0, Number(v.stock) || 0));
          }
          index = new Map();
          for (const p of products) {
            if (!p || !p.id) continue;
            const k = String(p.id);
            index.set(k, {
              name: String(p.name || ''),
              price: Math.max(0, Math.round(Number(p.priceMAD) || 0)),
              avail: stock.has(k) ? stock.get(k) > 0 : true,
            });
          }
          menuRev = menuRow.updated_ts || null;
        }
      }
    } catch (_) { index = null; }
  }

  const lines = [];
  const unknown = [];
  const unavailable = [];
  let total = 0;

  /* Rien contre quoi vérifier ⇒ on ne devine pas, on le DIT. L'appelant en fait
   * un 409 explicite ; il n'écrit jamais une commande dont il ne connaît pas le
   * prix. C'est la seule sortie possible ici : lire `l.unitPrice` reviendrait à
   * laisser un inconnu tarifer la marchandise d'un commerçant. */
  if (!index) {
    return { lines: [], total: 0, priced: false, noCatalogue: true, menuRev: null,
             unknown: [], unavailable: [] };
  }

  for (const l of rawLines) {
    const id = String((l && l.id) || '').slice(0, 40);
    const qty = Math.min(MAX_LINE_QTY, Math.max(1, Math.round(Number(l && l.qty) || 1)));
    const options = String((l && l.options) || '').slice(0, 200);
    const note = String((l && l.note) || '').slice(0, 200);

    const ref = id && index.get(id);
    if (!ref) { unknown.push(id || '?'); continue; }
    if (!ref.avail) { unavailable.push(ref.name || id); continue; }
    lines.push({ id, name: ref.name, qty, unitPrice: ref.price, options, note });
    total += ref.price * qty;
  }

  return {
    lines, total,
    priced: true,             // on n'arrive ici qu'avec un catalogue en main
    noCatalogue: false,
    menuRev,
    unknown, unavailable,
  };
}
