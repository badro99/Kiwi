/* La pastille « Inventaire » de la caisse boutique compte les alertes de stock
 * NON VUES (assets/pos-boutique/inv-tools.js) : vues, elles s'éteignent ; un
 * article qui passe de bas à épuisé avertit de nouveau ; un article réassorti
 * puis redescendu avertit de nouveau. Propriétaire, 2026-10-28. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.document = { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } };

const src = readFileSync(new URL('../assets/pos-boutique/inv-tools.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '');                       // la logique de la pastille ne dépend pas de la liste
const mod = await import('data:text/javascript;base64,' + Buffer.from(src + '\nfunction bqKitScanBar(){} function searchArticles(){ return []; }').toString('base64'));
const { invUnseenCount: unseen, invMarkSeen: seen } = mod;

let ok = 0; const t = (name, fn) => { fn(); ok++; };
const K = 'santos';
t('every current alert counts before the page is opened', () => {
  assert.equal(unseen(K, [['a', 3], ['b', 0], ['c', 12]]), 2);
});
t('opening the Inventaire clears the badge, and it stays cleared', () => {
  seen(K, [['a', 3], ['b', 0], ['c', 12]]);
  assert.equal(unseen(K, [['a', 3], ['b', 0], ['c', 12]]), 0);
  assert.equal(unseen(K, [['a', 3], ['b', 0], ['c', 12]]), 0);
});
t('a seen low item that runs out alerts again', () => {
  assert.equal(unseen(K, [['a', 0], ['b', 0], ['c', 12]]), 1);
});
t('a new low item alerts', () => {
  seen(K, [['a', 0], ['b', 0], ['c', 12]]);
  assert.equal(unseen(K, [['a', 0], ['b', 0], ['c', 4]]), 1);
});
t('a restocked item that drops again alerts again', () => {
  seen(K, [['a', 0], ['b', 0], ['c', 4]]);
  assert.equal(unseen(K, [['a', 20], ['b', 0], ['c', 4]]), 0);   // réassorti : sort de la liste vue
  assert.equal(unseen(K, [['a', 2], ['b', 0], ['c', 4]]), 1);
});
t('two stores never share what was seen', () => {
  assert.equal(unseen('amira', [['a', 2]]), 1);
});
t('the boutique till renders no stock value and three single-purpose cards', () => {
  const inv = readFileSync(new URL('../assets/pos-boutique/inventory.js', import.meta.url), 'utf8');
  assert.ok(!/Valeur de stock/.test(inv));
  assert.ok(/<span class="l">Stock bas<\/span>/.test(inv) && /<span class="l">Rupture de stock<\/span>/.test(inv) && /<span class="l">Pièces en stock<\/span>/.test(inv));
  assert.ok(!/st\.low\} \+ \$\{st\.ruptures/.test(inv));
});
t('the till « Mouvements de stock » screen only reads, and only boutique rows', () => {
  const mv = readFileSync(new URL('../assets/pos-boutique/inv-moves.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const w of ['enable(', 'attach(', 'record(', 'requestManual', 'adjustStock', 'setStock', 'adjustVariantStock', 'receiveStock', '.add(']) assert.ok(!mv.includes(w), 'inv-moves.js must not call ' + w);
  assert.ok(/module: MODULE/.test(mv) && /const MODULE = 'boutique'/.test(mv));
  assert.ok(/MZ\.facets\(MODULE\)/.test(mv));
  const inv = readFileSync(new URL('../assets/pos-boutique/inventory.js', import.meta.url), 'utf8');
  assert.ok(/id="bqi-count"[\s\S]{0,260}id="bqi-moves"/.test(inv), 'the button sits right after « Inventaire physique »');
  assert.ok(/productHistory\?\.\(pid, 8, 'boutique'\)/.test(inv), 'the product sheet reads boutique rows');
});
t('the physical count reaches the right store, signed by the person at the till, with a reason per gap', () => {
  const c = readFileSync(new URL('../assets/pos-inventory-count.js', import.meta.url), 'utf8');
  assert.ok(/const staff = window\.KiwiStaff;/.test(c), 'the boutique cashier is read from KiwiStaff');
  assert.ok(/merchant: merchant,/.test(c) && /'\/api\/inventory\/counts' \+ \(merchant \? '\?merchant=' \+ encodeURIComponent\(merchant\)/.test(c), 'the store is named, so a paired till is recognised');
  assert.ok(/supersedes: countState\.supersedes \|\| undefined/.test(c), 'a recount replaces the count sent back');
  assert.ok(/hasGap\(it\) \?/.test(c) && /data-cnt-reason=/.test(c), 'only lines that differ ask for a reason');
});
t('the owner is told on the boutique Inventaire page and can ask for details', () => {
  const b = readFileSync(new URL('../assets/pages-pro-boutique.js', import.meta.url), 'utf8');
  assert.ok(/<div id="bqx-counts"><\/div>/.test(b) && /status=submitted&merchant=/.test(b) && /data-action="stock-count-detail"[^`]*data-merchant=/.test(b));
  const r = readFileSync(new URL('../assets/stock/counts.js', import.meta.url), 'utf8');
  assert.ok(/reviewCount\(count\.id, 'correction_requested', note\)/.test(r), 'asking goes through the one review path');
  assert.ok(/decision === 'correction_requested' \? 'request-correction' : 'review'/.test(r));
  const inv = readFileSync(new URL('../assets/pos-boutique/inv-tools.js', import.meta.url), 'utf8');
  assert.ok(/status=correction_requested&merchant=/.test(inv) && /recount\(\{ supersedes: c\.id/.test(inv), 'the till shows the question and recounts in place');
});
console.log(`✓ boutique-inv-alerts · ${ok} contrôles : la pastille Inventaire compte ce qui n'a pas été vu`);
