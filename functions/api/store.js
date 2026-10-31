import { canonicalCode, normalizeMember } from './_rules-staff-credential.js';
import { cleanFloorplan } from './_rules-floorplan-clean.js';
import { cleanBriefingSettings } from './_briefing-settings.js';
import { refundCreditBook } from './_credit-book-refund.js';
import { BOOK_FEATURE, commitBook, getVerticalOps, legacyBook, readBook, withBook, withoutBook } from './_credit-book-store.js';
import { serviceCapacityConflict } from './_booking-capacity.js';
import { hideReservations, keepReservations } from './_reservations-view.js';
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

import { cleanGuestDoc } from './order/_guest.js';
import { cleanStorefront, STOREFRONT_FEATURE } from './shop/_settings.js';
import { validateMonthReportPolicy } from './_month-report-policy.js';
import { json, entitledMerchant, activeAccountSession, isTillFor } from '../auth/_lib.js';
import { storeEtag, storeTag } from './_store-etag.js';
import { tenantFor, storeSubscriptionPending } from './_private.js';
import { authFingerprint, authSentinel, planEmployeeAuth, writeEmployeeAuth, authMoved } from './_employee-auth.js';
import { foreignCopy, keepHistory } from './_tenant-guard.js';
import { freezePressingNotifications } from './_pressing-notification.js';
import { poke } from './_live.js';
import {
  HOTEL_UNITS_FEATURE,
  isHotelMerchantType,
  validateHotelUnits,
} from './_hotel-units.js';
import {
  ECONOMAT_CATALOGUE_FEATURE,
  validateEconomatCatalogue,
} from './inventory/_economat-catalogue.js';
import { hotelUnitDeactivationBlockers } from './inventory/_hotel-unit-deactivation.js';
import { validateCommercialSync } from './hotel/_commercial.js';
import { reservationOverlapConflict } from './hotel/_reservation-overlap.js';
import { capBookings, BOOKING_CAP } from './_booking-cap.js';
import { archiveFromSnapshot, isArchivable } from './_pressing-archive.js';
import { preservePressingCancellations, validatePressingSnapshot } from './_pressing-snapshot.js';
import { validateHubClaim } from './print/_hub-lease.js';
import { validateRoomsDocument } from './hotel/_rooms.js';

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
/* Le bail du hub d'impression. Ce n'est pas un document qu'on fusionne, c'est un
 * verrou qu'on arbitre : il passe donc par l'écriture conditionnelle
 * (CAS_FEATURES) et par validateHubClaim. Voir print/_hub-lease.js. */
const PRINT_HUB_FEATURE = 'printhub';

/* Les documents d'ARBITRAGE. Depuis que TOUTE écriture est conditionnelle à la
 * révision lue (UPDATE … WHERE rev = ?), ils ne se distinguent plus que par la
 * rigueur : un résultat sans `meta.changes` y vaut conflit. Pour eux, « deux
 * appareils à la fois » n'est pas une gêne d'affichage mais une faute : une
 * chambre vendue deux fois, deux comptoirs qui impriment le même bon. */
const CAS_FEATURES = new Set(['reservations', PRINT_HUB_FEATURE, 'monthreport']);

