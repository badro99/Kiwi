#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
/* Kiwi · strings-bidi-test · chaque interpolation est isolée (§9.6, « Every
 * interpolation is isolated », révision 15, P6).
 *
 * Un nom latin au bout d'une phrase arabe emporte le point final du mauvais
 * côté ; un nom arabe dans une phrase anglaise déplace le nombre qui suit. Le
 * remède est structurel et c'est lui qu'on tient :
 *   · dans le DOM, KiwiStrings.format() rend des nœuds et met chaque argument
 *     dans son propre <bdi> : dir="ltr" pour un nombre ou un montant, sans dir
 *     pour un nom ;
 *   · en texte brut (aria-label, title, presse-papiers), KiwiStrings.t() met
 *     chaque argument entre U+2068 et U+2069 ;
 *   · aucune valeur des paquets ne contient U+2066 à U+2069, U+200E, U+200F ni
 *     U+061C : ces caractères sont ajoutés à la frontière, jamais écrits.
 *
 * Chaque clé qui a un argument est rendue dans les trois langues, avec « Café
 * Atlas 2 » dans les phrases arabes et « مقهى الأطلس » dans les phrases
 * anglaises et françaises. Puis les deux vecteurs d'acte de remise (M6), U+00A0
 * écrit ⍽. La partie DOM tourne dans Chromium ; sans Chromium elle saute, la
 * partie texte tourne toujours. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { ROOT, LANGS, BUNDLE_SURFACES, loadBundles, loadRuntime } from './strings-corpus.mjs';

const K = loadRuntime();
const bundles = loadBundles();
let failures = 0, checks = 0;
const ok = (m) => { checks++; console.log('  ✓ ' + m); };
const bad = (m) => { failures++; console.log('  ✗ ' + m); };

/* Le genre de chaque argument : un nombre ou un montant (LTR), ou un nom
 * (direction de son premier caractère fort). Un argument nouveau échoue ici
 * jusqu'à ce qu'on le classe. */
const NUMBERS = new Set(['n', 'total', 'minutes', 'min', 'paid']);
const FORMATTED = new Set(['amount', 'pct', 'delta', 'time', 'date', 'price', 'tip', 'hour', 'start', 'end', 'from', 'to', 'value', 'subtotal']);
const NAMES = new Set(['label', 'venue', 'business', 'name', 'act', 'order', 'table', 'item', 'group', 'staff', 'reason', 'bill', 'store', 'denomination', 'baseline', 'weekday', 'known', 'contactable', 'relative', 'status', 'source', 'station', 'items', 'line']);
const kindOf = (a) => (NUMBERS.has(a) ? 'num' : FORMATTED.has(a) ? 'fmt' : NAMES.has(a) ? 'name' : null);
const LATIN = 'Café Atlas 2';
const ARABIC = 'مقهى الأطلس';
const FORMATTED_SAMPLE = { amount: '1 234,50 MAD', pct: '10 %', delta: '−127 MAD', time: '17:39', date: '12 Oct', price: '45,00 MAD', tip: '23,00 MAD', hour: '18:00', start: '05:00', end: '04:59', from: '1 Oct', to: '7 Oct', value: '0,50', subtotal: '150,00 MAD' };

/* Les clés à arguments, avec leurs noms (union de toutes les branches). */
const withArgs = [];
for (const s of BUNDLE_SURFACES) {
  for (const [key, en] of Object.entries(bundles[s].en)) {
    const names = new Set();
    for (const l of LANGS) for (const v of [].concat(bundles[s][l][key])) K._args(v).forEach((a) => names.add(a));
    if (names.size) withArgs.push({ key, args: [...names] });
  }
}

function argsFor(names, lang, n) {
  const out = {};
  for (const a of names) {
    const kind = kindOf(a);
    out[a] = kind === 'num' ? (a === 'n' || a === 'total' ? n : 4) : kind === 'fmt' ? K.ltr(FORMATTED_SAMPLE[a]) : (lang === 'ar' ? LATIN : ARABIC);
  }
  return out;
}

console.log('■ Texte : rien d\'isolant dans les paquets, chaque argument classé');
{
  const FORBIDDEN = /[⁦-⁩‎‏؜]/;
  let found = 0;
  for (const s of BUNDLE_SURFACES) for (const l of LANGS) for (const [k, v] of Object.entries(bundles[s][l])) {
    for (const x of [].concat(v)) if (FORBIDDEN.test(x)) { found++; bad(`${s}.${l} ${k} contient un caractère de direction écrit à la main`); }
  }
  if (!found) ok('aucune valeur ne contient U+2066 à U+2069, U+200E, U+200F ni U+061C');
  const unknown = [...new Set(withArgs.flatMap((w) => w.args))].filter((a) => !kindOf(a));
  if (unknown.length) bad(`arguments non classés : ${unknown.join(', ')} (ajoutez-les à NUMBERS, FORMATTED ou NAMES)`);
  else ok(`${withArgs.length} clés à arguments, tous les arguments classés`);
}

