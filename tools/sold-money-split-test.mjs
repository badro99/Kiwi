#!/usr/bin/env node
/* Vendus · l'argent du jour se lit en deux : dans la caisse, chez le livreur.
 *
 * Santos, 25 novembre 2026 : la case « Chiffre produits » affichait 10 750 MAD.
 * 4 100 étaient payés au comptoir, 600 venaient d'un ticket annulé ensuite, et
 * 6 050 étaient huit livraisons encore chez le livreur, payées à la réception.
 * Le patron a lu 10 750 comme sa recette. Ce test rejoue cette journée, avec la
 * forme exacte des lignes du flux serveur et du journal local de la caisse. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'assets/sold-insights.js'), 'utf8');
const lang = fs.readFileSync(path.join(ROOT, 'assets/caisse-lang.js'), 'utf8');

function load(langCode = 'fr', { till = false, sales = [] } = {}) {
  const window = {
    KiwiBoutiqueCatalog: { listCategories: () => [], listProducts: () => [], listVariants: () => [] },
    KiwiBoutiqueDemoDay: () => sales,
    addEventListener() {},
  };
  /* Le tableau de bord donne sa langue par KiwiI18n ; la caisse, par <html lang>. */
  if (!till) window.KiwiI18n = { getLang: () => langCode };
  const document = {
    documentElement: { lang: langCode, getAttribute: (k) => (k === 'lang' ? langCode : null) },
    getElementById: () => null, createElement: () => ({}), head: { appendChild() {} },
  };
  const ctx = vm.createContext({
    window, document, localStorage: { getItem: () => null }, console, Date, Intl, Number, String, Math, Array, Object, JSON, Promise, setTimeout() {},
  });
  vm.runInContext(src, ctx);
  return window.KiwiSoldInsights;
}
function paint(S) {
  const panel = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
  S.renderTill(panel);
  return panel.innerHTML;
}

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

const H = (hh, mm) => new Date(2026, 10, 25, hh, mm).getTime();
const line = (name, qty, total) => ({ name, qty, total });
/* Une vente du flux serveur (/api/feed) : amountCents = encaissé, paymentParts = détail. */
const counter = (ref, at, cents, method, lines) => ({ id: 'sale-ref-' + ref, ref, ts: at, amount: cents / 100, amountCents: cents, method, paymentParts: [{ method, amountCents: cents }], label: lines[0].name, lines });
const courier = (ref, at, cents, lines) => ({ id: 'sale-ref-' + ref, ref, ts: at, amount: 0, amountCents: 0, method: 'delivery', channel: 'delivery', paymentParts: [{ method: 'delivery', amountCents: cents }], label: lines[0].name, lines });

const server = [
  counter('40001', H(14, 8), 40000, 'cash', [line('Gardigon bazek S', 2, 400)]),
  counter('40002', H(14, 57), 20000, 'cash', [line('Pantalon classe L', 1, 200)]),
  /* 40003 (600, carte) a été annulé : le flux serveur ne le sert plus. */
  counter('40004', H(17, 23), 65000, 'cash', [line('Gardigon bazek S', 2, 400), line('Capuchon adidas S', 1, 250)]),
  counter('40005', H(17, 50), 145000, 'cash', [line('Pantalon classe L', 3, 600), line('Jupe sky M', 1, 250), line('Gardigon bazek S', 2, 400), line('Chemis basic S', 1, 200)]),
  counter('40006', H(18, 31), 110000, 'cash', [line('Enssnble 4 botones cour S', 1, 450), line('boodie maille M', 1, 150), line('Pantalon classe L', 1, 200), line('Vist rey S', 1, 300)]),
  courier('39505', H(18, 46), 180000, [line('Pantalon classe L', 2, 400), line('Tranch courte XL', 1, 350), line('Sourvit santos M', 1, 400), line('Manteco manteu S', 1, 650)]),
  courier('39506', H(18, 52), 125000, [line('Jupe sky M', 1, 250), line('Pull basic tommy S', 2, 400), line('Pantalon juens M', 1, 200), line('Bomber kashmer M', 1, 400)]),
  courier('39507', H(18, 55), 40000, [line('Pantalon classe L', 2, 400)]),
  courier('39508', H(18, 59), 40000, [line('Sourvit santos M', 1, 400)]),
  courier('39509', H(19, 5), 65000, [line('Manteco manteu S', 1, 650)]),
  courier('42501', H(19, 24), 50000, [line('Tranch minitir S', 1, 500)]),
  courier('42502', H(19, 31), 65000, [line('Tranch daan M', 1, 650)]),
  courier('42503', H(19, 34), 40000, [line('SUR0001 S', 1, 400)]),
  counter('43001', H(20, 30), 30000, 'cash', [line('Vist rey S', 1, 300)]),
];
/* Le journal local de la caisse garde le ticket annulé, marqué `voided`, et
   ses propres copies des tickets déjà envoyés (sans amountCents). */
