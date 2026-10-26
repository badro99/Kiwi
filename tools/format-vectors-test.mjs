#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
/* format-vectors-test · KiwiFormat (assets/kit/format.js), direction 2027 §6.3.
 *
 * Two halves, one table (tools/format-vectors.json):
 *
 *   Node      every vector in EN, FR and AR, character for character (U+00A0
 *             and U+2212 are different from the space and the hyphen they
 *             resemble); no banned character in any output, ever; sweeps of
 *             numbers, days and times with the assertion armed; the
 *             assertion itself (throws in tests, repairs and reports once in
 *             production, never prints the value); independence from the
 *             host's time zone; and mutations of format.js that must each
 *             turn the table red.
 *   Chromium  the same table in a real page whose DEVICE zone is not the
 *             store's, through the repository's puppeteer-core harness
 *             (tools/browser-trace.mjs), plus language resolution from the
 *             page. Skipped, said out loud, where Chromium is absent.
 *
 * The iOS WebKit half is tools/format-vectors-ios.mjs (xcrun simctl).
 *
 *   node tools/format-vectors-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FORMAT_FILE = path.join(root, 'assets/kit/format.js');
const BD_FILE = path.join(root, 'assets/kit/business-day.js');
const VECTORS_FILE = path.join(root, 'tools/format-vectors.json');
const FORMAT_SRC = fs.readFileSync(FORMAT_FILE, 'utf8');
const BD_SRC = fs.readFileSync(BD_FILE, 'utf8');
const VECTORS = JSON.parse(fs.readFileSync(VECTORS_FILE, 'utf8')).vectors;
const LANGS = ['en', 'fr', 'ar'];
const BANNED = /[\u200E\u200F\u061C\u202F-]/;   // bidi marks, narrow no-break space, hyphen-minus
const DEFAULT_ZONE = 'Africa/Casablanca';

let checks = 0;
const ok = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const hex = (s) => [...String(s)].map((c) => (c.charCodeAt(0) > 126 || c.charCodeAt(0) < 32 ? 'U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') : c)).join(' ');

/* A fresh copy of format.js (optionally mutated) in its own context, so a
 * mutation, a report hook or a language never leaks into the next check. */
function load(src, extra = {}) {
  const ctx = vm.createContext({ module: { exports: {} }, ...extra });
  vm.runInContext(src, ctx);
  return { api: ctx.module.exports, ctx };
}
const bd = load(BD_SRC).api;
function fresh(src = FORMAT_SRC) {
  const made = load(src, { KiwiBusinessDay: bd });
  made.api.ctx = made.ctx;
  return made.api;
}

/* Every vector, every language: the list of rows that differ. */
function run(F, vectors = VECTORS) {
  const bad = [];
  for (const v of vectors) {
    for (const l of LANGS) {
      F.configure({ zone: v.zone || DEFAULT_ZONE });
      let got;
      try { got = F.for(l)[v.call](...v.args); } catch (e) { got = 'THROW ' + e.message; }
      if (got !== v[l]) bad.push({ id: v.id, lang: l, got, want: v[l] });
    }
  }
  F.configure({ zone: DEFAULT_ZONE });
  return bad;
}

/* ── Node ───────────────────────────────────────────────────────────────── */
console.log('format-vectors-test · Node');
const F = fresh();
F.strict = true;

{
  const bad = run(F);
  ok(bad.length === 0, `${VECTORS.length} vectors x 3 languages, character for character` + (bad.length ? ': ' + bad.slice(0, 3).map((b) => `${b.id}/${b.lang} got ${hex(b.got)} want ${hex(b.want)}`).join(' | ') : ''));
  const spec = VECTORS.filter((v) => v.id.startsWith('spec-'));
  ok(spec.length === 23, `the 23 rows of the section 6.3 table are all present (${spec.length})`);
}

{
  let held = 0, total = 0;
  for (const v of VECTORS) for (const l of LANGS) { total++; if (!BANNED.test(v[l])) held++; }
  ok(held === total, `no expected string holds U+200E, U+200F, U+061C, U+202F or a hyphen-minus (${total} strings)`);
  const bare = VECTORS.filter((v) => LANGS.some((l) => / /.test(v[l]) && /\d ?(MAD|%|k|M|K|min|h|pt|درهم|ألف|مليون|نقطة|د|س)\b/.test(v[l])));
  ok(bare.length === 0, 'a number and its unit are never separated by a plain space (U+00A0 only)');
}

