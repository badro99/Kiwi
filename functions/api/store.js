// /api/store — les documents PRIVÉS d'un établissement, synchronisés entre
// appareils. Le même filet que /api/catalog, généralisé.
//
// L'inventaire d'une boutique a eu droit à sa copie serveur (functions/api/
// catalog.js). Tout le reste de ce qu'un commerçant configure n'existait
// toujours QUE dans le localStorage du navigateur qui l'avait saisi : sa carte,
// son équipe et ses plannings de paie, son programme de fidélité, son plan de
// salle. Une fenêtre privée fermée, un deuxième appareil, un cache vidé, et le
// commerçant retrouvait un établissement vide. Ressaisir vingt salariés et
// quatre semaines de planning parce qu'on a ouvert Kiwi sur l'iPad du comptoir
// n'est pas acceptable.
//
// Plutôt qu'une table et un endpoint par fonctionnalité — six fois la même
// logique de révision, six occasions de se tromper sur la tenancy — un seul
// document JSON par (magasin, fonctionnalité). C'est exactement la forme que
// assets/venue-store.js impose déjà côté navigateur (`kiwi:<feature>:v1:<venue>`
// contient un objet, et un seul) : le serveur ne fait que lui donner un endroit
// où survivre.
//
// Modèle de confiance — identique à /api/catalog, et à l'opposé de /api/menu :
// GET /api/menu est PUBLIC (le client qui scanne un tag n'a ni compte ni
// cookie) et ne sert que ce qu'un commerce CHOISIT de publier. Ici rien n'est
// public. Une seule règle, dans _private.js : session du compte, deuxième
// établissement possédé, caisse appairée, ou opérateur.
//
// Concurrence : `rev` s'incrémente côté serveur. Le client renvoie la révision
// sur laquelle il s'est basé ; si le serveur a bougé entre-temps l'écriture est
// REFUSÉE (409) avec la copie serveur, jamais écrasée — le client fusionne et
// repropose. Sans ce garde-fou, l'iPad qui enregistre un planning efface le
// salarié que le portable vient d'ajouter.
//
// Toujours « fail-soft » : pas de D1, pas de table (migration pas passée),
// erreur base — 200 neutre en lecture, 503 en écriture. Le client garde sa copie
// locale et retentera. Un serveur qui tousse ne doit jamais coûter une donnée.

import { json, entitledMerchant } from '../auth/_lib.js';
import { tenantFor } from './_private.js';
import { poke } from './_live.js';

/* Les fonctionnalités qui ont le droit d'exister ici, et ce qu'on sait de leur
 * forme. La liste est FERMÉE : sans elle, n'importe quel client authentifié
 * pourrait semer autant de lignes qu'il veut sous des noms inventés. Ajouter une
 * fonctionnalité côté navigateur (KiwiStore.define) veut donc dire ajouter une
 * ligne ici — c'est le prix, assumé, d'un endpoint générique qui ne s'ouvre pas
 * tout seul.
 *
 * `keys` = les clés de premier niveau dont AU MOINS UNE doit être présente. Ce
 * n'est pas de la validation de contenu (voir `bounded` plus bas, qui ne
 * connaît aucune fonctionnalité) : c'est le même garde-fou de forme que
 * /api/catalog. Un document qui n'est pas celui qu'on croit — l'équipe envoyée
 * sous `menu` à cause d'un bug de câblage — écraserait silencieusement le vrai.
 * Vide = forme inconnue (fonctionnalité pas encore écrite) : on se contente
 * alors d'exiger un objet, et le refus d'écraser par du vide fait le reste.
 *
 * `max` = taille sérialisée maximale. Généreux : une carte avec photos ou un
 * planning au mois pèsent lourd, et refuser l'écriture d'un commerçant parce
 * qu'il a trop de salariés serait absurde. */
