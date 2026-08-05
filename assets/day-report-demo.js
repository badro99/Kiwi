/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · un journal de ventes pour la DÉMONSTRATION seulement.
 *
 * Pourquoi ce fichier existe.
 * Le rapport journalier ne lit que deux sources : l'instantané écrit par la
 * caisse, et le feed des ventes remontées (KiwiSales). En démonstration, les
 * deux sont vides — day-report.js refuse d'écrire ou de relire quoi que ce
 * soit hors d'un vrai commerce, et pour de bonnes raisons (un terminal qui a
 * servi un vrai magasin puis repasse en démo ne doit pas ressortir les
 * chiffres du commerçant). Résultat : la page s'ouvrait sur 0 MAD, une frise
 * plate et « Aucune vente ce jour-là », alors que le reste du tableau de bord
 * affichait 25 391 MAD. Une surface creuse, pas une surface sobre.
 *
 * Ce module comble ce trou-là, et rien d'autre : il fabrique un journal
 * plausible à partir de la carte de démonstration déjà chargée, pour que la
 * page du rapport montre ce qu'elle sait faire. Il ne touche pas à KiwiSales,
 * n'écrit dans aucun stockage, et s'efface dès que la session devient réelle.
 *
 * Trois garanties, dans l'ordre d'importance :
 *   1. JAMAIS en production. `active()` reprend mot pour mot la règle de
 *      day-report.js : compte réel, caisse appairée ou établissement
 *      personnalisé ⇒ ce module se tait et rend un tableau vide.
 *   2. Rien n'est persisté. Tout vit en mémoire, le temps de l'onglet.
 *   3. Déterministe. La graine vient de la date, donc deux rechargements
 *      montrent la MÊME journée — un rapport dont les chiffres bougent à
 *      chaque F5 se lit comme un bug, pas comme une démonstration.
 * ═════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DEPTH = 60;            /* journées générées : la frise en montre 14, le
                                pager de dates remonte bien plus loin */
  var HOUR = 3600000;

  /* ── la garde ─────────────────────────────────────────────────────────── */

  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }

  /* Même règle que day-report.js · isReal(). Volontairement dupliquée plutôt
     qu'importée : ce module doit pouvoir se taire même si day-report.js n'est
     pas encore chargé, et une garde qui dépend de ce qu'elle protège n'en est
     pas une. */
  function real() {
    try {
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
      if (JSON.parse(ls('kiwiPairedVenue') || 'null')) return true;
    } catch (_) {}
    try { return !!(window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()); } catch (_) {}
    return false;
  }

  function active() { return !real(); }

  /* ── hasard reproductible ─────────────────────────────────────────────── */

  function seedOf(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /* mulberry32 — court, sans dépendance, et surtout stable d'un rechargement
     à l'autre, ce que Math.random() ne peut pas être. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rand, arr) { return arr[Math.floor(rand() * arr.length) % arr.length]; }

  /* ── la carte ─────────────────────────────────────────────────────────── */

  /* Repli minimal : si la carte de démonstration n'est pas encore montée, on
     préfère cinq lignes crédibles à une page vide. */
  var FALLBACK = [
    { name: 'Café noir', price: 12, cat: 'boissons' },
    { name: 'Thé à la menthe', price: 15, cat: 'boissons' },
    { name: 'Jus d’orange pressé', price: 25, cat: 'boissons' },
    { name: 'Msemen', price: 18, cat: 'desserts' },
    { name: 'Sandwich poulet', price: 45, cat: 'sandwiches' },
  ];

  function carte() {
    var out = [];
    try {
      var items = (window.KiwiMenu && window.KiwiMenu.items && window.KiwiMenu.items()) || [];
      items.forEach(function (p) {
        var price = p && +p.price;
        if (p && p.name && isFinite(price) && price > 0) {
          out.push({ name: String(p.name), price: price, cat: String(p.category || '') });
        }
      });
    } catch (_) {}
    return out.length ? out : FALLBACK;
  }

  /* ── la journée ───────────────────────────────────────────────────────── */

  /* La courbe de service, indexée sur l'OFFSET depuis le seuil de journée (5 h
     par défaut) et non sur l'heure de l'horloge — c'est l'index que build()
     utilise pour sa frise horaire. Offset 2 = 7 h du matin. Deux coups de feu :
     le déjeuner et le dîner, comme n'importe quelle salle de Casablanca. */
  var CURVE = [
    /* 5h */ 0, 0, 3, 6, 5, 4, 6, 12, 14, 8, 5, 5, 6, 7, 9, 11, 8, 4, 2, 0, 0, 0, 0, 0,
  ];
  var CURVE_SUM = CURVE.reduce(function (a, b) { return a + b; }, 0);

  /* Le rythme de la semaine, repris des séries du tableau de bord pour que le
     rapport et les tuiles racontent la même semaine. Index 0 = lundi. */
  var WEEK = [10800, 13200, 11400, 12100, 12400, 13100, 11800];

  var METHODS = [
    /* « wallet » est la clé du virement dans le libellé du rapport ·
       day-report-dash.js → { wallet: 'Virement' }. Une clé inconnue s'affiche
       telle quelle, en anglais, au milieu d'une colonne française. */
    { m: 'card', w: 52 }, { m: 'cash', w: 41 }, { m: 'wallet', w: 7 },
  ];
  var CASHIERS = ['Yasmine', 'Omar', 'Salma'];

  function methodFor(r) {
    var x = r() * 100, acc = 0;
    for (var i = 0; i < METHODS.length; i++) { acc += METHODS[i].w; if (x < acc) return METHODS[i].m; }
    return 'cash';
  }

  /* Une heure tirée dans la courbe, puis une minute au hasard dedans. */
  function offsetFor(r) {
    var x = r() * CURVE_SUM, acc = 0;
    for (var i = 0; i < CURVE.length; i++) { acc += CURVE[i]; if (x < acc) return i; }
    return 8;
  }

  function bounds(day) {
    try {
      var b = window.KiwiDayReport && window.KiwiDayReport.dayBounds && window.KiwiDayReport.dayBounds(day);
      if (b && b.from) return b;
    } catch (_) {}
    return null;
  }

  /* ── la fabrique ──────────────────────────────────────────────────────── */

  var memo = null;        /* { key, sales, meta } — une fois par onglet */

  function build() {
    var menu = carte();
    var DR = window.KiwiDayReport;
    if (!DR || !DR.today || !DR.shiftDay) return { sales: [], meta: {} };

    var today = DR.today();
    var key = today + '·' + menu.length + '·' + (menu[0] && menu[0].name || '');
    if (memo && memo.key === key) return memo;

    var now = Date.now();
    var sales = [];
    var meta = Object.create(null);
    var day = today;

    for (var n = 0; n < DEPTH; n++) {
      var b = bounds(day);
      if (b) dayOf(day, b, menu, now, sales, meta);
      day = DR.shiftDay(day, -1);
    }

    memo = { key: key, sales: sales, meta: meta };
    return memo;
  }

  function dayOf(day, b, menu, now, sales, meta) {
    var r = rng(seedOf('kiwi-demo-' + day));
    var dow = (new Date(b.from).getDay() + 6) % 7;            /* 0 = lundi */
    var target = WEEK[dow] * (0.9 + r() * 0.2);
    var cash = 0, first = 0, last = 0, gross = 0, n = 0;

    /* On encaisse jusqu'à approcher l'objectif du jour plutôt que de viser un
       nombre de tickets : c'est le chiffre d'affaires qui doit coller aux
       tuiles, le panier moyen s'en déduit. La borne dure évite qu'un tirage
       malheureux ne parte en boucle. */
    for (var guard = 0; guard < 400 && gross < target; guard++) {
      var off = offsetFor(r);
      var ts = b.from + off * HOUR + Math.floor(r() * 60) * 60000 + Math.floor(r() * 60) * 1000;
      if (ts >= b.to || ts > now) continue;                    /* pas de vente dans le futur */

      var lines = [];
      var amount = 0;
      var nl = 1 + Math.floor(r() * 3.4);
      for (var i = 0; i < nl; i++) {
        var it = pick(r, menu);
        var qty = r() < 0.78 ? 1 : 2;
        var total = Math.round(it.price * qty * 100) / 100;
        lines.push({ name: it.name, qty: qty, total: total });
        amount += total;
      }
      amount = Math.round(amount * 100) / 100;

      var method = methodFor(r);
      var tip = method === 'card' && r() < 0.18 ? Math.round(amount * 0.05) : 0;

      sales.push({
        id: 'demo-' + day + '-' + n,
        ts: ts,
        amount: amount,
        method: method,
        tip: tip,
        cashier: pick(r, CASHIERS),
        ref: 'T' + (1000 + n),
        lines: lines,
      });

      gross += amount;
      if (method === 'cash') cash += amount;
      if (!first || ts < first) first = ts;
      if (ts > last) last = ts;
      n++;
    }

    /* Un remboursement de temps en temps — un rapport qui n'en montre jamais
       ne ressemble pas à un vrai service. */
    if (n > 12 && r() < 0.35) {
      var back = pick(r, menu);
      var rts = b.from + (8 + Math.floor(r() * 8)) * HOUR;
      if (rts < now && rts < b.to) {
        sales.push({
          id: 'demo-' + day + '-r', ts: rts, amount: -back.price, kind: 'refund',
          method: 'cash', tip: 0, cashier: CASHIERS[0], ref: 'R' + day.slice(-2),
          lines: [{ name: back.name, qty: 1, total: back.price }],
        });
        cash -= back.price;
      }
    }

    meta[day] = { cash: Math.round(cash * 100) / 100, first: first, last: last, n: n, seed: seedOf(day) };
  }

  /* ── le tiroir ────────────────────────────────────────────────────────── */

  /* Ce que seule la caisse saurait : heures d'ouverture et de fermeture, fond
     de caisse, comptage. Sans ça la page affiche « journée en cours » et laisse
     tout le bloc espèces vide, ce qui est exactement l'impression de surface
     morte qu'on cherche à corriger. La journée du jour, elle, reste ouverte —
     parce qu'elle l'est. */
  function session(day) {
    if (!active()) return null;
    var st = build();
    var m = st.meta[day];
    if (!m || !m.n) return null;
    var b = bounds(day);
    if (!b) return null;

    var DR = window.KiwiDayReport;
    var isToday = false;
    try { isToday = DR && DR.today && DR.today() === day; } catch (_) {}

    var r = rng(m.seed ^ 0x5f3a);
    var opening = 400;
    var supplyOut = 120;   /* la sortie fournisseur, retirée du tiroir */
    /* Un écart de caisse crédible : quelques dirhams, pas zéro pile — un
       comptage parfait tous les jours ne trompe personne. */
    var drift = Math.round((r() * 24 - 12));
    var out = {
      openedAt: m.first ? m.first - 25 * 60000 : b.from + 2 * HOUR,
      openedBy: 'Yasmine',
      openingFloat: opening,
      cashMovements: [
        /* Forme lue par day-report.js · build() : { ts, type, amount, reason }.
           Une entrée mal nommée est filtrée en silence et le tiroir affiche
           « aucune entrée ni sortie », ce qui est faux. */
        { ts: b.from + 9 * HOUR, type: 'out', amount: supplyOut, reason: 'Achat pain — fournisseur' },
      ],
      discounts: Math.round(m.n * 1.8),
      discountsCount: Math.max(1, Math.round(m.n * 0.06)),
      cancels: r() < 0.5 ? 1 : 0,
      handovers: [],
    };
    if (!isToday) {
      out.closedAt = m.last ? m.last + 20 * 60000 : b.from + 18 * HOUR;
      out.closedBy = 'Omar';
      /* Attendu = fond + espèces encaissées − sorties. Oublier la sortie
         fournisseur ici, c'est afficher un écart de +120 MAD tous les jours. */
      out.countedCash = Math.round((opening + m.cash - supplyOut + drift) * 100) / 100;
    }
    return out;
  }

  function sales() {
    if (!active()) return [];
    try { return build().sales; } catch (_) { return []; }
  }

  window.KiwiDayReportDemo = { active: active, sales: sales, session: session };
})();
