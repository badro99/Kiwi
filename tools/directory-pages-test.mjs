#!/usr/bin/env node
/* Annuaire Kiwi · le HTML rendu, sans navigateur.
 *
 * Chaque page de l'annuaire (hub, ville, métier, fiche, formulaires, 404) est
 * rendue par la vraie fonction sur une base de test, dans les trois langues,
 * et doit tenir les règles du site public : un seul <h1>, canonical et
 * hreflang sur ce qui s'indexe, noindex sur le reste, JSON-LD qui se lit,
 * pas de tiret cadratin, pas d'italique, pas d'emoji, des icônes Material
 * vendorisées, des libellés complets en FR, EN et AR, et aucun champ privé.
 *
 *   node tools/directory-pages-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { directoryDb } from './directory-fixture.mjs';
import { directoryPage, BASE } from '../functions/api/_directory-page.js';
import { STR } from '../functions/api/_directory-strings.js';
import { CHROME, ASSETS } from '../functions/api/_directory-chrome.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
const ok = async (label, fn) => { try { await fn(); passed++; console.log('  ✓ ' + label); } catch (e) { failed++; console.log('  ✗ ' + label + '\n      ' + String(e && e.message || e).split('\n').slice(0, 3).join('\n      ')); } };
const { DB } = directoryDb();
const env = { DB };
const render = async (lang, rel) => {
  const r = await directoryPage({ env, request: new Request('https://kiwi-os.com' + BASE[lang] + rel) }, lang);
  return { status: r.status, html: await r.text(), cache: r.headers.get('Cache-Control') };
};
const SLUG = { fr: 'ajouter', en: 'add', ar: 'ajouter' }, REPORT = { fr: 'signaler', en: 'report', ar: 'signaler' };
const pages = (lang) => [
  ['hub', '', true], ['city', 'casablanca/', true], ['trade', 'casablanca/cafe/', true], ['listing', 'cafe-atlas-casablanca/', true],
  ['arabic listing', 'boulangerie-fes/', true], ['add', SLUG[lang] + '/', true], ['report', 'pressing-lumiere-rabat/' + REPORT[lang] + '/', false],
  ['search', '?q=riad', false], ['empty city', 'agadir/', false], ['missing', 'nexiste-pas-rabat/', false],
];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

console.log('■ annuaire · les mots');
await ok('every string exists in FR, EN and AR, with the same shape', () => {
  const shape = (o) => (Array.isArray(o) ? o.map(shape) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, shape(o[k])])) : typeof o);
  assert.deepEqual(shape(STR.en), shape(STR.fr));
  assert.deepEqual(shape(STR.ar), shape(STR.fr));
  const flat = JSON.stringify(STR);
  assert.ok(!flat.includes('—'), 'no em dash');
  assert.ok(!EMOJI.test(flat), 'no emoji');
});
await ok('the chrome is the guides chrome, with the directory linked from the footer', () => {
  for (const l of ['fr', 'en', 'ar']) {
    assert.match(CHROME[l].header, /class="site-header"/);
    assert.match(CHROME[l].footer, new RegExp(`href="${BASE[l]}"`));
  }
  const guide = fs.readFileSync(path.join(root, 'fr/guides/index.html'), 'utf8');
  assert.match(guide, /href="\/fr\/annuaire\/"[^>]*>Annuaire Kiwi</, 'the guides footer links the directory');
  for (const href of Object.values(ASSETS)) assert.ok(fs.existsSync(path.join(root, href.split('?')[0])), href);
});
await ok('the stylesheet keeps the brand: no italic, no new colour beyond the danger token, logical properties', () => {
  const css = fs.readFileSync(path.join(root, 'assets/directory/directory.css'), 'utf8');
  assert.doesNotMatch(css, /font-style:\s*italic/);
  assert.deepEqual([...new Set(css.match(/#[0-9a-f]{3,8}\b/gi) || [])], ['#C94A3A']);
  assert.doesNotMatch(css, /(margin|padding)-(left|right)\s*:|\b(left|right)\s*:\s*\d/);
  assert.ok(!css.includes('!important'));
});

for (const lang of ['fr', 'en', 'ar']) {
  console.log(`■ annuaire · pages · ${lang}`);
  for (const [name, rel, indexable] of pages(lang)) {
    await ok(`${name}`, async () => {
      const { status, html, cache } = await render(lang, rel);
      assert.ok([200, 404].includes(status), 'status ' + status);
      assert.match(html, new RegExp(`<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">`));
      assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, 'one h1');
      const robots = (html.match(/<meta name="robots" content="([^"]+)"/) || [])[1];
      if (indexable) {
        assert.equal(status, 200);
        assert.match(robots, /^index/);
        assert.match(html, new RegExp(`<link rel="canonical" href="https://kiwi-os\\.com${BASE[lang]}${rel.replace(/\?/g, '\\?')}">`));
        for (const l of ['fr', 'en', 'ar', 'x-default']) assert.match(html, new RegExp(`hreflang="${l}"`));
      } else {
        assert.match(robots, /noindex/);
        assert.doesNotMatch(html, /rel="canonical"/);
      }
      for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
      assert.ok(!html.includes('—'), 'no em dash');
      assert.doesNotMatch(html, /font-style:\s*italic|<i>[^<]|<em>/);
      for (const m of html.matchAll(/icons\/material\/([a-z_0-9]+)\.svg/g)) assert.ok(fs.existsSync(path.join(root, 'assets/icons/material', m[1] + '.svg')), m[1]);
      for (const bit of ['prive@example.com', 'Contact Privé', 'dl-fixture', 'dedupe']) assert.ok(!html.includes(bit), 'leaks ' + bit);
      assert.doesNotMatch(html, /#fff\b|#ffffff/i);
      if (name === 'add' || name === 'report') assert.equal(cache, 'no-store', 'a form with a signed time is never cached');
    });
  }
}
await ok('a listing carries LocalBusiness data built only from real fields', async () => {
  const { html } = await render('fr', 'pressing-lumiere-rabat/');
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const biz = ld.find((x) => x['@type'] === 'DryCleaningOrLaundry');
  assert.ok(biz, 'typed by trade');
  assert.equal(biz.address.addressLocality, 'Rabat');
  assert.equal(biz.address.addressCountry, 'MA');
  assert.equal(biz.telephone, undefined, 'no phone that was not chosen for display');
  assert.equal(biz.openingHoursSpecification, undefined, 'no invented hours');
  assert.ok(ld.some((x) => x['@type'] === 'BreadcrumbList'));
});

console.log(`\n${failed ? '✗' : '✓'} directory pages · ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