const FEATURES = {
  /* PAS la carte. `menu` est listé pour qu'un slug connu ne devienne pas un nom
   * inventé, mais assets/menu-catalog.js ne passe PAS par ici : il relit sa
   * carte par GET /api/menu?mine=1, la ligne que la page client lit déjà. Deux
   * miroirs pour une même carte, c'est deux vérités qui divergent — ne câblez
   * pas `cloud` sur le menu. */
  menu:         { keys: ['cats', 'items'],                        max: 600000 },
  recipes:      { keys: ['items'],                                max: 600000 },
  costs:        { keys: ['items', 'ingredients', 'recipes', 'charges', 'targets'], max: 600000 },
  team:         { keys: ['members', 'hours', 'shifts'],            max: 600000 },
  attendance:   { keys: ['entries'],                               max: 600000 },
  fidelity:     { keys: ['model', 'visit', 'amount', 'product'],   max: 20000 },
  floorplan:    { keys: ['rooms', 'tables', 'zones', 'objects'],   max: 400000 },
  stock:        { keys: ['items', 'lines', 'movements', 'suppliers'], max: 600000 },
  /* Private cost truth.  assets/cost.js deliberately keeps purchase prices,
   * ingredients, recipes and fixed charges out of the public menu document.
   * The browser has always declared this cloud document; omitting it here made
   * every real cross-device save fail with unknown-feature while the local UI
   * looked healthy.  This is the compatibility bridge until transactional
   * supplier prices and recipe versions move to normalized ledger tables. */
  costs:        { keys: ['items', 'ingredients', 'recipes', 'charges'], max: 600000 },
  reservations: { keys: ['list', 'bookings', 'slots'],             max: 600000 },
  services:     { keys: ['list', 'cats', 'items'],                 max: 400000 },
  promotions:   { keys: ['list', 'rules'],                         max: 200000 },
  retailcredit: { keys: ['entries', 'seq'],                        max: 600000 },
  returns:      { keys: ['list'],                                  max: 400000 },
  rooms:        { keys: ['list', 'rooms'],                         max: 400000 },
  kds:          { keys: ['stations', 'list'],                      max: 200000 },
  payroll:      { keys: ['periods', 'list'],                       max: 400000 },
  suppliers:    { keys: ['list'],                                  max: 200000 },
  procurement:  { keys: ['suppliers', 'orders', 'receipts', 'invoices', 'seq'], max: 900000 },
  /* Operational state can contain a compact condition photo (pressing damage
   * proof). Keep the document cap authoritative while allowing one bounded
   * image string; the generic 4 kB string ceiling is appropriate for notes,
   * not for a deliberately compressed data URL. */
  verticalops:   { keys: ['verticals', 'commands', 'seq'],             max: 1500000, maxStr: 350000 },
  expenses:     { keys: ['list'],                                  max: 400000 },
  /* Assistant approvals and their version trail. Protected from paired tills
   * below because summaries can contain customer and operational identifiers. */
  agentactions:  { keys: ['items', 'versions'],                      max: 250000 },
  /* Morning briefings eventually carry measured revenue, margin and stock
   * figures. Treat the cache as books from day one: non-editing surfaces see
   * an empty projection and, critically, cannot write that projection back. */
  briefing:      { keys: ['days'],                                   max: 250000 },
  /* Les trois destinations « starter » qui n'avaient pas encore de case ici.
   * Le starter (pages-pro.js) range une simple LISTE de lignes saisies à la
   * main, d'où la forme `{ list: [...] }` — la même que `suppliers` ou
   * `expenses`. `terminals` n'est pas `terminaux` : les noms de features sont
   * la clé primaire de store_docs, ils restent en anglais comme tous les
   * autres. */
  /* Les horaires d'ouverture — une fiche par établissement, la source unique
   * de « sommes-nous ouverts ? » pour la caisse, les réservations, Order Pro,
   * la page client, le rapport journalier et l'assistant. Minuscule (sept jours
   * + quelques exceptions) et pourtant l'un des plus importants à faire suivre
   * d'un appareil à l'autre : un commerçant qui règle sa semaine sur l'iPad du
   * comptoir doit la retrouver sur son téléphone, sinon les deux écrans
   * répondent différemment à la même question. */
  hours:        { keys: ['week', 'exceptions', 'overrides'],       max: 40000 },
  /* La fiche de l'établissement — raison sociale, adresse, téléphone, ICE, IF,
   * RC, patente, CNSS. La SOURCE des mentions qui s'impriment sur le reçu et
   * qui figureront sur toute facture. Elle vivait dans `kiwiSet:biz:*`, donc
   * dans UN navigateur : le commerçant saisissait son ICE au bureau et son
   * ticket sortait sans mention légale au comptoir. */
  business:     { keys: ['name', 'tradeName', 'logo', 'slogan', 'legal'], max: 400000, maxStr: 350000 },
  /* L'apparence du reçu — logo, en-tête, messages, ce qu'on affiche, largeur
   * du rouleau. `max` généreux à cause du logo, qui est une image en data: URI
   * (fichier borné à 300 ko avant encodage côté client ; data URI ≤ 500 ko).
   *
   * `maxStr` : le logo est UNE chaîne de plusieurs dizaines de milliers de
   * caractères, et le bornage générique refuse toute chaîne au-delà de 4 000.
   * Le document entier était donc rejeté (413 · string-too-long) DÈS QU'UN
   * COMMERÇANT POSAIT SON LOGO — en silence : le tableau de bord gardait sa
   * copie locale et montrait le nouveau reçu dans l'aperçu, le serveur n'en
   * recevait rien, et la caisse continuait d'imprimer l'ancien ticket
   * indéfiniment. Observé chez un client le 30/07/2026.
   *
   * On ne relâche la borne QUE pour cette fonctionnalité-là : partout ailleurs
   * une chaîne de 500 ko est une anomalie, ici c'est le format normal d'une
   * image. `max` reste le vrai plafond du document. */
  receipt:      { keys: ['look', 'show', 'msg', 'print', 'vat'],    max: 700000, maxStr: 500000 },
  terminals:    { keys: ['list'],                                  max: 200000 },
  appointments: { keys: ['list'],                                  max: 400000 },
  practitioners:{ keys: ['list'],                                  max: 200000 },
  /* Exact-trade operational boards (pre-orders, production, prescriptions,
   * memberships, deliveries, etc.). One tenant-scoped document deliberately
   * holds every board so a status change made on the phone is visible on the
   * desktop without multiplying store_docs rows. Records are bounded again in
   * the client; this server limit is the final safety rail. */
  workspaces:   { keys: ['trade', 'records'],                       max: 600000 },
  /* Garment tickets are the pressing's operational source of truth: customer,
   * care instructions, per-piece status, rack and outstanding balance. */
  'pressing-orders': { keys: ['customers', 'orders', 'seq'],       max: 1500000 },
  /* Editable garment/service catalogue shared by the owner dashboard and the
   * paired pressing till. Historical tickets keep their own price snapshot. */
  'pressing-catalog': { keys: ['categories', 'services', 'items'], max: 600000 },
  /* Les rapports de clôture (le « Z » de fin de journée), un document par
   * magasin contenant `days['2026-07-26'] = {…}`. C'est le SEUL de cette liste
   * qui soit une pièce comptable : un commerçant le rouvre pour justifier un
   * écart de caisse trois mois plus tard, et il doit le retrouver depuis
   * n'importe quel appareil — c'est précisément ce que la caisse ne savait pas
   * faire (le rapport mourait avec l'onglet à la fermeture de la caisse).
   *
   * Généreux sur la taille : un an de journées, chacune avec son détail par
   * catégorie et par produit. Ce n'est PAS `max` qui borne ce document en
   * pratique — c'est MAX_NODES (120 000) et MAX_KEYS (400) du bornage
   * générique plus bas. Le client le sait et s'élague lui-même AVANT d'envoyer
   * (assets/day-report.js : 370 journées, budget de 90 000 nœuds), parce qu'un
   * refus ici serait invisible pour le commerçant : sa copie locale survit, il
   * ne voit rien, et le jour où il ouvre Kiwi sur un autre appareil ses
   * rapports n'y sont pas. Toucher à l'un des deux plafonds sans l'autre
   * rouvre exactement ce trou. */
  dayreports:   { keys: ['days'],                                  max: 1500000 },
};

