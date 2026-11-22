#!/usr/bin/env node
/* Dépenses · l'interrupteur. Le module `expenses` est éteint pour tout le
 * monde tant qu'un opérateur n'a pas écrit features.expenses === true pour ce
 * commerçant (Pasta Corner d'abord, 17 nov. 2026). Une clé absente veut dire
 * ÉTEINT, contrairement aux modules historiques : sinon chaque ancien
 * commerçant le verrait apparaître sans l'avoir demandé.
 *
 * Tient : la règle dans assets/merchant-config.js (extraite telle que livrée),
 * l'entrée de la console (off:true dans chaque liste de métier), l'entrée du
 * menu du tableau de bord (data-feature + réservée au patron), la page plein
 * écran et ses traductions. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' introuvable');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}
let n = 0;
const ok = (name) => { n++; console.log('✓ ' + name); };

/* La règle, telle que livrée. */
{
  const SRC = R('assets/merchant-config.js');
  const make = (features) => new Function('cfg', [
    'var HANDLER_ALIASES = {};',
    grab(SRC, 'function optInOff('),
    grab(SRC, 'function featureOff('),
    'return featureOff;',
  ].join('\n'))({ features });
  assert.equal(make({})('expenses'), true, 'absent = off');
  assert.equal(make({ expenses: 'true' })('expenses'), true, 'only the boolean true turns it on');
  assert.equal(make({ expenses: false })('expenses'), true);
  assert.equal(make({ expenses: true })('expenses'), false, 'operator switched it on');
  assert.equal(make({})('transactions'), false, 'historic modules keep absent = on');
  ok('expenses is off unless features.expenses === true; other modules unchanged');
}

/* La console opérateur. */
{
  const admin = R('kiwi-admin.html');
  const optin = grab(admin, 'var OPTIN_MODULES = {');
  const types = [...optin.matchAll(/^\s{4}([a-z_]+): \[/gm)].map((m) => m[1]);
  const missing = types.filter((t) => {
    const list = optin.slice(optin.indexOf(t + ': ['), optin.indexOf('\n    ],', optin.indexOf(t + ': [')));   // la fin de la liste, pas un « onFor:['maison'], » à l'intérieur
    return !/key:'expenses', label:'Dépenses[^']*', off:true/.test(list);
  });
  assert.ok(types.length >= 2 && missing.length === 0, 'opt-in entry missing for ' + missing.join(',') + ' of ' + types.join(','));
  ok('console: a "Dépenses" switch, off by default, for every business type (' + types.join(', ') + ')');
}

/* Le tableau de bord. */
{
  const dash = R('dashboard.html');
  const pages = R('assets/pages.js');
  const fullPage = pages.slice(pages.indexOf('const FULL_PAGE_NAVS'), pages.indexOf(']);', pages.indexOf('const FULL_PAGE_NAVS')));
  const i18n = R('assets/i18n.js');
  const wanted = {
    entry: /<a href="#" data-nav="expenses" data-feature="expenses">[\s\S]{0,900}?<span data-i18n="dash\.sidebar\.expenses">Dépenses<\/span>/.test(dash),
    ownerOnly: /\['nav-depenses', 'nav-promos', 'nav-expenses'\]\.forEach\(\(key\) => wrap\(key, \['owner'\]\)\)/.test(dash),
    fullPage: /'expenses'/.test(fullPage),
    en: /'dash\.sidebar\.expenses': 'Expenses'/.test(i18n),
    ar: /'dash\.sidebar\.expenses': 'المصاريف'/.test(i18n),
  };
  const vendored = (R('assets/icons/material/account_balance_wallet.svg').match(/ d="([^"]+)"/) || [])[1];
  const entry = dash.slice(dash.indexOf('data-nav="expenses"'), dash.indexOf('</a>', dash.indexOf('data-nav="expenses"')));
  wanted.icon = !!vendored && entry.includes('viewBox="0 -960 960 960"') && entry.includes(`d="${vendored}"`);
  assert.deepEqual(Object.keys(wanted).filter((k) => !wanted[k]), []);
  ok('dashboard: owner-only "Dépenses" entry behind the switch, full page, EN and AR labels');
}

console.log(n + ' groupes · expenses switch');
