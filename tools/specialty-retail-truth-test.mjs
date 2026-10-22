#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * PHARMACIE · LIBRAIRIE · ÉPICERIE · CE QUE LA CAISSE ET LE TABLEAU DE BORD AFFIRMENT
 *
 * Mesuré le 2026-10-11 sur le stack local (trois comptes réels, catalogue du
 * commerçant, caisse appairée) :
 *
 * 1. Les trois caisses vendaient un catalogue INVENTÉ (doliprane, romans, tomates
 *    à des prix qu'aucun commerçant n'avait fixés), même sur un compte réel.
 * 2. La pharmacie n'avait aucune fiche pour les lots, la péremption, l'ordonnance
 *    obligatoire, le tiers payant : le stock et les lots affichés étaient ceux de la démo.
 * 3. Un lot périmé se vendait ; la vente ne sortait ni du stock ni du bon lot.
 * 4. Un produit sans prix se vendait « 0 MAD » (« un prix que le commerçant n'a pas fixé »).
 * 5. La part mutuelle n'arrivait nulle part (aucun dossier tiers payant côté tableau de bord),
 *    les lignes de liste scolaire ne se résolvaient pas vers le catalogue.
 * 6. Accueil : « Réservations non configurées, ajoutez vos tables » dit à un libraire.
 * 7. Les péremptions se comptaient sur 24 h (un lot périmé la veille « expire dans 0 j »).
 *
 *   node tools/specialty-retail-truth-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const SCHEMA = rd('assets/trade-workspace-schema.js');
const PHARM = rd('assets/pos-pharmacie.js');
const LIB = rd('assets/pos-librairie.js');
const EPI = rd('assets/pos-epicerie.js');
const WSJS = rd('assets/pos-workspaces.js');
const TW = rd('assets/trade-workspaces.js');
const VENUES = rd('assets/venues.js');
const DR = rd('assets/dateRange.js');

/* Le corps d'une fonction (accolades équilibrées), pour l'exécuter seul. */
function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' introuvable');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('accolades non équilibrées : ' + start);
}
const run = (code, ctx) => { vm.createContext(ctx); vm.runInContext(code, ctx); return ctx; };

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

/* ── 1. Le schéma : fiches, horloge du commerce, trois langues ───────────────── */
const win = { addEventListener() {}, localStorage: { getItem: () => null, setItem() {} } };
const S = (() => {
  const ctx = { window: win, document: { addEventListener() {}, readyState: 'complete' }, localStorage: win.localStorage, console, Intl, Date, Math, JSON, Object, Array, String, Number, RegExp };
  win.window = win;
  run(SCHEMA, ctx);
  return win.KiwiTradeSchema;
})();

ok('pharmacie : lots, fiches produit, organismes ; épicerie : produits au poids ; librairie : listes et commandes', () => {
  assert.ok(S.get('pharmacie', 'expiries') && S.get('pharmacie', 'drugs') && S.get('pharmacie', 'payers') && S.get('pharmacie', 'duty'));
  assert.ok(S.get('epicerie', 'weighed'));
  assert.ok(S.get('librairie', 'schoollists') && S.get('librairie', 'bookorders'));
});

ok('chaque libellé des nouvelles fiches existe en FR, EN et AR', () => {
  [['pharmacie', 'expiries'], ['pharmacie', 'drugs'], ['pharmacie', 'payers'], ['epicerie', 'weighed']].forEach(([trade, nav]) => {
    const sc = S.get(trade, nav);
    sc.fields.forEach((f) => {
      ['fr', 'en', 'ar'].forEach((l) => assert.ok(f.label && f.label[l], `${nav}.${f.id} sans libellé ${l}`));
      (f.values || []).forEach((o) => ['fr', 'en', 'ar'].forEach((l) => assert.ok(o.label[l], `${nav}.${f.id}=${o.value} sans libellé ${l}`)));
    });
  });
});

ok('un numéro de lot est unique PAR produit, pas globalement', () => {
  const sc = S.get('pharmacie', 'expiries');
  const row = (id, product, lot) => ({ id, status: 0, values: { product, lot, expiryAt: '2027-01-01', qty: 3 } });
  const a = row('a', 'p1', 'L-1');
  assert.equal(S.validate(sc, row('b', 'p2', 'L-1'), [a]).ok, true, 'même lot sur un autre produit');
  assert.equal(S.validate(sc, row('c', 'p1', 'L-1'), [a]).errors.lot, 'unique', 'même lot, même produit');
});