const FEATURES = {
  [HOTEL_UNITS_FEATURE]: { keys: ['units'],                       max: 80000 },
  [ECONOMAT_CATALOGUE_FEATURE]: { keys: ['items'],                max: 600000 },
  /* PAS la carte. `menu` est listé pour qu'un slug connu ne devienne pas un nom
   * inventé, mais assets/menu-catalog.js ne passe PAS par ici : il relit sa
   * carte par GET /api/menu?mine=1, la ligne que la page client lit déjà. Deux
   * miroirs pour une même carte, c'est deux vérités qui divergent — ne câblez
   * pas `cloud` sur le menu. */
  [PRINT_HUB_FEATURE]: { keys: ['hub'],                           max: 4000 },
  menu:         { keys: ['cats', 'items'],                        max: 600000 },
  recipes:      { keys: ['items'],                                max: 600000 },
  team:         { keys: ['members', 'hours', 'shifts'],            max: 600000 },
  attendance:   { keys: ['entries'],                               max: 600000 },
  fidelity:     { keys: ['model', 'visit', 'amount', 'product'],   max: 20000 },
  discountpolicy: { keys: ['percentages'], max: 2000 },
  /* Les réglages de CAISSE des métiers de bouche autres que le restaurant
   * (pizzeria, traiteur, boulangerie) : frais de livraison par zone, supplément
   * moitié-moitié, tarif des extras d'un devis, échéancier par défaut, prix des
   * gâteaux sur commande. Avant ce document, ces prix étaient des constantes
   * de la démo écrites dans pos-*.js : une vraie pizzeria facturait 10 MAD de
   * livraison au centre-ville parce que la démo le dit. Le propriétaire écrit
   * (OWNER_EDIT_FEATURES), la caisse appairée lit et n'écrit jamais : un prix
   * se pose au bureau. */
  foodtrade:    { keys: ['pizzeria', 'traiteur', 'boulangerie'],   max: 60000 },
  floorplan:    { keys: ['rooms', 'tables', 'zones', 'objects'],   max: 400000 },
  /* La page d'accueil du client Order Pro : Wi-Fi des clients, lien d'avis,
   * réseaux, jeux (quiz du restaurant, pseudos masqués, manche en cours) et
   * mode Ramadan. Le propriétaire écrit (OWNER_EDIT_FEATURES) ; chaque
   * enregistrement passe par cleanGuestDoc, la forme que lit la route
   * publique functions/api/order/guest.js. */
  guestpage:    { keys: ['wifi', 'review', 'socials', 'games', 'ramadan'], max: 200000 },
  /* Les réglages de la boutique en ligne (Kiwi Commerce) : livraison, packs, codes promo, contact.
   * Le propriétaire écrit (OWNER_EDIT_FEATURES), forme fixée par cleanStorefront (shop/_settings.js),
   * la vitrine les relit par GET /api/shop/catalog. */
  [STOREFRONT_FEATURE]: { keys: ['name', 'tagline', 'announcement', 'whatsapp', 'instagram', 'accent', 'shipping', 'bundles', 'coupons'], max: 20000 },
  stock:        { keys: ['items', 'lines', 'movements', 'suppliers'], max: 600000 },
  /* Private cost truth.  assets/cost.js deliberately keeps purchase prices,
   * ingredients, recipes and fixed charges out of the public menu document.
   * The browser has always declared this cloud document; omitting it here made
   * every real cross-device save fail with unknown-feature while the local UI
   * looked healthy.  This is the compatibility bridge until transactional
   * supplier prices and recipe versions move to normalized ledger tables. */
  costs:        { keys: ['items', 'ingredients', 'recipes', 'charges', 'targets'], max: 600000 },
  reservations: { keys: ['list', 'bookings', 'slots'],             max: 600000 },
  services:     { keys: ['list', 'cats', 'items'],                 max: 400000 },
  promotions:   { keys: ['list', 'rules', 'promos'],               max: 200000 },
  retailcredit: { keys: ['entries', 'seq'],                        max: 600000 },
  returns:      { keys: ['list'],                                  max: 400000 },
  rooms:        { keys: ['list', 'rooms'],                         max: 400000 },
  kds:          { keys: ['stations', 'list'],                      max: 200000 },
  payroll:      { keys: ['periods', 'list'],                       max: 400000 },
  suppliers:    { keys: ['list'],                                  max: 200000 },
  procurement:  { keys: ['suppliers', 'orders', 'receipts', 'returns', 'invoices', 'seq'], max: 900000 },
  giftregistries:{ keys: ['list'],                                  max: 600000 },
  /* Operational state can contain a compact condition photo (pressing damage
   * proof). Keep the document cap authoritative while allowing one bounded
   * image string; the generic 4 kB string ceiling is appropriate for notes,
   * not for a deliberately compressed data URL. */
  verticalops:   { keys: ['verticals', 'commands', 'seq'],             max: 1500000, maxStr: 350000 },
  monthreport:  { keys: ['taxPeriods', 'accountantEmail'], max: 100000 },
  expenses:     { keys: ['list'],                                  max: 400000 },
  /* Charges fixes et commissions : loyer, électricité, abonnements, le taux
   * des charges sociales patronales et ce que la carte ou Glovo prélève. C'est
   * le compte d'exploitation du commerce, pas un réglage de caisse : expurgé
   * pour la caisse appairée et l'employé connecté, écrit par le seul
   * propriétaire (REDACT ci-dessous). Les salaires n'y sont pas, ils restent
   * dans `team` (assets/charges.js). */
  charges:       { keys: ['lines', 'social', 'commissions'],          max: 200000 },
  /* Assistant approvals and their version trail. Protected from paired tills
   * below because summaries can contain customer and operational identifiers. */
  agentactions:  { keys: ['items', 'versions'],                      max: 250000 },
  /* Morning briefings eventually carry measured revenue, margin and stock
   * figures. Treat the cache as books from day one: non-editing surfaces see
   * an empty projection and, critically, cannot write that projection back. */
  briefing:      { keys: ['days'],                                   max: 250000 },
  /* Customer retention (#0165): the owner's group thresholds, the offer for
   * each group and the log of messages the owner approved. The log names
   * customers, so it is redacted for paired tills and only the owner writes. */
  retention:     { keys: ['settings', 'offers', 'sends'],             max: 400000 },
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
  'pressing-orders': { keys: ['customers', 'orders', 'cancellations', 'rackConflicts', 'seq'], max: 1500000 },
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

/* Deux bons distincts ne partagent jamais un numéro sur le serveur. Une copie
 * qui porterait, sous le numéro d'un bon déjà enregistré, un AUTRE bon (heure
 * de dépôt différente) l'effacerait : on la renvoie fusionner (409 + copie
 * serveur). La fusion des caisses garde alors les deux, le second renuméroté. */
function pressingDroppedAt(order) {
  const t = order && order.droppedAt != null ? new Date(order.droppedAt).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
}
function pressingIdentityConflict(current, incoming) {
  const before = new Map();
  for (const order of (current && Array.isArray(current.orders) ? current.orders : [])) {
    if (order && order.id) before.set(String(order.id), order);
  }
  for (const order of (incoming && Array.isArray(incoming.orders) ? incoming.orders : [])) {
    if (!order || !order.id) continue;
    const old = before.get(String(order.id));
    if (!old) continue;
    const a = pressingDroppedAt(old), b = pressingDroppedAt(order);
    if (a !== null && b !== null && a !== b) return { id: String(order.id) };
  }
  return null;
}

/* Lettres des caisses du pressing (« 0042-B » pour un bon numéroté hors
 * ligne). Registre en ajout seul : une caisse garde sa première lettre, une
 * copie qui l'oublie ne l'efface pas, et une lettre déjà tenue par une autre
 * caisse est refusée (409 + copie serveur, la caisse en reprend une libre).
 * Une lettre que le serveur a acceptée est donc unique pour ce commerce. */
const PRESSING_TILL_KEY = /^d[a-z0-9]{6,24}$/;
const PRESSING_TILL_LETTER = /^[A-Z]{1,2}$/;
function pressingTillRows(doc) {
  const tills = doc && doc.tills;
  if (!tills || typeof tills !== 'object' || Array.isArray(tills)) return [];
  return Object.entries(tills).filter(([key, row]) => PRESSING_TILL_KEY.test(key) && row
    && typeof row === 'object' && PRESSING_TILL_LETTER.test(String(row.letter || '')));
}
function pressingTills(current, incoming) {
  const tills = {};
  const owner = new Map();
  for (const [key, row] of pressingTillRows(current)) {
    const letter = String(row.letter);
    if (owner.has(letter)) continue;
    tills[key] = { letter, at: Number(row.at) || 0 };
    owner.set(letter, key);
  }
  for (const [key, row] of pressingTillRows(incoming)) {
    if (tills[key]) continue;
    const letter = String(row.letter);
    if (owner.has(letter)) return { conflict: { key, letter } };
    if (owner.size >= 200) continue;
    tills[key] = { letter, at: Number(row.at) || 0 };
    owner.set(letter, key);
  }
  return { tills };
}

function pressingRackConflict(doc) {
  const owners = new Map();
  for (const order of (doc && doc.orders) || []) {
    if (!order || order.cancelledAt || !order.rack) continue;
    const rack = String(order.rack).trim().slice(0, 20);
    if (!rack) continue;
    const previous = owners.get(rack);
    if (previous && previous !== String(order.id || '')) return { slot: rack, orderId: String(order.id || '') };
    owners.set(rack, String(order.id || ''));
  }
  return null;
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
/**
 * The guard assertions describe documents with no member array; they do not
 * assert that any stored member is safe. Member-bearing documents must pass
 * through the destructuring projection below.
 * @param {import('../../types/tenant').StoredTeamDocument | null} doc
 * @returns {import('../../types/tenant').TillTeamDocument | null}
 */
function stripTeamCodes(doc) {
  if (!doc || typeof doc !== 'object') return /** @type {Omit<import('../../types/tenant').StoredTeamDocument, 'members'>} */ (doc);
  const members = Array.isArray(doc.members) ? doc.members : null;
  if (!members) return /** @type {Omit<import('../../types/tenant').StoredTeamDocument, 'members'>} */ (doc);
  return { ...doc, members: members.map((m) => {
    if (!m || typeof m !== 'object') return m;
    /* La paie et la fiche personnelle suivent les codes : une caisse appairée
     * s'ouvre maintenant SANS la session du patron (functions/_middleware.js ›
     * TILL_PATHS), et aucune surface autre que le tableau de bord ne lit ces
     * champs. Qui ne les lit pas ne réécrit pas le document (REDACT). */
    const { pinCode, password, baseSalary, hourlyRate, cin, iban, address, emergencyName, emergencyPhone, ...rest } = m;
    return rest;
  }) };
}

function stripAgentActions() { return { items: [], versions: [] }; }
function stripBriefing() { return { days: [] }; }
function stripRetention() { return { settings: null, offers: null, sends: [] }; }
function stripCharges() { return { lines: [], social: { rate: null }, commissions: { methods: {}, channels: {} } }; }
/* Les fiches techniques du tableau de bord (assets/restaurant-recipes.js) :
 * grammages et rendements, le savoir-faire de la maison. Seul dashboard.html
 * charge ce module ; la caisse chiffre ses ventes par `costs` (KiwiCost.of),
 * jamais par ce document. Une caisse appairée n'a donc rien à y lire. */
function stripRecipes() { return { items: {} }; }

/* Quelles fonctionnalités cachent un secret à qui ne l'écrit pas. */
const REDACT = { team: stripTeamCodes, agentactions: stripAgentActions, briefing: stripBriefing, retention: stripRetention, charges: stripCharges, recipes: stripRecipes };

/* ── DES DOCUMENTS QUE LA CAISSE ÉCRIT, MAIS DONT ELLE NE LIT QU'UNE PARTIE ──
 * REDACT ferme un document entier : qui ne lit pas ne réécrit pas. Deux
 * documents ne peuvent pas être fermés ainsi, parce que la caisse appairée y
 * écrit légitimement :
 *
 * - `workspaces` : la caisse de la pharmacie y lit les fiches médicament, les
 *   lots et les organismes, et y DÉPOSE l'ordonnance délivrée et le dossier
 *   de tiers payant d'une vente. Elle ne relit jamais ni l'un ni l'autre. Or
 *   ces deux tableaux portent le nom du patient, son médecin, son organisme :
 *   des données de santé, lisibles jusqu'ici par n'importe quel appareil de
 *   comptoir appairé. Elles restent au pharmacien titulaire (la session du
 *   compte) ; la caisse continue d'en ajouter.
 * - `costs` : la caisse gèle le coût matière d'une ligne au moment de la
 *   vente (KiwiCost.of), il lui faut donc les coûts, les ingrédients et les
 *   fiches de ce document. Les charges fixes et les objectifs de marge, non :
 *   c'est le compte d'exploitation.
 *
 * `hide` rend la vue de la caisse ; `keep` reconstruit, à l'écriture d'une
 * surface qui n'a reçu que cette vue, ce qu'elle n'a pas pu renvoyer : sans lui,
 * la caisse relirait la vue expurgée, la pousserait, et effacerait au serveur
 * les ordonnances ou les charges (la règle de `team-doc-redaction-test`). */
const HIDDEN_BOARDS = ['prescriptions', 'insurers'];
function unionById(older, newer) {
  const ids = new Map();
  [...(Array.isArray(older) ? older : []), ...(Array.isArray(newer) ? newer : [])].forEach((r) => {
    if (!r || typeof r !== 'object' || !r.id) return;
    const id = String(r.id);
    const prev = ids.get(id);
    if (!prev || (+r.updatedAt || 0) >= (+prev.updatedAt || 0)) ids.set(id, r);
  });
  return [...ids.values()].sort((a, b) => (+b.updatedAt || 0) - (+a.updatedAt || 0)).slice(0, 500);
}
const PARTIAL = {
  /* Contacts des clients, pièces des voyageurs et liens « gérer ma réservation » :
     voir functions/api/_reservations-view.js. */
  reservations: { hide: hideReservations, keep: keepReservations },
  workspaces: {
    hide(doc) {
      if (!doc || typeof doc !== 'object' || !doc.records || typeof doc.records !== 'object') return doc;
      const records = { ...doc.records };
      HIDDEN_BOARDS.forEach((nav) => { if (nav in records) records[nav] = []; });
      return { ...doc, records };
    },
    keep(prev, next) {
      if (!next || typeof next !== 'object') return next;
      const before = (prev && prev.records) || {};
      const records = { ...((next.records && typeof next.records === 'object') ? next.records : {}) };
      HIDDEN_BOARDS.forEach((nav) => {
        const merged = unionById(before[nav], records[nav]);
        if (merged.length || nav in records || nav in before) records[nav] = merged;
      });
      return { ...next, records };
    },
  },
  costs: {
    hide(doc) {
      if (!doc || typeof doc !== 'object') return doc;
      return { ...doc, charges: [], targets: {} };
    },
    keep(prev, next) {
      if (!next || typeof next !== 'object') return next;
      const p = prev && typeof prev === 'object' ? prev : {};
      return { ...next, charges: Array.isArray(p.charges) ? p.charges : [], targets: (p.targets && typeof p.targets === 'object') ? p.targets : {} };
    },
  },
};

/* A store's briefing holds that store's days only. Each day names the venue it
 * was computed for, and that venue is the slug the browser syncs under; a day
 * naming another venue is another store's (maison-121 carried 26 of
 * la-maison-en-vogue's, 2026-09-26). Dropped on the way in and on the way out,
 * so a device still running the old briefing.js cannot file them back. */
export function ownBriefingDays(doc, merchant) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.days)) return doc;
  return { ...doc, days: doc.days.filter((d) => d && typeof d === 'object' && d.venue === merchant) };
}
/* Ce qu'un magasin EN ATTENTE d'activation peut déjà enregistrer : sa
 * configuration, rien de ce qui compte de l'argent ou des heures. L'assistant
 * d'installation monte l'équipe, le plan de salle, les services, les chambres,
 * les prix ; le serveur refusait toute écriture `store_docs` d'un magasin en
 * attente, si bien que ces fiches restaient sur l'appareil de l'installation
 * (marquées non synchronisées) et manquaient sur tous les autres jusqu'à
 * l'activation. Décision du propriétaire (2026-10-13) : la configuration passe,
 * et seulement depuis la session du compte propriétaire ou un opérateur nommé ;
 * une caisse appairée n'écrit toujours rien avant l'activation. Ventes,
 * pointage, paie, avoirs, retours, réservations restent bloqués. */
