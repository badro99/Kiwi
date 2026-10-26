#!/usr/bin/env node
import dashboardDependencies from './dashboard-dependencies.cjs';
/* starter-copy-test · a real store's empty pages read in its language.
 *
 * Before it has data, a real store opens dashboard pages on a « starter »: a
 * title, one line, three bullets (assets/pages-pro.js, STARTERS_FR). Until
 * 21 October those were French whatever the app language; an English sweep of
 * Terminaux showed all four lines in French. assets/starter-copy.js now carries
 * the English and Arabic text. This test fails when a destination is missing
 * from either language, when a bullet count differs, and checks the lookup
 * itself: English and Arabic replace the French, a missing entry falls back.
 *   node tools/starter-copy-test.mjs */
import fs from 'node:fs';
import vm from 'node:vm';
import pagesProSource from './pages-pro-test-source.cjs'; // pages-pro.js en quatre fichiers depuis le 22 octobre 2026

const ROOT = new URL('..', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
let n = 0; const fails = [];
const check = (ok, label) => { n++; if (!ok) fails.push(label); };

const pro = pagesProSource();
const a = pro.indexOf('  const STARTERS_FR = {');
const b = pro.indexOf('\n  };', a);
check(a > 0 && b > a, 'pages-pro.js keeps the French table as STARTERS_FR');
const FR = new Function('return (' + pro.slice(a + '  const STARTERS_FR = '.length, b + 4).trim().replace(/;$/, '') + ')')();
const p0 = pro.indexOf('  const STARTERS = new Proxy(STARTERS_FR, {');
const p1 = pro.indexOf('\n  });', p0);
check(p0 > b && p1 > p0, 'STARTERS is the language-aware view of STARTERS_FR');

const window = {};
vm.runInNewContext(read('assets/starter-copy.js'), { window });
const C = window.KiwiStarterCopy;
const navs = Object.keys(FR);
check(navs.length >= 20, `${navs.length} destinations in the French table`);
for (const lang of ['en', 'ar']) {
  const L = (C && C[lang]) || {};
  const missing = navs.filter((k) => !L[k]);
  check(!missing.length, `${lang}: every destination translated${missing.length ? ' (missing ' + missing.join(', ') + ')' : ''}`);
  const extra = Object.keys(L).filter((k) => !FR[k]);
  check(!extra.length, `${lang}: no entry for a destination that does not exist${extra.length ? ' (' + extra.join(', ') + ')' : ''}`);
  for (const k of navs) {
    const e = L[k]; if (!e) continue;
    check(!!e.t && !!e.d && Array.isArray(e.b) && e.b.length === FR[k].b.length && e.b.every(Boolean), `${lang}/${k}: title, line and ${FR[k].b.length} bullets`);
    check(e.t !== FR[k].t || ['Stock', 'Menu', 'Promotions', 'Planning'].includes(e.t) && lang === 'en', `${lang}/${k}: title is not the French one`);
  }
  check(!JSON.stringify(L).includes('—'), `${lang}: no em dash`);
}
check(!/[éèêàçùûôœ]/.test(JSON.stringify(C.en)), 'en: no French accented letter left');
check(/[؀-ۿ]/.test(JSON.stringify(C.ar)) && Object.values(C.ar).every((e) => /[؀-ۿ]/.test(e.d)), 'ar: every line is in Arabic script');

/* The lookup, run as shipped. */
const proxySrc = pro.slice(p0 + '  const STARTERS = '.length, p1 + 5).trim().replace(/;$/, '');
const view = (lang, copy) => vm.runInNewContext(`(${proxySrc})`, { STARTERS_FR: FR, window: { KiwiI18n: { getLang: () => lang }, KiwiStarterCopy: copy }, Object, Array });
check(view('en', C).terminaux.d === C.en.terminaux.d && view('en', C).terminaux.b[0] === C.en.terminaux.b[0], 'English replaces the French starter');
check(view('ar', C).clients.t === C.ar.clients.t, 'Arabic replaces the French starter');
check(view('fr', C).terminaux.d === FR.terminaux.d, 'French reads the French table');
check(view('en', { en: {} }).menu.d === FR.menu.d, 'a missing translation falls back to French');
check(view('en', undefined).stock.t === FR.stock.t, 'no copy file loaded: French, never undefined');

const dash = dashboardDependencies(read('dashboard.html'));
const sc = dash.indexOf('assets/starter-copy.js?v='), pp = dash.indexOf('assets/pages-pro.js?v=');
check(sc > 0 && sc < pp, 'dashboard loads starter-copy.js before pages-pro.js');

if (fails.length) { console.log(`✗ starter copy: ${fails.length}/${n} failed\n  ` + fails.join('\n  ')); process.exit(1); }
console.log(`✓ starter copy: ${n} checks · ${navs.length} empty pages in fr, en and ar`);
