#!/usr/bin/env node
/* Stock · la ligne « rupture totale » dit vrai et se lit en sombre (owner, 2026-10-12).
 *
 * Le bouton « Commander en urgence » devenait un pavé noir sans texte au
 * survol en mode sombre : le survol passait à var(--paper), noir pur sous
 * Vexel, avec un texte --riad-deep. Et la ligne annonçait un « manque à
 * gagner » de coût d'achat × 3,2, une marge inventée, affichée « 0 MAD/jour »
 * dès que la consommation manquait. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const js = fs.readFileSync(path.join(ROOT, 'assets/stock.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8').replace(/<link rel="stylesheet" href="assets\/dashboard-shell\.css\?v=\d+"\s*\/?>/, () => '<style>' + fs.readFileSync(path.join(ROOT, 'assets/dashboard-shell.css'), 'utf8') + '</style>');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

ok(!/\* 3\.2/.test(js) && !/dailyMissed/.test(js), 'no invented lost-revenue multiplier');
ok(!/perDayMissed|impactCost/.test(js), 'the « manque à gagner » wording is gone in every language');
for (const lang of ['fr', 'en', 'ar']) {
  const start = js.indexOf(`    ${lang}: {`);
  ok(start > 0 && /impactBlocks: \(n, names\)/.test(js.slice(start, start + 60000)) && /impactNone:/.test(js.slice(start, start + 60000)), `${lang}: the rupture line names the dishes it blocks`);
}
ok(/const blocked = isOut \? dishesUsing\(it\) : null;/.test(js) && /function dishesUsing\(it\)/.test(js) && /R\.stockFor\(line\)/.test(js), 'blocked dishes come from the recipes that use the item');
ok(/const dailyUse = \+it\.usageThisWeek > 0 \?/.test(js), 'daily use is shown only when the week has a real figure');
ok(!/\.st-btn\.primary:hover \{ background: var\(--paper\); color: var\(--riad-deep\); \}/.test(html), 'the dark hover never paints the button with the page colour');
ok(/html\[data-vexel-mode="dark"\] \.st-btn\.primary:hover \{ background: color-mix\(in srgb, var\(--mint\) 82%, #fff\); color: var\(--riad-deep\); \}/.test(html), 'dark hover lightens the mint and keeps a dark label');
ok(/html\[data-vexel-mode="dark"\] \.st-suggest-acts \.st-btn\.primary:hover \{ background: color-mix/.test(html), 'the suggested-order button follows');
ok(/if \(!recipes\.length\) return null;/.test(js), 'a venue without recipes gets no recipe claim at all');
console.log(`✓ stock alert truth: ${n} checks`);