const PENDING_SETUP_FEATURES = new Set([
  'team', 'floorplan', 'services', 'rooms', HOTEL_UNITS_FEATURE, 'kds',
  'foodtrade', 'discountpolicy', 'fidelity', 'recipes', 'costs', 'promotions', 'suppliers',
]);
const OWNER_EDIT_FEATURES = new Set([HOTEL_UNITS_FEATURE, ECONOMAT_CATALOGUE_FEATURE, 'discountpolicy', 'monthreport', 'foodtrade', 'guestpage', STOREFRONT_FEATURE]);

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

async function isHotelMerchant(env, merchant) {
  try {
    const row = await env.DB.prepare('SELECT type FROM merchant_config WHERE merchant=?')
      .bind(merchant)
      .first();
    return isHotelMerchantType(row && row.type);
  } catch (_) {
    return false;
  }
}

/* Pierres tombales du document `team` : [{ id, ts }]. Le navigateur fusionne par
 * UNION de membres, donc un appareil resté sur l'ancien roster (ou une version
 * d'assets/team.js qui ignore `removed`) renvoyait le salarié supprimé, et le
 * serveur le réinscrivait dans `employee-access` : la personne retirée gardait
 * sa connexion à l'app employé. Le serveur garde donc l'union des deux listes et
 * retire ces ids du roster entrant, quel que soit le client qui écrit. */