ok('une fiche produit par article du catalogue (pas de doublon dci/ordonnance)', () => {
  const sc = S.get('pharmacie', 'drugs');
  const a = { id: 'a', status: 0, values: { product: 'p1' } };
  assert.equal(S.validate(sc, { id: 'b', status: 0, values: { product: 'p1' } }, [a]).errors.product, 'unique');
});

/* L'horloge est celle de Casablanca (UTC+1 ; le test l'impose sans dépendre de la machine). */
const at = (iso) => Date.parse(iso);
ok('péremption en jours calendaires : le jour même = 0 j, la veille = périmé', () => {
  const sc = S.get('pharmacie', 'expiries');
  const lot = (d) => ({ id: 'x', status: 0, values: { product: 'p', lot: 'L', expiryAt: d, qty: 1 } });
  const now = at('2026-10-11T12:00:00Z');
  const f = (d) => S.derived(sc, lot(d), now).derived;
  assert.equal(f('2026-10-11').daysToExpiry, 0);
  assert.equal(f('2026-10-11').expired, false, 'périme à la fin du jour');
  assert.equal(f('2026-10-10').daysToExpiry, -1);
  assert.equal(f('2026-10-10').expired, true);
  assert.equal(f('2026-12-31').daysToExpiry, 81);
  assert.equal(f('2026-12-31').expiring, true, 'dans la fenêtre de 90 jours');
  assert.equal(f('2027-03-01').expiring, false);
});

ok('minuit à Casablanca, pas à l’appareil : 23:30 UTC est déjà le lendemain', () => {
  const now = at('2026-10-11T23:30:00Z');
  assert.equal(S.venueZone(), 'Africa/Casablanca');
  assert.equal(S.dateKey(now), '2026-10-12');
  assert.equal(S.wallNow(now), '2026-10-12T00:30');
});

ok('un lot sorti (épuisé) ne remonte plus en alerte de péremption', () => {
  const sc = S.get('pharmacie', 'expiries');
  const gone = { id: 'x', status: 2, values: { product: 'p', lot: 'L', expiryAt: '2020-01-01', qty: 0 } };
  const d = S.derived(sc, gone, at('2026-10-11T12:00:00Z')).derived;
  assert.equal(d.expired, false);
  assert.equal(d.alert, false);
});

/* ── 2. Pharmacie : FEFO, allergies, jours restants ──────────────────────────── */
ok('la vente sort du stock lot par lot, le plus proche de sa péremption d’abord', () => {
  const lots = {
    a: [{ recId: 'r1', lot: 'A-OLD', qty: 2 }, { recId: 'r2', lot: 'A-NEW', qty: 10 }],
  };
  const patches = [], sold = [];
  const ctx = run(
    `const STOCK = { a: 12 }; const pvReal = () => true; const liveLots = (id) => lots[id] || [];
     const WS = () => ({ catalog: { sell: (id, q, ref) => sold.push([id, q, ref]) }, patch: (n, id, v, st) => patches.push([n, id, v, st]) });
     ${grab(PHARM, 'function takeFromStock(')}
     globalThis.out = takeFromStock({ num: 'T-9', lines: [{ itemId: 'a', qty: 5 }] }); globalThis.STOCK = STOCK;`,
    { lots, patches, sold, Math, Object },
  );
  assert.equal(ctx.out.a, 'A-OLD ×2, A-NEW ×3');
  assert.deepEqual(JSON.parse(JSON.stringify(sold)), [['a', 5, 'T-9']], 'le catalogue partagé est décrémenté avec la référence du ticket');
  assert.deepEqual(JSON.parse(JSON.stringify(patches)), [['expiries', 'r1', { qty: 0 }, 2], ['expiries', 'r2', { qty: 7 }, null]]);
  assert.equal(ctx.STOCK.a, 7);
});

