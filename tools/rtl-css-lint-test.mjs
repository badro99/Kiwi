#!/usr/bin/env node
/* rtl-css-lint-test · l'arabe se retourne par les propriétés logiques, pas par des rustines.
 *
 * Deux gardes sur toutes les feuilles de style de assets/ :
 *  1. cliquet : le nombre de déclarations physiques (margin/padding/border gauche-droite,
 *     text-align left/right, left:/right:) par feuille ne monte jamais
 *     (tools/rtl-css-baseline.json ; KIWI_UPDATE_RTL_BASELINE=1 l'abaisse après un nettoyage).
 *     Une feuille neuve peut en porter 10. pages-pro.css et pressing-caisse.css ne gardent
 *     que les boutons à bascule (le point glisse par translateX, physique) et les coins de visée.
 *  2. une rustine « html[dir=rtl] … flex-direction: row-reverse » sur un conteneur flex
 *     dont la règle de base est déjà une ligne : en arabe la ligne s'inverse déjà, la rustine
 *     la remet dans l'ordre gauche-droite (onglets de zone et de mode du plan de salle). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const parse = (css) => [...strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector.trim().replace(/\s+/g, ' '),
  decls: body.split(';').map((d) => d.trim()).filter(Boolean),
}));

export const countPhysical = (css) => parse(css).reduce((n, r) => n + r.decls.filter((d) =>
  /^(margin-left|margin-right|padding-left|padding-right|border-left|border-right|left|right)\s*:/.test(d)
  || /^text-align\s*:\s*(left|right)\s*$/.test(d)).length, 0);

// A stylesheet is parsed rule by rule; a row-reverse patch under dir=rtl on a plain flex row is a double reversal.
export const doubleReversals = (css) => {
  const rules = parse(css);
  const out = [];
  for (const r of rules) {
    if (!/(html)?\[dir="?rtl"?\]|\.kiwi-rtl/.test(r.selector) || !r.decls.some((d) => /^flex-direction\s*:\s*row-reverse$/.test(d))) continue;
    for (const sel of r.selector.split(',')) {
      const base = sel.trim().replace(/^html\[dir="?rtl"?\]\s*|^\[dir="?rtl"?\]\s*|^\.kiwi-rtl\s*/, '');
      const own = rules.filter((b) => b !== r && !/rtl/.test(b.selector) && b.selector.split(',').some((s) => s.trim() === base));
      const flex = own.some((b) => b.decls.some((d) => /^display\s*:\s*(inline-)?flex$/.test(d)));
      const dir = own.some((b) => b.decls.some((d) => /^flex-direction\s*:\s*(column|row-reverse)/.test(d)));
      if (flex && !dir) out.push(sel.trim());
    }
  }
  return out;
};

// The zone and mode tabs of the floor plan: the defect, found in the real source.
const tablesData = fs.readFileSync(path.join(root, 'assets/pages/tables-data.js'), 'utf8');
assert.deepEqual(doubleReversals(tablesData).filter((s) => /pds-/.test(s)), [], 'floor plan tabs are not reversed twice under dir=rtl');
// The detector sees the defect when it is there.
assert.deepEqual(doubleReversals('.a{display:flex;gap:4px}\n.b{display:flex}\nhtml[dir="rtl"] .a, html[dir="rtl"] .b{flex-direction:row-reverse}'), ['html[dir="rtl"] .a', 'html[dir="rtl"] .b'], 'detector flags a patch on a plain flex row');
assert.deepEqual(doubleReversals('.a{display:flex;flex-direction:column}\nhtml[dir="rtl"] .a{flex-direction:row-reverse}'), [], 'a column container is left alone');

// Équipe and Paie: the stylesheet lives in a JS module, read the same way.
const teamStyles = fs.readFileSync(path.join(root, 'assets/team/styles.js'), 'utf8');
assert.equal(countPhysical(teamStyles), 0, 'the Équipe and Paie tables follow the writing direction (Arabic included)');
assert.equal(countPhysical('.a{margin-left:3px;text-align:right}.b{padding-inline-start:3px}'), 2, 'the counter sees physical declarations only');

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (e.name.endsWith('.css')) files.push(p);
  }
})(path.join(root, 'assets'));
const counts = Object.fromEntries(files.map((f) => [path.relative(root, f), countPhysical(fs.readFileSync(f, 'utf8'))]).sort());

const basePath = path.join(root, 'tools/rtl-css-baseline.json');
if (process.env.KIWI_UPDATE_RTL_BASELINE === '1') {
  const prev = fs.existsSync(basePath) ? JSON.parse(fs.readFileSync(basePath, 'utf8')) : {};
  const next = Object.fromEntries(Object.entries(counts).map(([f, n]) => [f, f in prev ? Math.min(prev[f], n) : n]));
  fs.writeFileSync(basePath, JSON.stringify(next, null, 2) + '\n');
}
const base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
const over = Object.entries(counts).filter(([f, n]) => n > (f in base ? base[f] : 10)).map(([f, n]) => `${f}: ${n} > ${f in base ? base[f] : 10}`);
assert.deepEqual(over, [], 'physical left/right declarations only go down: use inline-start / inline-end / text-align:start|end');
assert.ok(counts['assets/pages-pro.css'] <= 12 && counts['assets/pressing-caisse.css'] <= 8, 'the two stylesheets the Arabic rating named stay logical');

console.log('✓ stylesheets: physical left/right ratchet, no double-reversed RTL tabs');