console.log('\n■ Texte : t() isole chaque argument entre FSI et PDI');
{
  globalThis.__kiwiStrings = {};
  for (const [s, langs] of Object.entries(bundles)) for (const l of LANGS) globalThis.__kiwiStrings[`${s}.${l}`] = langs[l];
  let n = 0, problems = 0;
  for (const lang of LANGS) {
    K.setLocale(lang);
    for (const { key, args } of withArgs) {
      for (const count of [1, 2, 5, 12, 100]) {
        const a = argsFor(args, lang, count);
        const list = [].concat(K._pieces(key, a));
        const pieceLists = Array.isArray(list[0]) ? list : [list];
        const texts = [].concat(K.t(key, a));
        texts.forEach((text, i) => {
          const argPieces = pieceLists[i].filter((p) => p.arg);
          const fsi = [...text].filter((c) => c === '⁨').length;
          const pdi = [...text].filter((c) => c === '⁩').length;
          const wrapped = argPieces.every((p) => text.includes('⁨' + p.arg.text + '⁩'));
          n++;
          if (fsi !== argPieces.length || pdi !== argPieces.length || !wrapped) { problems++; if (problems < 10) bad(`${key} (${lang}, ${count}) : ${argPieces.length} arguments, ${fsi} FSI, ${pdi} PDI, « ${text} »`); }
          /* ôté des isolats, le texte est celui du rendu brut */
          const stripped = text.replace(/[⁨⁩]/g, '');
          if (stripped !== [].concat(K.raw(key, a))[i]) { problems++; bad(`${key} (${lang}) : le texte isolé diffère du texte brut`); }
        });
      }
    }
  }
  if (!problems) ok(`${n} rendus en texte (3 langues × 5 nombres) : un FSI et un PDI par argument`);
}

console.log('\n■ Vecteurs des actes de remise (M6)');
{
  const V = [
    ['act.discount.pct', { pct: { en: '10%', fr: '10 %', ar: '10 %' } }, { en: 'A 10% discount', fr: 'Une remise de 10⍽%', ar: 'تطبيق خصم بنسبة 10⍽%' }],
    ['act.discount.amount', { amount: { en: '20.00 MAD', fr: '20,00 MAD', ar: '20,00 درهم' } }, { en: 'A 20.00⍽MAD discount', fr: 'Une remise de 20,00⍽MAD', ar: 'تطبيق خصم بقيمة 20,00⍽درهم' }],
  ];
  let problems = 0;
  for (const [key, argv, want] of V) {
    for (const lang of LANGS) {
      K.setLocale(lang);
      const name = Object.keys(argv)[0];
      const got = K.raw(key, { [name]: K.ltr(argv[name][lang]) }).replace(/ /g, '⍽');
      if (got !== want[lang]) { problems++; bad(`${key} (${lang}) : « ${got} », attendu « ${want[lang]} »`); }
    }
  }
  if (!problems) ok('A 10% discount · Une remise de 10⍽% · تطبيق خصم بنسبة 10⍽% ; A 20.00⍽MAD discount · Une remise de 20,00⍽MAD · تطبيق خصم بقيمة 20,00⍽درهم');
  K.setLocale('en');
}

