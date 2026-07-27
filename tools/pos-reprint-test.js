#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · GARDE-FOU du bouton « Réimprimer » (assets/pos-reprint.js)
 * ---------------------------------------------------------------------------
 * Une réimpression peut nuire de trois façons, et ce fichier ferme les trois.
 *
 *  1. ENCAISSER DEUX FOIS. Si réimprimer passait par le chemin d'une vente, le
 *     tiroir monterait sans qu'un dirham soit entré. C'est l'erreur que le
 *     bouton existe pour éviter — refaire la vente était le seul recours avant
 *     lui — et ce serait une régression cruelle de l'y ramener.
 *  2. RENUMÉROTER. Un duplicata qui porte un numéro neuf, ou l'heure de la
 *     réimpression, est introuvable au rapprochement : le comptable cherche un
 *     ticket de 19 h 05 pour une vente de 12 h 40.
 *  3. SE TAIRE. Deux exemplaires du même reçu qui circulent sans le dire, c'est
 *     une pièce qu'on ne peut plus rapprocher, et un retour remboursable deux
 *     fois.
 *
 * On charge le VRAI module (pas une copie de sa logique) dans un DOM de poche,
 * et on lui donne un KiwiReceipt espion : ce qu'il demande à imprimer est
 * exactement ce que le client aurait en main.
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'assets', 'pos-reprint.js');

let pass = 0;
const fails = [];
function ok(label, cond) { if (cond) pass++; else fails.push(label); }
function eq(label, got, want) {
  if (got === want) pass++;
  else fails.push(`${label} — attendu ${JSON.stringify(want)}, obtenu ${JSON.stringify(got)}`);
}

/* Un DOM de poche. Le module n'y touche qu'au montage et pour les toasts ;
   rows()/docFrom()/reprint() n'en ont pas besoin. */
function stubDom() {
  const node = () => ({
    style: {}, className: '', id: '', innerHTML: '', type: '',
    classList: { add() {}, remove() {}, contains: () => false },
    appendChild() {}, insertBefore() {}, setAttribute() {}, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], remove() {},
  });
  return {
    getElementById: () => null,
    createElement: node,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: node(),
    head: { appendChild() {} },
  };
}

/* Le reçu, espionné. On note ce qu'on lui demande de construire et
   d'imprimer — et surtout, on note si quelqu'un a tiré un numéro neuf. */
function spyReceipt(state) {
  return {
    build(sale, opts) { state.built = { sale, opts }; return { __doc: true, sale, opts }; },
    fromSnapshot(snap, opts) { state.fromSnap = { snap, opts }; return { __doc: true, snap, opts }; },
    print(doc) { state.printed = doc; return Promise.resolve({ ok: true, via: 'usb' }); },
    nextRef() { state.mintedRef = true; return 'NEUF-999'; },
  };
}

function load(extra) {
  const state = { built: null, printed: null, fromSnap: null, mintedRef: false, recorded: [] };
  const ctx = {
    window: Object.assign({
      KiwiReceipt: spyReceipt(state),
      KiwiPosSale: {
        isReal: () => true,
        today: () => (extra && extra.today) || [],
        /* Si le module appelait ceci, la caisse encaisserait une deuxième fois. */
        record: (v, s) => { state.recorded.push([v, s]); return s; },
        nextSeq: () => 1,
      },
    }, (extra && extra.window) || {}),
    document: stubDom(),
    setTimeout, clearTimeout, Promise, Date, Math, JSON, Array, String, Number, RegExp, isNaN,
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx, { filename: 'pos-reprint.js' });
  return { RP: ctx.window.KiwiPosReprint, state };
}

const T = Date.now();
const at = (minsAgo) => T - minsAgo * 60000;

const SALE = {
  ts: at(90), total: 84.5, method: 'cash', raw: 'espèces',
  label: 'Pain +3 art.', ref: 'T-642-A7',
  lines: [{ name: 'Pain complet', qty: 2, total: 24 }, { name: 'Msemen', qty: 3, total: 60.5 }],
};

/* ═══ 1 · une réimpression n'est pas une vente ═══ */
{
  const { RP, state } = load({ today: [SALE] });
  RP.reprint('boulangerie', SALE);
  ok('aucune vente enregistrée par une réimpression', state.recorded.length === 0);
  ok('aucun numéro neuf tiré par une réimpression', state.mintedRef === false);
}

