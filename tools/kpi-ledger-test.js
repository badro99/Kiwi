#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · le chiffre d'affaires se LIT, il ne se reconstitue pas
 *
 *   node tools/kpi-ledger-test.js
 *
 * Le tableau de bord affichait un CA reconstitué : nombre de ventes × panier
 * moyen. Le panier moyen affiché est arrondi à l'entier — 37 ventes pour
 * 4 618 MAD donnent 124,81 qui s'affiche 125, et le CA sortait à 4 625. Sept
 * dirhams nés d'un arrondi d'affichage, et l'écart grandit avec le volume :
 * c'est le commerçant le plus occupé qui voit son tableau de bord s'éloigner
 * le plus de sa caisse. Cinq tuiles en dérivent (CA, CA/jour, bénéfice brut,
 * coût matière, pourboires), donc elles se décalaient TOUTES ENSEMBLE — rien à
 * l'écran ne pouvait le trahir, et seul un rapprochement avec le rouleau de
 * caisse le révélait.
 *
 * Ce que ce banc vérifie, et ce qu'il ne vérifie pas. Les tuiles KPI ne sont
 * pas exposées par le module (dateRange.js n'exporte que sa plage), donc on ne
 * rejoue pas le rendu. On extrait du VRAI fichier les quelques fonctions pures
 * qui portent l'arithmétique et on les évalue telles quelles : si quelqu'un
 * réécrit revOf, l'extraction échoue bruyamment au lieu de passer à côté. La
 * plomberie qui alimente `data.revenue` depuis les ventes réelles, elle, est
 * contrôlée sur la source — c'est une ligne, et une ligne supprimée est
 * exactement la régression qu'on craint.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'assets/dateRange.js'), 'utf8');

let pass = 0; const fails = [];
const ok = (label, cond, detail) => { if (cond) pass++; else fails.push(label + (detail ? ' — ' + detail : '')); };

/* ── on découpe l'arithmétique pure hors du module ─────────────────────────
 * De `const r1 =` jusqu'à `const KPI_CATALOG` : r1, withDelta, revOf, margeOf,
 * revDelta et leurs constantes. Aucune de ces lignes ne touche le DOM. */
const from = SRC.indexOf('const r1 = ');
const to = SRC.indexOf('const KPI_CATALOG');
ok('l\'arithmétique est extractible du module', from > 0 && to > from,
  `from=${from} to=${to}`);
if (from < 0 || to <= from) {
  console.log('  ✗ ' + fails.join('\n  ✗ '));
  console.log('\n✗ CA au grand livre : extraction impossible\n');
  process.exit(1);
}
const slice = SRC.slice(from, to);
let M;
try {
  M = new Function(slice + '\nreturn { revOf, revDelta, margeOf, withDelta, r1 };')();
} catch (e) {
  console.log('  ✗ l\'arithmétique extraite ne s\'évalue pas — ' + (e && e.message));
  process.exit(1);
}

/* ── 1. LE CAS QUI FAISAIT L'ÉCART ─────────────────────────────────────────
 * 37 ventes, 4 618 MAD. Panier réel 124,81 ; panier AFFICHÉ 125. */
const REAL = { tx: { value: 37, delta: 5 },
               panier: { value: 125, delta: 2 },          // déjà arrondi, comme à l'écran
               revenue: { value: 4618, delta: 7.3 } };

ok('le CA affiché est le total additionné, pas le produit',
  M.revOf(REAL) === 4618, 'obtenu ' + M.revOf(REAL));
ok('…et il n\'est PAS le produit arrondi qu\'on affichait avant',
  M.revOf(REAL) !== REAL.tx.value * REAL.panier.value,
  'produit = ' + REAL.tx.value * REAL.panier.value);
ok('la variation du CA est celle des ventes, pas une somme d\'à-peu-près',
  M.revDelta(REAL) === 7.3, 'obtenu ' + M.revDelta(REAL));

/* L'écart exact que voyait le commerçant en rapprochant sa caisse. */
const ecart = REAL.tx.value * REAL.panier.value - 4618;
ok('l\'ancien calcul se trompait bien de 7 MAD sur ce panier', ecart === 7, 'écart=' + ecart);

/* ── 2. LA DÉMO NE BOUGE PAS ───────────────────────────────────────────────
 * Aucune période de démonstration ne porte de clé `revenue` : elle continue de
 * passer par le produit, avec des paniers déjà entiers. */
const DEMO = { tx: { value: 182, delta: 15.2 }, panier: { value: 134, delta: 1.5 } };
ok('sans total réel, on retombe sur le produit (démo inchangée)',
  M.revOf(DEMO) === 182 * 134, 'obtenu ' + M.revOf(DEMO));
ok('…et sur l\'ancienne approximation de variation',
  M.revDelta(DEMO) === 16.7, 'obtenu ' + M.revDelta(DEMO));

/* Un littéral chiffré — c'est la forme des jeux de démonstration. Le chemin
   réel, lui, écrit `value: t.revenue`, qui vient des ventes. */
ok('aucune période de démonstration ne déclare de CA en dur',
  !/^\s{6,}revenue:\s*\{\s*value:\s*\d/m.test(SRC),
  'une clé revenue: { value: <nombre> } traîne dans les jeux de démonstration');

/* ── 3. PAS DE COMPARAISON INVENTÉE ────────────────────────────────────────
 * Une composante absente ⇒ aucune comparaison. `null + null` vaut 0 en JS, ce
 * qui ressusciterait le « 0 % » que le null existe pour taire. */
ok('sans baseline, pas de variation du tout',
  M.revDelta({ tx: { value: 10, delta: null }, panier: { value: 20, delta: 3 } }) === null);
ok('un CA réel sans baseline ne fabrique pas 0 %',
  M.revDelta({ tx: { value: 10, delta: 4 }, panier: { value: 20, delta: 3 },
               revenue: { value: 200, delta: null } }) === 7,
  'faute de variation réelle, on retombe sur l\'approximation');

/* ── 4. LA PLOMBERIE ───────────────────────────────────────────────────────
 * Le total exact existait déjà dans realSalesTotals() et n'était transmis à
 * personne. Ces trois lignes sont ce qui l'amène jusqu'aux tuiles. */
ok('realSalesTotals additionne bien un revenu',
  /return \{ revenue, count, basket:/.test(SRC));
ok('le chemin réel transmet ce total sous `revenue`',
  /revenue:\s*\{\s*value:\s*t\.revenue,/.test(SRC),
  'data.revenue n\'est plus alimenté depuis les ventes');
ok('sa comparaison survit au nettoyage des deltas hérités de la démo',
  /REAL_DELTAS = new Set\(\[[^\]]*'revenue'/.test(SRC));

/* ── 5. PLUS AUCUNE TUILE NE RECOMBINE ventes × panier ─────────────────────
 * C'est la règle qui empêche la panne de revenir par une sixième tuile ajoutée
 * plus tard : tout ce qui dérive du CA passe par revDelta(). */
const KPI = SRC.slice(to);
ok('aucune tuile ne recompose la variation du CA à la main',
  !/withDelta\(\[d\.tx\.delta,\s*d\.panier\.delta/.test(KPI),
  'une tuile additionne encore les variations de ventes et de panier');
['revenue', 'revPerDay', 'profit', 'cogs', 'tips'].forEach((k) => {
  const m = new RegExp('\\n\\s*' + k + ':\\s*\\{[\\s\\S]*?\\n(?=\\s*[a-zA-Z]+:\\s*\\{)').exec(KPI);
  ok(`la tuile « ${k} » passe par revDelta`, !!m && /revDelta\(d\)/.test(m[0]),
    m ? 'trouvée, mais sans revDelta' : 'tuile introuvable');
});

/* ── 6. OÙ COMMENCE « AUJOURD'HUI » ────────────────────────────────────────
 * Le tableau de bord coupait la journée à minuit ; le rapport Z la coupe à la
 * bascule commerciale (5 h par défaut). Pour un restaurant qui ferme à 1 h du
 * matin, les ventes de 00 h–01 h étaient donc dans la recette du soir sur le Z
 * et dans le lendemain sur le tableau de bord — deux chiffres justes chacun de
 * leur côté, incomparables, et impossibles à départager pour le patron. */
const dFrom = SRC.indexOf('function dayCutoffH()');
const dTo = SRC.indexOf('function realSalesList()');
ok('la définition de la journée est extractible', dFrom > 0 && dTo > dFrom);
if (dFrom > 0 && dTo > dFrom) {
  const mk = (h) => new Function('window', SRC.slice(dFrom, dTo) + '\nreturn dayStartMs;')(
    { KiwiDayReport: h == null ? undefined : { cutoff: () => h } });

  // 12 mars 2026, 00 h 30 — une vente de fin de service.
  const nuit = new Date(2026, 2, 12, 0, 30).getTime();
  const veille5h = new Date(2026, 2, 11, 5, 0).getTime();
  ok('une vente à 00 h 30 appartient encore à la soirée de la veille',
    mk(5)(nuit) === veille5h, new Date(mk(5)(nuit)).toString());

  // …et une vente en plein service reste dans SA journée.
  const soir = new Date(2026, 2, 12, 21, 0).getTime();
  ok('une vente à 21 h appartient à la journée du jour',
    mk(5)(soir) === new Date(2026, 2, 12, 5, 0).getTime());

  // « Hier » reste exactement 24 h en amont — les bornes de plage en dépendent.
  ok('la veille reste à 24 h exactement',
    mk(5)(soir) - mk(5)(nuit) === 864e5, String(mk(5)(soir) - mk(5)(nuit)));

  // Sans module de rapport chargé : minuit, c'est-à-dire l'ancien comportement.
  ok('sans rapport journalier, on retombe sur minuit (comportement d\'avant)',
    mk(null)(nuit) === new Date(2026, 2, 12, 0, 0).getTime());
  ok('une bascule hors bornes est ignorée, pas propagée',
    mk(99)(nuit) === new Date(2026, 2, 12, 0, 0).getTime());
}

/* ── 7. UN TIRET, PAS UN ZÉRO ──────────────────────────────────────────────
 * Kiwi ne mesure ni les paiements refusés ni les retours. Le clone de démo
 * remis à zéro affichait pourtant « Taux succès 0,00 % » — qui ne se lit pas
 * « on ne sait pas » mais « aucun paiement n'aboutit », l'alarme la plus grave
 * qu'une caisse puisse afficher, sur une tuile qui ne mesure rien. */
['success', 'tauxRetour'].forEach((k) => {
  ok(`« ${k} » affiche un tiret chez un vrai commerçant, pas un zéro`,
    new RegExp(k + ":\\s*data\\." + k + "\\s*\\?[^\\n]*text: '—'").test(SRC),
    'la tuile retombe encore sur le zéro du clone de démonstration');
});

/* ── 8. LA CARTE DES HEURES DE POINTE SUIT LE COMMERCE ─────────────────────
 * La bande était figée de 11 h à 02 h — les heures d'un restaurant — et TOUTE
 * vente en dehors était jetée en silence. La matinée d'une boulangerie
 * disparaissait, et la carte n'affichait pas « rien » : elle affichait un pic à
 * midi, c'est-à-dire le contraire de la réponse. On rejoue ici le choix de
 * fenêtre, seul morceau d'algorithme de cette carte. */
{
  const span = 16;
  const pick = (byHour) => {
    let start = 11, bestSum = -1, bestLead = 99;
    for (let s = 0; s < 24; s++) {
      let sum = 0, lead = 0, counting = true;
      for (let k = 0; k < span; k++) {
        const val = byHour[(s + k) % 24];
        sum += val;
        if (counting) { if (val > 0) counting = false; else lead++; }
      }
      if (sum > bestSum || (sum === bestSum && lead < bestLead)) { bestSum = sum; bestLead = lead; start = s; }
    }
    return bestSum <= 0 ? 11 : start;
  };
  const hours = (spec) => { const a = new Array(24).fill(0); Object.entries(spec).forEach(([h, v]) => { a[+h] = v; }); return a; };

  /* Un restaurant qui sert dès 11 h retombe exactement sur la bande historique
     — c'est la non-régression : le métier pour lequel elle avait été écrite ne
     doit rien voir changer. */
  const resto = hours({ 11: 300, 12: 900, 13: 1400, 19: 1600, 20: 2100, 21: 1800, 23: 400 });
  ok('un restaurant qui sert dès 11 h retrouve la bande 11 h–02 h',
    pick(resto) === 11, 'obtenu ' + pick(resto));

  /* Et s'il n'ouvre qu'à midi, la bande le suit plutôt que d'ouvrir sur une
     case vide. La règle est « commencer là où le commerce commence », pas
     « commencer à 11 h ». */
  const midi = hours({ 12: 900, 13: 1400, 19: 1600, 20: 2100, 21: 1800, 23: 400 });
  ok('…et s\'il n\'ouvre qu\'à midi, la bande commence à midi',
    pick(midi) === 12, 'obtenu ' + pick(midi));

  const boul = hours({ 6: 800, 7: 1900, 8: 1500, 9: 600, 11: 400, 13: 700 });
  ok('une boulangerie ouvre sa bande à 6 h', pick(boul) === 6, 'obtenu ' + pick(boul));
  ok('…et son vrai pic de 7 h n\'est plus jeté',
    ((7 - pick(boul) + 24) % 24) < span);

  ok('un commerce qui ne vend qu\'à midi n\'ouvre pas sur douze cases vides',
    pick(hours({ 12: 500 })) === 12, 'obtenu ' + pick(hours({ 12: 500 })));

  ok('sans aucune vente, la bande d\'origine est conservée',
    pick(new Array(24).fill(0)) === 11);

  // Un service de nuit passe la minuit sans se couper en deux.
  const nuit = hours({ 20: 900, 22: 1600, 23: 1400, 0: 1200, 1: 800 });
  ok('un service de nuit tient dans une seule bande',
    ((1 - pick(nuit) + 24) % 24) < span && ((20 - pick(nuit) + 24) % 24) < span,
    'départ ' + pick(nuit));
}

ok('plus aucune vente n\'est jetée hors de la bande affichée',
  !/if \(i >= HH_HOURS\.length\) return;/.test(SRC),
  'le rejet silencieux des heures hors bande est toujours là');

/* La règle vaut pour tout le module : plus aucune remise à minuit en dur dans
 * le calcul des plages de ventes réelles. */
ok('le calcul des plages ne remet plus l\'heure à zéro à la main',
  !/function dayStartMs\(t\) \{ const d = new Date\(t\); d\.setHours\(0/.test(SRC));

/* ══════════════════════════════════════════════════════════════════════════
 * 6. LA MÊME JOURNÉE AU COMPTOIR ET DANS L'ASSISTANT
 *
 * Le tableau de bord et le rapport Z comptent depuis la bascule commerciale.
 * Deux lecteurs comptaient encore depuis minuit :
 *   · le journal du terminal (pos-sale.js) — il se VIDAIT à minuit, donc au
 *     milieu du service d'un restaurant qui ferme à 01h. Le compteur du
 *     comptoir repartait de zéro pendant que le Z, lui, continuait la soirée ;
 *   · l'assistant (agent-data.js) — il lisait ce journal sur une fenêtre qui
 *     démarrait à minuit, donc il ratait les ventes de fin de nuit que le
 *     journal, lui, gardait. « Rien vendu aujourd'hui », le comptoir encaissant.
 *
 * Ce que ce banc vérifie : que les deux lecteurs POSENT la question à
 * KiwiDayReport et se rangent sur sa réponse. Le stub ci-dessous rejoue la
 * bascule à l'identique de day-report.js (mêmes trois fonctions, mêmes lignes)
 * uniquement pour pouvoir fixer l'heure qu'il est — l'arithmétique de la
 * bascule elle-même est contrôlée ailleurs, pas ici. */
{
  const POS = fs.readFileSync(path.join(ROOT, 'assets/pos-sale.js'), 'utf8');
  const AGT = fs.readFileSync(path.join(ROOT, 'assets/agent-data.js'), 'utf8');

  const cut = (src, a, b, label) => {
    const i = src.indexOf(a), j = src.indexOf(b);
    ok(`${label} est extractible`, i > 0 && j > i, `i=${i} j=${j}`);
    return (i > 0 && j > i) ? src.slice(i, j) : null;
  };
  const posSrc = cut(POS, '  function sameDay(a, b) {', '  function key(vertical)', 'le filtre « aujourd\'hui » du comptoir');
  const agtSrc = cut(AGT, '  function startOfDay() {', '  function inWin(', 'la fenêtre « aujourd\'hui » de l\'assistant');

  if (posSrc && agtSrc) {
    /* Chaque lecteur reçoit SON `window` : c'est la seule façon d'avoir un
       terminal avec KiwiDayReport et un autre sans, dans le même banc. */
    const mkPos = (win) => new Function('window', posSrc + '\nreturn isToday;')(win);
    const mkAgt = (win) => new Function('window', agtSrc + '\nreturn startOfDay;')(win);

    /* Le stub : businessDay / today / dayBounds recopiés de day-report.js, avec
       un « maintenant » injecté au lieu de Date.now(). */
    const mkReport = (nowMs, h) => {
      const p2 = (n) => String(n).padStart(2, '0');
      const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
      const businessDay = (ts) => ymd(new Date(ts - h * 3600000));
      const today = () => businessDay(nowMs);
      const dayBounds = (day) => {
        const p = String(day).split('-');
        const d = new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1, h, 0, 0, 0);
        return { from: d.getTime(), to: d.getTime() + 24 * 3600000 };
      };
      return { businessDay, today, dayBounds };
    };

    const at = (D, hh, mm) => new Date(2026, 6, D, hh, mm || 0, 0, 0).getTime();
    const NOW = at(28, 0, 30);          /* 00h30 — le service n'est pas fini */
    const veille22 = at(27, 22, 0);     /* la table de 22h, servie il y a 2h30 */
    const nuit0005 = at(28, 0, 5);      /* le dernier café */
    const avantHier = at(26, 22, 0);    /* la soirée d'AVANT, elle, est close */

    const w5 = { KiwiDayReport: mkReport(NOW, 5) };
    const posDay = mkPos(w5);

    ok('à 00h30, la table de 22h est toujours dans la journée du comptoir',
      posDay(veille22) === true);
    ok('…et le dernier café de 00h05 aussi', posDay(nuit0005) === true);
    ok('la soirée de l\'avant-veille, elle, est bien sortie du journal',
      posDay(avantHier) === false);

    /* Non-vacuité : sans la bascule, la table de 22h serait jetée à minuit —
       c'est exactement le compteur qui repartait de zéro en plein service. */
    const posMinuit = mkPos({});
    const memeDate = new Date(veille22).toDateString() === new Date().toDateString();
    ok('sans KiwiDayReport le filtre retombe sur le calendrier (ancien comportement)',
      posMinuit(veille22) === memeDate);

    /* Une bascule à 0 h doit rendre EXACTEMENT le calendrier : un commerce de
       jour ne doit rien voir changer. */
    const pos0 = mkPos({ KiwiDayReport: mkReport(NOW, 0) });
    ok('une bascule à 0 h se comporte comme minuit',
      pos0(veille22) === false && pos0(nuit0005) === true);

    ok('une date illisible reste refusée', posDay(NaN) === false);

    /* L'assistant lit la MÊME borne. */
    const agtDay = mkAgt(w5);
    ok('la fenêtre de l\'assistant démarre à la bascule, pas à minuit',
      agtDay() === at(27, 5, 0), 'obtenu ' + new Date(agtDay()).toString());
    ok('…donc la table de 22h que le journal garde, l\'assistant la voit',
      veille22 >= agtDay() && veille22 < agtDay() + 24 * 3600000);
    ok('…et il ne remonte pas jusqu\'à la soirée d\'avant',
      avantHier < agtDay());

    const agtMinuit = mkAgt({});
    ok('sans KiwiDayReport l\'assistant retombe sur minuit',
      agtMinuit() === new Date(new Date().setHours(0, 0, 0, 0)).getTime());

    /* Et le journal et l'assistant s'accordent : tout ce que le comptoir garde
       est dans la fenêtre que l'assistant lit. C'est l'invariant, pas les deux
       bornes prises séparément. */
    const dedans = [veille22, nuit0005, at(27, 12, 0)].every(
      (ts) => posDay(ts) === (ts >= agtDay() && ts < agtDay() + 24 * 3600000));
    ok('le comptoir et l\'assistant ne peuvent plus se contredire', dedans);
  }

  /* Les deux gardes portent sur le CODE extrait, pas sur le fichier : un
     commentaire qui parle de la bascule ne prouve rien, et un garde qu'un
     commentaire suffit à satisfaire ne garde rien. */
  ok('le comptoir ne tranche plus « aujourd\'hui » au calendrier seul',
    !!posSrc && /R\.businessDay\(/.test(posSrc));
  ok('l\'assistant ne fabrique plus son minuit à la main sans demander',
    !!agtSrc && /R\.dayBounds\(/.test(agtSrc));
}

/* ── Clients réguliers : une mesure, ou rien ────────────────────────────────
   La tuile a porté deux mensonges successifs. Chez un commerçant de démo, une
   constante — « 286 / 1240 », écrite en dur, une par plage et par métier. Chez
   un VRAI commerçant, « value: 0 » : et « Clients réguliers 0 » ne se lit pas
   « on ne sait pas », il se lit « personne ne revient ».

   Ces gardes portent sur le code extrait de dateRange.js, pas sur le fichier :
   ils exécutent realRegulars/realRegularsTile tels qu'ils sont livrés. */
{
  const lift = (name) => {
    const s = SRC.indexOf('  function ' + name + '(');
    const e = s < 0 ? -1 : SRC.indexOf('\n  }\n', s);
    return e < 0 ? '' : SRC.slice(s, e + 4);
  };
  const parts = ['rangeBounds', 'realClientsList', 'realRegulars', 'realRegularsTile'].map(lift);
  ok('le calcul des clients réguliers est extractible du module', parts.every(Boolean));

  if (parts.every(Boolean)) {
    let R = null;
    try {
      R = new Function('getClients', 'flags', `
        const RANGE_DAYS = { aujourdhui: 1, hier: 1, septJours: 7, trenteJours: 30, moisDernier: 30, trimestre: 90, annee: 365, personnalise: 1 };
        const window = { KiwiClients: { list: () => getClients() } };
        function dayCutoffH() { return 0; }
        function dayStartMs(t) { const d = new Date(t); d.setHours(0,0,0,0); return d.getTime(); }
        function getCurrentVenue() { return 'chez-moi'; }
        function ownData() { return flags.own; }
        function customVenue() { return flags.custom; }
        ${parts.join('\n')}
        return { realRegularsTile };
      `);
    } catch (e) { ok('le calcul s\'évalue isolément', false, e.message); }

    if (R) {
      let book = [], own = true, custom = true;
      const api = R(() => book, { get own() { return own; }, get custom() { return custom; } });
      const tile = (range) => api.realRegularsTile({ fmt: 'int' }, range);
      const DAY = 864e5;
      const now = Date.now();
      const T = new Date(new Date().setHours(0, 0, 0, 0)).getTime();

      book = [];
      ok('carnet vide : un tiret, jamais un zéro', tile('aujourdhui').text === '—');
      ok('…et surtout pas de valeur chiffrée', tile('aujourdhui').value == null);

      book = [
        { lastSeen: now - 2 * 3600e3, visits: 5 },
        { lastSeen: now - 3 * 3600e3, visits: 1 },
        { lastSeen: now - 4 * 3600e3, visits: 2 },
        { lastSeen: T - 5 * DAY,      visits: 9 },
      ];
      const jour = tile('aujourdhui');
      ok('régulier = plus d\'une visite, total = fiches vues sur la plage',
        jour.value === 2 && jour.unit === '/ 3', JSON.stringify([jour.value, jour.unit]));
      const sept = tile('septJours');
      ok('la fenêtre s\'élargit avec la plage choisie',
        sept.value === 3 && sept.unit === '/ 4', JSON.stringify([sept.value, sept.unit]));

      ok('une fenêtre passée fermée ne se devine pas depuis lastSeen',
        tile('hier').text === '—');
      ok('aucune variation n\'est inventée faute d\'historique de visites',
        jour.delta === null && sept.delta === null);

      own = true; custom = false;
      ok('le trou réel-mais-pas-custom ne laisse pas fuiter un carnet de démo',
        tile('septJours').text === '—');
      own = true; custom = true;

      book = [{ lastSeen: now, visits: 1 }, { lastSeen: now, visits: 1 }];
      const zero = tile('aujourdhui');
      ok('0 sur 2 reste affiché : là, le zéro EST la mesure',
        zero.value === 0 && zero.unit === '/ 2');
    }
  }

  ok('la tuile réelle ne réinjecte plus la constante value: 0',
    !/regulars:\s*data\.regulars\s*\?\s*\{[^}]*value:\s*0/.test(SRC));
}

console.log('');
if (fails.length) {
  fails.forEach((f) => console.log('  ✗ ' + f));
  console.log(`\n✗ CA au grand livre : ${pass} ok, ${fails.length} échec(s)\n`);
  process.exit(1);
}
console.log(`  ✓ CA au grand livre (${pass} contrôles : total additionné, arrondi neutralisé, démo intacte, pas de comparaison inventée, plomberie, aucune tuile ne recompose, journée commerciale, tiret plutôt que zéro, heures de pointe, comptoir et assistant sur la même journée, clients réguliers mesurés)\n`);