const featureOf = (v) => {
  const f = String(v == null ? '' : v).slice(0, 24).trim();
  return Object.prototype.hasOwnProperty.call(FEATURES, f) ? f : '';
};

/* Bornage GÉNÉRIQUE — et c'est délibéré.
 *
 * /api/catalog énumère ses champs un par un, et sa propre note d'en-tête
 * prévient du piège : un champ oublié dans cette liste ne provoque aucune
 * erreur, il disparaît simplement au premier aller-retour par le serveur. Sur un
 * endpoint qui sert quatorze fonctionnalités écrites à des dates différentes,
 * cette liste serait périmée dès la semaine suivante, et le symptôme — un
 * horaire de planning ou une option de produit qui s'évapore en changeant
 * d'appareil — serait invisible en revue.
 *
 * On ne valide donc PAS le contenu : le serveur est un coffre bête et borné. Il
 * vérifie la profondeur, le nombre de nœuds et la longueur des chaînes, et il
 * REFUSE tout ce qui dépasse au lieu de tronquer. Tronquer serait une perte de
 * données muette — exactement ce qu'on cherche à empêcher. Un refus, lui, laisse
 * la copie locale intacte et se voit.
 *
 * Ce que ça n'est pas : une défense contre un commerçant qui écrirait n'importe
 * quoi dans son propre document. Il en a le droit — c'est son magasin. C'est une
 * défense contre une ligne qui grossit sans fin. */