function keepTeamTombstones(previous, incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return incoming;
  const byId = new Map();
  const add = (list) => (Array.isArray(list) ? list : []).forEach((r) => {
    const id = r && typeof r.id === 'string' ? r.id.slice(0, 96) : '';
    if (!id) return;
    const ts = Number(r.ts) || 0;
    if (!byId.has(id) || ts > byId.get(id).ts) byId.set(id, { id, ts });
  });
  add(previous && previous.removed);
  add(incoming.removed);
  if (!byId.size) return incoming;
  const removed = [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, 200);
  const gone = new Set(removed.map((r) => r.id));
  const members = (Array.isArray(incoming.members) ? incoming.members : [])
    .filter((m) => !(m && gone.has(String(m.id || ''))));
  return { ...incoming, members, removed };
}

/* Un salarié retiré pendant son service gardait son pointage OUVERT. Plus
 * personne ne pouvait le clore : son app employé est déconnectée, la caisse ne
 * l'affiche plus. Et /api/team/live comptait ses heures jusqu'à « maintenant »,
 * à chaque lecture, pour toujours. Le retrait clôt donc le pointage à l'heure
 * du retrait, quel que soit l'appareil qui l'a fait, et le marque comme tel.
 * Une pause en cours devient une pause close au même instant. Idempotent : un
 * pointage déjà clos n'est jamais touché. */
async function closeRemovedShifts(env, merchant, removed) {
  const at = new Map();
  (Array.isArray(removed) ? removed : []).forEach((r) => {
    const id = r && typeof r.id === 'string' ? r.id : '';
    const ts = Number(r && r.ts) || 0;
    if (id && ts) at.set(id, ts);
  });
  if (!at.size) return;
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await env.DB.prepare("SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = 'attendance'")
      .bind(merchant).first();
    if (!row) return;
    let doc = null;
    try { doc = JSON.parse(row.data || '{}'); } catch (_) { return; }
    const entries = Array.isArray(doc && doc.entries) ? doc.entries : [];
    const now = Date.now();
    let changed = false;
    const next = entries.map((entry) => {
      if (!entry || entry.outTs || !entry.inTs) return entry;
      const ts = at.get(String(entry.memberId || entry.staffId || ''));
      if (!ts) return entry;
      // Une horloge d'appareil en retard ne rouvre rien : jamais avant l'entrée,
      // jamais après maintenant.
      const end = Math.max(Number(entry.inTs) || 0, Math.min(ts, now));
      const closed = { ...entry, outTs: end, closedBy: 'removal' };
      if (entry.pauseTs) {
        const from = Math.min(Number(entry.pauseTs) || end, end);
        closed.breaks = [...(Array.isArray(entry.breaks) ? entry.breaks : []), { inTs: from, outTs: end }];
        closed.pauseTs = 0;
      }
      changed = true;
      return closed;
    });
    if (!changed) return;
    const rev = Number(row.rev) || 0;
    const result = await env.DB.prepare(
      "UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = 'attendance' AND rev = ?"
    ).bind(JSON.stringify({ ...doc, entries: next }), rev + 1, now, merchant, rev).run();
    if (Number(result && result.meta && result.meta.changes) > 0) { await poke(env, merchant, 'attendance'); return; }
  }
}