ok('allergie : nom, DCI et famille des pénicillines, sans casse ni accents', () => {
  const ctx = run(`${PHARM.match(/const fold = .*;/)[0]}; ${PHARM.match(/const PENICILLINS = .*;/)[0]}; ${grab(PHARM, 'function allergyHit(')}; globalThis.allergyHit = allergyHit;`, { String, Object });
  const hit = ctx.allergyHit;
  const p = { allergies: ['Pénicilline'] };
  assert.equal(hit(p, { label: 'Augmentin 1 g', dci: '' }), 'Pénicilline');
  assert.equal(hit(p, { label: 'Clamoxyl', dci: 'Amoxicilline' }), 'Pénicilline');
  assert.equal(hit(p, { label: 'Doliprane 1000', dci: 'Paracétamol' }), '');
  assert.equal(hit({ allergies: ['AS'] }, { label: 'Aspegic', dci: '' }), '', 'deux lettres : trop court pour être fiable');
  assert.equal(hit({ allergies: ['paracetamol'] }, { label: 'Doliprane', dci: 'Paracétamol' }), 'paracetamol');
});

ok('jours restants d’un lot : calendrier du commerce, exact', () => {
  const ctx = run(
    `const DAY = 86400000; const l1 = { expKey: '2026-10-12' };
     window.KiwiTradeSchema = S; ${grab(PHARM, 'function lotDays(')}; globalThis.lotDays = lotDays;`,
    { window: {}, S: { dayDiff: S.dayDiff, dateKey: () => '2026-10-11' }, Date, Math },
  );
  assert.equal(ctx.lotDays({ expKey: '2026-10-12' }), 1);
  assert.equal(ctx.lotDays({ expKey: '2026-10-10' }), -1);
});

ok('pharmacie : aucun article, lot, stock ni mutuelle inventé sur un compte réel', () => {
  assert.match(PHARM, /pvReal\(\)/);
  assert.match(PHARM, /const GROSSISTE_SUGGEST = pvReal\(\) \? \[\]/);
  assert.match(PHARM, /vendre un prix que le commerçant n’a pas fixé|prix à saisir/);
  assert.match(PHARM, /lots périmés/);
});

