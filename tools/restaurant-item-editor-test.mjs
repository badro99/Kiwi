#!/usr/bin/env node
/* L'éditeur d'article de la carte restaurant (owner, 2026-10-11 : « u gotta ace it »).
 *
 * Avant : une colonne de champs gris, des cases à cocher natives dans des
 * boîtes trop grandes, un bouton « Enregistrer cette formule comme modèle
 * réu… » coupé, des étapes au titre collé à son fond, un « Enregistrer » qui
 * ne répondait pas quand le nom était vide, et des messages en français dur
 * dans les trois langues. Ce test tient la nouvelle feuille. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const js = read('assets/restaurant-menu-workspace.js');
const ia = read('assets/interactive.js');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

const a = js.indexOf('  function openItem(x){'), b = js.indexOf('  function emojiPicker(');
ok(a > 0 && b > a, 'openItem() is found');
const fn = js.slice(a, b);
const up = js.slice(js.indexOf('async function upload('), js.indexOf('async function upload(') + 900);
const css = (js.match(/s\.id='rmw-item-css';s\.textContent=`([\s\S]*?)`;/) || [])[1] || '';
const rcss = (js.match(/s\.id='rmw-recipe-css';s\.textContent=`([\s\S]*?)`;/) || [])[1] || '';

ok(/recipeStyle\(\);itemStyle\(\);/.test(fn) && /classList\.add\('rmw-item-workspace','rmw-recipe-modal'\)/.test(fn), 'the item sheet shares the recipe sheet: opaque, same tokens');
ok(/<div class="rmw-it">/.test(fn) && /<aside class="rmw-rx-side rmw-it-side">/.test(fn), 'two columns: the item on the left, media and visibility on the right');
ok((fn.match(/<section class="rmw-rx-sec/g) || []).length === 3, 'three titled sections: item, options, set menu');
ok(/role="switch" \$\{attr\}/.test(fn) && /toggle\('data-avail'/.test(fn) && /avail:!!\$\('\[data-avail\]',m\.el\)\.checked/.test(fn), 'availability is a switch, saved from its checked state');
ok(!/<select[^>]*data-avail/.test(fn), 'no availability select left');
ok(/data-is-formula aria-label=/.test(fn) && /role="switch" data-is-formula/.test(fn), 'the set menu is turned on by a labelled switch');
ok(/class="rmw-it-chip"><input type="checkbox" data-opt=/.test(fn), 'option groups are chips with a real (hidden, focusable) checkbox');
ok(/ui\('itRule'\)\.split\(/.test(fn) && /data-slot-min=/.test(fn) && /data-slot-max=/.test(fn), 'a step rule reads as a sentence around its two numbers');
ok(/if\(!name\)\{nameErr\.hidden=false;nameInput\.setAttribute\('aria-invalid','true'\);nameInput\.focus\(\);return;\}/.test(fn), 'an empty name says so instead of a silent Save');
ok(/data-media-tile/.test(fn) && /const showMedia=\(\)=>\{tile\.innerHTML=mediaTile\(\)/.test(fn), 'the photo or video is previewed, and the preview follows an upload or removal');
ok(/itSvg\('add'\)/.test(fn) && !/\bic\('/.test(fn), 'icons are Material paths, not the old icon font');
for (const fr of ['Menu mis à jour', 'Formule copiée', 'Formule vide', 'Nom du modèle', 'Formule enregistrée', 'Aucune étape', 'Média retiré', "label||'Choix'"])
  ok(!fn.includes(fr), `no hardcoded French in the editor: ${fr}`);
for (const fr of ['Stockage média indisponible', 'Média prêt', 'Envoi impossible', "'Envoi…'"])
  ok(!up.includes(fr), `upload status is translated: ${fr}`);
ok(/ui\(n===1\?'itChoiceOne':'itChoiceCount',\{n\}\)/.test(fn), 'one choice and several choices are worded apart');
ok(!/style="/.test(fn.replace(/panel\.style|removeAttribute\('style'\)/g, '')), 'no inline styles in the markup');
ok(/\.rmw-it-sw:after\{[^}]*cubic-bezier\(0\.34,1\.45,0\.5,1\)/.test(css), 'the switch moves on the house spring');
ok(/\[dir="rtl"\] \.rmw-it-tg input:checked\+\.rmw-it-sw:after\{transform:translateX\(-16px\)\}/.test(css), 'the switch mirrors in Arabic');
ok(/@media\(max-width:620px\)\{[^@]*\.rmw-it-side\{order:1;/.test(css), 'on a phone the fields come first, media and switches after');
ok(/\.rmw-it-media:has\(\.rmw-it-ph\)\{aspect-ratio:auto;height:96px\}/.test(css), 'an empty media box does not take a screen on a phone');
ok(/\.kiwi-backdrop\.rmw-recipe-modal select\.rmw-rx-unit\{background-image:[^}]*!important/.test(rcss), 'selects keep their chevron under the Vexel skin');
ok(!/italic/.test(css), 'no italics');
ok(/\.kiwi-modal-close \{ position: absolute; top: 18px; inset-inline-end: 18px;/.test(ia) && /\.kiwi-modal-head \{ padding: 24px 28px 16px; padding-inline-end: 64px;/.test(ia), 'every modal: the close button follows the reading direction and never covers the title');
console.log(`✓ restaurant item editor: ${n} checks`);