/* Sweeps with the assertion armed: it throws on the first banned character. */
{
  let seed = 20261012, n = 0;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const l of LANGS) {
    const f = F.for(l);
    for (let i = 0; i < 4000; i++) {
      const v = (rnd() - 0.5) * Math.pow(10, Math.floor(rnd() * 10));
      for (const s of [f.num(v, 0), f.num(v, 2), f.signed(v, 1), f.pct(v / 1e4), f.share(v / 1e4), f.compact(v), f.money(v, 2), f.signedMoney(v, 0), f.pts(v / 100, 1)]) {
        n++;
        if (s === '' || /[1-9]|0/.test(s) === false) throw new Error(`sweep: empty or digitless output for ${v} in ${l}: ${hex(s)}`);
      }
    }
    for (let d = 0; d < 400; d++) {
      const iso = new Date(Date.UTC(2026, 0, 1 + d, 12)).toISOString().slice(0, 10);
      for (const s of [f.date(iso), f.short(iso), f.weekday(iso), f.weekdayBaseline(iso)]) { n++; if (!s) throw new Error('sweep: empty date for ' + iso); }
    }
    for (let m = 0; m < 1440; m++) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0'), mm = String(m % 60).padStart(2, '0');
      n++; if (f.time(`${hh}:${mm}`) !== `${hh}:${mm}`) throw new Error('sweep: time ' + hh + ':' + mm);
    }
    for (let days = 0; days < 400; days++) { n++; if (!f.rel(days)) throw new Error('sweep: rel ' + days); }
    for (let e = 0; e < 300; e++) { n++; if (!f.elapsed(e * 7)) throw new Error('sweep: elapsed'); }
  }
  ok(n > 40000, `${n} strings across numbers, a year of days, every minute of the day and relative days: none holds a banned character (strict mode throws)`);
}

/* A negative number rounding to zero never prints a sign. */
{
  for (const l of LANGS) {
    const f = F.for(l);
    const z = [f.num(-0.004, 2), f.signed(-0.004, 2), f.pct(-0.00004), f.share(-0.001), f.compact(-0.2), f.money(-0.001, 2), f.pts(-0.04, 1)];
    ok(z.every((s) => !/[\u2212+]/.test(s)), `${l}: values that round to zero carry no sign (${z.map((s) => JSON.stringify(s)).join(', ')})`);
  }
}

/* A change shown as a figure is signed; an amount is signed only when negative. */
{
  const f = F.for('en');
  ok(f.signed(23, 0) === '+23' && f.signed(-23, 0) === '\u221223' && f.signed(0, 0) === '0', 'signed: + on a rise, U+2212 on a fall, nothing on zero');
  ok(f.num(23, 0) === '23' && f.num(-23, 0) === '\u221223', 'num: a minus on negatives only');
  ok(!/\u2212/.test(f.share(0.5)) && f.share(0.5) === '50%', 'share: a part of a whole, unsigned and whole');
}

/* The assertion. */
{
  const reports = [];
  const probe = fresh();
  probe.ctx.KiwiReportError = (e, where) => reports.push({ message: e.message, where, codepoints: e.codepoints });
  probe.strict = true;
  for (const [c, name] of [['\u200E', 'U+200E'], ['\u200F', 'U+200F'], ['\u061C', 'U+061C'], ['\u202F', 'U+202F'], ['-', 'hyphen-minus']]) {
    let threw = false;
    try { probe.guard('19' + c + '174', 'probe'); } catch (e) { threw = /format-banned-char/.test(e.message); }
    ok(threw, `strict mode throws on ${name}`);
  }
  probe.strict = false;
  const fixed = probe.guard('19\u202F174\u200E \u200F\u061C-5', 'probe');
  ok(fixed === '19\u00A0174 \u22125', `production repairs the string, never blanks it (${hex(fixed)})`);
  probe.guard('1\u202F2', 'probe');
  probe.guard('1\u202F3', 'probe');
  ok(reports.length === 1 && reports[0].message === 'format-banned-char' && reports[0].where === 'format:probe', 'it reports once per call name and page load, as format:<call>');
  ok(/U\+202F/.test(reports[0].codepoints) && !/174|\b19\b/.test(JSON.stringify(reports[0])), 'the report names the code points and never the value');
  probe.guard('1-2', 'other');
  ok(reports.length === 2 && reports[1].where === 'format:other', 'a second call name reports on its own');
}