/* ═══ 2 · le ticket est l'original ═══ */
{
  const { RP } = load({});
  const d = RP.docFrom(SALE);
  eq('le numéro d\'origine est repris', d.ref, 'T-642-A7');
  eq('l\'heure d\'origine est reprise', d.ts, SALE.ts);
  eq('le total d\'origine est repris', d.total, 84.5);
  eq('les lignes suivent', d.lines.length, 2);
  eq('le mot du métier passe avant le mot normalisé', d.method, 'espèces');

  /* Le piège : une vente SANS numéro. Tenté de « réparer » en en tirant un —
     ce serait fabriquer une pièce qui n'existe dans aucun livre. */
  const nude = RP.docFrom({ ts: at(5), total: 12, method: 'cash', ref: '' });
  eq('une vente sans numéro reste sans numéro', nude.ref, '');
}

/* ═══ 3 · le double se dit ═══ */
{
  const { RP, state } = load({});
  RP.reprint('epicerie', SALE);
  ok('la construction demande la mention de duplicata', !!(state.built && state.built.opts && state.built.opts.copy === true));
  ok('c\'est bien ce document qui part à l\'impression', state.printed && state.printed.__doc === true);

  /* `true` et non « DUPLICATA » : le mot doit venir de la langue du ticket,
     sinon un reçu arabe sort avec un mot français (voir assets/receipt.js). */
  eq('le mot n\'est pas écrit en dur en français', typeof state.built.opts.copy, 'boolean');
}

/* ═══ le ticket figé de la boutique passe avant toute recomposition ═══ */
{
  const { RP, state } = load({});
  const withSnap = Object.assign({}, SALE, { rc: { ref: 'MM-1208', frozen: true } });
  RP.reprint('boutique', withSnap);
  ok('le ticket figé est rouvert tel quel', !!state.fromSnap);
  ok('il n\'est pas recomposé à côté', state.built === null);
  ok('et il porte lui aussi la mention', state.fromSnap.opts.copy === true);
}

/* ═══ la liste : aujourd'hui, le plus récent d'abord ═══ */
{
  const vieille = Object.assign({}, SALE, { ref: 'HIER', ts: T - 30 * 3600000 });
  const recente = Object.assign({}, SALE, { ref: 'RECENTE', ts: at(2) });
  const differee = Object.assign({}, SALE, { ref: 'DIFFERE', ts: at(10), total: 0 });
  const { RP } = load({ today: [SALE, vieille, recente, differee] });
  const r = RP.rows('boulangerie');
  eq('la veille ne figure pas dans la liste du jour', r.filter((x) => x.ref === 'HIER').length, 0);
  eq('un encaissement différé (0 MAD) n\'a pas de ticket', r.filter((x) => x.ref === 'DIFFERE').length, 0);
  eq('la plus récente est en tête', r[0].ref, 'RECENTE');
  eq('les ventes du jour sont toutes là', r.length, 2);
}

/* ═══ un métier qui tient son propre journal s'annonce ═══ */
{
  const { RP } = load({ today: [SALE] });
  RP.provide('boutique', () => [{ ts: at(3), total: 300, ref: 'MM-1208', label: 'Chemise' }]);
  eq('le journal du métier passe avant le journal partagé', RP.rows('boutique')[0].ref, 'MM-1208');
  eq('les autres métiers lisent toujours le journal partagé', RP.rows('epicerie')[0].ref, 'T-642-A7');
}

/* ═══ la démo ne change pas d'un pixel ═══ */
{
  const { RP } = load({ window: { KiwiPosSale: { isReal: () => false, today: () => [SALE] } } });
  let inserted = 0;
  const lock = { className: 'ep-lock-btn', id: 'ep-lock', parentNode: { insertBefore() { inserted++; } } };
  const root = { querySelector: (s) => (s === '.kx-reprint' ? null : lock) };
  eq('aucun bouton posé sur une démo', RP.mount(root, 'epicerie'), null);
  eq('et rien inséré dans son écran', inserted, 0);
}

/* ═══ sans imprimante, on le dit — on ne fait pas semblant ═══ */
{
  const { RP, state } = load({ window: { KiwiReceipt: null } });
  Promise.resolve(RP.reprint('epicerie', SALE)).then((r) => {
    eq('sans module de reçu, rien n\'est imprimé', r, null);
    ok('et rien n\'a été construit', state.built === null);
    done();
  }).catch((e) => {
    fails.push(`sans module de reçu — ${e && e.message}`);
    done();
  });
}

function done() {
  if (fails.length) {
    console.log(`\n  ✗ réimprimer un ticket — ${fails.length} échec(s) sur ${pass + fails.length}`);
    fails.forEach((f) => console.log(`     · ${f}`));
    process.exit(1);
  }
  console.log(`  ✓ réimprimer un ticket (${pass} contrôles : pas de double encaissement, numéro et heure d'origine, mention du duplicata, démo intacte)`);
}
