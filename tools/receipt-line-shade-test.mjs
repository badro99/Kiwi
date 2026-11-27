#!/usr/bin/env node
/* La teinte sur le ticket boutique (Elham Brand, 22 nov. 2026) : deux châles
 * du même modèle en deux teintes s'imprimaient en deux lignes identiques.
 *  A. La caisse boutique nomme chaque ligne du reçu avec taille ET teinte.
 *  B. Sur la thermique, un nom trop long passe à la ligne au lieu d'être coupé
 *     (la teinte, en fin de nom, était la première à disparaître).
 *  C. À l'écran, la teinte ne se coupe pas en deux. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

console.log('A. ligne du reçu boutique');
const pos = fs.readFileSync(path.join(root, 'assets/pos-boutique.js'), 'utf8');
const at = pos.indexOf('const beginPay = () =>'); /* openPay, ou payOffered pour un ticket offert */
const block = at >= 0 ? pos.slice(at, pos.indexOf('subtotal:', at)) : '';
ok(block.length > 0, 'beginPay est trouvé');
ok(/name:[^\n]*ln\.size[^\n]*colorLabel\(ln\.color\)/.test(block), 'le nom de ligne porte la taille puis la teinte (colorLabel)');
ok(/ln\.color \? colorLabel/.test(block), 'pas de teinte inventée quand la ligne n’en a pas');
ok(/colorLabel\(ln\.color\)\.split\(' · '\)\[0\]/.test(block), 'une teinte bilingue (« 05 Fuchsia · فوشيا ») garde sa moitié latine : pas de ligne en image');

const storage = new Map();
const document = { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, createElement() { return {}; } };
const window = { document };
const ctx = vm.createContext({ window, document, console, Date, Promise, Uint8Array, Uint8ClampedArray,
  localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)), removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {} }, setTimeout() { return 0; }, clearTimeout() {} });
for (const f of ['assets/escpos.js', 'assets/receipt.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx);
const R = window.KiwiReceipt;

console.log('B. retour à la ligne sur la thermique');
const longName = 'Châle dentelle brodée main TU · 105 Bleu nuit profond';
for (const paper of ['80', '58']) {
  const doc = R.build({ ref: 'T-1', ts: Date.UTC(2026, 10, 22, 17), lines: [{ qty: 1, name: longName, total: 180 }, { qty: 2, name: 'Châle soie · 05 Fuchsia', total: 300 }], total: 480, pay: [{ label: 'espèces', amount: 480 }] },
    { config: { print: { paper } }, business: { name: 'Boutique' } });
  const rows = Buffer.from(R.escpos(doc)).toString('latin1').replace(/[\x00-\x09\x0b-\x1f]/g, '').split('\n');
  ok(rows.some((r) => r.includes('105 Bleu nuit profond') && r.includes('180 MAD')), paper + ' mm : la teinte entière, à côté du prix, sur la ligne longue');
  if (paper === '80') ok(rows.some((r) => r.includes('2× Châle soie · 05 Fuchsia') && r.includes('300 MAD')), '80 mm : une ligne courte reste sur une seule ligne');
  else ok(rows.some((r) => r.includes('05 Fuchsia') && r.includes('300 MAD')), '58 mm : la ligne trop large passe à la ligne, teinte et prix ensemble');
}

console.log('C. aperçu et impression système');
const h = R.html(R.build({ ref: 'T-2', lines: [{ qty: 1, name: 'Châle dentelle · 05 Fuchsia', total: 180 }, { qty: 1, name: 'Écharpe', total: 90 }], total: 270, pay: [] }, { config: {}, business: { name: 'B' } }));
ok(h.includes('Châle dentelle <span style="white-space:nowrap">· 05 Fuchsia</span>'), 'la teinte reste d’un seul tenant à l’écran');
ok(h.includes('<span>1× Écharpe</span>'), 'une ligne sans teinte s’affiche comme avant');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