/* The host's zone does not matter: an instant is read in the store's. */
{
  const before = process.env.TZ;
  for (const tz of ['Pacific/Auckland', 'America/Los_Angeles', 'UTC']) {
    process.env.TZ = tz;
    const g = fresh();
    g.strict = true;
    ok(run(g).length === 0, `device zone ${tz}: every vector still passes`);
  }
  if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
}

/* The zone comes from business-day.js when nothing was configured. */
{
  const g = fresh();
  const e = Date.UTC(2025, 9, 12, 16, 39);   // Sunday 12 October 2025: before any tz-data disagreement on Casablanca
  ok(g.time(e) === '17:39', `an instant with no zone configured reads in KiwiBusinessDay.DEFAULT_ZONE (${bd.DEFAULT_ZONE})`);
  g.configure({ zone: bd.resolve({ timezone: 'Europe/Paris' }).zone });
  ok(g.time(e) === '18:39', 'configure({ zone }) with the resolved store zone moves it');
  g.configure({ zone: 'Not/AZone' });
  ok(g.time(e) === '17:39', 'a zone the engine does not know is ignored, not guessed');
}

/* The comparison is character-exact: a corrupted table goes red. */
{
  const hit = (f) => VECTORS.map((v) => f(JSON.parse(JSON.stringify(v))));
  const swapped = hit((v) => { v.fr = v.fr.replace(/\u00A0/g, ' '); return v; });
  ok(run(F, swapped).length > 20, 'U+00A0 swapped for a plain space in the expectations turns many rows red');
  const hyphen = hit((v) => { v.en = v.en.replace(/\u2212/g, '-'); return v; });
  ok(run(F, hyphen).length > 3, 'U+2212 swapped for a hyphen-minus turns the negative rows red');
}

/* Mutations of format.js: each one must be caught. */
{
  const mutations = [
    ['French groups with U+202F', (s) => s.replace("tags: ['fr-FR'], group: NBSP", "tags: ['fr-FR'], group: '\\u202F'")],
    ['the minus is a hyphen', (s) => s.replace("var MINUS = '\\u2212';", "var MINUS = '-';")],
    ['English percent takes a space', (s) => s.replace("tags: ['en-GB'], group: ',', decimal: '.', pct: '%'", "tags: ['en-GB'], group: ',', decimal: '.', pct: ' %'")],
    ['Arabic uses ICU\'s own group', (s) => s.replace("else if (p.type === 'group') out += L.group;", "else if (p.type === 'group') out += p.value;")],
    ['zero is signed', (s) => s.replace('if (zero) return \'\';', 'if (false) return \'\';')],
    ['the share keeps a decimal', (s) => s.replace('var c = core(lang(), Math.abs(frac), 0, 0, true);', 'var c = core(lang(), Math.abs(frac), 1, 1, true);')],
    ['compact lower-cases K', (s) => s.replace("k: 'K', m: 'M'", "k: 'k', m: 'M'")],
    ['dates keep ICU\'s literals', (s) => s.replace(".filter(Boolean).join(' ')", ".filter(Boolean).join(', ')")],
    ['the relative day keeps ICU\'s apostrophe', (s) => s.replace(".replace(/\\u2019/g, \"'\")", '')],
  ];
  for (const [name, mutate] of mutations) {
    const src = mutate(FORMAT_SRC);
    ok(src !== FORMAT_SRC, `mutation "${name}" applies to format.js`);
    let red = false;
    try {
      const m = fresh(src);
      m.strict = true;       // as in every test: the production repair must not hide a mutation
      red = run(m).length > 0;
    } catch (_) { red = true; }
    ok(red, `mutation "${name}" turns the table red`);
  }
}

