#!/usr/bin/env node
/* Kiwi · country-display-test · ce qu'un commerce espagnol voit et imprime.
 *
 * Owner, 24 November 2026 (CHICTRATEC SL, the Startoner shop, in Spain): « this
 * company is mainly in spain, so please also change what needs to be changed for
 * that ». The interface stays in French (owner's choice the same day); the money
 * unit, the printed ticket and its legal words follow the store's country.
 *
 * Holds:
 *   unit    · « 120 MAD » → « 120 € », a lone « MAD » cell → « € », « MAD/mois »
 *             → « €/mois »; a product named « MAD MAX » is left alone;
 *   ticket  · a Spanish store prints in Spanish and euros (FACTURA SIMPLIFICADA,
 *             Efectivo, € as CP1252 0x80 on the thermal printer), its tax field
 *             reads NIF; a Moroccan store prints exactly as before (REÇU, MAD);
 *   loading · merchant-config.js and kiwi-country.js load the country files by a
 *             URL written in code, which bump-stamp does not move: each must
 *             match the service worker's precache entry.
 *   node tools/country-display-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import Countries from '../assets/country-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let n = 0, bad = 0;
const ok = (cond, msg, detail) => { if (cond) { n++; console.log('  ✓ ' + msg); } else { bad++; console.log('  ✗ ' + msg + (detail !== undefined ? ' · ' + JSON.stringify(detail) : '')); } };

function till(profile) {
  const storage = new Map();
  const appended = [];
  const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, createElement() { return {}; }, head: { appendChild(el) { appended.push(el.src); } } };
  const window = { document, KiwiConfig: profile ? { countryProfile: profile, slugNow: () => 'startoner' } : { slugNow: () => 'santos' } };
  const context = vm.createContext({
    window, document, console,
    localStorage: { getItem(k) { return storage.get(k) || null; }, setItem(k, v) { storage.set(k, String(v)); }, key() { return null; }, length: 0 },
    sessionStorage: { getItem() { return null; }, setItem() {} },
    setTimeout() { return 0; }, clearTimeout() {}, Uint8Array, Uint8ClampedArray, Promise, Date,
  });
  vm.runInContext(read('assets/escpos.js'), context);
  vm.runInContext(read('assets/receipt.js'), context);
  if (profile) {
    vm.runInContext(read('assets/kiwi-country.js'), context);
    vm.runInContext(read('assets/receipt-country.js'), context);
    window.KiwiCurrency.apply();   // pas de <body> ici : pose seulement la devise du ticket imprimé
  }
  return { window, R: window.KiwiReceipt, appended };
}
const sale = { ref: '0001', lines: [{ qty: 2, name: 'Lote tinta HP 940XL compatible', total: 32.88 }], total: 32.88, pay: [{ label: 'espèces', amount: 32.88 }] };

console.log('■ les mots du pays');
const oppo = read('assets/oppo-cards.js');
ok(/dc: \{ ES: \{ fr: '.*?espagnol ou anglais/.test(oppo) && /pick\(\(c\.dc && c\.dc\[country\(\)\]\) \|\| c\.d\)/.test(oppo), 'l’agent parle « français, espagnol ou anglais » à un commerce espagnol, pas darija');
const mc = read('assets/merchant-config.js');
const grab = (src, start) => { const i = src.indexOf(start); let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } return ''; };
const gate = (cfg) => vm.runInNewContext(grab(mc, 'var HANDLER_ALIASES') + ';' + grab(mc, 'function optInOff') + grab(mc, 'function foreignOff') + grab(mc, 'function featureOff') + '; featureOff', { cfg });
ok(gate({ features: {}, countryProfile: Countries.profile('ES') })('cheques') === true, '« Chèques et effets » (banques marocaines, LCN) quitte la barre d’un commerce espagnol');
ok(gate({ features: {}, countryProfile: Countries.profile('MA') })('cheques') === false && gate({ features: {} })('cheques') === false, 'un commerce marocain, ou sans pays connu, le garde');
ok(gate({ features: {}, countryProfile: Countries.profile('ES') })('crm') === false, 'les autres modules ne bougent pas');
console.log('■ l’unité à l’écran');
const es = till(Countries.profile('ES'));
const rw = (s) => es.window.KiwiCurrency.rewrite(s, '€');
ok(rw('120 MAD') === '120 €' && rw('1 234,56 MAD') === '1 234,56 €', '« 120 MAD » devient « 120 € »', [rw('120 MAD'), rw('1 234,56 MAD')]);
ok(rw('0MAD') === '0 €', 'un montant collé à son unité garde une espace insécable', rw('0MAD'));
ok(rw('MAD') === '€' && rw('  MAD ') === '  € ', 'une cellule qui ne dit que « MAD » dit « € »');
ok(rw('380 MAD/soir') === '380 €/soir' && rw('prix en MAD/kg') === 'prix en €/kg', '« MAD/… » devient « €/… »', [rw('380 MAD/soir'), rw('prix en MAD/kg')]);
ok(rw('T-shirt MAD MAX') === 'T-shirt MAD MAX' && rw('MADRID') === 'MADRID', 'un nom de produit ou une ville ne sont pas touchés', [rw('T-shirt MAD MAX'), rw('MADRID')]);
ok(rw('MAD encaissé') === '€ encaissé' && rw('MAD collected') === '€ collected', 'une unité suivie de son mot (« MAD encaissé ») devient « € encaissé »', [rw('MAD encaissé'), rw('MAD collected')]);
ok(rw('MAD MAX') === 'MAD MAX', 'un nom en capitales qui commence par MAD reste tel quel', rw('MAD MAX'));
ok(rw('Kiwi Wallet') === 'PayPal / Bizum' && rw('QR / Wallet') === 'PayPal / Bizum' && rw('65 % en QR / Wallet') === '65 % en PayPal / Bizum' && rw('sont en QR / wallet.') === 'sont en PayPal / Bizum.', 'en Espagne le portefeuille se nomme PayPal / Bizum', [rw('Kiwi Wallet'), rw('QR / Wallet')]);
ok(rw('Carte bancaire') === 'Carte bancaire' && rw('Wallet') === 'Wallet', 'les autres moyens ne bougent pas', [rw('Carte bancaire'), rw('Wallet')]);
ok(!Countries.profile('MA').walletLabel && Countries.profile('ES').walletLabel === 'PayPal / Bizum', 'le Maroc garde ses libellés, l’Espagne porte le sien');
ok(es.appended.length === 0 || es.appended.every((u) => /receipt-country\.js/.test(u)), 'kiwi-country.js ne charge que le ticket du pays', es.appended);

console.log('■ le ticket');
let txt = es.R.text(es.R.build(sale));
ok(/FACTURA SIMPLIFICADA/.test(txt) && /Efectivo/.test(txt) && /€/.test(txt) && !/MAD/.test(txt), 'un commerce espagnol imprime en espagnol et en euros', txt);
const vat = es.R.build(sale).totals.vat;
ok(vat && vat.rate === 21 && vat.ht === 27.17 && vat.tva === 5.71 && vat.included, 'IVA 21 % inclus par défaut : base 27,17 €, IVA 5,71 € sur 32,88 €', vat);
ok(/IVA 21 %\s+5,71 €/.test(txt) && /Base imponible/.test(es.R.html(es.R.build(sale))), 'le ticket dit l’IVA, et la base imponible à l’écran et sur papier', txt);
const bytes = Array.from(es.R.escpos(es.R.build(sale)));
ok(bytes.includes(0x80), 'le ticket thermique porte « € » (0x80 en CP1252)');
const ice = es.R.LEGAL_FIELDS.find((f) => f.k === 'ice');
ok(ice.label.fr === 'NIF', 'le champ fiscal des réglages s’appelle NIF', ice.label);
const ma = till(null);
txt = ma.R.text(ma.R.build(sale));
ok(!/TVA/.test(txt) && !/FACTURA/.test(txt) && /Espèces/.test(txt) && /MAD/.test(txt) && !/€/.test(txt), 'un commerce marocain imprime comme avant (français, MAD, sans titre)', txt);
ok(ma.R.LEGAL_FIELDS.find((f) => f.k === 'ice').label.fr === 'ICE', 'et son champ fiscal reste ICE');

console.log('■ les URL écrites dans le code');
const sw = read('kiwi-sw.js');
const swStamp = (file) => (sw.match(new RegExp("'/assets/" + file.replace('.', '\\.') + "\\?v=(\\d+)'")) || [])[1];
const inCode = (src, file) => (read(src).match(new RegExp("assets/" + file.replace('.', '\\.') + "\\?v=(\\d+)")) || [])[1];
ok(swStamp('kiwi-country.js') && inCode('assets/merchant-config.js', 'kiwi-country.js') === swStamp('kiwi-country.js'), 'merchant-config.js charge kiwi-country.js au même ?v= que le service worker', [inCode('assets/merchant-config.js', 'kiwi-country.js'), swStamp('kiwi-country.js')]);
ok(swStamp('receipt-country.js') && inCode('assets/kiwi-country.js', 'receipt-country.js') === swStamp('receipt-country.js'), 'kiwi-country.js charge receipt-country.js au même ?v= que le service worker', [inCode('assets/kiwi-country.js', 'receipt-country.js'), swStamp('receipt-country.js')]);

console.log(bad ? `✗ ${bad} échec(s), ${n} contrôles passés` : `✓ pays d'exploitation à l'écran et sur le ticket : ${n} contrôles`);
process.exitCode = bad ? 1 : 0;
