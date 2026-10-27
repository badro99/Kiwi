#!/usr/bin/env node
/* La page des promotions (campagnes de démonstration de Maison Mansour, son
 * assistant et ses tiroirs) est sortie de boutique-promos-returns.js, qui
 * dépassait son plafond de 1 069 lignes et ne garde que les retours.
 * Preuve : le fichier d'avant (fixture) coupé à [start, end) est retrouvé à
 * l'octet entre les deux repères de boutique-promos-demo.js, et n'est plus
 * dans le fichier des retours. Les deux chunks portent chacun leurs actions,
 * le registre des pages au premier usage les nomme, et aucune icône n'est plus
 * dessinée à la main (Material Symbols seulement ; la marque WhatsApp, tierce,
 * reste au trait). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(f, 'utf8');
let passed = 0;
const ok = (cond, label) => { assert.ok(cond, label); passed += 1; console.log('  ✓ ' + label); };

const map = JSON.parse(read('tools/fixtures/promos-returns/split.json'));
const original = gunzipSync(fs.readFileSync('tools/fixtures/promos-returns/original.js.gz')).toString();
assert.equal(createHash('sha256').update(original).digest('hex'), map.sha256);
const section = original.slice(map.start, map.end);
const demo = read('assets/pages-pro/boutique-promos-demo.js');
const returns = read('assets/pages-pro/boutique-promos-returns.js');

const a = demo.indexOf(map.begin), b = demo.indexOf(map.finish);
ok(a > 0 && b > a, 'la page des promotions garde ses deux repères');
ok(demo.slice(a + map.begin.length, b) === section, 'la section déplacée est identique à l\'octet à celle de l\'ancien fichier');
ok(!returns.includes(section.slice(0, 400)) && !returns.includes("handlers['nav-promos']"), 'elle n\'est plus dans le fichier des retours');
ok(returns === original.slice(0, map.start) + original.slice(map.end) || returns.split('\n').length < original.split('\n').length - 300, 'le fichier des retours a perdu cette section (ses icônes ont changé en plus)');
new vm.Script(demo); new vm.Script(returns);

const handlersOf = (src) => [...src.matchAll(/handlers\['([^']+)'\]\s*=/g)].map((m) => m[1]);
const inOriginal = handlersOf(original).sort();
const both = [...handlersOf(demo), ...handlersOf(returns)].sort();
ok(JSON.stringify(inOriginal) === JSON.stringify(both), `les ${inOriginal.length} actions de l'ancien fichier se retrouvent, chacune dans un seul chunk`);
const registry = read('assets/pages-pro.js');
for (const [file, src] of [['boutique-promos-demo.js', demo], ['boutique-promos-returns.js', returns]]) {
  const m = new RegExp(`url: 'assets/pages-pro/${file.replace('.', '\\.')}\\?v=\\d+', handlers: (\\[[^\\]]*\\])`).exec(registry);
  ok(m && JSON.stringify(JSON.parse(m[1]).sort()) === JSON.stringify(handlersOf(src).sort()), `le registre des pages nomme exactement les actions de ${file}`);
}
ok(/boutique-promos-demo\.js\?v=\d+/.test(read('kiwi-sw.js')), 'le chunk des promotions est dans le cache hors ligne');

const strokes = (src) => (src.match(/<svg[^>]*fill="none"[^>]*stroke=/g) || []).length;
ok(strokes(demo) === 0, 'la page des promotions ne dessine aucune icône à la main');
ok(strokes(returns) === 1 && /Marque tierce/.test(returns), 'le fichier des retours ne garde que la marque WhatsApp au trait');
ok(/<svg[^>]*viewBox="0 -960 960 960"/.test(demo.slice(0, a)) && !/viewBox="0 0 24 24"/.test(demo + returns.replace(/wa: .*\n/, '')), 'toutes les autres icônes sont des Material Symbols (viewBox 0 -960 960 960)');
ok(returns.split('\n').length <= 1069, `le fichier des retours est sous son plafond (${returns.split('\n').length} lignes, plafond 1 069)`);
/* Le type « code » n'avait pas d'icône : l'assistant écrivait « undefined ». */
ok(/code:\s+msym\(/.test(demo), 'le type « Code promo » a son icône (l\'ancien fichier écrivait « undefined »)');

console.log(`  ✓ promos-returns-split: ${passed} contrôles`);
