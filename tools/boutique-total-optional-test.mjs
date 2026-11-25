// Boutique · « Quantité totale » facultative à la création d'un produit
// (owner, 25 nov. 2026). Beaucoup de commerçants ne savent pas combien de
// pièces ils ont de chaque article : le champ obligatoire les bloquait, et peu
// savaient qu'ils pouvaient taper n'importe quel nombre. Vide = 0 pièce, le
// produit se crée et le stock se complète plus tard ; un texte qui n'est pas
// un nombre reste refusé.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; console.log(`  ✓ ${message}`); };

const Z = await import(pathToFileURL(path.join(root, 'assets/boutique-sizes.js')).href);

/* Un faux formulaire : le champ et son message d'erreur. */
function form(value) {
  const attrs = {};
  const inp = { value, setAttribute: (k, v) => { attrs[k] = v; } };
  const err = { hidden: true };
  const r = { querySelector: (sel) => (sel === '[data-kbs-total]' ? inp : sel === '[data-kbs-total-err]' ? err : null) };
  return { r, attrs, err };
}
const run = (value) => { const f = form(value); return { n: Z.readTotal(f.r), invalid: f.attrs['aria-invalid'], errShown: !f.err.hidden }; };

const empty = run('');
ok(empty.n === 0 && empty.invalid === 'false' && !empty.errShown, 'an empty total is accepted as 0 pieces, without an error');
ok(run('   ').n === 0, 'blank spaces count as empty too');
ok(run('0').n === 0, '« 0 » is accepted');
ok(run('24').n === 24, 'a real quantity still reads as itself');
const bad = run('douze');
ok(bad.n === null && bad.invalid === 'true' && bad.errShown, 'text that is not a number is still refused, with its message');

/* Le libellé dit « facultatif », dans les trois langues, et le message
   d'erreur ne demande plus « 1 ou plus ». */
for (const lang of ['fr', 'en', 'ar']) {
  const html = Z.totalFieldHtml(lang, 'taille');
  ok(html.includes(Z.formWords(lang).optional), `the field is marked optional (${lang})`);
  ok(!/1 ou plus|1 or more|1 أو أكثر/.test(Z.words(lang).totalErr), `the error no longer asks for 1 or more (${lang})`);
}

/* Les deux formulaires (caisse et tableau de bord) ne bloquent que sur `null`,
   donc 0 crée le produit. */
const till = read('assets/pos-boutique/inventory.js');
ok(/total == null( |\))/.test(till), 'the till form only blocks on an unreadable total');
const dash = read('assets/pages-pro-boutique.js');
ok(/total == null\) \{ _bqxPfFail\(b\); return; \}/.test(dash), 'the dashboard form only blocks on an unreadable total');

console.log(`\n✓ ${checks} boutique optional total controls passed`);
