import pressingSource from './pressing-test-source.cjs';
// Pressing et hôtel : les boutons d'espèces RÈGLENT le montant reçu, comme la
// caisse principale. Avant le 22 octobre ils AJOUTAIENT au dû déjà inscrit :
// pour 40 MAD dus, un caissier qui tapait « +100 » pour un billet de 100 lisait
// 140 reçus et rendait 100 MAD au lieu de 60.
// Le même passage a trouvé deux règles de style qui attrapaient le nom du
// client depuis qu'il vit dans son propre élément (traduction du 22 octobre).
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

let n = 0;
const ok = (label, cond) => { assert.ok(cond, label); n++; };

for (const [file, input] of [['assets/pressing-caisse.js', 'px-cash-in'], ['assets/pos-hotel.js', 'ht-cash-in']]) {
  const src = pressingSource.readFileSync(file, 'utf8');
  const m = src.match(/function cashSuggestions\(due\) \{[\s\S]*?\n  \}/);
  ok(file + ': cashSuggestions exists', !!m);
  const ctx = {}; vm.runInNewContext(m[0] + '; this.f = cashSuggestions;', ctx);
  for (let due = 0.5; due < 5000; due += 13.25) {
    const s = ctx.f(due);
    ok(file + ': 1 to 3 suggestions for ' + due, s.length >= 1 && s.length <= 3);
    ok(file + ': every suggestion is above ' + due, s.every((v) => v > due));
    ok(file + ': ascending, no duplicates for ' + due, s.every((v, i) => i === 0 || v > s[i - 1]));
  }
  ok(file + ': 18 MAD due offers a 20 note', ctx.f(18)[0] === 20);
  ok(file + ': 40 MAD due offers 50, 60, 100', JSON.stringify(ctx.f(40)) === '[50,60,100]');
  const cash = src.slice(src.indexOf("id=\"" + input + "\""), src.indexOf("id=\"" + input + "\"") + 2500);
  ok(file + ': the cash step has an Exact button', /data-set="\$\{[^}]+\}">Exact</.test(cash));
  ok(file + ': no additive +N preset left in the cash step', !/data-add=/.test(cash));
  ok(file + ': a tap sets the amount received', /received = \+b\.dataset\.set;/.test(cash));
}

const css = pressingSource.readFileSync('assets/pressing-caisse.css', 'utf8');
ok('pickup card: the phone-line style no longer catches the name inside <b>', /\.px-rt-who > span \{/.test(css) && !/\.px-rt-who span \{/.test(css));
ok('item sheet: total and per-unit line stack', /\.px-sheet-price \.val \{ display: block;/.test(css) && /\.px-sheet-price \.per \{ display: block;/.test(css));
ok('item sheet: header leaves room for the close button', /\.px-sheet-head \{[^}]*padding-inline-end: 28px/.test(css));
const px = pressingSource.readFileSync('assets/pressing-caisse.js', 'utf8');
ok('recognised customer: name and text share one flex item', px.includes('<span>${dataText(c.name)}, client reconnu</span>'));

console.log('✓ trade-cash-presets · ' + n + ' contrôles');
