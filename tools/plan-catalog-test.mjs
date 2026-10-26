#!/usr/bin/env node
import coreTestSource from './core-test-source.cjs';
/* plan-catalog-test · the dashboard's plan picker says what the site says.
 *
 * assets/plan-catalog.js carries the picker in French, English and Arabic.
 * Its feature lists are copies of content/landing-pricing.json, and its
 * prices must equal the tier prices the operator console bills
 * (functions/api/admin/overview.js TIER_PRICE). On 21 October the picker
 * still sold Basic at 199 MAD and had no Plus while the site said 150 and
 * sold Plus: this test is what stops that happening again.
 *   node tools/plan-catalog-test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('..', import.meta.url);
const read = (p) => coreTestSource.readFileSync(new URL(p, ROOT), 'utf8');
let n = 0; const fails = [];
const check = (ok, label) => { n++; if (!ok) fails.push(label); };

const window = {};
vm.runInNewContext(read('assets/plan-catalog.js'), { window });
const cat = window.KiwiPlanCatalog;
const landing = JSON.parse(read('content/landing-pricing.json'));
const IDS = ['basic', 'plus', 'pro', 'ultra'];
const KEYS = ['tag', 'title', 'desc', 'badgeCurrent', 'badgeReco', 'ctaCurrent', 'choose', 'ultraCta', 'quoteCta', 'later', 'tipReal', 'tipDemo', 'tiers'];

const tierPrice = Object.fromEntries([...read('functions/api/admin/overview.js')
  .match(/const TIER_PRICE = \{([^}]+)\}/)[1].matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
check(IDS.every((id) => tierPrice[id] > 0), 'the console bills a price for each of basic, plus, pro, ultra');
/* The operating notes must describe the plans the backend actually accepts:
   an agent reading "no plus plan" would strip Plus from config and billing. */
const configPlans = (read('functions/api/config.js').match(/planExplicit = \[([^\]]+)\]/) || [, ''])[1];
const notes = read('CLAUDE.md');
check(configPlans.includes("'plus'") && !/backend has no `plus` plan/.test(notes), 'CLAUDE.md does not deny the plus plan that config accepts and the console bills');

for (const lang of ['fr', 'en', 'ar']) {
  const c = cat && cat[lang], L = landing[lang];
  check(!!c, `${lang}: catalog present`);
  if (!c) continue;
  check(KEYS.every((k) => c[k] != null && c[k] !== ''), `${lang}: every string is filled`);
  check(c.choose.includes('{name}'), `${lang}: « choose » names the plan`);
  IDS.forEach((id, i) => {
    const t = c.tiers[id], l = L.tiers[i];
    check(t && t.name === l.name, `${lang}/${id}: name matches the site (${t && t.name} vs ${l.name})`);
    check(t && JSON.stringify(t.feats) === JSON.stringify(l.features), `${lang}/${id}: features match the site word for word`);
    check(t && Number(String(t.price).replace(/\D/g, '')) === tierPrice[id], `${lang}/${id}: price ${t && t.price} equals the billed ${tierPrice[id]}`);
    check(t && t.unit === L.monthlySuffix && !!t.tagline, `${lang}/${id}: monthly unit and tagline`);
  });
  const u = c.tiers.ultimate;
  check(u && u.name === L.ultimate.name && u.price === L.quote
    && JSON.stringify(u.feats) === JSON.stringify(L.ultimate.features), `${lang}/ultimate: on quote, same list as the site`);
  check(!JSON.stringify(c).includes('—'), `${lang}: no em dash`);
}

const ix = read('assets/interactive.js');
check(ix.includes('window.KiwiPlanCatalog') && !/price: '199 MAD'/.test(ix), 'the picker reads the catalog, no price left inline');
const dash = read('dashboard.html'), sw = read('kiwi-sw.js');
const tag = dash.match(/assets\/plan-catalog\.js\?v=\d+/), tagIx = dash.indexOf('assets/interactive.js?v=');
check(!!tag && dash.indexOf(tag[0]) < tagIx, 'dashboard loads the catalog before interactive.js');
check(!!tag && sw.includes('/' + tag[0]), 'the service worker precaches the same catalog URL');

if (fails.length) { console.log(`✗ plan catalog: ${fails.length}/${n} failed\n  ` + fails.join('\n  ')); process.exit(1); }
console.log(`✓ plan catalog: ${n} checks · picker = site = billed price, in fr, en and ar`);
