#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
/* skin-cloak-test · no flash of the shipped screens before the 2027 skin
 * (owner, 2026-10-23: "it flashes the old design and then it gives you the
 * new design").
 *
 *   node tools/skin-cloak-test.mjs
 *
 * Every page whose <head> turns the 2027 skin on keeps a visible base while the
 * kit loads. Temporary ground paint is bounded; content is never hidden:
 *   · the cloak sits inside the switched-on branch, after data-skin-2027 is
 *     set (a page with the flag off is never hidden);
 *   · it paints paper without hiding or disabling any content;
 *   · it is removed two frames after DOMContentLoaded or within 500 ms;
 *   · the dashboard's venue code follows only kiwiDashTheme, as its <head>
 *     does, so a Mac in dark mode does not paint it black for a second;
 *   · the 2027 till paints the clock-in screen's ground under it while it
 *     fades in, so it does not fade in from white. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => coreTestSource.readFileSync(path.join(root, f), 'utf8');
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
console.log('skin-cloak-test');

const LOADER = /setAttribute\('data-skin-2027', '[a-z]+'\)/;
const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html') && !/ \d+\.html$/.test(f))
  .filter((f) => LOADER.test(read(f)));
for (const f of ['OrderPro.html', 'dashboard.html', 'kiwi-caisse.html', 'kiwi-cuisine.html', 'kiwi-serveur.html', 'printer.html', 'reset.html']) {
  check(pages.includes(f), `${f} has a 2027 head loader`);
}
for (const f of pages) {
  const html = read(f);
  const at = html.search(LOADER);
  const script = html.slice(html.lastIndexOf('<script', at), html.indexOf('</script>', at));
  const cut = script.search(LOADER);
  const local = script.slice(cut);
  check(/if \(!on\) return/.test(script.slice(0, cut)), `${f}: the cloak is in the branch that turns the skin on`);
  check(/id = 'k-cloak'/.test(local) && !/visibility:hidden|opacity:0/.test(local),
    `${f}: the base product remains visible during skin loading`);
  check(/body\{background:var\(--paper,#F7F5F0\)\}/.test(local), `${f}: a brand base surface is available`);
  const t = local.match(/setTimeout\(go, (\d+)\)/);
  check(t && Number(t[1]) <= 500, `${f}: enhancement style expires within 500 ms`);
}

const venues = read('assets/venues.js');
const fn = venues.slice(venues.indexOf('function themeChoiceIsDark()'), venues.indexOf('function restoreThemeChoice()'));
check(/hasAttribute\('data-vexel-mode'\)\) return localStorage\.getItem\('kiwiDashTheme'\) === 'dark'/.test(fn),
  'the dashboard keeps its own theme choice: the system preference never paints it dark during load');

const shell = read('assets/caisse-shell.css');
const own = shell.slice(shell.indexOf('.clockin-screen {'));
/* Since 2026-10-24 the 2027 till opens on the kit's paper (owner: light,
   dark, light read as a flash), so the page under the clock-in takes the
   kit's ground, and the 2027 clock-in screen paints that same ground. The
   shipped till keeps its night-green clock-in. */
check(/html\[data-skin-2027="till"\]:has\(#clockin-screen\.is-visible:not\(\.is-leaving\)\) body \{ background-color: var\(--k-bg\); \}/.test(shell),
  'the 2027 till paints the clock-in ground under the clock-in screen');
check(/html\[data-skin-2027="till"\] \.clockin-screen \{\s*background-color: var\(--k-bg\);/.test(shell),
  'which is the 2027 clock-in screen\'s own ground');
check(/^\s*background-color: #04120D;/m.test(own.slice(0, own.indexOf('}'))),
  'the shipped clock-in keeps its own night-green ground');

console.log(`✓ skin-cloak-test · ${checks} checks`);
