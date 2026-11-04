/* Real checkout screens, real language selector, no DOM translation observer. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { world } = require('./retail-money-harness.cjs');
const fixture = fs.readFileSync('tools/caisse-lang-test.js', 'utf8');
const setup = fixture.slice(fixture.indexOf('const store ='), fixture.indexOf('let failed ='));
const lang = vm.createContext({ require, __dirname: new URL('.', import.meta.url).pathname, source: fs.readFileSync('assets/caisse-lang.js', 'utf8'), console, vm });
vm.runInContext(setup + '\nthis.L = L;', lang);
const copy = fs.readFileSync('assets/caisse-strings.js', 'utf8');
for (const locale of ['en', 'ar']) {
  const w = world('boutique');
  w.c.KiwiCaisseLang = lang.L;
  lang.L.set(locale);
  vm.runInContext(copy, w.c);
  const layer = w.c.KiwiCaisseStrings;
  for (const [key, row] of Object.entries(layer.entries)) {
    assert.ok(row[locale], key);
    assert.equal(layer.say(key, row.fr), row[locale]);
  }
  const check = () => {
    const html = w.panel.innerHTML;
    assert.doesNotMatch(html, /Encaissement|Partager|Espèces|Rendu calculé|Terminal de la banque|Virement|Chèque|Scanner ou saisir|Avoir en paiement|Espèces reçues|Montant envoyé|Paiement refusé|Aucun montant/);
    assert.ok(Object.values(layer.entries).some(row => row[locale] !== row.fr && html.includes(row[locale])));
  };
  for (const tender of ['especes', 'carte', 'virement', 'cheque', 'avoir', 'livraison']) {
    w.start(100, { title: 'Encaissement' }); check();
    w.$$('[data-bq-m]').find(b => b.dataset.bqM === tender).onclick();
    // Delivery-card has its own translated renderer and is covered by its suite.
    if (tender !== 'livraison') check();
    if (tender === 'carte') { while(w.timers.length) w.timers.shift()(); assert.equal(w.$('#bq-reader-status').textContent, layer.entries['checkout.confirmez.l.encaissement.sur.le.lecteur'][locale]); }
    if (tender === 'avoir') { w.$('#bq-av-code').value = 'INVALID'; await w.$('#bq-av-code-form').onsubmit({ preventDefault() {} }); assert.equal(w.$('#bq-av-err').textContent, layer.entries['checkout.aucun.avoir.avec.ce.code.verifiez.le.sur.le.bon'][locale]); }
  }
  assert.equal(layer.say('missing.key', 'Texte français'), 'Texte français');
  delete layer.entries['checkout.especes'];
  w.start(100, { title: 'Encaissement' });
  assert.match(w.panel.innerHTML, /Espèces/, 'missing known key keeps local French');
  w.c.KiwiCaisseLang = { get() { throw Error('language unavailable'); } };
  assert.equal(layer.say('checkout.carte', 'Carte'), 'Carte');
  delete w.c.KiwiCaisseLang;
  assert.equal(layer.say('checkout.especes', 'Espèces'), 'Espèces');
  delete w.c.KiwiCaisseStrings;
  w.start(100, { title: 'Encaissement' });
  assert.match(w.panel.innerHTML, /Encaissement/);
  assert.match(w.panel.innerHTML, /Espèces/);
}
console.log('PASS keyed EN/AR checkout methods, cash, card, bank, cheque, credit errors; missing key/language/table falls back to French');