const local = [
  { id: '40003', at: new Date(H(15, 36)).toISOString(), voided: true, parts: [{ m: 'carte', amount: 600 }], total: 600,
    lines: [{ pid: 'prod_1267', qty: 2, unit: 200, name: 'Pantalon classe L' }, { pid: 'prod_875', qty: 1, unit: 200, name: 'Chemis basic S' }] },
  { id: '40001', at: new Date(H(14, 8)).toISOString(), parts: [{ m: 'especes', amount: 400 }], total: 400, lines: [{ pid: 'prod_1222', qty: 2, unit: 200, name: 'Gardigon bazek S' }] },
  { id: '39507', at: new Date(H(18, 55)).toISOString(), parts: [{ m: 'livraison', amount: 400 }], total: 400, lines: [{ pid: 'prod_1267', qty: 2, unit: 200, name: 'Pantalon classe L' }] },
];
const today = { from: '2026-11-25', to: '2026-11-25' };

/* 1. La journée de Santos, telle que le serveur et la caisse la connaissent. */
{
  const S = load();
  const a = S.analyze(local.concat(server), today);
  ok(a.money.till === 410000, 'dans la caisse : 4 100 MAD, pas 10 750 (got ' + a.money.till / 100 + ')');
  ok(a.money.courier === 605000, 'chez le livreur : 6 050 MAD (got ' + a.money.courier / 100 + ')');
  ok(a.money.counter === 6 && a.money.pending === 8 && a.money.deliveries === 8, 'six ventes au comptoir, huit livraisons pas encore payées');
  ok(a.money.till + a.money.courier === a.revenue * 100, 'les deux parts font la valeur des articles vendus (10 150)');
  ok(a.tickets === 14 && a.units === 35, 'le ticket annulé que la caisse garde en local ne compte plus (14 tickets, 35 pièces)');
}

/* 2. Le livreur rapporte une partie : l'argent change de case, il ne double pas. */
{
  const S = load();
  const collection = { id: 'col-1', ref: '39505', ts: H(21, 10), amount: 1800, amountCents: 180000, method: 'cash', channel: 'delivery',
    label: 'Livraison reçue · Pantalon classe +3 art.', lines: [line('Pantalon classe L', 2, 400)] };
  const a = S.analyze(server.concat([collection]), today);
  ok(a.money.till === 590000 && a.money.courier === 425000, 'le livreur paie 39505 : 1 800 passent de « chez le livreur » à « dans la caisse »');
  ok(a.money.brought === 180000 && a.money.pending === 7, 'la caisse dit combien le livreur a rapporté, il reste sept livraisons');
  ok(a.units === 35 && a.tickets === 14, 'l’encaissement du livreur n’est pas une nouvelle vente d’articles');
  /* Le lendemain, la livraison d'hier rapportée compte dans la caisse du jour, sans articles. */
  const next = S.analyze(server.concat([{ ...collection, ts: new Date(2026, 10, 26, 11, 0).getTime() }]), { from: '2026-11-26', to: '2026-11-26' });
  ok(next.money.till === 180000 && next.money.courier === 0 && next.money.brought === 180000, 'une livraison d’hier payée aujourd’hui entre dans la caisse d’aujourd’hui');
}