ok('pharmacie : la part mutuelle part au tableau de bord comme dossier À ENVOYER (Kiwi ne transmet rien)', () => {
  const body = grab(PHARM, 'function recordDelivery(');
  assert.match(body, /upsert\('insurers', \{ id: 'cl-' \+ t\.num, title: 'Dossier ' \+ t\.num, status: 0/);
  assert.match(body, /split\.mut > 0/);
  assert.match(body, /upsert\('prescriptions'/);
});

/* ── 3. Librairie ────────────────────────────────────────────────────────────── */
ok('liste scolaire : « 2 x Titre », « Titre x 2 », quantité bornée', () => {
  const ctx = run(`${grab(LIB, 'function parseListLines(')}; globalThis.p = parseListLines;`, { String, Math });
  const out = JSON.parse(JSON.stringify(ctx.p('2 x Cahier 96 p\nMath 6e × 3\n\nAtlas\n500 x Stylo')));
  assert.deepEqual(out.map((x) => [x.qty, x.ref]), [[2, 'Cahier 96 p'], [3, 'Math 6e'], [1, 'Atlas'], [99, 'Stylo']]);
});

ok('une ligne qui ne se résout pas vers le catalogue reste « sans prix », jamais devinée', () => {
  const CATALOG = [{ items: [{ title: 'Cahier 96 pages', price: 8 }, { title: 'Cahier 192 pages', price: 14 }, { title: 'Atlas du Maroc', price: 90 }] }];
  const ctx = run(
    `const CATALOG = ${JSON.stringify(CATALOG)}; const ITEM = {}; ${grab(LIB, 'const fold =')}; ${grab(LIB, 'function itemForRef(')}; globalThis.f = itemForRef;`,
    { String, Object },
  );
  assert.equal(ctx.f('atlas du maroc').price, 90, 'titre exact, sans casse ni accents');
  assert.equal(ctx.f('Atlas').price, 90, 'fragment unique');
  assert.equal(ctx.f('Cahier'), null, 'fragment ambigu : deux cahiers, aucun choix silencieux');
  assert.equal(ctx.f('Dictionnaire'), null);
});

ok('librairie : l’acompte et le solde d’une commande spéciale entrent dans la recette', () => {
  assert.match(LIB, /postDay\(cmd\.acompte, cmd\.acompteTender, `Acompte \$\{cmd\.id\}`/);
  assert.match(LIB, /postDay\(due, paidBy, `Solde \$\{c\.id\}`/);
});

ok('librairie : acompte et solde gardent leur vrai moyen de paiement, rien n’est présélectionné', () => {
  // Ni l'acompte ni le solde ne s'inscrivent plus en espèces d'office.
  assert.doesNotMatch(LIB, /postDay\(cmd\.acompte, 'especes'/);
  assert.doesNotMatch(LIB, /postDay\(due, 'especes'/);
  // Un acompte demande comment il est réglé, et l'état de départ est vide.
  assert.match(LIB, /acTender: '',/);
  assert.match(LIB, /draft\.acompte > 0 && !draft\.acTender\) \{ toast\(/);
  // La remise propose les deux gestes ; l'étape « Retirée » seule ne choisit pas.
  assert.match(LIB, /data-lb-tender="especes"/);
  assert.match(LIB, /data-lb-tender="carte"/);
  assert.match(LIB, /tender !== 'especes' && tender !== 'carte'\) \{/);
  assert.match(LIB, /soldeRecorded/);
});

ok('librairie : plus d’ISBN inventé « EAN-n » en réel, un livre sans prix ne se vend pas', () => {
  assert.doesNotMatch(LIB, /isbn: 'EAN-/);
  assert.match(LIB, /noPrice/);
  assert.match(LIB, /isbn: p\.ean \|\| ''/);
});

/* ── 4. Épicerie ─────────────────────────────────────────────────────────────── */
ok('prix au poids : arrondi au centime, pas de dérive flottante', () => {
  const ctx = run(
    `const r2 = (n) => Math.round(n * 100) / 100; const ITEMS = { t: { price: 7.5 }, o: { price: 32 }, e: { price: 6.5 } };
     ${grab(EPI, 'function weighedTotal(')}; ${grab(EPI, 'function lineTotal(')}; ${grab(EPI, 'function ticketTotal(')}; globalThis.lt = lineTotal; globalThis.tt = ticketTotal;`,
    { Math },
  );
  assert.equal(ctx.lt({ itemId: 't', weight: 0.5 }), 3.75);
  assert.equal(ctx.lt({ itemId: 'o', weight: 0.333 }), 10.66);
  assert.equal(ctx.tt({ lines: [{ itemId: 'e', qty: 2 }, { itemId: 't', weight: 0.5 }] }), 16.75);
  assert.equal(ctx.tt({ lines: [{ itemId: 'o', weight: 0.1 }, { itemId: 'o', weight: 0.2 }] }), 9.6);
});

ok('épicerie : un produit au poids n’est pas décompté en unités, un produit sans prix ne se vend pas', () => {
  assert.match(EPI, /unit: 'weigh'/);
  assert.match(EPI, /noPrice/);
  assert.match(EPI, /catalog\.sell/);
  assert.match(EPI, /catalog\.resolve/);
});

/* ── 5. Le pont caisse ↔ catalogue ───────────────────────────────────────────── */
ok('la caisse relit une fiche modifiée dans un autre onglet du même navigateur', () => {
  assert.match(WSJS, /addEventListener\('storage'/);
  assert.match(WSJS, /e&&e\.key===key\(\)/);
});

ok('le catalogue partagé ne sort que ce qui existe en stock, et trace le ticket', () => {
  assert.match(WSJS, /Math\.max\(0,\+v\.stock\|\|0\)/);
  assert.match(WSJS, /adjustStock\(v\.id,-t,'vente',\{ref:ref\|\|''\}\)/);
});

/* ── 6. Tableau de bord : Accueil ────────────────────────────────────────────── */
function bandCtx(extra) {
  const code = `const escTxt = (s) => String(s == null ? '' : s); ${DR.match(/  const BAND_NAV = .*;/)[0]} ${grab(DR, 'function dutyBand(')}; ${grab(DR, 'function retailBand(')};
    globalThis.dutyBand = dutyBand; globalThis.retailBand = retailBand;`;
  const w = { KiwiTradeSchema: { wallNow: () => '2026-10-11T12:00' }, KiwiVenue: { getCurrentVenueData: () => ({ subtype: extra.trade }), getVenueType: () => extra.base || '' }, KiwiTradeWorkspaces: extra.W };
  return run(code, { window: w, Intl, Date, String, Number });
}
const empty = { lbl: 'FIN DE JOURNÉE', head: 'Rien de prévu', msg: 'Vide.' };
const W = (rows, nav) => ({ config: (n) => (n === nav ? {} : null), rows: (n) => (n === nav ? rows : []) });

ok('Accueil pharmacie : la garde en cours vient des fiches, avec l’horloge du magasin', () => {
  const rows = [{ id: 'g1', title: 'Garde de nuit', status: 2, values: { startAt: '2026-10-11T08:00', endAt: '2026-10-12T08:00', handover: 'Clés au coffre' } }];
  const html = bandCtx({ trade: 'pharmacie', W: W(rows, 'duty') }).dutyBand('fr', empty);
  assert.match(html, /EN GARDE/);
  assert.match(html, /Garde de nuit/);
  assert.match(html, /Clés au coffre/);
  assert.match(html, /nav-duty/);
});

ok('Accueil pharmacie : sans garde, un état vide honnête qui renvoie vers les fiches', () => {
  const html = bandCtx({ trade: 'pharmacie', W: W([], 'duty') }).dutyBand('fr', empty);
  assert.match(html, /Rien de prévu/);
  assert.match(html, /nav-duty/);
});

ok('Accueil librairie : les commandes spéciales, singulier/pluriel français', () => {
  const rows = [{ status: 1 }, { status: 0 }, { status: 0 }, { status: 2 }];
  const html = bandCtx({ trade: 'librairie', W: W(rows, 'bookorders') }).retailBand('fr', empty);
  assert.match(html, /<div class="big">3<\/div>/, 'la commande retirée n’est plus ouverte');
  assert.match(html, /1 arrivée à retirer/);
  assert.match(html, /2 en attente de livraison/);
  const two = bandCtx({ trade: 'librairie', W: W([{ status: 1 }, { status: 1 }], 'bookorders') }).retailBand('fr', empty);
  assert.match(two, /2 arrivées à retirer/);
});

ok('Accueil librairie / épicerie : jamais « réservations » ni « ajoutez vos tables »', () => {
  const lib = bandCtx({ trade: 'librairie', W: W([], 'bookorders') }).retailBand('fr', empty);
  const epi = bandCtx({ trade: 'epicerie', W: W([], 'bookorders') }).retailBand('fr', empty);
  [lib, epi].forEach((h) => { assert.match(h, /Rien de prévu/); assert.doesNotMatch(h, /nav-reservations|tables|Réservation/i); });
});

ok('Accueil boutique, maison, fleuriste : l\'état vide du métier, jamais « Réservations non configurées »', () => {
  for (const trade of ['boutique', 'maison', 'fleuriste', 'autre']) {
    const h = bandCtx({ trade, base: 'boutique', W: W([], 'bookorders') }).retailBand('fr', empty);
    assert.ok(h, trade + ' : aucun bandeau');
    assert.match(h, /Rien de prévu/);
    assert.doesNotMatch(h, /nav-reservations|tables|Réservation|non configur/i, trade);
  }
  const V = readFileSync(path.join(ROOT, 'assets/venues.js'), 'utf8');
  assert.doesNotMatch(V, /Les temps forts de votre journée s'afficheront ici/, 'promesse d\'un contenu qui n\'arrive jamais');
  assert.doesNotMatch(V, /Vos commandes et livraisons du jour s'afficheront ici/, 'idem pour le fleuriste');
});

ok('Accueil : un autre métier ne reçoit pas ces bandeaux', () => {
  assert.equal(bandCtx({ trade: 'restaurant', W: W([], 'bookorders') }).retailBand('fr', empty), null);
});

ok('Accueil : en anglais et en arabe aussi', () => {
  const rows = [{ status: 1 }];
  const en = bandCtx({ trade: 'librairie', W: W(rows, 'bookorders') }).retailBand('en', empty);
  const ar = bandCtx({ trade: 'librairie', W: W(rows, 'bookorders') }).retailBand('ar', empty);
  assert.match(en, /SPECIAL ORDERS/);
  assert.match(ar, /الطلبات الخاصة/);
});

/* ── 7. Tableau de bord : navigation, copie ──────────────────────────────────── */
ok('les destinations pharmacie / épicerie existent dans le profil de chaque métier', () => {
  ['drugs', 'payers'].forEach((n) => assert.ok(VENUES.includes("nav: '" + n + "'"), n));
  assert.ok(VENUES.includes("nav: 'weighed'"));
});

ok('copie : pas de tiret cadratin, pas d’italique, pas de couleur hors palette dans les fichiers touchés', () => {
  const copy = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  [['pos-pharmacie', PHARM], ['pos-librairie', LIB], ['pos-epicerie', EPI]].forEach(([n, s]) => {
    assert.doesNotMatch(copy(s), /font-style\s*:\s*italic/, n + ' italique');
  });
  /* Le schéma est du texte utilisateur pur : aucun U+2014. */
  assert.doesNotMatch(SCHEMA.replace(/\/\*[\s\S]*?\*\//g, ''), /—/, 'schéma');
});

ok('liste scolaire : pas de « Solde 0 MAD » tant qu’aucune fiche ne porte de montant', () => {
  const sc = S.get('librairie', 'schoollists');
  const bare = S.summary(sc, [{ id: 'l1', title: 'École Al Andalous', values: { level: 'CE2', items: '2 x Cahier' } }]);
  assert.equal(bare.balanceTracked, false);
  const priced = S.summary(sc, [{ id: 'l2', title: 'École Al Andalous', values: { level: 'CE2', items: '2 x Cahier', total: 120, paid: 40 } }]);
  assert.equal(priced.balanceTracked, true);
  assert.equal(priced.balance, 80);
  // Une fiche sans solde du tout (check-list des retours fleuriste) ne le suit jamais.
  assert.equal(S.summary(S.get('fleuriste', 'returns'), [{ id: 'r1', title: 'Roses', values: { qty: 3, amount: 50 } }]).balanceTracked, false);
  // La bande de la caisse n'affiche la case que dans ce cas.
  assert.match(WSJS, /\$\{sum\.balanceTracked\?`<span><b>\$\{esc\(pick\(UI\.balance\)\)\}<\/b>/);
});

ok('la fiche santé ne passe que par le document tenant-scopé, jamais dans un journal', () => {
  [PHARM, LIB, EPI, WSJS].forEach((s) => assert.doesNotMatch(s, /console\.(log|info)\([^)]*(patient|allerg|ordonnance)/i));
});

ok('épicerie : le stock au poids sort en kilos entiers, les fractions attendent sur la caisse', () => {
  const store = {};
  const sold = [];
  const ctx = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    pvPaired: () => ({ merchant: 'epicerie-test' }),
    WS: () => ({ catalog: { sell: (id, q, ref) => { sold.push([id, q, ref]); return q; } } }),
    JSON, Math,
  };
  run(grab(EPI, 'function weighKey') + grab(EPI, 'function weighPending') + grab(EPI, 'function drawWeighed'), ctx);
  assert.equal(ctx.drawWeighed('tomates', 0.4, 'T1'), 0);            // 400 g : rien ne sort encore
  assert.deepEqual(sold, []);
  assert.equal(ctx.drawWeighed('tomates', 0.75, 'T2'), 1);           // 1,15 kg cumulés : un kilo sort
  assert.equal(JSON.stringify(sold), JSON.stringify([['tomates', 1, 'T2']]));
  assert.equal(JSON.parse(store['kiwi:epWeighPending:epicerie-test']).tomates, 0.15);
  assert.equal(ctx.drawWeighed('tomates', 2.85, 'T3'), 3);           // 0,15 + 2,85 = 3 kg pile
  assert.equal(JSON.parse(store['kiwi:epWeighPending:epicerie-test']).tomates, undefined);
  // le reste en attente se déduit de l'affichage du stock réel
  assert.match(EPI, /wu \? Math\.max\(0, Math\.round\(\(n - \(\+pend\[p\.id\] \|\| 0\)\) \* 1000\) \/ 1000\) : n/);
  assert.match(EPI, /if \(ln\.weight != null\) drawWeighed\(ln\.itemId, ln\.weight, t\.num\)/);
  assert.doesNotMatch(EPI, /stock au poids n'est pas suivi/i);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