const MAX_DEPTH = 12;
const MAX_NODES = 120000;
const MAX_STR = 4000;
const MAX_ARRAY = 20000;
const MAX_KEYS = 400;

function bounded(raw, maxStr) {
  let nodes = 0;
  let overflow = '';
  const strCap = maxStr > 0 ? maxStr : MAX_STR;

  function walk(v, depth) {
    if (++nodes > MAX_NODES) { overflow = overflow || 'too-many-nodes'; return null; }
    if (v == null) return null;
    const t = typeof v;
    if (t === 'string') {
      if (v.length > strCap) { overflow = overflow || 'string-too-long'; return null; }
      return v;
    }
    if (t === 'number') return Number.isFinite(v) ? v : 0;
    if (t === 'boolean') return v;
    // Fonctions, symboles, BigInt : JSON.parse ne peut pas en produire, mais on
    // ne les laisse pas passer par principe.
    if (t !== 'object') return null;
    if (depth >= MAX_DEPTH) { overflow = overflow || 'too-deep'; return null; }

    if (Array.isArray(v)) {
      if (v.length > MAX_ARRAY) { overflow = overflow || 'array-too-long'; return null; }
      const out = [];
      for (let i = 0; i < v.length; i++) {
        if (overflow) return null;
        out.push(walk(v[i], depth + 1));
      }
      return out;
    }

    const keys = Object.keys(v);
    if (keys.length > MAX_KEYS) { overflow = overflow || 'too-many-keys'; return null; }
    const out = {};
    for (let i = 0; i < keys.length; i++) {
      if (overflow) return null;
      const k = String(keys[i]);
      if (k.length > 120) { overflow = overflow || 'key-too-long'; return null; }
      out[k] = walk(v[k], depth + 1);
    }
    return out;
  }

  const value = walk(raw, 0);
  return { ok: !overflow, why: overflow, value };
}