/* ── Chromium ───────────────────────────────────────────────────────────── */
console.log('\nformat-vectors-test · Chromium');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); } catch (_) { puppeteer = null; }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
if (!puppeteer || !bin) {
  console.log(`○ format-vectors-test Chromium half not run: ${!puppeteer ? 'puppeteer-core unavailable' : 'no Chromium found'} (never counted as passed)`);
  console.log(`\nformat-vectors-test: ${checks} checks passed (Node half only)`);
  process.exit(process.env.CI ? 1 : 0);
}

const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>format</title>
<script src="/assets/kit/business-day.js"></script><script src="/assets/kit/format.js"></script></head><body></body></html>`;
const ALLOW = { '/assets/kit/format.js': 'text/javascript', '/assets/kit/business-day.js': 'text/javascript', '/tools/format-vectors.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://local').pathname;
  if (p === '/' || p === '/format.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
  if (!ALLOW[p]) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': ALLOW[p] + '; charset=utf-8' });
  res.end(fs.readFileSync(path.join(root, p)));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const S = suite('format-vectors', { browser });

try {
  await S.run('vectors in a page whose device zone is not the store zone', async (t) => {
    const ctx = await browser.createBrowserContext();
    t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    t.step('emulate a device in Auckland and open the page');
    await page.emulateTimezone('Pacific/Auckland');
    await page.goto(base + '/format.html', { waitUntil: 'load' });
    const info = await page.evaluate(() => ({
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      f: typeof window.KiwiFormat, b: typeof window.KiwiBusinessDay, ua: navigator.userAgent.replace(/.*(Chrome\/[\d.]+).*/, '$1'),
    }));
    ok(info.zone === 'Pacific/Auckland' && info.f === 'object' && info.b === 'object', `the page's device zone is ${info.zone}, KiwiFormat and KiwiBusinessDay are on window (${info.ua})`);

    t.step('run every vector in the page');
    const bad = await page.evaluate(async (DEFAULT_ZONE, locales) => {
      const table = await (await fetch('/tools/format-vectors.json')).json();
      const out = [];
      for (const v of table.vectors) for (const l of locales) {
        KiwiFormat.configure({ zone: v.zone || DEFAULT_ZONE });
        let got;
        try { got = KiwiFormat.for(l)[v.call](...v.args); } catch (e) { got = 'THROW ' + e.message; }
        if (got !== v[l]) out.push({ id: v.id, lang: l, got, want: v[l] });
      }
      return out;
    }, DEFAULT_ZONE, forLocales(LANGS));
    ok(bad.length === 0, `${VECTORS.length} vectors x ${forLocales(LANGS).length} languages in Chromium` + (bad.length ? ': ' + bad.slice(0, 3).map((b) => `${b.id}/${b.lang} got ${hex(b.got)} want ${hex(b.want)}`).join(' | ') : ''));

    t.step('language comes from the page');
    const langs = await page.evaluate((locales) => {
      const seen = {};
      KiwiFormat.configure({ lang: '' });
      for (const l of locales) { document.documentElement.setAttribute('lang', l); seen[l] = KiwiFormat.num(19174.5, 2) + '|' + KiwiFormat.lang(); }
      document.documentElement.removeAttribute('lang');
      seen.none = KiwiFormat.lang();
      return seen;
    }, forLocales(LANGS));
    ok(forLocales(LANGS).every(l => langs[l] === ({ fr: '19\u00A0174,50|fr', en: '19,174.50|en', ar: '19\u00A0174,50|ar' })[l]) && langs.none === 'fr',
      'with no explicit language the page decides (html lang), and French is the last resort like the rest of the app');

    t.step('the assertion in a page');
    const guard = await page.evaluate(() => {
      const reports = [];
      window.KiwiReportError = (e, where) => reports.push(where + ':' + e.message);
      KiwiFormat.strict = false;
      const s = KiwiFormat.guard('1\u202F2\u200E-3', 'probe');
      KiwiFormat.guard('1\u202F2', 'probe');
      return { s, reports };
    });
    ok(guard.s === '1\u00A02\u22123' && guard.reports.length === 1 && guard.reports[0] === 'format:probe:format-banned-char', 'repaired and reported once in a real page');
  });
} finally {
  server.close();
  console.log(`\nformat-vectors-test: ${checks} checks passed`);
  await S.finish();
}
