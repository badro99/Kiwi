#!/usr/bin/env node
/* Kiwi · online-store-channel-test · « Ventes par canal » sait ce qu'est une boutique en ligne.
 *
 * Owner, 24 nov. 2026 (CHICTRATEC SL, Startoner : « he sells at the counter and
 * online »). Ses 72 commandes Shopify, reprises dans les livres avec le canal
 * 'shopify', s'affichaient « Comptoir 100 % » : le classeur ne connaissait pas ce
 * canal et tombait sur le repli « ticket de caisse boutique = comptoir ».
 *
 * Holds:
 *   · a Shopify sale is « Boutique en ligne » (eshop), never the counter, and stays
 *     unclassified rather than counter when the card shows no eshop ring;
 *   · the boutique rings gain « Boutique en ligne » beside Comptoir as soon as the
 *     period's books hold an online sale, and only then;
 *   · outside Morocco the « Chèque » ring leaves (a Spanish shop is not paid by
 *     cheque); in Morocco nothing moves;
 *   · the breakdown splits counter and online money to the cent;
 *   · the layout asks the classifier for its rings, and the label exists in FR/EN/AR.
 *   node tools/online-store-channel-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(read('assets/channel-sales.js'), context);
vm.runInNewContext(read('assets/trades.js'), context);
const truth = context.window.KiwiChannelSales;
const trades = context.window.KiwiTrades;
const boutique = { base: () => 'boutique' };
let n = 0;
const ok = (fn, msg) => { fn(); n++; console.log('  ✓ ' + msg); };

const shop = { id: 'shp:chictratec-sl:1072', channel: 'shopify', label: 'Shopify #1072', origin: 'caisse', method: 'card', amount: 32.88, ts: 2000 };
const till = { id: 's-1', label: 'Ticket 12', origin: 'caisse', method: 'cash', amount: 10, ts: 1000 };

console.log('■ une vente Shopify');
ok(() => assert.equal(truth.key(shop, ['counter', 'eshop', 'delivery'], boutique, 'boutique'), 'eshop'), 'canal shopify : Boutique en ligne');
ok(() => assert.equal(truth.key({ ...shop, channel: 'eshop' }, ['counter', 'eshop', 'delivery'], boutique, 'boutique'), 'eshop'), 'canal eshop : Boutique en ligne');
ok(() => assert.equal(truth.key(shop, ['counter', 'cheque', 'delivery'], boutique, 'boutique'), ''), 'sans anneau en ligne, elle reste non classée, jamais au comptoir');
ok(() => assert.equal(truth.key(till, ['counter', 'eshop', 'delivery'], boutique, 'boutique'), 'counter'), 'un ticket de caisse reste au comptoir');

console.log('■ les anneaux de la boutique');
const base = ['counter', 'cheque', 'delivery'];
ok(() => assert.deepEqual([...truth.rings(base, [till, shop], 'ES')], ['counter', 'eshop', 'delivery']), 'Espagne avec ventes en ligne : Comptoir · Boutique en ligne · Livraison');
ok(() => assert.deepEqual([...truth.rings(base, [till], 'ES')], ['counter', 'delivery']), 'Espagne sans vente en ligne : le chèque part, rien n’est ajouté');
ok(() => assert.deepEqual([...truth.rings(base, [till], 'MA')], base), 'Maroc sans vente en ligne : rien ne bouge');
ok(() => assert.deepEqual([...truth.rings(base, [till, shop], 'MA')], ['counter', 'eshop', 'cheque', 'delivery']), 'Maroc avec ventes en ligne : le chèque reste, la boutique en ligne s’ajoute');
ok(() => assert.deepEqual([...truth.rings(['dining', 'takeaway', 'delivery', 'orderpro'], [shop], 'ES')], ['dining', 'takeaway', 'delivery', 'orderpro']), 'un restaurant n’est pas touché');
ok(() => assert.deepEqual([...truth.rings(base, [till, shop], '')], ['counter', 'eshop', 'cheque', 'delivery']), 'pays inconnu : traité comme le Maroc');

console.log('■ la répartition');
const split = truth.breakdown([till, shop], ['counter', 'eshop', 'delivery'], 0, 5000, boutique, 'boutique', []);
ok(() => assert.equal(split.amounts.counter, 10), 'comptoir 10');
ok(() => assert.equal(split.amounts.eshop, 32.88), 'boutique en ligne 32,88');
ok(() => assert.equal(split.unknown, 0), 'rien de non classé');

console.log('■ le libellé et le branchement');
ok(() => assert.deepEqual({ ...trades.CHANNELS.eshop }, { fr: 'Boutique en ligne', en: 'Online store', ar: 'المتجر الإلكتروني' }), 'libellé FR / EN / AR');
ok(() => assert.match(read('assets/design-vexel-layout.js'), /var truth = window\.KiwiChannelSales;[\s\S]{0,600}truth\.rings\(/), 'la carte demande ses anneaux au classeur');

console.log(`✓ canal boutique en ligne : ${n} contrôles`);