/* « Vide » = rien qui ressemble à du contenu. Un compteur, un drapeau ou une
 * version ne comptent pas : un document qui ne porte que `{ v: 1 }` est un
 * navigateur neuf, pas un commerçant qui a tout supprimé. Sert uniquement à
 * refuser qu'un premier envoi efface une vraie copie serveur. */
function isEmptyDoc(d) {
  if (d == null) return true;
  if (Array.isArray(d)) return d.length === 0;
  if (typeof d !== 'object') return false;
  const keys = Object.keys(d);
  for (let i = 0; i < keys.length; i++) {
    const v = d[keys[i]];
    if (v == null) continue;
    if (Array.isArray(v)) { if (v.length) return false; continue; }
    if (typeof v === 'object') { if (!isEmptyDoc(v)) return false; continue; }
    if (typeof v === 'string') { if (v.trim()) return false; continue; }
    // un scalaire (seq, version, drapeau) ne fait pas un document « rempli »
  }
  return true;
}

/* Le document ressemble-t-il à CETTE fonctionnalité ? Voir FEATURES.keys. */
function shapeOk(feature, raw) {
  if (!raw || typeof raw !== 'object') return false;
  const keys = FEATURES[feature].keys;
  if (!keys || !keys.length) return true;
  if (Array.isArray(raw)) return false;
  return keys.some((k) => Object.prototype.hasOwnProperty.call(raw, k));
}

/* The employee portal must never depend on a second best-effort browser
 * request after the Team document has been saved. That split was the reason an
 * employee could be visible in Dashboard → Équipe while /api/employee still
 * knew nothing about them: the large Team POST succeeded, the small
 * /api/config PIN mirror failed silently, and the UI nevertheless looked
 * saved.
 *
 * Build the private login roster from the exact Team document accepted by this
 * endpoint and write both rows in the same D1 batch. `tenantFor()` has already
 * resolved the real store, so this also remains correctly scoped when one
 * owner has several dashboards/stores. */
/* ── LE CODE PERSONNEL N'EST PAS UNE DONNÉE D'ÉQUIPE COMME UNE AUTRE ─────────
 * Le document `team` porte, pour chaque salarié, le code à quatre chiffres qui
 * lui ouvre l'app employé — dans `pinCode` et `password`, deux champs qui
 * portent la même valeur. La page Équipe du tableau de bord les AFFICHE, et
 * c'est voulu : c'est là que le patron lit le code qu'il va donner à sa
 * caissière.
 *
 * Une caisse appairée n'a rien à voir là-dedans, et elle y avait accès. Le
 * jeton de caisse est un cookie httpOnly posé sur un appareil de comptoir que
 * n'importe qui peut approcher : `tenantFor()` l'accepte (voir _private.js ›
 * resolveTenant), donc `GET /api/store?feature=team` rendait à ce comptoir
 * l'intégralité des codes du personnel. C'est la même fuite que celle que
 * /api/config vient de perdre, par une autre porte.
 *
 * On rend donc l'équipe SANS les codes à qui n'est pas en train de la tenir à
 * jour. La caisse garde ce qu'elle utilise — des noms, des rôles, des heures —
 * et perd ce qu'elle n'a jamais lu. */
function stripTeamCodes(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const members = Array.isArray(doc.members) ? doc.members : null;
  if (!members) return doc;
  return { ...doc, members: members.map((m) => {
    if (!m || typeof m !== 'object') return m;
    const { pinCode, password, ...rest } = m;
    return rest;
  }) };
}

function stripAgentActions() { return { items: [], versions: [] }; }
function stripBriefing() { return { days: [] }; }

/* Quelles fonctionnalités cachent un secret à qui ne l'écrit pas. */
const REDACT = { team: stripTeamCodes, agentactions: stripAgentActions, briefing: stripBriefing };

