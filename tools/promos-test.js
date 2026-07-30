#!/usr/bin/env node
'use strict';

/* Les règles de prix des promotions, vérifiées sans navigateur.
 *
 * Ce qui se casse silencieusement dans un moteur de promotions, ce n'est pas
 * l'affichage : c'est l'arbitrage. Deux affiches en vitrine sur le même caftan,
 * une promotion terminée hier qui s'applique encore, un cumul qui descend un
 * ticket à zéro. Rien de tout ça ne se voit à l'œil sur une capture d'écran —
 * ça se voit sur un prix, et un prix se vérifie ici. */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'promos.js'), 'utf8');
const data = new Map();
const localStorage = {
  getItem: (k) => (data.has(k) ? data.get(k) : null),
  setItem: (k, v) => data.set(k, String(v)),
  removeItem: (k) => data.delete(k),
};
const window = { localStorage };
const context = { window, localStorage, console, Set, Math, Date, JSON, Number, Object, Array, String };
vm.runInNewContext(source, context, { filename: 'promos.js' });
const PR = window.KiwiPromos;

let failed = 0, ran = 0;
function check(ok, label) {
  ran++;
  if (!ok) { console.error(`  ✗ ${label}`); failed++; return; }
  console.log(`  ✓ ${label}`);
}
const DAY = 86400000;
const now = 1767225600000;                      /* instant fixe : un test daté « maintenant » ment un jour sur deux */

const item = (o) => Object.assign({ id: 'p1', name: 'Caftan', price: 1000, cost: 400, rayon: 'caftans', createdAt: now - 200 * DAY, sizes: { M: 4 } }, o);

/* ── la baisse elle-même ─────────────────────────────────────────────────── */
PR.reset();
PR.save({ id: 'a', name: 'Trente', kind: 'percent', value: 30, scope: { type: 'tout' } });
check(PR.priceFor(item(), { now }).price === 700, 'une remise en pourcentage baisse le prix affiché');

PR.reset();
PR.save({ id: 'a', kind: 'amount', value: 150, scope: { type: 'tout' } });
check(PR.priceFor(item(), { now }).price === 850, 'une remise en dirhams se retire du prix');

PR.reset();
PR.save({ id: 'a', kind: 'fixed', value: 499, scope: { type: 'tout' } });
check(PR.priceFor(item(), { now }).price === 499, 'un prix fixe remplace le prix catalogue');

/* Un article à 200 MAD dans une promotion « −500 MAD » ne peut pas finir à
   −300 : la caisse rendrait de l'argent à chaque vente. */
PR.reset();
PR.save({ id: 'a', kind: 'amount', value: 500, scope: { type: 'tout' } });
check(PR.priceFor(item({ price: 200 }), { now }).price === 0, 'une baisse plus grande que le prix s\'arrête à zéro, jamais en dessous');

/* Un « prix fixe » supérieur au prix catalogue ferait payer la promotion PLUS
   cher que l'étiquette. On ne l'applique pas du tout. */
PR.reset();
PR.save({ id: 'a', kind: 'fixed', value: 1500, scope: { type: 'tout' } });
check(PR.priceFor(item(), { now }) === null, 'une promotion qui ne baisse rien ne s\'applique pas');

/* ── la cible ────────────────────────────────────────────────────────────── */
PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 10, scope: { type: 'rayon', ids: ['caftans'] } });
check(!!PR.priceFor(item(), { now }), 'un rayon visé est remisé');
check(PR.priceFor(item({ rayon: 'sacs' }), { now }) === null, 'un rayon non visé garde son prix');

PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 10, scope: { type: 'produits', ids: ['p1'] } });
check(!!PR.priceFor(item(), { now }), 'un article choisi un par un est remisé');
check(PR.priceFor(item({ id: 'p2' }), { now }) === null, 'son voisin ne l\'est pas');

PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 10, scope: { type: 'avant', before: now - 100 * DAY } });
check(!!PR.priceFor(item(), { now }), 'le déstockage vise ce qui est entré avant la date');
check(PR.priceFor(item({ createdAt: now - 10 * DAY }), { now }) === null, 'l\'arrivage récent n\'est pas déstocké');

/* Une cible « avant » sans date visait TOUT le magasin dans une première
   version : une promotion à moitié saisie bradait la boutique entière. */
PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 50, scope: { type: 'avant' } });
check(PR.priceFor(item(), { now }) === null, 'un déstockage sans date ne vise rien plutôt que tout');

PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 20, scope: { type: 'stock', max: 5 } });
check(!!PR.priceFor(item({ sizes: { M: 3 } }), { now }), 'la fin de série vise les articles sous le seuil');
check(PR.priceFor(item({ sizes: { M: 9 } }), { now }) === null, 'un article bien approvisionné garde son prix');
check(PR.priceFor(item({ sizes: { M: 0 } }), { now }) === null, 'un article épuisé ne porte pas d\'affiche de fin de série');

/* ── la fenêtre de temps ─────────────────────────────────────────────────── */
PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 30, scope: { type: 'tout' }, from: now + DAY });
check(PR.priceFor(item(), { now }) === null, 'une promotion programmée ne s\'applique pas avant l\'heure');
check(PR.priceFor(item(), { now: now + 2 * DAY }).price === 700, 'elle s\'applique une fois l\'heure venue');

PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 30, scope: { type: 'tout' }, to: now - DAY });
check(PR.priceFor(item(), { now }) === null, 'une promotion terminée cesse d\'elle-même, sans geste');

PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 30, scope: { type: 'tout' }, paused: true });
check(PR.priceFor(item(), { now }) === null, 'une promotion en pause ne remise plus');
PR.setPaused('a', false);
check(PR.priceFor(item(), { now }).price === 700, 'la reprendre la remet en vitrine');

/* ── DEUX PROMOTIONS SUR UN MÊME ARTICLE ─────────────────────────────────── */
/* La MEILLEURE est enregistrée en PREMIER, la moins bonne ensuite : sans cet
   ordre, « on garde la dernière créée » passerait le test par accident et on
   croirait avoir vérifié l'arbitrage alors qu'on n'a rien vérifié du tout. */
PR.reset();
PR.save({ id: 'b', name: 'Tout −30', kind: 'percent', value: 30, scope: { type: 'tout' }, createdAt: now - 5 * DAY });
PR.save({ id: 'a', name: 'Rayon −10', kind: 'percent', value: 10, scope: { type: 'rayon', ids: ['caftans'] }, createdAt: now - DAY });
const two = PR.priceFor(item(), { now });
check(two.price === 700, 'deux promotions ne se cumulent pas — la meilleure pour la cliente gagne');
check(two.promo.id === 'b', 'et c\'est bien celle-là qui est nommée sur le ticket');
/* 1000 − 30 % puis − 10 % ferait 630 : le cumul se voit ici et nulle part
   ailleurs, parce qu'à l'écran 630 ressemble à un prix parfaitement normal. */
check(two.price !== 630, 'les deux baisses ne s\'empilent pas l\'une sur l\'autre');

/* À prix égal, la plus ancienne : sinon l'affiche en vitrine change de nom le
   jour où le commerçant crée une promotion équivalente. */
PR.reset();
PR.save({ id: 'vieille', kind: 'percent', value: 20, scope: { type: 'tout' }, createdAt: now - 10 * DAY });
PR.save({ id: 'neuve', kind: 'amount', value: 200, scope: { type: 'tout' }, createdAt: now - DAY });
check(PR.priceFor(item(), { now }).promo.id === 'vieille', 'à prix égal, c\'est la plus ancienne qui reste affichée');

/* ── l'aperçu avant d'enregistrer ────────────────────────────────────────── */
PR.reset();
const cat = [item({ id: 'p1', price: 1000, cost: 400 }), item({ id: 'p2', price: 500, cost: 450 }), item({ id: 'p3', price: 300, cost: 100, rayon: 'sacs' })];
const pv = PR.preview({ kind: 'percent', value: 50, scope: { type: 'tout' } }, cat);
check(pv.count === 3, 'l\'aperçu compte les articles visés avant d\'enregistrer');
check(pv.from === 1800 && pv.to === 900, 'il chiffre le avant et le après');
check(pv.under === 1, 'et il compte ceux qui passeraient sous le prix d\'achat');

/* ── suppression et fusion entre deux caisses ────────────────────────────── */
PR.reset();
PR.save({ id: 'a', kind: 'percent', value: 30, scope: { type: 'tout' } });
PR.remove('a');
check(PR.list().length === 0 && PR.priceFor(item(), { now }) === null, 'une promotion supprimée cesse de remiser');

/* La caisse du fond porte encore la promotion effacée au comptoir. Sans pierre
   tombale, elle la renvoie à chaque échange et la remise ne meurt jamais. */
const comptoir = { v: 1, promos: [], deleted: [{ id: 'a', at: now }] };
const fond = { v: 1, promos: [PR.normalize({ id: 'a', kind: 'percent', value: 30, scope: { type: 'tout' }, updatedAt: now - DAY })], deleted: [] };
check(PR.merge(comptoir, fond).promos.length === 0, 'la suppression d\'une caisse ne revient pas par l\'autre');

/* Mais la corriger APRÈS l'avoir supprimée doit la ressusciter, sinon un
   commerçant ne peut plus jamais réutiliser cette promotion. */
const reprise = { v: 1, promos: [PR.normalize({ id: 'a', kind: 'percent', value: 15, scope: { type: 'tout' }, updatedAt: now + DAY })], deleted: [] };
check(PR.merge(comptoir, reprise).promos.length === 1, 'une promotion recréée après coup revit');

/* mergeDefault() de cloud-doc.js garde toujours NOTRE version : la correction
   faite au bureau n'atteindrait jamais le comptoir. On arbitre par date. */
const vieux = { v: 1, promos: [PR.normalize({ id: 'a', name: 'Ancien', kind: 'percent', value: 10, scope: { type: 'tout' }, updatedAt: now - DAY })], deleted: [] };
const frais = { v: 1, promos: [PR.normalize({ id: 'a', name: 'Corrigé', kind: 'percent', value: 40, scope: { type: 'tout' }, updatedAt: now })], deleted: [] };
check(PR.merge(vieux, frais).promos[0].value === 40, 'la version la plus récente l\'emporte, d\'où qu\'elle vienne');

/* ── saisie hostile ──────────────────────────────────────────────────────── */
const junk = PR.normalize({ kind: 'chelou', value: -40, scope: { type: 'nawak' } });
check(junk.kind === 'percent' && junk.value === 0 && junk.scope.type === 'tout', 'une promotion illisible retombe sur une valeur inoffensive');
check(PR.normalize({ kind: 'percent', value: 300 }).value === 100, 'on ne remise pas plus de cent pour cent');

if (failed) { console.error(`\n✗ ${failed} vérification(s) de promotions en échec.`); process.exit(1); }
console.log(`\n✓ ${ran} règles de promotions vérifiées.`);