/* ── La partie DOM, dans Chromium ──────────────────────────────────────── */
console.log('\n■ DOM : format() met chaque argument dans son <bdi>');
let puppeteer;
try { puppeteer = createRequire(path.join(ROOT, 'app/package.json'))('puppeteer-core'); }
catch { puppeteer = null; }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!puppeteer || !bin) {
  console.log('  ○ skip: ' + (puppeteer ? 'Chromium' : 'puppeteer-core') + ' unavailable, browser assertions not executed');
  if (process.env.CI) process.exit(1);
} else {
  const { suite } = await import('./browser-trace.mjs');
  const files = ['assets/kit/strings.js', ...BUNDLE_SURFACES.flatMap((s) => LANGS.map((l) => `assets/kit/strings/${s}.${l}.js`))];
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    if (p === '/__bidi.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html lang="en"><meta charset="utf-8"><body>' + files.map((f) => `<script src="/${f}"></script>`).join('') + '</body></html>');
      return;
    }
    if (!files.includes(p.slice(1))) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(path.join(ROOT, p)));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
  const S = suite('strings-bidi', { browser });
  await S.run('every argument sits in its own bdi', async (t) => {
    const page = t.watch(await browser.newPage());
    t.step('open the blank page that loads the bundles');
    await page.goto(base + '/__bidi.html', { waitUntil: 'load' });
    const plan = withArgs.map((w) => ({ key: w.key, args: w.args.map((a) => ({ name: a, kind: kindOf(a), sample: FORMATTED_SAMPLE[a] || null })) }));
    t.step('render every key with an argument in three languages');
    const result = await page.evaluate((plan, LATIN, ARABIC, locales) => {
      const K = window.KiwiStrings;
      const out = { rendered: 0, problems: [] };
      /* Le contrôle négatif : la même vérification doit voir un argument hors <bdi>. */
      const outside = (frag, sentinel) => {
        const holder = document.createElement('div');
        holder.appendChild(frag.cloneNode(true));
        const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
        let text = '';
        for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentElement.closest('bdi')) text += n.nodeValue;
        return sentinel.some((s) => text.includes(s));
      };
      const naked = document.createDocumentFragment();
      naked.appendChild(document.createTextNode('Bonjour ' + ARABIC + ' !'));
      if (!outside(naked, [ARABIC])) out.problems.push('contrôle négatif : un nom hors <bdi> n\'est pas vu');
      for (const lang of locales) {
        K.setLocale(lang);
        for (const { key, args } of plan) {
          for (const count of [1, 2, 5, 12, 100]) {
            const a = {};
            for (const x of args) a[x.name] = x.kind === 'num' ? (x.name === 'n' || x.name === 'total' ? count : 4) : x.kind === 'fmt' ? K.ltr(x.sample) : (lang === 'ar' ? LATIN : ARABIC);
            const pieces = K._pieces(key, a);
            const lists = Array.isArray(pieces[0]) ? pieces : [pieces];
            const frags = [].concat(K.format(key, a));
            frags.forEach((frag, i) => {
              out.rendered++;
              const argPieces = lists[i].filter((p) => p.arg);
              const bdis = [...frag.querySelectorAll('bdi')];
              const where = `${key} (${lang}, ${count})`;
              if (bdis.length !== argPieces.length) out.problems.push(`${where} : ${argPieces.length} arguments, ${bdis.length} <bdi>`);
              argPieces.forEach((p, j) => {
                const el = bdis[j];
                if (!el) return;
                if (el.textContent !== p.arg.text) out.problems.push(`${where} : le <bdi> n°${j} dit « ${el.textContent} », l'argument « ${p.arg.text} »`);
                const num = /^[\d]/.test(p.arg.text) || p.arg.dir === 'ltr';
                const dir = el.getAttribute('dir');
                if (p.arg.dir === 'ltr' && dir !== 'ltr') out.problems.push(`${where} : un nombre ou un montant sans dir="ltr"`);
                if (p.arg.dir !== 'ltr' && dir) out.problems.push(`${where} : un nom avec dir="${dir}" (il doit suivre son premier caractère fort)`);
                void num;
              });
              if (outside(frag, [LATIN, ARABIC])) out.problems.push(`${where} : un nom hors <bdi>`);
              /* le texte sans les <bdi> est exactement le gabarit */
              const tmpl = lists[i].filter((p) => p.text != null).map((p) => p.text).join('');
              const holder = document.createElement('div');
              holder.appendChild(frag.cloneNode(true));
              holder.querySelectorAll('bdi').forEach((b) => b.remove());
              if (holder.textContent !== tmpl) out.problems.push(`${where} : du texte hors <bdi> qui n'est pas le gabarit`);
              /* aucun isolat de direction dans un nœud texte */
              if (/[⁦-⁩‎‏؜]/.test(frag.textContent)) out.problems.push(`${where} : un isolat ou une marque de direction dans le DOM`);
            });
          }
        }
      }
      /* Les vecteurs de remise, argument dans son <bdi> en arabe. */
      K.setLocale('ar');
      const f = K.format('act.discount.amount', { amount: K.ltr('20,00 درهم') });
      const b = f.querySelector('bdi');
      if (!b || b.getAttribute('dir') !== 'ltr' || b.textContent !== '20,00 درهم') out.problems.push('act.discount.amount (ar) : l\'argument n\'est pas dans son <bdi dir="ltr">');
      return out;
    }, plan, LATIN, ARABIC, forLocales(['en', 'fr', 'ar']));
    for (const p of result.problems.slice(0, 15)) bad(p);
    assert.equal(result.problems.length, 0, `${result.problems.length} problème(s) de <bdi>`);
    ok(`${result.rendered} rendus DOM (${forLocales(LANGS).length} langues × 5 nombres) : un <bdi> par argument, dir="ltr" pour les nombres, aucun nom hors <bdi>, contrôle négatif vu`);
  });
  await browser.close();
  server.close();
  const code = await S.finish({ exit: false });
  if (code === 1) failures++;
  else if (code === 3 && !failures) process.exit(3);   // the environment, not the product (check-guard reruns it)
}

console.log('\n' + '─'.repeat(60));
if (failures) { console.log(`✗ ${failures} échec(s)`); process.exit(1); }
console.log(`✓ strings-bidi-test : ${checks} contrôles`);