/* Celui-ci tient-il la fiche, ou ne fait-il que la consulter ?
 * `entitledMerchant` SANS `allowTill` répond exactement à ça : la session du
 * compte propriétaire, ou un opérateur nommé — les deux seules surfaces qui
 * éditent l'équipe. Une caisse appairée, un employé connecté : non.
 * L'opérateur reste dedans volontairement. Sa vue portée ouvre la même page
 * Équipe, et un champ code vidé n'y serait pas anodin : le formulaire
 * régénère un code quand il n'en relit pas un (assets/team.js › makeCode),
 * donc masquer sans plus reviendrait à faire tourner les codes du client dans
 * son dos. */
async function editsRoster(request, env, merchant) {
  if (!merchant) return false;
  try { return (await entitledMerchant(request, env, merchant)) === merchant; }
  catch (_) { return false; }
}

function employeeAccessFromTeam(team, merchant) {
  const members = Array.isArray(team && team.members) ? team.members : [];
  const seen = new Set();
  const access = [];
  for (const member of members) {
    if (!member) continue;
    const id = String(member.id || '').trim().slice(0, 96);
    const email = String(member.email || '').trim().toLocaleLowerCase('en').slice(0, 254);
    const pin = String(member.pinCode || member.password || '').trim();
    if (!id || !/^\S+@\S+\.\S+$/.test(email) || !/^\d{4}$/.test(pin)) continue;
    const key = `${email}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    access.push({
      id,
      firstName: String(member.firstName || '').trim().slice(0, 60),
      lastName: String(member.lastName || '').trim().slice(0, 60),
      email,
      pinCode: pin,
      password: pin,
      function: String(member.function || '').trim().slice(0, 60),
      department: String(member.department || '').trim().slice(0, 60),
      venueSlug: merchant,
    });
  }
  return { members: access };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const feature = featureOf(url.searchParams.get('feature'));
  if (!feature) return json({ error: 'unknown-feature' }, 400);

  // Pas de backend (hébergement statique, préview sans secrets) → neutre. Le
  // client garde son localStorage et continue de travailler.
  if (!env.DB) return json({ feature, merchant: '', data: null, rev: 0 });

  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  try {
    const row = await env.DB.prepare(
      'SELECT data, rev, updated_ts FROM store_docs WHERE merchant = ? AND feature = ?'
    ).bind(merchant, feature).first();
    if (!row) return json({ feature, merchant, data: null, rev: 0 });
    let data = null;
    try { data = JSON.parse(row.data); } catch (_) { data = null; }
    const redact = REDACT[feature];
    const safe = (redact && !(await editsRoster(request, env, merchant))) ? redact(data) : data;
    return json({ feature, merchant, data: safe, rev: row.rev || 0, updated_ts: row.updated_ts || 0 });
  } catch (_) {
    // Table absente (migration pas encore passée) → neutre, surtout pas une
    // erreur : le client doit continuer à fonctionner en local.
    return json({ feature, merchant, data: null, rev: 0, unmigrated: true });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const feature = featureOf(body && body.feature);
  if (!feature) return json({ error: 'unknown-feature' }, 400);

  const merchant = await tenantFor(request, env, body && body.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);

  /* Qui ne peut pas LIRE les codes ne peut pas RÉÉCRIRE le document qui les
   * porte. Sans cette ligne, la rédaction du GET creuse un trou pire que celui
   * qu'elle bouche : une caisse relit l'équipe expurgée, la repousse telle
   * quelle, et tous les codes du magasin disparaissent de la base — une panne
   * silencieuse le lendemain matin, quand personne n'arrive à se connecter.
   * Aucune surface de caisse n'écrit l'équipe (seul assets/team.js le fait,
   * depuis le tableau de bord), donc c'est un verrou, pas un retrait. */
  if (REDACT[feature] && !(await editsRoster(request, env, merchant))) {
    return json({ error: 'forbidden-feature', feature }, 403);
  }

  const raw = (body && body.data) || null;

  // Garde-fou de forme. Un document qui n'est pas celui qu'on croit écraserait
  // silencieusement le vrai. Un document honnêtement vide (le commerçant a tout
  // supprimé) porte quand même ses clés, donc il passe.
  if (!shapeOk(feature, raw)) return json({ error: 'shape-mismatch', expected: feature }, 409);

  const clean = bounded(raw, FEATURES[feature].maxStr);
  // Refus plutôt que troncature : voir la note de `bounded`. Le client garde sa
  // copie locale — il ne perd rien, il n'a simplement pas de copie serveur.
  if (!clean.ok) return json({ error: 'too-large', why: clean.why }, 413);

  const text = JSON.stringify(clean.value);
  if (text.length > FEATURES[feature].max) {
    return json({ error: 'too-large', why: 'byte-size', max: FEATURES[feature].max }, 413);
  }

  const baseRev = Math.max(0, Number(body && body.baseRev) || 0);
  const now = Date.now();

  let current = null;
  try {
    current = await env.DB.prepare(
      'SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?'
    ).bind(merchant, feature).first();
  } catch (_) {
    // Table absente : la migration n'est pas passée. 503 → le client garde tout
    // en local et retentera au prochain enregistrement.
    return json({ error: 'unmigrated' }, 503);
  }

  const serverRev = (current && current.rev) || 0;

  // Écriture basée sur une révision périmée : on ne l'applique PAS. On renvoie la
  // copie serveur pour que le client fusionne et repropose. Sans ça, deux
  // appareils ouverts en même temps se recouvrent l'un l'autre.
  if (serverRev && baseRev !== serverRev) {
    let mine = null;
    try { mine = JSON.parse(current.data); } catch (_) { mine = null; }
    return json({ error: 'stale', feature, rev: serverRev, data: mine }, 409);
  }

  // Un premier envoi VIDE ne doit pas effacer un document déjà en ligne : c'est
  // la signature d'un navigateur neuf qui pousse avant d'avoir hydraté.
  if (serverRev && isEmptyDoc(clean.value)) {
    let mine = null;
    try { mine = JSON.parse(current.data); } catch (_) { mine = null; }
    if (!isEmptyDoc(mine)) {
      return json({ error: 'refused-empty', feature, rev: serverRev, data: mine }, 409);
    }
  }

  const rev = serverRev + 1;
  try {
    const writeDoc = env.DB.prepare(
      `INSERT INTO store_docs (merchant, feature, data, rev, updated_ts)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(merchant, feature) DO UPDATE SET
         data = excluded.data, rev = excluded.rev, updated_ts = excluded.updated_ts`
    ).bind(merchant, feature, text, rev, now);
    if (feature === 'team') {
      const accessText = JSON.stringify(employeeAccessFromTeam(clean.value, merchant));
      const writeAccess = env.DB.prepare(
        `INSERT INTO store_docs (merchant, feature, data, rev, updated_ts)
         VALUES (?, 'employee-access', ?, 1, ?)
         ON CONFLICT(merchant, feature) DO UPDATE SET
           data = excluded.data, rev = store_docs.rev + 1, updated_ts = excluded.updated_ts`
      ).bind(merchant, accessText, now);
      await env.DB.batch([writeDoc, writeAccess]);
    } else {
      await writeDoc.run();
    }
  } catch (_) { return json({ error: 'write-failed' }, 500); }

  /* Écriture faite : on réveille les autres appareils du commerçant pour qu'ils
   * relisent maintenant plutôt qu'au prochain tour d'horloge. Attendu plutôt que
   * détaché — sans binding c'est un simple test de vérité, et avec binding
   * l'aller-retour reste dans le même centre de données, à côté des requêtes D1
   * qu'on vient déjà de faire. */
  await poke(env, merchant, feature);

  return json({ ok: true, feature, merchant, rev, updated_ts: now, bytes: text.length });
}