/* 3. Un avoir n'est pas de l'argent en caisse ; un remboursement ne casse rien. */
{
  const S = load();
  const credit = { id: 'x', ref: '50001', ts: H(12, 0), amount: 100, amountCents: 10000, method: 'split',
    paymentParts: [{ method: 'store-credit', amountCents: 30000 }, { method: 'cash', amountCents: 10000 }], lines: [line('Jupe', 1, 400)] };
  const refund = { id: 'r', ref: '50001', ts: H(13, 0), amount: -100, amountCents: -10000, method: 'cash', lines: [line('Jupe', 1, 400)] };
  const a = S.analyze([refund, credit], today);
  ok(a.money.till === 10000 && a.money.courier === 0, 'payé 300 en avoir + 100 en espèces : 100 dans la caisse');
}

/* 4. Ce que voit la personne à la caisse, et dans sa langue. Les ventes sont
   datées d'aujourd'hui : le panneau s'ouvre sur sa période par défaut. */
{
  const now = new Date(); const at = (m) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() - m).getTime();
  const day = [counter('1', at(30), 40000, 'cash', [line('Chemise', 2, 400)]), courier('2', at(20), 65000, [line('Manteau', 1, 650)]),
    courier('3', at(10), 40000, [line('Jupe', 1, 400)])];
  const fr = paint(load('fr', { till: true, sales: day }));
  ok(/L’argent/.test(fr) && /Dans la caisse/.test(fr) && /Chez le livreur/.test(fr), 'la bande dit « Dans la caisse » et « Chez le livreur »');
  ok(/<b>1\s?450<\/b>/.test(fr.replace(/&nbsp;|\u202f|\u00a0/g, ' ')) && /1 vente payée au comptoir/.test(fr) && /2 livraisons pas encore payées/.test(fr), '400 + 1 050 = 1 450 ; une vente au comptoir, deux livraisons en route');
  ok(!/Chiffre produits/.test(fr), 'la case « Chiffre produits » qui mélangeait les deux a disparu');
  ok(/class="ksold-money-bar" role="group" aria-label="[^"]*dans la caisse[^"]*chez le livreur/.test(fr), 'la barre se lit aussi au lecteur d’écran');
  ok(/prefers-reduced-motion:reduce\)\{\.ksold-money/.test(src), 'les rayures qui roulent s’arrêtent si l’appareil demande moins de mouvement');
  const ar = paint(load('ar', { till: true, sales: day }));
  ok(/في الصندوق/.test(ar) && /عند عامل التوصيل/.test(ar) && /طلبات توصيل لم تُدفع بعد: 2/.test(ar) && !/Dans la caisse/.test(ar), 'caisse en arabe (lue sur <html lang>) : la bande parle arabe');
  const en = paint(load('en', { till: true, sales: day }));
  ok(/In the till/.test(en) && /With the courier/.test(en) && /2 deliveries not paid yet/.test(en) && /Items sold/.test(en), 'caisse en anglais : toute la page suit, pas seulement la bande');
  const none = paint(load('fr', { till: true, sales: [counter('9', at(5), 30000, 'cash', [line('Vist', 1, 300)])] }));
  ok(/Dans la caisse/.test(none) && !/Chez le livreur/.test(none), 'sans livraison, un seul bloc : tout est dans la caisse');
}

console.log(`  ✓ Vendus · argent en deux (${checks} contrôles : Santos 25 nov. 4 100 en caisse + 6 050 chez le livreur, livreur qui rapporte, avoir, annulation, traductions)`);
