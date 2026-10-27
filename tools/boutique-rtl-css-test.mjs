#!/usr/bin/env node
/* boutique-rtl-css-test · la caisse boutique se retourne en arabe par ses
 * propriétés, pas par des rustines.
 *
 * assets/pos-boutique.css posait le rail, la zone de travail, les bordures et les
 * alignements en coordonnées physiques (left / right, text-align: left) et
 * rattrapait l'arabe avec trois règles `.kiwi-rtl` ; tout nouvel écran qui
 * oubliait sa rustine restait collé à gauche. Ici le fichier est lu règle par
 * règle : plus de déclaration physique de disposition, plus de rustine, et les
 * fonds blancs de secours passent par le jeton papier (jamais un #fff froid). */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../assets/pos-boutique.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector.trim().replace(/\s+/g, ' '),
  decls: body.split(';').map((d) => d.trim()).filter(Boolean),
}));
assert.ok(rules.length > 400, 'the stylesheet is parsed rule by rule');

// Layout properties that do not flip with dir. Symmetric fills (left and right both
// set) and the camera frame's corner marks are decoration, named here on purpose.
const isPhysical = (d) => /^(margin-left|margin-right|padding-left|padding-right|border-left|border-right)\s*:/.test(d) || /^text-align\s*:\s*(left|right)\s*$/.test(d);
const found = rules.flatMap((r) => r.decls.filter(isPhysical).map((d) => ({ selector: r.selector, decl: d })));
const allowed = (f) => /^\.bq-cam-frame i:nth-child\([1-4]\)$/.test(f.selector);
assert.deepEqual(found.filter((f) => !allowed(f)).map((f) => f.selector + ' { ' + f.decl + ' }'), [],
  'no physical margin, padding, border or text-align left/right outside the camera frame corners');

// The shell: the rail and the work area are placed with logical insets.
const rule = (selector) => rules.find((r) => r.selector === selector);
const rail = rule('#pos-boutique > .bq-rail'), main = rule('#pos-boutique > .bq-main');
assert.ok(rail.decls.includes('inset-inline-start: 0') && rail.decls.includes('inset-block: 0'), 'the rail sits at the start edge');
assert.ok(main.decls.includes('inset-inline: 212px 0'), 'the work area starts after the rail, on whichever side the rail is');
assert.ok(rule('.bq-rail').decls.some((d) => d.startsWith('border-inline-end')), 'the rail border follows the rail');
assert.ok(rule('.bq-ticket').decls.some((d) => d.startsWith('border-inline-start')), 'the ticket border follows the ticket');

// No patch left behind for the shell.
assert.deepEqual(rules.filter((r) => /\.kiwi-rtl[^,]*\.bq-(rail|main)\b/.test(r.selector)).map((r) => r.selector), [], 'no .kiwi-rtl patch for the rail or the work area');

// Backgrounds fall back to the warm paper token, never to a cold #fff.
const whiteBackgrounds = rules.flatMap((r) => r.decls.filter((d) => /^background(-color)?\s*:\s*#(fff|ffffff)\b/i.test(d) || /var\(--[\w-]+,\s*#fff\)/i.test(d)).map((d) => r.selector + ' { ' + d + ' }'));
assert.deepEqual(whiteBackgrounds, [], 'no pure white background or background fallback');

console.log('✓ boutique till stylesheet: logical layout properties, no RTL patches, no cold white backgrounds');
