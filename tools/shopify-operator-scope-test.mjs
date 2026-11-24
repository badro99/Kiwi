#!/usr/bin/env node
/* Kiwi · shopify-operator-scope-test · le panneau Shopify parle du commerce à l'écran.
 *
 * 24 Nov 2026: in the operator view of CHICTRATEC SL (?op=1&merchant=chictratec-sl)
 * the Shopify panel showed Amira Boutique's connection — the operator's own
 * signed-in store — because no request named the store, and the server fell back
 * on the session. An import from there would have written into Amira Boutique.
 * Holds: in operator view every Shopify request of assets/channel-link.js names
 * the store on screen; outside it, nothing is added (the session decides, as before).
 *   node tools/shopify-operator-scope-test.mjs
 */
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../assets/channel-link.js', import.meta.url), 'utf8');
let n = 0, bad = 0;
const ok = (c, m, d) => { if (c) { n++; console.log('  ✓ ' + m); } else { bad++; console.log('  ✗ ' + m + (d !== undefined ? ' · ' + JSON.stringify(d) : '')); } };

const fn = (src.match(/function shopScope\(\) \{[\s\S]*?\n  \}/) || [])[0];
ok(!!fn, 'le panneau a une seule règle pour le commerce à l’écran (shopScope)');
const scope = (search) => new Function('location', 'URLSearchParams', fn + '; return shopScope();')({ search }, URLSearchParams);
ok(scope('?op=1&merchant=chictratec-sl') === 'chictratec-sl', 'vue opérateur : le commerce de l’URL');
ok(scope('?merchant=chictratec-sl') === '' && scope('') === '', 'hors vue opérateur : rien (la session décide, comme avant)');

const calls = [...src.matchAll(/chFetch\('\/api\/shopify\/[^']+'/g)];
ok(calls.length === 4, 'quatre requêtes Shopify dans le panneau', calls.length);
for (const c of calls) {
  const near = src.slice(c.index, c.index + 400);
  ok(/shopScope\(\)/.test(near.split('.then(')[0]), 'elle nomme le commerce · ' + near.slice(8, 40));
}
console.log(bad ? `✗ ${bad} échec(s), ${n} contrôles passés` : `✓ panneau Shopify en vue opérateur : ${n} contrôles`);
process.exitCode = bad ? 1 : 0;
