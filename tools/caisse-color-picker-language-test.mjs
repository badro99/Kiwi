#!/usr/bin/env node
/* Caisse · le sélecteur de couleur de la fiche article parle la langue de la
 * caisse.
 *
 * 2026-10-12. La boutique et la maison passaient à la palette un nom de groupe
 * « Couleur » et une consigne « Touchez une pastille pour lire son nom » en
 * dur. Les deux finissent en ATTRIBUTS (aria-label, data-kc-empty affiché par
 * CSS) : le balayage des nœuds de texte de caisse-lang.js ne les voit jamais,
 * et une caissière en anglais ou en arabe lisait la consigne en français. La
 * palette se nomme elle-même dans la langue de <html lang>, que caisse-lang.js
 * pose : il suffit de ne plus lui imposer le français.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.KIWI_ROOT || path.resolve(new URL('..', import.meta.url).pathname);
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const files = fs.readdirSync(path.join(root, 'assets')).filter((f) => /^pos-.*\.js$/.test(f));
const calls = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(root, 'assets', f), 'utf8');
  for (const m of src.matchAll(/KC\(\)\.picker\(([^)]*\{[^}]*\})\)/g)) calls.push({ f, opts: m[1] });
}
check(calls.some((c) => c.f === 'pos-boutique.js') && calls.some((c) => c.f === 'pos-maison.js'), 'the boutique and maison registers still offer the colour picker');
check(calls.every((c) => !/\blabel\s*:\s*['"`]/.test(c.opts)), 'no register forces a literal group name on the picker');
check(calls.every((c) => !/\bhint\s*:\s*['"`]/.test(c.opts)), 'no register forces a literal hint on the picker');

const palette = fs.readFileSync(path.join(root, 'assets/color-palette.js'), 'utf8');
check(/document\.documentElement\.getAttribute\('lang'\)/.test(palette), 'the palette names itself from <html lang>');
const lang = fs.readFileSync(path.join(root, 'assets/caisse-lang.js'), 'utf8');
check(/el\.setAttribute\('lang', cur\)/.test(lang), 'and the caisse sets <html lang> to the register language');

console.log(`\ncaisse-color-picker-language: ${checks} passed, 0 failed`);
