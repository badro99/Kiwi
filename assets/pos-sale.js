/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · POS SALE — le journal partagé des quinze métiers.
 * ---------------------------------------------------------------------------
 * Chaque module assets/pos-<métier>.js encaissait dans une variable de closure
 * et rien d'autre. Une boulangerie vendait toute la journée : le compteur du
 * comptoir montait, le tableau de bord de la patronne restait à 0 MAD, et le
 * moindre rechargement (mise à jour PWA, batterie, onglet tué par iOS) effaçait
 * la recette. Seule la boutique (pos-boutique.js) persistait, et la caisse
 * restaurant via recordSale() dans kiwi-caisse.html.
 *
 * Ce module est le point de passage unique. Un métier appelle :
 *
 *   KiwiPosSale.record('epicerie', {
 *     total: 84.5, method: 'especes', label: 'Pain +3 art.', ref: 'T-642',
 *     lines: [{ name, qty, total }],           // facultatif
 *   });
 *
 * et il obtient DEUX choses, celles qui manquaient :
 *
 *  1. LE SERVEUR — miroir vers /api/sale via KiwiLive.postSale(). C'est ce qui
 *     fait apparaître la vente sur « En direct » et dans les KPI du tableau de
 *     bord. File d'attente hors-ligne comprise (live-link.js) : une vente prise
 *     sans réseau part dès le retour du réseau, elle n'est jamais perdue.
 *  2. LE JOURNAL LOCAL — kiwi:posDay:<métier>, filtré sur aujourd'hui. C'est ce
 *     qui permet au terminal de retrouver SA journée après un rechargement, sans
 *     attendre le serveur. Préfixe `kiwi:` : purgé au changement de compte
 *     (TENANT_PREFIXES dans identity.js), et le filtre « aujourd'hui » fait
 *     basculer le compteur tout seul à minuit.
 *
 * LA DÉMO N'ÉCRIT RIEN. pvReal() faux ⇒ record() ne persiste pas et ne poste
 * pas : les quinze démos gardent exactement le comportement d'avant, chiffres
 * d'amorçage compris. C'est volontaire — la démo doit rester identique au bit
 * près, et une démo qui posterait des ventes polluerait les livres d'un vrai
 * commerçant signé sur le même navigateur.
 *
 * Un encaissement différé (« payer plus tard », méthode null, montant nul) n'est
 * PAS une recette : record() le refuse. Le module rappellera quand l'argent
 * rentre vraiment, au moment du solde.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PREFIX = 'kiwi:posDay:';
  var MAX_ROWS = 800;          /* garde-fou mémoire : ~une journée très chargée */

  function paired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  /* Vrai commerce = session hébergée OU terminal appairé. Même règle que les
     modules métier (pvReal) et que pos-boutique.js (isDemoStore), pour qu'un
     seul et même terminal ne soit jamais « réel » ici et « démo » là-bas. */
  function isReal() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!paired(); }
    catch (_) { return !!paired(); }
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function isToday(ts) {
    var d = new Date(ts);
    return !isNaN(d) && sameDay(d, new Date());
  }

  function key(vertical) { return PREFIX + String(vertical || 'pos'); }

  function read(vertical) {
    /* La démo ne LIT pas le journal, pas seulement elle n'y écrit pas. Un
       terminal qui a servi à un vrai commerce puis revient en démo (démo de
       vente, appairage retiré, session fermée) retrouvait sinon la recette
       réelle ajoutée par-dessus les chiffres d'amorçage : 2 831 MAD au lieu
       des 2 560 MAD attendus. La démo doit rester identique au bit près,
       quoi qu'il traîne dans le stockage. */
    if (!isReal()) return [];
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(key(vertical)) || '[]'); } catch (_) { return []; }
    if (!Array.isArray(raw)) return [];
    /* Le journal d'hier n'est pas le compteur d'aujourd'hui. */
    return raw.filter(function (s) { return s && +s.total > 0 && isToday(s.ts); });
  }
  function write(vertical, rows) {
    try { localStorage.setItem(key(vertical), JSON.stringify(rows.slice(-MAX_ROWS))); } catch (_) {}
  }

  /* Les métiers parlent français ('especes', 'carte', 'virement'…), le serveur
     parle le vocabulaire des terminaux (cash|card|wallet). Traduire ici plutôt
     que dans quinze modules : une vente au virement comptée comme espèces
     fausserait la répartition des encaissements du tableau de bord. */
  var METHOD_MAP = {
    especes: 'cash', espece: 'cash', cash: 'cash', liquide: 'cash',
    carte: 'card', card: 'card', tpe: 'card', cb: 'card',
    virement: 'wallet', transfer: 'wallet', wallet: 'wallet',
    glovo: 'wallet', online: 'wallet', enligne: 'wallet',
    cheque: 'wallet', qr: 'qr', tap: 'tap',
  };
  function normMethod(m) {
    var k = String(m == null ? '' : m).toLowerCase().replace(/[^a-z]/g, '');
    return METHOD_MAP[k] || 'cash';
  }

  /* ─────────────────────────── l'API ─────────────────────────── */

  /* record(vertical, sale) → l'entrée journalisée, ou null si rien n'a été pris.
     Ne jette jamais : un encaissement réussi ne doit pas échouer parce que le
     stockage est plein ou que le miroir tombe. */
  function record(vertical, sale) {
    if (!sale) return null;
    var total = Math.round((+sale.total || 0) * 100) / 100;
    /* Montant nul ou négatif ⇒ ce n'est pas une recette. Les différés
       ('payer plus tard') et les avoirs passent par là et sont ignorés. */
    if (!(total > 0)) return null;
    if (!isReal()) return null;                 /* la démo reste en mémoire */

    var at = sale.at instanceof Date ? sale.at : new Date();
    var entry = {
      ts: at.getTime(),
      total: total,
      method: normMethod(sale.method),
      raw: sale.method == null ? '' : String(sale.method),   /* le mot du métier, pour le journal local */
      label: String(sale.label || 'Vente').slice(0, 80),
      ref: String(sale.ref || '').slice(0, 32),
    };
    if (Array.isArray(sale.lines) && sale.lines.length) {
      entry.lines = sale.lines.slice(0, 40).map(function (l) {
        return { name: String((l && l.name) || 'Article').slice(0, 60), qty: +(l && l.qty) || 1, total: Math.round(((l && +l.total) || 0) * 100) / 100 };
      });
    }

    var rows = read(vertical);
    rows.push(entry);
    write(vertical, rows);

    /* Miroir serveur — c'est LUI qui alimente le tableau de bord. Enveloppé :
       une panne du miroir ne doit jamais casser la vente au comptoir. */
    try {
      if (window.KiwiLive && window.KiwiLive.isOn && window.KiwiLive.isOn()) {
        window.KiwiLive.postSale({
          amount: total, method: entry.method, label: entry.label,
          ref: entry.ref, time: at,
        });
      }
    } catch (_) {}

    return entry;
  }

  /* today(vertical) → les ventes d'aujourd'hui déjà encaissées sur ce terminal.
     À appeler au montage pour reconstruire les compteurs de la journée. */
  function today(vertical) { return read(vertical); }

  /* totals(vertical) → { total, cash, card, other, count } — le calcul que les
     quinze modules referaient sinon chacun de leur côté. */
  function totals(vertical) {
    var t = { total: 0, cash: 0, card: 0, other: 0, count: 0 };
    read(vertical).forEach(function (s) {
      var a = +s.total || 0;
      t.total += a; t.count++;
      if (s.method === 'cash') t.cash += a;
      else if (s.method === 'card') t.card += a;
      else t.other += a;
    });
    t.total = Math.round(t.total * 100) / 100;
    t.cash = Math.round(t.cash * 100) / 100;
    t.card = Math.round(t.card * 100) / 100;
    t.other = Math.round(t.other * 100) / 100;
    return t;
  }

  /* nextSeq(vertical, floor) → le prochain numéro de ticket, repris AU-DELÀ du
     dernier numéro déjà encaissé aujourd'hui. Sans ça, un rechargement remet le
     compteur à sa valeur initiale et deux tickets différents portent le même
     numéro — ce qu'une caisse ne peut pas se permettre. Les références non
     numériques (P-1045, MM-1208…) sont lues sur leur partie chiffrée. */
  function nextSeq(vertical, floor) {
    var max = 0;
    read(vertical).forEach(function (s) {
      var n = parseInt(String(s.ref || '').replace(/^\D+/, ''), 10);
      if (n > max) max = n;
    });
    var base = +floor || 0;
    return max >= base ? max + 1 : base;
  }

  window.KiwiPosSale = {
    record: record, today: today, totals: totals, nextSeq: nextSeq,
    isReal: isReal,
  };
})();