async function employeeAccessFromTeam(env, team, merchant) {
  const members = Array.isArray(team && team.members) ? team.members : [];
  let previous = { members: [] };
  try {
    const row = await env.DB.prepare(
      "SELECT data FROM store_docs WHERE merchant = ? AND feature = 'employee-access'"
    ).bind(merchant).first();
    if (row && row.data) {
      const parsed = JSON.parse(row.data);
      if (parsed && Array.isArray(parsed.members)) previous = parsed;
    }
  } catch (_) { return null; }
  const previousById = new Map(previous.members.map((member) => [String(member && member.id || ''), member]));
  const seen = new Set();
  const access = [];
  const plans = [];
  for (const member of members) {
    if (!member) continue;
    const id = String(member.id || '').trim().slice(0, 96);
    const email = String(member.email || '').trim().toLocaleLowerCase('en').slice(0, 254);
    const pin = canonicalCode(member);
    if (!id || !/^\S+@\S+\.\S+$/.test(email) || !/^\d{4}$/.test(pin)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const prior = previousById.get(id);
    const priorPin = canonicalCode(prior);
    const priorVersion = Math.max(0, Math.round(Number(prior && prior.authVersion) || 0));
    const revision = await planEmployeeAuth(
      env, merchant, id, pin, priorVersion + (prior && priorPin !== pin ? 1 : 0)
    );
    if (!revision.ok) return null;
    plans.push(revision);
    access.push(normalizeMember({
      id,
      firstName: String(member.firstName || '').trim().slice(0, 60),
      lastName: String(member.lastName || '').trim().slice(0, 60),
      email,
      pinCode: pin,
      authVersion: revision.version,
      function: String(member.function || '').trim().slice(0, 60),
      department: String(member.department || '').trim().slice(0, 60),
      venueSlug: merchant,
    }));
  }
  return { doc: { members: access }, plans };
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
  if ((feature === HOTEL_UNITS_FEATURE || feature === ECONOMAT_CATALOGUE_FEATURE)
      && !(await isHotelMerchant(env, merchant))) {
    return json({ feature, merchant, data: null, rev: 0 });
  }

  if (feature === 'verticalops') return getVerticalOps(request, env, merchant);

  try {
    const redact = REDACT[feature] || (PARTIAL[feature] && PARTIAL[feature].hide);
    /* Revalidation (docs/ops/CPU.md, "Store revalidation"). A document whose
     * answer is the same for every caller allowed to read it gets an ETag
     * built from what the database says about it. The browser sends it back
     * by itself on the next poll; when nothing moved, the row comes back
     * without its data and the answer is a 304, so a 250 KB receipt logo is
     * neither read, parsed nor re-encoded. Redacted and partial documents
     * depend on who asks, so they keep a full answer every time. */
    /* Le carnet de réservations est relu à chaque sondage du tableau de bord :
       son propriétaire garde la revalidation (la vue complète est la même pour
       tous ceux qui le tiennent) ; la vue expurgée, elle, ne porte jamais d'ETag. */
    const editor = redact ? await editsRoster(request, env, merchant) : true;
    const cacheable = !redact || (feature === 'reservations' && editor);
    const known = cacheable ? storeTag(request.headers.get('If-None-Match')) : null;
    const row = known && known.merchant === merchant && known.feature === feature
      ? await env.DB.prepare(
        'SELECT rev, updated_ts, length(data) AS bytes, CASE WHEN rev = ? AND updated_ts = ? AND length(data) = ? THEN NULL ELSE data END AS data FROM store_docs WHERE merchant = ? AND feature = ?'
      ).bind(known.rev, known.updated, known.bytes, merchant, feature).first()
      : await env.DB.prepare(
        'SELECT data, rev, updated_ts, length(data) AS bytes FROM store_docs WHERE merchant = ? AND feature = ?'
      ).bind(merchant, feature).first();
    if (!row) return json({ feature, merchant, data: null, rev: 0 });
    const tag = cacheable ? storeEtag(merchant, feature, row) : null;
    const cacheHeaders = tag ? { 'Cache-Control': 'private, no-cache', ETag: tag } : undefined;
    if (tag && row.data == null && known && known.rev === Number(row.rev) && known.updated === Number(row.updated_ts) && known.bytes === Number(row.bytes)) {
      return new Response(null, { status: 304, headers: cacheHeaders });
    }
    let data = null;
    try { data = JSON.parse(row.data); } catch (_) { data = null; }
    if (feature === 'briefing') data = ownBriefingDays(data, merchant);
    const safe = (redact && !editor) ? redact(data) : data;
    return json({ feature, merchant, data: safe, rev: row.rev || 0, updated_ts: row.updated_ts || 0 }, 200, cacheHeaders);
  } catch (_) {
    // Table absente (migration pas encore passée) → neutre, surtout pas une
    // erreur : le client doit continuer à fonctionner en local.
    return json({ feature, merchant, data: null, rev: 0, unmigrated: true });
  }
}

/* Documents d'un autre établissement, identifiés à l'octet près. Le
 * 26/09/2026, deux onglets God Mode partageant une clé locale ont déposé chez
 * Pasta Corner les coûts, recettes et réservations d'Amira Café (clients
 * compris). Supprimés du serveur, ils revenaient à la synchronisation suivante
 * d'un appareil de Pasta Corner qui en gardait la copie. Refuser ces
 * empreintes précises, et elles seules, fait converger l'appareil : il reçoit
 * foreign-document et abandonne sa copie (assets/cloud-doc.js). */
const QUARANTINE = {
  'pasta-corner': {
    costs: ['026a88027646ab906ce0960fd969dc1b529a856a05c0c99c108409fd30f6736a'],
    recipes: ['ee5325713f3ca61291f472fda1f0cf0f93f449ea9f4f00c6f3436a574434d870'],
    reservations: ['984743cb5a51f1495e64e8b83fe79b8d8f7276357dc9a59f0c30fec6adb5d9f3'],
  },
};
export async function quarantined(merchant, feature, text) {
  const list = QUARANTINE[merchant] && QUARANTINE[merchant][feature];
  if (!list || !list.length) return false;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return list.includes(hex);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }

  const feature = featureOf(body && body.feature);
  if (!feature) return json({ error: 'unknown-feature' }, 400);

  let merchant = await tenantFor(request, env, body && body.merchant, { strict: true });
  if (!merchant && PENDING_SETUP_FEATURES.has(feature)) {
    const setup = await tenantFor(request, env, body && body.merchant, { strict: true, allowPending: true });
    if (setup && await storeSubscriptionPending(env, setup) && await editsRoster(request, env, setup)) merchant = setup;
  }
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
  if (OWNER_EDIT_FEATURES.has(feature) && !(await editsRoster(request, env, merchant))) {
    return json({ error: 'forbidden-feature', feature }, 403);
  }
  /* Voir PARTIAL : une surface qui ne lit qu'une vue du document ne reçoit que
     cette vue, même dans une réponse de conflit, et ne peut pas effacer le reste. */
  const partial = PARTIAL[feature] && !(await editsRoster(request, env, merchant)) ? PARTIAL[feature] : null;
  const view = (doc) => (partial ? partial.hide(doc) : doc);
  if ((feature === HOTEL_UNITS_FEATURE || feature === ECONOMAT_CATALOGUE_FEATURE)
      && !(await isHotelMerchant(env, merchant))) {
    return json({ error: 'hotel-only' }, 403);
  }

  if (feature === 'verticalops' && body.action === 'credit-book-refund') return refundCreditBook(request, env, merchant, body);

  const raw = (body && body.data) || null;

  // Garde-fou de forme. Un document qui n'est pas celui qu'on croit écraserait
  // silencieusement le vrai. Un document honnêtement vide (le commerçant a tout
  // supprimé) porte quand même ses clés, donc il passe.
  if (!shapeOk(feature, raw)) return json({ error: 'shape-mismatch', expected: feature }, 409);
  if (feature === 'discountpolicy') {
    const p = raw.percentages;
    if (!Array.isArray(p) || p.length < 1 || p.length > 8
      || p.some(n => !Number.isInteger(n) || n < 1 || n > 100)
      || new Set(p).size !== p.length) return json({ error: 'bad-discount-policy' }, 400);
  }

  /* Le plan de salle s'écrit aussi depuis une caisse appairée et se lit en HTML
   * chez le propriétaire : ids et couleurs ramenés à ce qu'un attribut peut
   * porter sans danger (functions/api/_rules-floorplan-clean.js). */
  if (feature === 'floorplan') cleanFloorplan(raw);
  const clean = bounded(feature === 'guestpage' ? cleanGuestDoc(raw)
    : feature === STOREFRONT_FEATURE ? cleanStorefront(raw, Date.now()) : raw, FEATURES[feature].maxStr);
  // Refus plutôt que troncature : voir la note de `bounded`. Le client garde sa
  // copie locale — il ne perd rien, il n'a simplement pas de copie serveur.
  if (!clean.ok) return json({ error: 'too-large', why: clean.why }, 413);

  let text = JSON.stringify(clean.value);
  let compacted = false; // pressing-orders : des bons viennent de passer en archive, le vivant peut en devenir vide
  /* pressing-orders : le contrôle exact vient APRÈS l'archivage des bons remis depuis plus de
     90 jours (voir plus bas) ; ici on ne coupe que ce qui dépasse largement le plafond. */
  if (text.length > FEATURES[feature].max * (feature === 'pressing-orders' ? 2 : 1)) {
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
  let mine = null;
  try { mine = current ? JSON.parse(current.data) : null; } catch (_) { mine = null; }
  /* Le carnet de crédit a son propre document (functions/api/_credit-book-store.js).
   * `book` est le carnet enregistré : la ligne creditbook, ou à défaut la copie
   * encore rangée dans verticalops. */
  let book = null;
  if (feature === 'verticalops') {
    try { book = await readBook(env, merchant, mine); }
    catch (_) { return json({ error: 'credit-book-unavailable' }, 503); }
  }
  const bookChanged = feature === 'verticalops'
    && JSON.stringify(book.carnet || []) !== JSON.stringify(legacyBook(clean.value) || []);
  if (bookChanged) {
    const session = await activeAccountSession(request, env);
    const owner = session && await env.DB.prepare('SELECT account_id FROM merchant_config WHERE merchant = ?').bind(merchant).first();
    if (!(session && owner?.account_id === session.aid) && !(await isTillFor(request, env, merchant))) {
      return json({ error: 'forbidden-credit-book' }, 403);
    }
  }


  if (feature === 'monthreport') {
    const validation = validateMonthReportPolicy(clean.value, mine);
    if (!validation.ok) return json({ error: validation.error, feature }, 400);
  }

  if (feature === 'rooms' && current) {
    const currentCheck = validateRoomsDocument(mine, mine);
    if (!currentCheck.ok) return json({ error: currentCheck.error, feature }, 503);
    // Room audit history is server-owned. A generic document save may update
    // room metadata, but it cannot forge, edit, or remove historical entries.
    clean.value.roomAudits = Array.isArray(mine.roomAudits)
      ? JSON.parse(JSON.stringify(mine.roomAudits)) : [];
  } else if (feature === 'rooms') {
    clean.value.roomAudits = [];
  }

  // Écriture basée sur une révision périmée : on ne l'applique PAS. On renvoie la
  // copie serveur pour que le client fusionne et repropose. Sans ça, deux
  // appareils ouverts en même temps se recouvrent l'un l'autre.
  /* Le carnet passe avant la révision de verticalops : ses lignes ne font que
   * s'ajouter, une caisse qui n'a pas vu celles d'une autre n'est donc pas en
   * conflit avec elle. Une modification d'un autre métier ne fait plus échouer
   * une dette notée au comptoir. */
  let bookSaved = null;
  if (feature === 'verticalops') {
    try {
      bookSaved = await commitBook(env, merchant, mine, legacyBook(clean.value) || [], {
        now,
        /* Les carnets pas encore déménagés vivent encore dans verticalops : la
         * garde cherche dans les deux. */
        guard: async (next, cur, bookText) => (await foreignCopy(env, { table: 'store', merchant, feature: BOOK_FEATURE, next, current: cur, text: bookText }))
          || foreignCopy(env, { table: 'store', merchant, feature: 'verticalops', next, current: cur, text: bookText }),
        keepHistory: () => keepHistory(env, 'store', merchant, BOOK_FEATURE),
      });
    } catch (_) { return json({ error: 'credit-book-unavailable' }, 503); }
    if (!bookSaved.ok) return json({ error: bookSaved.error, feature }, bookSaved.status);
    if (bookSaved.changed) await poke(env, merchant, feature);
  }

  /* Un appareil dont le carnet est en retard n'est pas en conflit : ses lignes
   * neuves sont ajoutées ci-dessus, les autres restent, et sa prochaine lecture
   * voit le carnet complet (l'ETag de verticalops couvre le carnet). */
  if (serverRev && baseRev !== serverRev) {
    const latest = feature === 'verticalops' && bookSaved.exists ? withBook(mine, bookSaved.carnet) : mine;
    return json({ error: 'stale', feature, rev: serverRev, data: view(latest) }, 409);
  }

  /* Le carnet est écrit dans son document : verticalops ne le garde plus.
   * Tant qu'aucune ligne creditbook n'existe (commerçant sans client à crédit),
   * la copie reste où l'appareil l'a écrite. */
  if (feature === 'verticalops' && bookSaved.exists) {
    clean.value = withoutBook(clean.value);
    text = JSON.stringify(clean.value);
    /* Rien d'autre n'a bougé : pas de nouvelle révision de verticalops, sinon
     * chaque dette notée redeviendrait un conflit pour les autres appareils. */
    if (current && text === JSON.stringify(mine)) {
      return json({ ok: true, feature, merchant, rev: serverRev, updated_ts: now, bytes: text.length, ...(bookSaved.creditConflicts?.length ? { creditConflicts: bookSaved.creditConflicts } : {}) });
    }
  }

  if (partial) {
    clean.value = partial.keep(mine, clean.value);
    text = JSON.stringify(clean.value);
  }
  /* After the merge, not before: two offline tills each send only their own
     settlement, and only the combined book shows the same debt paid twice. */
  if (partial && text.length > FEATURES[feature].max) {
    return json({ error: 'too-large', why: 'byte-size', max: FEATURES[feature].max }, 413);
  }

  if (feature === 'pressing-orders') {
    if (serverRev && (!mine || typeof mine !== 'object' || Array.isArray(mine) || !Array.isArray(mine.orders))) {
      return json({ error: 'corrupt-document', feature }, 503);
    }
    const snapshotError = validatePressingSnapshot(mine, clean.value);
    if (snapshotError) return json({ error: snapshotError.error, feature, id: snapshotError.id }, 409);
    const identity = pressingIdentityConflict(mine, clean.value);
    if (identity) return json({ error: 'pressing-order-identity-conflict', feature, id: identity.id, rev: serverRev, data: view(mine) }, 409);
    const tills = pressingTills(mine, clean.value);
    if (tills.conflict) return json({ error: 'pressing-till-letter-taken', feature, letter: tills.conflict.letter, rev: serverRev, data: view(mine) }, 409);
    if (Object.keys(tills.tills).length || clean.value.tills !== undefined) clean.value.tills = tills.tills;
    clean.value = preservePressingCancellations(mine, clean.value);
    clean.value = freezePressingNotifications(mine, clean.value, now);
    /* Les bons remis depuis plus de 90 jours passent en archive (une ligne par semaine) avant la
       vérification de taille. Un bon n'est retiré qu'une fois sa copie d'archive confirmée. */
    const kept = await archiveFromSnapshot(env, merchant, clean.value, mine, now);
    if (kept.size) compacted = true;
    if (kept.size) clean.value = { ...clean.value, orders: clean.value.orders.filter((o) => !(o && kept.has(String(o.id)) && isArchivable(o, now))) };
    const conflict = pressingRackConflict(clean.value);
    if (conflict) return json({ error: 'rack-conflict', feature, ...conflict }, 409);
    text = JSON.stringify(clean.value);
    if (text.length > FEATURES[feature].max) {
      return json({ error: 'too-large', why: 'byte-size', max: FEATURES[feature].max }, 413);
    }
  }

  if (feature === 'reservations') {
    try { await validateCommercialSync(env, merchant, mine, clean.value); }
    catch (e) { return json({ error: e?.code || 'commercial-unavailable', feature }, e?.code === 'commercial-stays-use-api' ? 409 : 503); }
    /* /api/booking et /api/hotel/stays refusent tous deux d'attribuer une
       ressource déjà prise. Ce push générique ne vérifiait rien de tel : un
       tableau de bord qui remontait son document pendant qu'une cliente
       réservait en ligne franchissait la garde de révision, la fusion réunissait
       les deux lignes actives, et la même chambre partait deux fois. */
    const originalBookings = new Map((mine?.bookings || []).map(row => [row.id, row]));
    for (const row of clean.value.bookings || []) {
      const expectation = originalBookings.get(row.id)?.depositExpectation;
      if (expectation) row.depositExpectation = expectation;
      else delete row.depositExpectation;
    }
    /* Plafond de lignes : le passé le plus ancien part d'abord, jamais une réservation à venir ;
       s'il ne reste que de l'avenir, l'écriture est refusée (413) au lieu de perdre une ligne. */
    if (Array.isArray(clean.value.bookings)) {
      const capped = capBookings(clean.value.bookings, Date.now());
      if (capped.full) return json({ error: 'too-large', why: 'bookings-cap', max: BOOKING_CAP, feature }, 413);
      clean.value.bookings = capped.bookings;
    }
    text = JSON.stringify(clean.value);
    const capacity = serviceCapacityConflict(clean.value);
    if (capacity) return json({ error: 'slot-unavailable', feature, serviceId: capacity }, 409);
    const doubled = reservationOverlapConflict(mine, clean.value);
    if (doubled) return json({ error: 'resource-double-booked', feature, ...doubled }, 409);
  }

  if ('team' === feature) {
    clean.value = keepTeamTombstones(mine, clean.value);
    /* team.hoursCredited (employee/_attendance.js) marque les services crédités : un appareil
       qui réécrit l'équipe sans elle ferait payer deux fois un départ rejoué. Union gardée. */
    const serverMarks = mine && mine.hoursCredited && typeof mine.hoursCredited === 'object' && !Array.isArray(mine.hoursCredited) ? mine.hoursCredited : null;
    if (serverMarks && clean.value && typeof clean.value === 'object') {
      const sent = clean.value.hoursCredited && typeof clean.value.hoursCredited === 'object' && !Array.isArray(clean.value.hoursCredited) ? clean.value.hoursCredited : {};
      clean.value.hoursCredited = { ...sent, ...serverMarks };
    }
    if (Array.isArray(clean.value.members)) clean.value.members = clean.value.members.map(normalizeMember);
    text = JSON.stringify(clean.value);
  }

  if (feature === HOTEL_UNITS_FEATURE) {
    const checked = validateHotelUnits(clean.value, mine);
    if (!checked.ok) {
      return json({ error: checked.error, detail: checked.detail }, checked.status || 422);
    }
    clean.value = checked.value;
    let drained;
    try {
      drained = await hotelUnitDeactivationBlockers(env.DB, merchant, mine, clean.value);
    } catch (_) {
      return json({ error: 'unmigrated' }, 503);
    }
    if (!drained.ok) {
      return json({ error: drained.error, blockers: drained.blockers }, drained.status || 409);
    }
    text = JSON.stringify(clean.value);
  }
  if (feature === ECONOMAT_CATALOGUE_FEATURE) {
    const checked = validateEconomatCatalogue(clean.value);
    if (!checked.ok) return json({ error: checked.error }, checked.status || 422);
    clean.value = checked.value;
    text = JSON.stringify(clean.value);
  }
  if (feature === 'rooms') {
    const checked = validateRoomsDocument(clean.value, mine, { checkDuplicateNumbers: true });
    if (!checked.ok) return json({ error: checked.error, detail: checked.detail, roomId: checked.roomId }, checked.status || 422);
    clean.value = checked.value;
    text = JSON.stringify(clean.value);
    if (text.length > FEATURES[feature].max) return json({ error: 'too-large', why: 'byte-size', max: FEATURES[feature].max }, 413);
  }
  if (feature === 'briefing') {
    clean.value = cleanBriefingSettings(ownBriefingDays(clean.value, merchant));
    text = JSON.stringify(clean.value);
  }
  if (feature === PRINT_HUB_FEATURE) {
    const claim = validateHubClaim(mine, clean.value, now);
    if (!claim.ok) return json({ error: claim.error, feature, holder: claim.holder || null }, claim.status || 409);
    /* L'expiration est réécrite ici, avec l'horloge du serveur : une tablette
       qui retarde s'attribuerait sinon un bail déjà mort, ou éternel. */
    clean.value = claim.value;
    text = JSON.stringify(clean.value);
  }

  /* Les enregistrements d'un autre établissement ne deviennent jamais les
   * nôtres, quel que soit le chemin qui les a apportés (functions/api/_tenant-guard.js).
   * L'appareil reçoit foreign-document et abandonne sa copie (assets/cloud-doc.js). */
  const foreign = await quarantined(merchant, feature, text) || await foreignCopy(env, { table: 'store', merchant, feature, next: clean.value, current: mine, text });
  if (foreign) {
    return json({ error: 'foreign-document', feature, rev: serverRev, data: view(mine) }, 409);
  }

  // Un premier envoi VIDE ne doit pas effacer un document déjà en ligne : c'est
  // la signature d'un navigateur neuf qui pousse avant d'avoir hydraté.
  /* Rendre le bail du hub EST un document vide : c'est le geste normal quand
     le comptoir cesse d'imprimer. validateHubClaim a déjà vérifié que celui qui
     le rend est bien celui qui le tient. */
  if (serverRev && !compacted && isEmptyDoc(clean.value) && feature !== PRINT_HUB_FEATURE
      && !(feature === 'monthreport' && Object.prototype.hasOwnProperty.call(clean.value, 'accountantEmail'))) {
    if (!isEmptyDoc(mine)) {
      return json({ error: 'refused-empty', feature, rev: serverRev, data: view(mine) }, 409);
    }
  }

  if (current) await keepHistory(env, 'store', merchant, feature);

  const rev = serverRev + 1;
  try {
    if (feature === 'rooms') {
      const writeDoc = serverRev
        ? env.DB.prepare('UPDATE store_docs SET data=?,rev=?,updated_ts=? WHERE merchant=? AND feature=? AND rev=?')
          .bind(text, rev, now, merchant, feature, serverRev)
        : env.DB.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?) ON CONFLICT(merchant,feature) DO NOTHING')
          .bind(merchant, feature, text, rev, now);
      const written = await writeDoc.run();
      if (Number(written.meta?.changes) !== 1) {
        let latest = null;
        try { latest = await env.DB.prepare('SELECT data, rev FROM store_docs WHERE merchant=? AND feature=?').bind(merchant, feature).first(); } catch (_) {}
        let latestData = null;
        try { latestData = latest?.data ? JSON.parse(latest.data) : null; } catch (_) {}
        return json({ error: 'stale', feature, rev: latest?.rev || serverRev, data: latestData }, 409);
      }
      await poke(env, merchant, feature);
      return json({ ok: true, feature, merchant, rev, updated_ts: now, bytes: text.length, data: clean.value });
    }
    /* COMPARE-AND-SWAP POUR TOUS LES DOCUMENTS. Le contrôle `baseRev !== serverRev`
     * plus haut est fait sur une LECTURE : entre elle et l'écriture, un second
     * appareil peut passer. Seuls quelques documents (CAS_FEATURES, le bail du
     * hub, pressing-orders, rooms) écrivaient avec `WHERE rev = ?`; tous les
     * autres finissaient en upsert aveugle, et la seconde des deux sauvegardes
     * simultanées écrasait la première sans erreur ni conflit. L'écriture porte
     * maintenant sa révision d'origine : zéro ligne touchée = quelqu'un nous a
     * devancé, on rend 409 avec la copie serveur et le client fusionne. */
    const writeDoc = current
      ? env.DB.prepare('UPDATE store_docs SET data=?,rev=?,updated_ts=? WHERE merchant=? AND feature=? AND rev=?')
        .bind(text, rev, now, merchant, feature, serverRev)
      : env.DB.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?) ON CONFLICT(merchant,feature) DO NOTHING')
        .bind(merchant, feature, text, rev, now);
    const lost = async () => {
      let latest = null;
      try { latest = await env.DB.prepare('SELECT data, rev FROM store_docs WHERE merchant=? AND feature=?').bind(merchant, feature).first(); } catch (_) {}
      let latestData = mine;
      try { latestData = latest && latest.data ? JSON.parse(latest.data) : latestData; } catch (_) {}
      return json({ error: 'stale', feature, rev: (latest && latest.rev) || serverRev, data: view(latestData) }, 409);
    };
    /* D1 rend toujours `meta.changes`. Une base de test qui ne le rend pas n'est un
     * conflit que pour les documents d'arbitrage (CAS_FEATURES), qui l'étaient déjà. */
    const notApplied = (r) => {
      const c = r && r.meta && r.meta.changes;
      return typeof c === 'number' ? c !== 1 : CAS_FEATURES.has(feature);
    };
    if (feature === 'team') {
      /* Révisions de connexion écrites dans ce lot, gardées par l'écriture du
       * document team (_employee-auth.js) : un enregistrement qui perd sa
       * révision ne monte plus celle d'un employé, et une autre sauvegarde qui
       * les a bougées entre-temps fait recommencer le calcul. */
      let results = null;
      for (let attempt = 0; attempt < 3 && !results; attempt++) {
        let fingerprint;
        try { fingerprint = await authFingerprint(env, merchant); }
        catch (_) { return json({ error: 'employee-access-unavailable' }, 503); }
        const built = await employeeAccessFromTeam(env, clean.value, merchant);
        if (!built) return json({ error: 'employee-access-unavailable' }, 503);
        const accessText = JSON.stringify(built.doc);
        /* Le miroir d'accès n'est écrit QUE si le document team vient d'être écrit
         * (révision, instant ET contenu sont les nôtres) : un lot D1 est atomique mais ne s'arrête pas
         * sur une ligne à zéro changement, et un team périmé aurait sinon réécrit
         * les codes de connexion des employés. */
        const writeAccess = env.DB.prepare(
          `INSERT INTO store_docs (merchant, feature, data, rev, updated_ts)
           SELECT ?, 'employee-access', ?, 1, ?
            WHERE EXISTS (SELECT 1 FROM store_docs WHERE merchant = ? AND feature = 'team' AND rev = ? AND updated_ts = ? AND data = ?)
           ON CONFLICT(merchant, feature) DO UPDATE SET
             data = excluded.data, rev = store_docs.rev + 1, updated_ts = excluded.updated_ts`
        ).bind(merchant, accessText, now, merchant, rev, now, text);
        const guard = { sql: "EXISTS (SELECT 1 FROM store_docs WHERE merchant = ? AND feature = 'team' AND rev = ? AND updated_ts = ? AND data = ?)", binds: [merchant, rev, now, text] };
        try {
          results = (await env.DB.batch([authSentinel(env, merchant, fingerprint), writeDoc, writeAccess,
            ...built.plans.map((plan) => writeEmployeeAuth(env, merchant, plan, now, guard))])).slice(1);
        } catch (error) {
          let moved = authMoved(error);
          if (!moved) { try { moved = (await authFingerprint(env, merchant)) !== fingerprint; } catch (_) {} }
          if (!moved) throw error;
        }
      }
      if (!results) return lost();
      if (notApplied(results && results[0])) return lost();
      try { await closeRemovedShifts(env, merchant, clean.value.removed); } catch (_) {}
    } else {
      const written = await writeDoc.run();
      if (notApplied(written)) return lost();
    }
  } catch (_) { return json({ error: 'write-failed' }, 500); }

  /* Écriture faite : on réveille les autres appareils du commerçant pour qu'ils
   * relisent maintenant plutôt qu'au prochain tour d'horloge. Attendu plutôt que
   * détaché — sans binding c'est un simple test de vérité, et avec binding
   * l'aller-retour reste dans le même centre de données, à côté des requêtes D1
   * qu'on vient déjà de faire. */
  await poke(env, merchant, feature);

  return json({ ok: true, feature, merchant, rev, updated_ts: now, bytes: text.length, ...(bookSaved?.creditConflicts?.length ? { creditConflicts: bookSaved.creditConflicts } : {}) });
}
