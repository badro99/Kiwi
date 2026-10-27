#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · repo smoke checks — the project's automated safety net.
 *
 *   node tools/check.js
 *
 * Zero dependencies, no build step — so it runs anywhere, instantly, with no
 * install. The project stack lock was lifted 2026-08-13, so a real test runner
 * is now allowed alongside this; keep THIS file dependency-free regardless, it
 * is the gate that must never fail to start.
 * Checks, in order:
 *   1. SYNTAX     every assets/*.js compiles (vm.Script parse, no execution)
 *   2. ACTIONS    every data-action declared in HTML is known to some JS file
 *   3. I18N       every data-i18n key used in HTML exists in i18n.js EN + AR
 *   4. FORBIDDEN  background:var(--ink) (inverts in dark mode) · secret-shaped
 *                 strings (API keys, private keys)
 *
 * Exit code 0 = all green · 1 = at least one failure. Warnings don't fail.
 * ─────────────────────────────────────────────────────────────────────────── */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* Windows. The browser suites look for Chrome at its macOS and Linux paths and,
 * finding none, print "○ skip" and exit 0, so a Windows run would pass with no
 * browser assertion executed. Find Chrome where Windows installs it and hand it
 * to every suite through the two variables they read. An explicit value wins. */
if (process.platform === 'win32' && !process.env.KIWI_CHROMIUM_BIN) {
  const winChrome = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
    .filter(Boolean)
    .flatMap((dir) => [path.join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe'), path.join(dir, 'Chromium', 'Application', 'chrome.exe')])
    .find((f) => fs.existsSync(f));
  if (winChrome) process.env.KIWI_CHROMIUM_BIN = winChrome;
  else console.log('⚠ Windows: no Chrome found; set KIWI_CHROMIUM_BIN, or every browser suite will skip');
}
if (process.env.KIWI_CHROMIUM_BIN && !process.env.CHROME_BIN) process.env.CHROME_BIN = process.env.KIWI_CHROMIUM_BIN;

/* One run at a time, and no child test can hang the gate (tools/check-guard.js). */
if (process.argv.includes('--fast')) process.env.KIWI_CHECK_TIER = 'fast';
if (process.argv.includes('--changed')) process.env.KIWI_CHECK_TIER = 'changed';
/* The changed tier names what it will run, and why, before anything starts. */
if (process.env.KIWI_CHECK_TIER === 'changed') {
  const g = require('./check-guard');
  let s;
  try { s = g.selection(); }
  catch (e) { console.log(`✗ --changed could not list the changes (${e.message}); run \`npm run check:fast\` instead`); process.exit(1); }
  const rel = (f) => path.relative(ROOT, f);
  console.log(`■ Changed tier · ${s.changed.length} changed file(s) against ${s.base ? 'the merge base with ' + s.base : 'HEAD'}`);
  for (const c of s.changed.slice(0, 40)) console.log('  · ' + c + (s.stampOnly.includes(c) ? '  (stamps only)' : ''));
  if (s.changed.length > 40) console.log(`  · … and ${s.changed.length - 40} more`);
  if (!s.depsKnown) console.log('  ⚠ no dependency map on this machine yet: tests are chosen by the files they name. One `npm run check:fast` (or a full run) records what each test reads.');
  if (s.all) console.log('  ⚠ the runner itself changed: every fast-tier suite runs');
  console.log(`  → ${s.picked.size} of ${s.named.size} child test(s) selected${s.picked.size ? ':' : ''}`);
  for (const [f, why] of s.picked) console.log(`    ${rel(f)}  (${why})`);
  if (s.browserLater.length) console.log(`  ⏭ ${s.browserLater.length} browser suite(s) load these files with their page but are not about them; the full gate runs them (--browsers runs them now; --no-browsers leaves every browser suite): ${s.browserLater.map((f) => path.basename(f)).join(', ')}`);
}
/* The money, payroll, books and accessibility suites need fast-check and
 * axe-core from app/node_modules; without them each one prints "○ skip" and
 * exits 0, so a fresh worktree passed the gate with no money property run
 * (found 22 October). Every tier refuses to start without them (the fast tier
 * used to only warn, and its green then held no property). KIWI_ALLOW_PROPERTY_SKIP=1
 * runs the rest anyway, knowingly, and the run ends red: a run with properties
 * left unexecuted is never a pass. */
const MISSING_TEST_DEPS = [];
{
  const missing = ['fast-check', 'axe-core', 'puppeteer-core']
    .filter((m) => !fs.existsSync(path.join(ROOT, 'app', 'node_modules', m, 'package.json')));
  if (missing.length) {
    const fix = `npm --prefix app ci, or in a worktree: ln -s <main checkout>/app/node_modules app/node_modules`;
    if (process.env.KIWI_ALLOW_PROPERTY_SKIP !== '1') {
      console.log(`✗ app/node_modules lacks ${missing.join(', ')}: the money and accessibility suites would skip and still read green.\n  Fix: ${fix}\n  (KIWI_ALLOW_PROPERTY_SKIP=1 runs the rest anyway, knowingly; that run ends red.)`);
      process.exit(1);
    }
    MISSING_TEST_DEPS.push(...missing);
    console.log(`⚠ app/node_modules lacks ${missing.join(', ')}: money and accessibility properties will skip, so this run cannot pass (${fix})`);
  }
}
/* …and puppeteer-core on disk is not a browser. Without a Chromium that starts,
 * every browser suite prints "○ skip" and exits 0, and the full gate read green
 * with none of them run. The full run finds the executable the suites would use
 * and launches it once; the fast tier launches no browser suite and only warns.
 * KIWI_ALLOW_BROWSER_SKIP=1 lets a full run go on anyway, knowingly. */
if (require('./check-guard').runsBrowsers() && process.env.KIWI_ALLOW_BROWSER_SKIP !== '1') {
  const b = require('./check-guard').browserPreflight();
  if (!b.ok) {
    console.log(`✗ no working Chromium: ${b.reason}.\n  Every browser suite would skip and still read green.\n  Fix: install Chrome or Chromium, or point KIWI_CHROMIUM_BIN at one that starts.\n  (KIWI_ALLOW_BROWSER_SKIP=1 runs anyway, knowingly; --fast needs no browser.)`);
    process.exit(1);
  }
} else if (process.env.KIWI_CHECK_TIER === 'fast' || process.env.KIWI_CHECK_TIER === 'changed') {
  const bin = require('./check-guard').findBrowser();
  if (!bin || !fs.existsSync(bin)) console.log(`⚠ no Chromium found${bin ? ' at ' + bin : ''}: a full run will refuse to start until one is (KIWI_CHROMIUM_BIN)`);
}
/* The machine-wide lock exists so two runs do not drown the machine in headless
 * browsers; the fast tier launches none, so it never waits behind a full run. */
if (require('./check-guard').runsBrowsers()) require('./check-guard').acquireLock();
require('./check-guard').install();
/* …and the child tests run side by side first, then replay here in order
 * (tools/check-pool.js). KIWI_CHECK_JOBS=1 runs everything serially. */
require('./check-guard').prefetch();

/* Les doubles de synchronisation. iCloud/Dropbox recopient un fichier modifié
 * des deux côtés sous « dashboard 2.html », « CLAUDE 2.md » — jamais suivis par
 * git, donc jamais déployés, mais posés à côté des vrais dans le même dossier.
 * La garde les lisait comme du produit : elle a signalé une clé i18n manquante
 * qui n'existe plus que dans une copie d'il y a trois semaines, et elle aurait
 * tout aussi bien pu masquer l'inverse. On n'audite que ce qui part en ligne. */
const STALE_COPY = / \d+\.[a-z]+$/i;
const list = (dir, ext) => fs.readdirSync(dir)
  .filter((f) => f.endsWith(ext) && !STALE_COPY.test(f))
  .map((f) => path.join(dir, f));
const read = (f) => fs.readFileSync(f, 'utf8');

const JS_FILES = list(path.join(ROOT, 'assets'), '.js').concat(...['assets/interactive', 'assets/daterange', 'assets/agent', 'assets/pos-maison', 'assets/pos-boutique', 'assets/team', 'assets/planning', 'assets/printer', 'assets/serveur', 'assets/stock', 'assets/pages-pro', 'assets/menu-catalog', 'assets/pressing'].map(dir => list(path.join(ROOT, dir), '.js')));
const CSS_FILES = list(path.join(ROOT, 'assets'), '.css');
const HTML_FILES = list(ROOT, '.html');

let failures = 0;
let warnings = 0;
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const warn = (msg) => { warnings++; console.log('  ⚠ ' + msg); };
/* A suite the fast tier did not run prints as skipped, once, never as green. */
const guard = require('./check-guard');
const ok = (msg) => {
  const s = guard.takeSkip();
  if (s) { if (guard.tier() === 'fast') console.log('  ⏭ ' + s + ' not run (fast tier)'); return; }
  console.log('  ✓ ' + msg);
};
const section = (t) => console.log('\n■ ' + t);

/* ── 1 · SYNTAX (compile only — nothing is executed) ────────────────────── */
section('Syntax (vm.Script compile)');
{
  let bad = 0;
  for (const f of JS_FILES) {
    try {
      const source = read(f);
      if (/^import .* from /m.test(source) || /^export\s/m.test(source)) require('child_process').execFileSync(process.execPath, ['--check', '--input-type=module'], { input: source, stdio: 'pipe' });
      else new vm.Script(source, { filename: f });
    }
    catch (e) { bad++; fail(path.relative(ROOT, f) + ' — ' + e.message); }
  }
  if (!bad) ok(`${JS_FILES.length} JS files parse clean`);
}

/* ── 1b · SYNTAX of the Pages Functions ──────────────────────────────────────
 * The one directory whose syntax errors take the whole SITE down, and the one
 * this file used to skip. A stray `try {` in functions/api/sale.js failed six
 * consecutive Cloudflare builds — the deploy pipeline stayed on the last good
 * commit for 44 minutes while every push appeared to succeed, because nothing
 * local ever parsed these files.
 *
 * They need their own pass for two reasons: they live in subdirectories, and
 * they are ES modules — `new vm.Script` throws on `export` no matter how valid
 * the file is, so the check above could never have covered them. `node --check`
 * decides module vs script from the extension, hence the .mjs temp copy. */
section('Syntax · Pages Functions (node --check, ESM)');
{
  const { execFileSync } = require('child_process');
  const os = require('os');
  const walk = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : (d.name.endsWith('.js') ? [p] : []);
  }) : [];

  const FN_FILES = walk(path.join(ROOT, 'functions'));
  const tmp = path.join(os.tmpdir(), 'kiwi-check-' + process.pid + '.mjs');
  let bad = 0;
  for (const f of FN_FILES) {
    try {
      fs.writeFileSync(tmp, read(f));
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    } catch (e) {
      bad++;
      const out = String((e && e.stderr) || (e && e.message) || '').split('\n')
        .find((l) => /Error|error/.test(l)) || 'syntax error';
      fail(path.relative(ROOT, f) + ' — ' + out.trim() + '  (this breaks the Cloudflare build)');
    }
  }
  try { fs.unlinkSync(tmp); } catch (_) {}
  if (!bad) ok(`${FN_FILES.length} Pages Functions parse clean`);
}

/* ── 2 · data-action coverage ───────────────────────────────────────────────
 * An action declared in markup must be *known* somewhere in JS — as a handler
 * registration, an object key, or routed delegation. Heuristic: after removing
 * the data-action="…" declarations themselves, the quoted action string must
 * still appear in at least one JS source (or inline <script>). Dynamic
 * (template-interpolated) action values are skipped by the \w- pattern. ──── */
section('data-action ↔ handler coverage');
{
  const DECL = /data-action="([\w-]+)"/g;
  // Markup declarations only — a selector usage like closest('[data-action="x"]')
  // IS wiring evidence, so the lookbehind keeps those in the corpus.
  const MARKUP_DECL = /(?<!\[)data-action="([\w-]+)"/g;
  const declared = new Set();
  const sources = [];
  for (const f of [...HTML_FILES, ...JS_FILES]) {
    const src = read(f);
    sources.push(src);
    let m; while ((m = DECL.exec(src))) if (m[1]) declared.add(m[1]);
  }
  // Corpus where wiring would live: JS + inline scripts, with the pure markup
  // declarations blanked out so they don't self-satisfy.
  const corpus = sources.map((s) => s.replace(MARKUP_DECL, '')).join('\n');
  const missing = [...declared].filter((a) => corpus.indexOf(`'${a}'`) === -1 &&
                                              corpus.indexOf(`"${a}"`) === -1 &&
                                              corpus.indexOf('`' + a + '`') === -1);
  if (missing.length) missing.forEach((a) => fail(`data-action="${a}" has no matching string anywhere in JS — likely unwired`));
  else ok(`${declared.size} unique data-action values all known to JS`);
}

/* ── 3 · i18n key parity (EN + AR must define every key the DOM uses) ────── */
section('i18n key parity (data-i18n → i18n.js EN/AR)');
{
  const i18nSrc = read(path.join(ROOT, 'assets', 'i18n.js'));
  const used = new Set();
  // Only pages that actually load assets/i18n.js — the standalone surfaces
  // (kiwi-order, kiwi-caisse, kiwi-serveur, kiwi-cuisine, …) carry their own
  // inline dicts.
  //
  // La balise, pas la sous-chaîne. Un simple includes() attrapait aussi toute
  // page qui se contente de NOMMER le module — l'écran du passe explique en
  // commentaire pourquoi son dictionnaire n'est pas dans assets/i18n.js, et se
  // faisait auditer contre un dictionnaire qu'il ne charge pas : douze
  // avertissements pour des clés parfaitement traduites, sur place.
  const LOADS_I18N = /<script[^>]+src="[^"]*assets\/i18n\.js/;
  for (const f of HTML_FILES.filter((f) => LOADS_I18N.test(read(f)))) {
    const src = read(f);
    let m;
    const A = /data-i18n="([\w.-]+)"/g;
    while ((m = A.exec(src))) used.add(m[1]);
    const B = /data-i18n-attr="[\w-]+:([\w.-]+)"/g;
    while ((m = B.exec(src))) used.add(m[1]);
  }
  const missing = [...used].filter((k) => {
    const n = i18nSrc.split(`'${k}'`).length - 1;
    return n < 2; // needs an entry in BOTH the en and ar dicts
  });
  if (missing.length) missing.forEach((k) => warn(`data-i18n="${k}" not found in both EN and AR dicts — will fall back to French`));
  else ok(`${used.size} data-i18n keys covered in EN + AR`);
}

/* ── 3b · balanced <script> tags ──────────────────────────────────────────
 * An unclosed <script> makes the parser eat the following markup up to the
 * next </script> — including other script tags (this killed i18n.js loading
 * once: the role-gate block lost its closer and swallowed the i18n include). */
section('Balanced <script> tags');
{
  let bad = 0;
  for (const f of HTML_FILES) {
    const src = read(f);
    const open = (src.match(/<script\b/gi) || []).length;
    const close = (src.match(/<\/script>/gi) || []).length;
    if (open !== close) { bad++; fail(`${path.relative(ROOT, f)} — ${open} <script> vs ${close} </script>`); }
  }
  if (!bad) ok(`${HTML_FILES.length} HTML files have balanced script tags`);
}

/* ── 4 · forbidden patterns ─────────────────────────────────────────────── */
section('Forbidden patterns');
{
  // background:var(--ink) inverts in dark mode (the bug that broke the sidebar
  // once, and left light-on-light slabs behind). The debt was burned down on
  // 2026-10-13: a dark slab asks for --inverse-surface / --inverse-ink
  // (tokens.css), a QR or a deliberate fixed colour uses a literal. Any new
  // instance in the token/dark-mode surfaces now fails the build.
  // tools/ink-debt-browser-test.mjs checks what actually paints.
  const INK_SCOPE = [...CSS_FILES, ...JS_FILES, path.join(ROOT, 'dashboard.html')];
  const inkCounts = [];
  for (const f of INK_SCOPE) {
    // CSS comments can document the forbidden spelling without painting it.
    const src = f.endsWith('.css') ? read(f).replace(/\/\*[\s\S]*?\*\//g, '') : read(f);
    const n = (src.match(/background(?:-color)?\s*:\s*var\(--ink\)/g) || []).length;
    // assets/caisse-shell.css was the caisse's inline <style> until 2026-10-21,
    // outside this scope, and came out with five of these (the caisse's own
    // --ink token). They may go down, never up. assets/orderpro-page.css est
    // de même le <style> de OrderPro.html sorti tel quel le 2026-10-22, avec
    // ses sept (le --ink propre à la page invité, qui reste claire).
    const INK_ALLOWED = { 'assets/caisse-shell.css': 5, 'assets/orderpro-page.css': 7 };
    const allowed = INK_ALLOWED[path.relative(ROOT, f)] || 0;
    if (n > allowed) inkCounts.push(`${path.relative(ROOT, f)}: ${n}${allowed ? ` (allowed ${allowed})` : ''}`);
  }
  if (inkCounts.length) fail(`background:var(--ink) is back (use var(--inverse-surface) + var(--inverse-ink), or a fixed colour) — ${inkCounts.join(' · ')}`);
  else ok('no background:var(--ink) in dark-mode surfaces');

  // « V1 sans encaissement Kiwi » was roadmap jargon printed on fifteen tills'
  // card step (2026-10-19). A cashier reads « paiement sur votre terminal ».
  // Comments may keep the history; visible copy may not.
  const v1 = JS_FILES.filter((f) => read(f).split('\n').some((l) => /V1 sans encaissement/.test(l) && !/^\s*(\*|\/\/|\/\*)/.test(l)))
    .map((f) => path.relative(ROOT, f));
  if (v1.length) fail(`roadmap jargon « V1 sans encaissement » shown to cashiers — ${v1.join(' · ')}`);
  else ok('no « V1 sans encaissement » in till copy');

  // Secret-shaped strings and unredacted credentials. The repo is public-facing demo code —
  // nothing resembling a live credential may be committed.
  // Scans all tracked files via git ls-files (excluding vendor bundles, media/binaries, and tools/ test harness).
  const { execSync } = require('child_process');
  let trackedFiles = [];
  try {
    trackedFiles = execSync('git -c core.quotepath=false ls-files', { cwd: ROOT, encoding: 'utf8' })
      .trim()
      .split('\n')
      .map((l) => l.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
  } catch (_) {
    trackedFiles = [...JS_FILES, ...HTML_FILES, ...CSS_FILES];
  }

  const EXCLUDED_PATTERNS = [
    /^photos\//,
    /^app\/(ios|android|plugins)\//,
    /^bridge\//,
    /^assets\/(vendor|icons|landing|pressing-products)\//,
    /^_next\//,
    /^draco\//,
    /\.min\.js$/,
    /\.(png|jpg|jpeg|gif|webp|svg|ico|pdf|zip|tar|gz|woff|woff2|ttf|eot|LICENSE|NOTICE)$/i,
    /^tools\//, // path-scoped exemption for local test suite and mock fixtures
  ];

  // Include new stylesheets before they are staged, too.
  const SCAN_FILES = [...new Set([...trackedFiles, ...CSS_FILES.map((f) => path.relative(ROOT, f))])]
    .filter((rel) => !EXCLUDED_PATTERNS.some((rx) => rx.test(rel)))
    .map((rel) => path.join(ROOT, rel));

  const PREFIXED_SECRET = /(?:sk_live_[0-9a-zA-Z]{24,}|rk_live_[0-9a-zA-Z]{24,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z-_]{35}|-----BEGIN [A-Z ]*PRIVATE KEY|\bsk-[A-Za-z0-9]{20,})/;

  // Contextual credentials:
  // - In code/config (.js/.html/.css/etc.): keyword near quoted 4-8 digit numeric literal
  // - In documentation (.md): keyword near quoted or unquoted 4-8 digit numeric literal (prose & table forms)
  const CONTEXTUAL_SECRET = /(?:pin|passcode|pairing[-_ ]?code|password|auth[-_ ]?secret)[\s\S]{0,40}?['"`]([0-9]{4,8})['"`]/i;
  const MD_PROSE_SECRET = /\b(?:pin|passcode|pairing[-_ ]?code|code de jumelage|password|mot de passe)\b[^\n\r]{0,40}?\b([0-9]{4,8})\b/i;

  // Exact 26-entry mock seed allowlist (for code/config files only; markdown has zero exemptions):
  // - 18 public demo métier switch codes in assets/pos-dispatch.js & kiwi-caisse.html ('0000'..'0017')
  // - 8 sequential mock PINs for demo shift team members in assets/pages-pro.js ('1234'..'8901')
  const CODE_DEMO_SEQUENCE = new Set([
    // 18 caisse vertical demo switch codes (kiwi-caisse.html, assets/pos-dispatch.js)
    '0000', '0001', '0002', '0003', '0004', '0005', '0006', '0007',
    '0008', '0009', '0010', '0011', '0012', '0013', '0014', '0015',
    '0016', '0017',
    // 8 mock staff roster PINs (assets/pages-pro.js team seed)
    '1234', '2345', '3456', '4567', '5678', '6789', '7890', '8901'
  ]);

  let leaks = 0;
  for (const f of SCAN_FILES) {
    let content = '';
    try { content = read(f); } catch (_) { continue; }
    const rel = path.relative(ROOT, f);

    const mPref = content.match(PREFIXED_SECRET);
    if (mPref) {
      leaks++;
      fail(`${rel} contains a secret-shaped string (${mPref[0].slice(0, 8)}…)`);
      continue;
    }

    const isMarkdown = /\.md$/i.test(f);
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const mMatch = isMarkdown ? line.match(MD_PROSE_SECRET) : line.match(CONTEXTUAL_SECRET);
      if (mMatch && !CODE_DEMO_SEQUENCE.has(mMatch[1])) {
        leaks++;
        fail(`${rel}:${i + 1} contains an unredacted credential literal`);
        break;
      }
    }
  }
  if (!leaks) ok(`no secret-shaped strings or unredacted credentials across ${SCAN_FILES.length} files`);
}

/* ── 4b · the catalogue import ───────────────────────────────────────────────
 * The one feature that can destroy data a merchant already typed. Its gate
 * asserts idempotence (re-importing a file changes nothing the second time) and
 * that no import silently zeroes a counted stock or steals a code-barres from
 * another article — properties invisible to a reader and cheap to check. */
section('Catalogue import (tools/import-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'import-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(`import gate green (${(out.match(/✓/g) || []).length} checks: CSV, encodages, idempotence, conflits)`);
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`import-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 4c · hardware honesty ──────────────────────────────────────────────────
 * The POS distinguishes an external-terminal card declaration from a bank
 * authorization. It still rejects authorization-only operations, fabricated
 * barcodes, successful prints and drawer openings when hardware is absent. */
section('Hardware honesty (tools/hardware-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'hardware-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(`hardware gate green (${(out.match(/✓/g) || []).length - 1} real/demo checks)`);
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`hardware-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 4c bis · unauthenticated auth input bounds ────────────────────────────
 * Password hashing is intentionally CPU-heavy; accepting an arbitrarily large
 * password lets an anonymous request amplify that cost before authentication. */
section('Auth input bounds (tools/auth-input-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'auth-input-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`auth-input-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

section('Origin migration safety (tools/origin-move-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'origin-move-test.mjs')], { encoding: 'utf8' });
  if (r.status === 0) ok('Origin redirects, handoffs, queues and operator projection');
  else fail('origin-move-test.mjs: ' + ((r.stdout || '') + (r.stderr || '')).trim());
}

/* ── 4d · live sale resilience ──────────────────────────────────────────────
 * A Wi-Fi outage may delay a sale but must never erase or duplicate it. */
section('Live sale resilience (tools/live-link-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'live-link-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(`live-link gate green (${(out.match(/✓/g) || []).length - 1} queue/idempotency checks)`);
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`live-link-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* A synchronous write-ahead copy closes the tiny but real gap between payment
 * confirmation and the asynchronous IndexedDB commit. Closing/reloading the
 * till inside that gap must leave a replayable sale, never only a larger Z. */
section('Live sale write-ahead durability');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'live-link-write-ahead-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) ok(`live sale write-ahead green (${(out.match(/✓/g) || []).length} crash-window checks)`);
  else fail(`live-link-write-ahead-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
}

/* Refunds are immutable negative financial events. Exercise the real Worker
 * route against SQLite plus the shipped browser queue so Caisse, Dashboard and
 * God Mode cannot silently disagree again. */
section('Refund reporting ledger');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'refund-reporting-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) ok(`refund reporting green (${(out.match(/\u2713/g) || []).length - 1} route/queue/reporting checks)`);
  else fail(`refund-reporting-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
}

section('Caisse service ledger scope');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'caisse-service-ledger-scope-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) ok(`caisse service scope green (${(out.match(/✓/g) || []).length} close/reopen checks)`);
  else fail(`caisse-service-ledger-scope-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
}

section('Financial ledger invariant');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'financial-ledger-invariant-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) ok('financial surfaces use the central ledger');
  else fail(`financial-ledger-invariant-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
}

section('Caisse handover & closure accounting');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'caisse-accounting-handover-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) ok(`caisse handover & closure accounting green (${(out.match(/✓/g) || []).length} controls)`);
  else fail(`caisse-accounting-handover-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
}

section('MixMax reconciliation, Gap A & Gap B repair');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'mixmax-reconciliation-repair-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) ok(`mixmax reconciliation repair green (${(out.match(/✓/g) || []).length} controls)`);
  else fail(`mixmax-reconciliation-repair-test.mjs exited ${r.status} - ${out.trim().split('\n').slice(-3).join(' | ')}`);
}

section('Production split payment, authoritative void & menu resolution');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'production-split-void-menu-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) ok(`production split, void & menu resolution green (${(out.match(/✓/g) || []).length} controls)`);
  else fail(`production-split-void-menu-test.mjs exited ${r.status} - ${out.trim().split('\n').slice(-3).join(' | ')}`);
}

/* ── 4e · durable browser outbox wiring ────────────────────────────────────
 * The behavioral fixtures run in a real browser; this zero-dependency gate
 * locks their tested engine into every operational shell and the PWA cache. */
section('Settlement recovery and durable pending commands');
{
  const { spawnSync } = require('child_process');
  for (const file of ['settlement-recovery-test.mjs', 'live-link-settlement-test.mjs', 'live-link-outbox-browser-test.mjs', 'live-link-crash-browser-test.mjs']) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', file)], { encoding: 'utf8' });
    if (r.status === 0) ok(`${file} green`);
    else fail(`${file}: ${((r.stdout || '') + (r.stderr || '')).slice(-2000)}`);
  }
}
section('Offline transaction foundation (tools/offline-foundation-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'offline-foundation-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(`offline foundation green (${(out.match(/✓/g) || []).length - 1} wiring and durability checks)`);
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`offline-foundation-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

section('Shared platform kernel and adapters');
for (const test of [
  'platform-kernel-test.mjs', 'platform-ops-test.mjs', 'media-upload-test.mjs', 'hotel-media-cleanup-test.mjs', 'operations-system-test.mjs', 'quarantine-settlement-test.mjs', 'quarantine-review-browser-test.mjs',
  'vertical-feature-parity-test.mjs', 'pos-sale-cloud-sync-test.mjs', 'pos-sale-hold-test.mjs', 'store-credits-test.mjs',
  'caisse-opening-gate-test.mjs',
  'hotel-rooms-test.mjs', 'hotel-room-plan-test.mjs', 'hotel-room-bulk-api-test.mjs', 'hotel-cloud-save-test.mjs', 'hotel-room-plan-ui-test.mjs', 'hotel-stays-test.mjs', 'hotel-stays-group-test.mjs', 'hotel-stays-group-guards-test.mjs', 'hotel-direct-pricing-test.mjs', 'hotel-reservations-d1-test.mjs', 'hotel-channel-sync-test.mjs', 'hotel-sync-worker-test.mjs', 'hotel-caisse-catalog-test.mjs',
  'sw-immutable-revalidation-test.mjs', 'request-headers-test.mjs', 'request-pollers-test.mjs', 'quiet-mode-test.mjs', 'quiet-demo-browser-test.mjs', 'load-test-suite-test.mjs',
]) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', test)], { encoding:'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) ok(`${test} green (${(out.match(/✓/g) || []).length - 1} controls)`);
  else {
    out.split('\n').filter((line) => line.includes('✗')).forEach((line) => fail(line.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`${test} exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 4f · groupe hôtel, conduit pour de vrai dans Chromium ───────────────
 * hotel-stays-group-browser-test.mjs ouvre le vrai modal de groupe, clique,
 * rejoue les pannes (partiel, reload, réponse perdue, stockage HS,
 * annulation externe, devis mixte) contre les vrais handlers et une vraie
 * base. Sans Chromium ni puppeteer-core la suite se déclare SKIPPÉE (vert
 * explicite) plutôt que de mentir. */
section('Hôtel · parcours réception multi-écran');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'hotel-journey-browser-test.mjs')], { encoding: 'utf8', timeout: 180000 });
  if (r.status !== 0) fail('hotel-journey-browser-test.mjs: ' + r.stdout + r.stderr);
  else ok('Parcours hôtel FR');
}

section('Groupe hôtel · workflow navigateur (tools/hotel-stays-group-browser-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'hotel-stays-group-browser-test.mjs')], { encoding: 'utf8', timeout: 420000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0 && out.includes('○ skip')) warn('group browser suite skipped (no Chromium — browser assertions not executed)');
  else if (r.status === 0) ok(`group browser workflow green (${(out.match(/✓/g) || []).length} controls)`);
  else {
    out.split('\n').filter((line) => line.includes('✗')).forEach((line) => fail(line.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`hotel-stays-group-browser-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 4f-bis · voyageur ordinaire, conduit pour de vrai dans Chromium ────
 * hotel-direct-booking-browser-test.mjs réserve depuis le vrai tableau de
 * bord (boot, code PIN, pages hôtel, écran individuel, groupe) : chaque
 * formule sans compte, prix convenu audité, hold, famille nombreuse, groupe
 * direct, contrat agence intact, reprise anti-doublon. Même règle de skip
 * explicite sans navigateur. */
section('Hôtel voyageur ordinaire · workflow navigateur (tools/hotel-direct-booking-browser-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'hotel-direct-booking-browser-test.mjs')], { encoding: 'utf8', timeout: 420000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0 && out.includes('○ skip')) warn('direct booking suite skipped (no Chromium — browser assertions not executed)');
  else if (r.status === 0) ok(`direct booking workflow green (${(out.match(/✓/g) || []).length} controls)`);
  else {
    out.split('\n').filter((line) => line.includes('✗')).forEach((line) => fail(line.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`hotel-direct-booking-browser-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 4g · les suites du jour, branchées sur la barrière ────────────────────
 * Une suite posée dans tools/ n'est pas une barrière : elle ne protège que ce
 * que check.js appelle. Ces huit-là existaient, passaient, et ne gardaient
 * rien — la régression de demain sur les réservations, le planning, la
 * réservation en ligne, la livraison, l'encaissement des tables ou le schéma
 * D1 serait passée sans un mot. */
section('Réservations, planning, livraison, encaissement, schéma');
for (const test of [
  'fetch-b-deadline-test.mjs',
  'booking-api-test.mjs',
  'booking-split-test.mjs',
  'booking-boundary-test.mjs',
  'booking-properties-test.mjs',
  'booking-read-order-test.mjs',
  'hotel-properties-test.mjs',
  'stock-money-properties-test.mjs',
  'menu-analysis-properties-test.mjs',
  'economat-properties-test.mjs',
  'economat-split-test.mjs',
  'shopify-sync-properties-test.mjs',
  'kitchen-properties-test.mjs',
  'booking-manage-test.mjs',
  'locale-booking-wave-n-test.mjs',
  'booking-hotel-beyond-window-test.mjs',
  'hotel-dossier-safety-test.mjs',
  'cloud-doc-quota-test.mjs',
  'reservation-overlap-test.mjs',
  'store-credit-sale-test.mjs',
  /* Une vente ne se rend qu'une fois : remboursement + avoir + annulation, et l'accord d'un responsable pour un avoir. */
  'sale-return-ledger-test.mjs',
  'return-client-guards-test.mjs',
  'd1-schema-test.mjs',
  /* migrations/ (wrangler d1 migrations) appliquées en mémoire = schema.sql, à la colonne près. */
  'd1-migrations-test.mjs',
  'runtime-ddl-test.mjs',
  'runtime-ddl-routes-test.mjs',
  'schema-minimum-test.mjs',
  'worker-cpu-test.mjs',
  /* Routes statiques appelées directement par le middleware racine (sans le routeur Pages) : table à jour, appel identique, repli. */
  'fast-routes-test.mjs',
  /* GET /api/store : 304 pour un document inchangé et identique pour tous ; jamais pour un document expurgé. */
  'store-revalidation-test.mjs',
  'd1-restore-rehearsal-test.mjs',
  /* D1 refuse plus de 100 paramètres liés par requête : la file de stock (200 mouvements) et la purge des tickets. */
  'd1-variable-limit-test.mjs',
  'order-delivery-test.mjs',
  'order-queue-pagination-test.mjs',
  'queue-open-visit-unpaid-test.mjs',
  'planning-split-test.mjs',
  'planning-core-test.mjs',
  /* Notices au-delà du plafond de 200 : archivées, relues page par page. */
  'planning-notices-archive-test.mjs',
  'wave-p-merge-test.mjs',
  'planning-layout-test.mjs',
  /* Le planning sur un téléphone (390 × 844) : un jour à la fois, une ligne
     par personne, rien ne défile de côté, ajout et modification au vrai
     toucher ; et à 1280 le tableau de la semaine tel qu'il était. */
  'planning-phone-browser-test.mjs',
  'wave-p-keyboard-browser-test.mjs',
  'wave-p-a11y-test.mjs',
  'reservations-test.mjs',
  'reservations-business-day-test.mjs',
  'serveur-menu-live-test.mjs',
  'menu-availability-test.mjs',
  /* « Épuisé jusqu'à 18 h » : la fin d'un 86 posée par la caisse, résolue par
     le serveur à chaque lecture, et le choix de durée au vrai clic. */
  'menu-86-until-test.mjs',
  /* « Vérifier la caisse » : connexion, appairage, ventes à envoyer,
     imprimante (sondée, jamais imprimée), horloge, version, stockage, carte. */
  'caisse-doctor-test.mjs',
  'service-settlement-test.mjs',
  'restaurant-payment-identity-test.mjs',
  'table-settlement-browser-test.mjs',
  'table-settlement-source-test.mjs',
  'current-order-source-test.mjs',
  'current-order-properties-test.mjs',
  'table-settlement-properties-test.mjs',
  'restaurant-reopen-test.mjs',
  'restaurant-reopen-ui-test.mjs',
  'restaurant-reopen-browser-test.mjs',
  'restaurant-reopen-resume-test.mjs',
  'table-split-lifecycle-test.mjs',
  /* Un ticket n°1 de demain n'a pas l'identifiant du ticket n°1 d'hier, et
     « Encaisser » / la fusion / un split à emporter / un scan maison ne
     rouvrent ni ne perdent une addition déjà payée en partie. */
  'sale-id-collision-test.mjs',
  'caisse-payment-guards-test.mjs',
  'refund-split-identity-test.mjs',
  'restaurant-visit-close-reload-test.mjs',
  'restaurant-sync-release-test.mjs',
  'z-reconciliation-test.mjs',
  'z-alert-truth-test.mjs',
  'owner-identity-browser-test.mjs',
  /* /api/me a une échéance : une requête qui ne répond jamais ne bloque plus
     la porte d'identité, donc plus de vue opérateur figée sur « Chargement
     du journal… » sans bandeau. */
  'identity-me-timeout-test.mjs',
  'z-alert-copy-test.mjs',
  'z-reconciliation-client-test.mjs',
  'retail-z-reconciliation-test.mjs',
  'retail-basket-cents-test.mjs',
  'retail-sale-hold-test.mjs',
  'z-reconciliation-browser-test.mjs',
  'caisse-winter-clock-test.mjs',
  'device-timezone-test.mjs',
  /* Une caisse appairée s'ouvre sur sa propre preuve, sans le mot de passe du
     patron : page et API de la caisse seulement, jamais le tableau de bord. */
  'till-gate-test.mjs',
  'staff-skin-test.mjs',
  'skin-cloak-test.mjs',
  /* Les skins se rencontrent dans le navigateur : tableau de bord, caisse restaurant
     et boutique, dans chaque skin, thème et taille, peignent le thème annoncé,
     sans italique ni contrôle transparent, avec le style calculé revu. */
  'skin-matrix-browser-test.mjs',
  'wave-p-polish-test.mjs',
  'employee-timezone-test.mjs',
  'wave-n-caps-test.mjs',
  'employee-timezone-browser-test.mjs',
  'table-visit-reuse-test.mjs',
  'recipe-heal-test.js',
  'sale-line-v2-test.mjs',
  'sales-centime-precision-test.mjs',
  'pin-hardening-test.mjs',
  /* Face ID : le serveur confirme la marque du compte (session, sans code), refuse
     tout changement de codes, et le client (native-runtime.js) lit ce verdict. */
  'face-unlock-test.mjs',
  'config-pin-projection-test.mjs',
  'staff-publication-split-test.mjs',
  'staff-credential-parity-test.mjs',
  'team-doc-redaction-test.mjs',
  'team-roster-cap-test.mjs',
  'team-properties-test.mjs',
  'team-split-test.mjs',
  'team-catalog-split-test.mjs',
  'team-owners-split-test.mjs',
  /* Les très gros fichiers ne grossissent plus : pages-pro.js, kiwi-caisse.html… plafonnés à leur taille (+200), les scripts des coquilles (+3). */
  'file-size-ratchet-test.mjs',
  'source-assertion-ratchet-test.mjs',
  'wave-o-infra-test.mjs',
  'assertion-provenance-test.mjs',
  /* TypeScript reads functions/ as plain JS (checkJs): type errors per file pinned, only ever down. */
  'typecheck-ratchet-test.mjs',
  /* One owner per window.Kiwi* global, no new dangling read, the large files' coupling pinned. */
  'global-ownership-test.mjs',
  /* Explicit cross-file read allowances and eager shell order, with no coupling slack. */
  'ownership-test.mjs',
  'pages-pro-lazy-registry-test.mjs',
  'pages-workflow-split-test.mjs',
  'pages-tables-browser-test.mjs',
  'pages-pro-lazy-test.mjs',
  'team-added-toast-test.mjs',
  'team-removal-shift-test.mjs',
  'team-job-names-test.mjs',
  'tenant-guard-test.mjs',
  /* Un commerce sans lettre latine n'est plus « client » : slug propre, pair/create vérifié. */
  'nonlatin-slug-test.mjs',
  /* /api/error ouvert aux caisses, plafond par compte sur /__unlock, compteur du verrou, employé retiré. */
  'auth-hardening-2-test.mjs',
  /* Tout document /api/store s'écrit en compare-and-swap ; cloud-doc garde la révision par magasin. */
  'store-cas-test.mjs',
  /* Shopify « don d'identifiants » : les webhooks se vérifient avec le secret de l'app. */
  'shopify-direct-webhook-test.mjs',
  'shopify-shop-domain-test.mjs',
  'shopify-replay-orders-test.mjs',
  /* Quiz : une question sans réponse ne vaut jamais un point. */
  'quiz-unanswered-test.mjs',
  'service-interconnectivity-test.mjs',
  /* Un employé non pointé ne peut écrire ni commande ni paiement : refus serveur. */
  'team-offshift-server-test.mjs',
  'pressing-split-test.mjs',
  'pressing-boundary-test.mjs',
  'pressing-workspace-test.js',
  'pressing-auto-ready-test.mjs',
  /* Pressing et hôtel : un bouton d'espèces règle le montant reçu, il ne l'ajoute plus au dû. */
  'trade-cash-presets-test.mjs',
  'inventory-waste-test.mjs',
  'inventory-universal-count-test.mjs',
  'inventory-expiry-test.mjs',
  'hotel-exceptions-test.mjs',
  'hotel-reception-journal-test.mjs',
  'hotel-stay-editing-test.mjs',
  'hotel-commercial-test.mjs',
  'hotel-commercial-layout-test.mjs',
  'hotel-pos-billing-safety-test.mjs',
  'hotel-declarations-closing-test.mjs',
]) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', test)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) ok(`${test} green (${Math.max(0, (out.match(/✓/g) || []).length - 1)} controls)`);
  else {
    out.split('\n').filter((line) => line.includes('✗')).forEach((line) => fail(line.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`${test} exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── Receipt numbers are allocated, not inferred from the sales ledger. ─── */
section('Numérotation multi-caisse (tools/ticket-sequence-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'ticket-sequence-test.mjs')], { encoding: 'utf8' });
  const out = String(r.stdout || '') + String(r.stderr || '');
  process.stdout.write(out);
  if (r.status !== 0) {
    if (!out.includes('✗')) fail(`ticket-sequence-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
    else failures++;
  }
}

/* ── dette --ink · ce qui se peint, dans les quatre climats ───────────────
 * ink-debt-browser-test.mjs ouvre l'Accueil, la barre latérale, le tiroir
 * Commandes et Paramètres en clair/sombre × skin Vexel/héritage : aucun texte
 * clair sur fond clair en sombre, et les dalles sombres restent sombres en
 * clair. Même règle de skip explicite sans navigateur. */
section('Dette background:var(--ink) · rendu navigateur (tools/ink-debt-browser-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'ink-debt-browser-test.mjs')], { encoding: 'utf8', timeout: 420000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0 && out.includes('○ skip')) warn('ink-debt browser suite skipped (no Chromium — browser assertions not executed)');
  else if (r.status === 0) ok(`ink-debt browser suite green (${(out.match(/✓/g) || []).length} controls)`);
  else {
    out.split('\n').filter((line) => line.includes('✗')).forEach((line) => fail(line.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`ink-debt-browser-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

section('Commandes · pas d\u2019onglets Réconciliation / Anti-fraude (tools/commandes-tabs-removed-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'commandes-tabs-removed-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) ok('tiroir Commandes sans onglets Réconciliation ni Anti-fraude');
  else fail(`commandes-tabs-removed-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
}

/* Caisse en nuit · --ink y devient clair, un texte blanc fixe dessus disparaît.
 * Le garde-fou ci-dessus ne lit pas kiwi-caisse.html ; cette suite mesure le
 * contraste réel des boutons « encre » de la caisse, nuit et jour. */
section('Caisse nuit · boutons « encre » lisibles (tools/caisse-ink-dark-browser-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'caisse-ink-dark-browser-test.mjs')], { encoding: 'utf8', timeout: 240000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0 && out.includes('○ skip')) warn('caisse-ink-dark browser suite skipped (no Chromium, browser assertions not executed)');
  else if (r.status === 0) ok(`caisse-ink-dark browser suite green (${(out.match(/✓/g) || []).length} controls)`);
  else {
    out.split('\n').filter((line) => line.includes('✗')).forEach((line) => fail(line.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`caisse-ink-dark-browser-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

section('Réconciliation numéro commande (tools/order-number-reconciliation-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'order-number-reconciliation-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) ok('numéro permanent partagé entre caisse et tickets');
  else fail(`order-number-reconciliation-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
}

/* ── Icônes · Material Symbols Outlined, rien d'autre ─────────────────────
 * Le runtime est généré depuis assets/icons/material/, chaque nom demandé
 * dessine un vrai glyphe (pas le « ? » de repli), et aucun fichier ne gagne un
 * data-lucide : le nouveau code écrit data-icon avec un nom Material. */
section('Icônes Material (tools/material-icons-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'material-icons-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) ok(`material-icons-test.mjs green (${Math.max(0, (out.match(/✓/g) || []).length)} controls)`);
  else fail(`material-icons-test.mjs exited ${r.status} — ${out.trim().split('\n').filter((l) => /AssertionError|✗/.test(l)).slice(0, 2).join(' | ') || out.trim().split('\n').slice(-3).join(' | ')}`);
}

/* ── Direction 2027 · étape 1 · icônes et ajustements mesurés ─────────────
 * Spec docs/specs/kiwi-design-2027.md §8 et §6.6.
 *   · icon-vendored-test : une icône qu'un fichier du kit ou un sprite nomme
 *     existe dans assets/icons/material/, le glyphe n'est jamais retouché, les
 *     sprites sont ceux que tools/build-icon-sprite.js écrirait aujourd'hui ;
 *   · icon-render-test : dans Chromium, le <use> de chaque icône recoupe son
 *     <svg> (le bogue de la révision 5 : un viewBox en trop vide l'icône) ;
 *   · font-metrics-test : tools/font-metrics.mjs lit les polices livrées et
 *     retrouve ce que §6.1 affirme (tailles, points de code, tnum, repli) ;
 *   · label-fit-test : chaque libellé d'une ligne tient dans son plus petit
 *     conteneur, mesuré avec les polices livrées et tnum (§6.6). */
for (const [label, file, browser] of [
  ['icon-vendored-test', 'icon-vendored-test.mjs', false],
  ['font-metrics-test', 'font-metrics-test.mjs', false],
  ['icon-render-test', 'icon-render-test.mjs', true],
  ['label-fit-test', 'label-fit-test.mjs', true],
]) {
  section(`Direction 2027 · ${label} (tools/${file})`);
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', file)], { encoding: 'utf8', timeout: 420000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0 && out.includes('○ skip')) warn(`${label} skipped (no Chromium — browser assertions not executed)`);
  else if (r.status === 0) ok(`${label} green (${(out.match(/✓/g) || []).length} controls)`);
  else {
    out.split('\n').filter((line) => line.includes('✗')).forEach((line) => fail(line.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`${file} exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 4d-bis · règles de promotions ──────────────────────────────────────────
 * Une promotion se voit sur un PRIX, pas sur une capture d'écran : deux
 * affiches qui se cumulent, une promotion terminée qui s'applique encore, un
 * déstockage sans date qui vise tout le magasin — rien de tout ça n'est
 * visible à l'œil, et tout coûte de l'argent au commerçant. */
section('Règles de promotions (tools/promos-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'promos-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(`promotions gate green (${(out.match(/✓/g) || []).length - 1} règles de prix vérifiées)`);
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`promos-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 4d-ter · langue du comptoir ────────────────────────────────────────────
 * Une traduction qui échoue ne lève aucune erreur : l'écran reste simplement en
 * français, personne ne signale rien, et la fonctionnalité meurt en silence. */
section('Langue du comptoir (tools/caisse-lang-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'caisse-lang-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(`langue gate green (${(out.match(/✓/g) || []).length - 1} contrôles : découpe, dates, montants en arabe, intégrité fr/en/ar)`);
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`caisse-lang-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 4d-quater · l'imprimante et la clôture dans la langue du comptoir ─────
 * Le dialogue « Connecter une imprimante » et la feuille de fin de service
 * écrivent en français et comptent sur le balayage de caisse-lang.js. Le banc
 * relit leur source et exige une paire anglais + arabe pour chaque phrase. */
section('Imprimante et clôture en FR/EN/AR (tools/caisse-surface-lang-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'caisse-surface-lang-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.trim().split('\n').pop().replace(/^✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`caisse-surface-lang-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* Specialist till language coverage, source extraction and rendered patterns. */
section('Pressing et hôtel en FR/EN/AR (tools/caisse-pressing-hotel-lang-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'caisse-pressing-hotel-lang-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.trim().split('\n').pop().replace(/^✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`caisse-pressing-hotel-lang-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 4e · production action honesty ────────────────────────────────────────
 * Presentation workflows must fail honestly for a real merchant, even if a
 * later navigation change accidentally exposes one of their buttons. */
section('Production action honesty (tools/action-honesty-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'action-honesty-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(`production action gate green (${(out.match(/✓/g) || []).length - 1} real/demo checks)`);
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`action-honesty-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 5 · the assistant actually answering ───────────────────────────────────
 * Everything above this line checks that the code PARSES and is WIRED. None of
 * it would have noticed the assistant quoting a break-even it computed wrong,
 * leaking a demo café's revenue to a real merchant, or answering a payroll
 * question for a badge that cannot open the payroll page. tools/agent-test.js
 * runs the assistant for real and grades its answers; it is a release gate, so
 * its failures are this script's failures. ─────────────────────────────────── */
section('Assistant behaviour (tools/agent-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'agent-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    const passed = (out.match(/✓/g) || []).length;
    ok(`assistant gate green (${passed} checks: routing ×3 langs, arithmetic, redaction, isolation, permissions)`);
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`agent-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* The assistant's product knowledge must ship with the product. These gates
 * compare all 19 merchant profiles with the feature registry and exercise 40
 * live operational questions against their real adapter contracts. */
section('Assistant feature truth + 40 operational simulations');
for (const script of ['agent-features-test.mjs', 'agent-ops-simulations.mjs', 'agent-open-targets-test.mjs']) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', script)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    const passed = (out.match(/✓/g) || []).length;
    ok(`${script} green (${passed} checks)`);
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`${script} exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* Ten user-facing ratings, ten executable contracts. A release cannot call
 * the copilot “10/10” because the screen looks convincing; it earns the score
 * through merchant isolation, live adapters, multilingual output, guarded
 * actions and honest failure behaviour. */
section('Assistant 10/10 scorecard');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'agent-scorecard.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) ok('all 10 assistant categories earned 10/10');
  else {
    out.split('\n').filter((l) => /[✗·]/.test(l)).forEach((l) => fail(l.trim().replace(/^✗\s*/, '')));
    if (!/[✗·]/.test(out)) fail(`agent-scorecard.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 6 · qui a le droit de lire le stock d'une AUTRE boutique ───────────────
 * /api/stock/lookup est le seul endpoint qui franchit volontairement la
 * frontière entre deux magasins. Une erreur de tenancy n'y produit aucun
 * symptôme visible — elle produit un concurrent qui lit l'inventaire du voisin.
 * tools/stock-lookup-test.js signe de vrais cookies et vérifie la frontière ;
 * c'est une porte de sortie, ses échecs sont ceux de ce script. ────────────── */
section('Stock inter-établissements (tools/stock-lookup-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'stock-lookup-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`stock-lookup-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 7 · la porte des canaux extérieurs ──────────────────────────────────────
 * /api/channel/order est la seule route appelée par un tiers SANS session, avec
 * une clé porteuse. Ses erreurs sont invisibles à l'écran : elles se voient
 * quand un inconnu dépose des commandes chez un commerçant, ou qu'un plat part
 * deux fois parce que le prestataire a rejoué sa requête. ──────────────────── */
section('Canaux extérieurs (tools/channel-order-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'channel-order-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`channel-order-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 7ter · le relais OrderPro ───────────────────────────────────────────────
 * Les trois portes du relais ont l'air justes isolément ; ce qui casse, c'est
 * leur relation. Un prix qu'on croit vérifié et qui vient du téléphone, une
 * session qu'on croit fermée et qui laisse encore commander, une étape franchie
 * qu'un deuxième tap défait. Ce banc-là ouvre un vrai SQLite sur schema.sql,
 * parce que la moitié de ces règles est tenue par le SQL lui-même. ─────────── */
section('Relais OrderPro (tools/orderpro-relay-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'orderpro-relay-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`orderpro-relay-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── L'heure du magasin, jamais un décalage fixe ──────────────────────────────
 * Le Maroc est passé de UTC+1 à UTC+0 en 2026. Les jours de file, la semaine
 * restaurant et les références de démo se lisent dans le fuseau (Intl), et rien
 * n'affiche « GMT+1 » à côté de l'horloge de l'appareil. */
section('Heure du magasin (tools/store-clock-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'store-clock-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok((out.split('\n').reverse().find((l) => l.includes('✓')) || 'store-clock-test vert').replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`store-clock-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 7quater · la carte suit l'établissement ─────────────────────────────────
 * Un compte tient plusieurs magasins et on passe de l'un à l'autre sans
 * recharger la page. Trois pannes vivaient dans ce pli : la carte du second
 * magasin n'était jamais lue (page Carte vide, et donc plus aucun accès aux
 * tags Order Pro), le « déjà lu » de la boutique verrouillait le restaurant, et
 * le slug du dernier magasin lu servait de cible à la publication suivante —
 * la carte du second restaurant écrasait la fiche du premier, sans un bruit.
 * On fait tourner le VRAI module dans un bac à sable, avec le décalage de
 * config qu'un changement d'établissement produit pour de bon. ─────────────── */
section('Carte par établissement (tools/menu-carte-store-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'menu-carte-store-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`menu-carte-store-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 7bis · la réception native Shopify ──────────────────────────────────────
 * /api/channel/shopify/<id> n'a ni session ni clé porteuse : son adresse est
 * publique par construction, puisque Shopify ne sait envoyer aucun en-tête
 * d'authentification. Ce qui la tient fermée, c'est la seule signature HMAC —
 * donc tout ce qui l'entoure (corps brut, secret enregistré, devise) est une
 * porte, pas un détail. ────────────────────────────────────────────────────── */
section('Réception Shopify (tools/shopify-webhook-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'shopify-webhook-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`shopify-webhook-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

section('Connecteur inventaire Shopify (tools/shopify-connector-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'shopify-connector-test.mjs')], { encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  process.stdout.write(out);
  if (r.status !== 0) {
    if (!out.includes('✗')) fail(`shopify-connector-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 8 · le bouton « Rafraîchir » de la caisse ───────────────────────────────
 * Il n'a qu'une façon de nuire : dire « à jour » sans avoir joint le serveur.
 * Le commerçant en conclut que l'écran dit vrai, et vend ce qu'il n'a plus.
 * (tools/caisse-refresh-test.js) ─────────────────────────────────────────── */
section('Rafraîchir la caisse (tools/caisse-refresh-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'caisse-refresh-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`caisse-refresh-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

section('Documents caisse appairée (tools/cloud-doc-paired-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'cloud-doc-paired-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`cloud-doc-paired-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

section('Liquid Glass par défaut (tools/glass-default-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'glass-default-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    fail(`glass-default-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

section('Détail des ventes (tools/ventes-detail-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'ventes-detail-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    fail(`ventes-detail-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 9 · le bouton « Réimprimer » de la caisse ───────────────────────────────
 * Une réimpression qui repasse par le chemin d'une vente encaisse deux fois, et
 * un duplicata qui ne se déclare pas est une pièce qu'on ne peut plus
 * rapprocher. (tools/pos-reprint-test.js) ────────────────────────────────── */
section('Réimprimer un ticket (tools/pos-reprint-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'pos-reprint-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`pos-reprint-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 9bis · les ventes réelles dans Échanges & avoirs ───────────────────────
 * Le journal local d'une tablette n'est pas le registre du magasin : les
 * tickets d'une autre caisse et ceux restaurés du serveur doivent rester
 * échangeables, sans rendre deux fois leur stock. */
section('Échanges & avoirs (tools/returns-sales-sync-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'returns-sales-sync-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`returns-sales-sync-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 9ter · la fusion du catalogue boutique ──────────────────────────────────
 * Deux appareils tiennent le même inventaire ; mergeDocs() décide ce qui
 * survit quand ils ne sont pas d'accord. Une erreur là-dedans ne lève rien —
 * elle rend au commerçant un stock qu'il croyait avoir corrigé, indéfiniment.
 * (tools/catalog-merge-test.js) ──────────────────────────────────────────── */
section('Fusion du catalogue boutique (tools/catalog-merge-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'catalog-merge-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`catalog-merge-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 9quater · les documents métier hors ligne ───────────────────────────────
 * Une adresse de reçu, un planning ou un plan de salle modifié hors ligne doit
 * repartir même après rechargement. Et un GET en erreur ne doit jamais donner
 * à une copie locale neuve le droit d'écraser le serveur. */
section('Documents métier hors ligne (tools/cloud-doc-offline-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'cloud-doc-offline-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`cloud-doc-offline-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 9bis · le chiffre d'affaires du tableau de bord ─────────────────────────
 * Il était reconstitué (ventes × panier moyen) alors que le panier affiché est
 * arrondi à l'entier : le tableau de bord ne tombait jamais juste face au
 * rouleau de caisse, et l'écart grandissait avec le volume. Cinq tuiles en
 * dérivent et se décalaient ensemble, donc rien à l'écran ne pouvait le
 * trahir. (tools/kpi-ledger-test.js) ──────────────────────────────────────── */
section('CA au grand livre (tools/kpi-ledger-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'kpi-ledger-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`kpi-ledger-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 9ter · les pourboires sont ceux qui ont été déclarés ────────────────────
 * La tuile valait CA × 7,2 % chez un vrai commerçant : un montant inventé sous
 * « Pourboires ». Elle lit les pourboires déclarés à la clôture des journées
 * de la période, et « · » tant qu'aucune n'est close. (tools/tips-truth-test.mjs) */
section('Pourboires déclarés (tools/tips-truth-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'tips-truth-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').reverse().find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`tips-truth-test.mjs exited ${r.status} · ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 9quater · les clients se comptent au carnet ────────────────────────────
 * « Nouveaux clients » valait ventes − réguliers : des tickets présentés comme
 * des personnes. Réguliers, fidélité et nouveaux clients lisent l'historique
 * d'achats daté du carnet clients. (tools/client-mix-test.mjs) */
section('Clients du carnet (tools/client-mix-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'client-mix-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').reverse().find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`client-mix-test.mjs exited ${r.status} · ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 9quinquies · souvent pris ensemble ─────────────────────────────────────
 * Les paires d'articles que les tickets réels réunissent, sous le classement
 * des produits, chacune avec sa preuve, et rien sous 20 tickets à plusieurs
 * articles. (tools/basket-pairs-test.mjs) */
section('Souvent pris ensemble (tools/basket-pairs-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'basket-pairs-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').reverse().find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`basket-pairs-test.mjs exited ${r.status} · ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 9 bis · la marge se mesure ──────────────────────────────────────────────
 * Trois tuiles — Marge brute, Bénéfice brut, Coût matière — dérivaient d'un
 * chiffre qui rapprochait le LIBELLÉ du ticket (un résumé de panier : « Pain
 * +3 art. ») du nom d'un produit. Un panier mixte ne se résolvait donc jamais,
 * un ticket de 4 pains se voyait retrancher UN seul coût, et tout le reste
 * retombait sur une constante de métier — un café affichait exactement 69,0 %
 * à vie. Ce banc défend la règle qui remplace tout ça : un coût inconnu ne
 * produit jamais un nombre. (tools/cost-margin-test.js) ───────────────────── */
section('Marges & coûts (tools/cost-margin-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'cost-margin-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('·')).forEach((l) => fail(l.trim().replace(/^·\s*/, '')));
    if (!out.includes('·')) fail(`cost-margin-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 9b · charges fixes et résultat net ─────────────────────────────────────
 * La marge brute ne dit pas si le commerce gagne de l'argent. Loyer, salaires
 * d'Équipe et charges patronales, commissions de la carte et des plateformes :
 * chaque règle du calcul (assets/charges-engine.js) tenue au centime, et la
 * page Marges réelle qui l'affiche. (tools/charges-test.js) ─────────────── */
section('Charges fixes & résultat net (tools/charges-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'charges-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const bad = out.split('\n').filter((l) => l.includes('✗') && !/charges : \d+\/\d+/.test(l));
  if (r.status === 0) ok(`charges : ${(/charges : (\d+\/\d+)/.exec(out) || [])[1] || 'ok'}`);
  else if (bad.length) bad.forEach((l) => fail(l.replace(/\x1b\[[0-9;]*m/g, '').trim()));
  else fail(`charges-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
}

/* ── 10 · les milliers en arabe ──────────────────────────────────────────────
 * « 31 500 MAD » s'affichait « MAD 500 31 » : un chiffre faux sous les yeux du
 * commerçant. Le correctif réécrit des nœuds de texte, donc la garde surveille
 * autant ce qu'il répare que ce qu'il doit laisser tranquille — une plage de
 * codes, une date, un numéro. (tools/rtl-numbers-test.js) ─────────────────── */
section('Milliers en arabe (tools/rtl-numbers-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'rtl-numbers-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`rtl-numbers-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 11 · les pages publiques et leurs scripts ───────────────────────────────
 * Allow-lister une page sans ses scripts la sert cassée à un inconnu : elle
 * répond 200, ses <script> reçoivent l'écran de connexion, et le client qui
 * scanne un QR voit des carrés vides. Rien ne le signale.
 * (tools/public-assets-test.js) ──────────────────────────────────────────── */
section('Pages publiques (tools/public-assets-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'public-assets-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('·')).forEach((l) => fail(l.replace(/^\s*·\s*/, '')));
    if (!out.includes('·')) fail(`public-assets-test.js exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 12 · l'import D1 → Supabase ─────────────────────────────────────────────
 * Les transformations de l'import (tools/migrate-d1-to-supabase.mjs) changent
 * la forme des données sans jamais lever d'erreur : un objet JSON recopié dans
 * une colonne jsonb y devient une chaîne, et la requête qui l'interroge rendra
 * NULL pendant des mois avant que quelqu'un s'en aperçoive. Le module s'exerce
 * hors réseau, donc il entre ici comme les autres.
 * (tools/supabase-migration-test.mjs) ─────────────────────────────────────── */
section('Import Supabase (tools/supabase-migration-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'supabase-migration-test.mjs')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    ok(out.split('\n').find((l) => l.includes('✓')).replace(/^\s*✓\s*/, ''));
  } else {
    out.split('\n').filter((l) => l.includes('✗')).forEach((l) => fail(l.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`supabase-migration-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 13 · whole-project regression suites ──────────────────────────────────
 * These used to live beside the main gate but were never executed by it. That
 * made green CI compatible with broken admin rights, kitchen relay, floor-plan
 * sync, offline POS shells and stock restoration. Keep the slower/integration
 * checks in one compact section while still failing on the first bad suite. */
section('Whole-project regressions');
{
  const { spawnSync } = require('child_process');
  const suites = [
    'audit-remediation-peripheral-test.mjs',
    'audit-remediation-ai-channel-surfaces-test.mjs',
    'audit-remediation-connectors-test.mjs',
    'audit-remediation-refund-recovery-test.mjs',
    'audit-remediation-caisse-integration-test.mjs',
    'audit-remediation-orders-test.mjs',
    'audit-remediation-serveur-test.mjs',
    'audit-remediation-pressing-test.mjs',
    'audit-remediation-auth-test.mjs',
    'forgot-password-test.mjs',
    'caisse-pairing-recovery-test.mjs',
    'caisse-handoff-demo-reload-test.mjs',
    'caisse-terminal-recovery-test.mjs',
    'caisse-offline-pin-test.mjs',
    'caisse-repair-pin-venue-test.mjs',
    'audit-remediation-money-test.mjs',
    'wave-d-security-test.mjs',
    'audit-remediation-inventory-loyalty-test.mjs',
    'loyalty-truth-test.mjs',
    'loyalty-refused-redemption-test.mjs',
    'loyalty-reserve-test.mjs',
    'repeat-sale-guard-test.mjs',
    'shift-age-nudge-test.mjs',
    'audit-remediation-dashboard-test.mjs',
    'business-day-surfaces-test.mjs',
    'agent-business-day-test.mjs',
    'audit-remediation-devices-test.mjs',
    'dashboard-analytics-toggle-test.mjs',
    'vexel-startup-test.mjs',
    'channel-percentage-test.mjs',
    'sales-day-contrast-test.mjs',
    'sales-ledger-cutoff-test.mjs',
    'day-report-export-test.mjs',
    'month-report-test.mjs',
    'month-report-api-test.mjs',
    'month-report-browser-test.mjs',
    'day-report-paired-scope-test.mjs',
    'day-report-multi-service-test.mjs',
    'card-z-reconciliation-test.mjs',
    'sale-replay-visit-binding-test.mjs',
    'operating-day-drawers-test.mjs',
    'operating-day-stock-test.mjs',
    'operating-day-ai-context-test.mjs',
    'agent-month-business-day-test.mjs',
    'operating-day-split-ui-test.mjs',
    'operating-day-operator-test.mjs',
    'operating-day-orders-integration-test.mjs',
    'operating-day-admin-test.mjs',
    'operating-day-handover-test.mjs',
    'counter-sale-flow-test.mjs',
    'operating-day-inventory-cycle-test.mjs',
    'operating-day-split-session-test.mjs',
    'cash-sessions-auth-test.mjs',
    /* Le tiroir : un attendu honnête n'est jamais retouché (remboursements,
       manquants signés au passage de caisse), un attendu trop bas l'est. */
    'cash-session-properties-test.mjs',
    /* Deux caisses qui réservent leurs numéros au même instant ne reçoivent
       jamais le même ticket. */
    'ticket-sequence-properties-test.mjs',
    /* Promotions boutique : la meilleure seule s'applique, jamais au-dessus du
       rayon, sur la journée d'exploitation ; deux appareils convergent. */
    'promos-properties-test.mjs',
    'cents-precision-test.mjs',
    'sale-return-race-properties-test.mjs',
    'operating-day-sync-status-test.mjs',
    'live-feed-backfill-test.mjs',
    'feed-limit-test.mjs',
    'feed-window-test.mjs',
    'feed-voids-test.mjs',
    'feed-changes-test.mjs',
    'sales-window-test.mjs',
    'sales-summary-test.mjs',
    'sales-history-parity-test.mjs',
    'sales-summary-store-test.mjs',
    'sales-reconcile-test.mjs',
    'sales-trim-test.mjs',
    'sales-scope-test.mjs',
    'ticket-141-test.mjs',
    'kpi-card-layout-test.mjs',
    'dashboard-card-truth-test.mjs',
    'install-card-icon-test.mjs',
    'caisse-menu-add-contrast-test.mjs',
    'caisse-product-art-test.mjs',
    'check-godmode.mjs',
    'operator-workspace-test.mjs',
    'admin-report-test.mjs',
    'scoped-tab-isolation-test.mjs',
    'cross-store-copy-test.mjs',
    'admin-crm-layout-test.mjs',
    'maison-client-history-test.mjs',
    'client-history-browser-test.mjs',
    'clients-campaign-flag-test.mjs',
    'dashboard-unoffered-actions-test.mjs',
    'support-system-test.mjs',
    'admin-support-format-test.mjs',
    'operator-snapshot-test.mjs',
    'ledger-cache-test.mjs',
    'caisse-support-entry-test.mjs',
    'caisse-payment-upload-test.mjs',
    // A paid sale when storage is full: one entry, held, no success haptic, sent once (critique-6 B1).
    'caisse-outbox-full-test.mjs',
    'caisse-auto-receipt-test.mjs',
    'dashboard-activity-test.mjs',
    'caisse-reconnect-test.mjs',
    'caisse-pairing-repair-test.mjs',
    'caisse-pairing-kdf-test.mjs',
    'takeaway-history-timestamps-test.mjs',
    'takeaway-stale-archive-test.mjs',
    'floorplan-sync-test.js',
    'kitchen-relay-test.js',
    'kitchen-relay-retry-test.mjs',
    'takeout-kds-ready-test.mjs',
    'caisse-godmode-toggles-test.mjs',
    'kitchen-print-queue-test.mjs',
    'kitchen-recovery-test.mjs',
    'kitchen-void-slip-test.mjs',
    'course-firing-browser-test.mjs',
    'close-open-tables-browser-test.mjs',
    'kds-recall-test.mjs',
    'kds-recall-browser-test.mjs',
    'kds-course-following-browser-test.mjs',
    'course-following-retry-test.mjs',
    'pairs-api-test.mjs',
    'pairs-caisse-browser-test.mjs',
    'pairs-serveur-browser-test.mjs',
    'pairs-boutique-browser-test.mjs',
    'till-repair-lock-browser-test.mjs',
    'table-time-test.mjs',
    'print-relay-idempotency-test.mjs',
    'print-relay-properties-test.mjs',
    'print-pairing-recovery-test.mjs',
    'shared-rules-test.mjs',
    'day-report-model-parity-test.mjs',
    'shared-pricing-parity-test.mjs',
    'order-pricing-properties-test.mjs',
    'menu-properties-test.mjs',
    'menu-formula-properties-test.mjs',
    'menu-rules-properties-test.mjs',
    'recipes-schema-parity-test.mjs',
    'print-slow-bridge-test.mjs',
    'print-hub-lease-test.mjs',
    'print-hub-resume-test.mjs',
    'service-draft-durability-test.mjs',
    'hotel-group-draft-escape-test.mjs',
    'payment-kitchen-dispatch-test.mjs',
    'food-production-print-test.mjs',
    'order-mode-exit-test.js',
    'table-takeaway-routing-test.js',
    'orderpro-inbox-display-test.js',
    'caisse-discount-and-phantom-table-test.js',
    'caisse-offline-sync-test.mjs',
    'resto-carte-test.js',
    'restaurant-menu-route-test.js',
    'menu-workspace-split-test.mjs',
    'menu-catalog-split-test.mjs',
    'menu-merge-properties-test.mjs',
    'menu-catalog-boundary-test.mjs',
    'menu-pull-route-test.js',
    'restaurant-menu-performance-test.js',
    'menu-pairs-test.js',
    'ramadan-test.js',
    'restaurant-menu-ledger-reconciliation-test.js',
    'restaurant-menu-nutrition-tab-test.js',
    /* Le patron éditorial public : SEO, article sémantique, RTL, mobile et
       fonctionnement sans JS restent présents à chaque nouveau guide. */
    'build-guides-check.mjs',
    'article-template-test.mjs',
    /* /guide et /guides sans préfixe de langue tombaient dans le gate de
       compte et renvoyaient l'écran de connexion marchand. La redirection vit
       dans functions/_middleware.js, donc une suite d'assets ne la verrait
       pas : celle-ci appelle le middleware lui-même. */
    'guides-redirect-test.mjs',
    /* Les articles juridiques portent une date de revue explicite. Le check
       local valide le registre ; le workflow hebdomadaire applique la limite
       stricte de 90 jours afin de ne pas transformer chaque build en minuteur. */
    'content-freshness-test.mjs',
    'restaurant-menu-peak-hours-test.js',
    'restaurant-units-test.js',
    'menu-nutrition-test.mjs',
    'employee-live-test.mjs',
    'employee-trade-shell-test.mjs',
    'locale-handoff-test.mjs',
    'canonical-origin-test.mjs',
    'landing-es-test.mjs',
    'landing-es-browser-test.mjs',
    /* Aucune page de la landing ne promet un chiffrement de bout en bout, et
       les tarifs montrent les quatre paliers de CLAUDE.md §7. */
    'landing-claims-test.mjs',
    'void-stock-test.js',
    'caisse-stock-test.mjs',
    'boutique-variant-stock-test.mjs',
    'boutique-existing-barcode-test.mjs',
    'scan-wedge-browser-test.mjs',
    'boutique-custom-color-test.js',
    'catalog-stock-transaction-test.mjs',
    /* Deux comptoirs, un stock : fusion, suppression, comptage et repli du
       journal contre un modèle de ce que la boutique a fait. */
    'catalog-merge-properties-test.mjs',
    /* Deux appareils, une fiche : chaque champ garde sa dernière édition, un
       même champ changé des deux côtés est soumis au commerçant. */
    'catalog-field-merge-test.mjs',
    'catalog-ledger-properties-test.mjs',
    'catalog-durable-recovery-test.mjs',
    'inventory-ledger-test.mjs',
    'inventory-consumption-batch-test.mjs',
    'inventory-queue-unblock-test.mjs',
    'maison-stock-movements-test.mjs',
    'maison-till-stock-journal-test.mjs',
    'maison-ticket-offline-test.mjs',
    'maison-counter-truth-test.mjs',
    'stock-costing-migration-test.mjs',
    'stock-category-management-test.mjs',
    'pairing-resolver-test.mjs',
    /* pairing-resolver vérifie qui LIT l'appairage ; celui-ci vérifie qu'il n'y
       a qu'un seul ÉCRIVAIN. La cuisine s'appaire sur la même route que la
       caisse et écrivait les quatre clés à la main — sans la purge du commerce
       précédent. */
    'pairing-parity-test.mjs',
    'split-bill-tender-test.mjs',
    'business-day-timezone-test.mjs',
    'zone-law-test.mjs',
    'sync-ledger-boutique-clock-test.mjs',
    /* Direction 2027, étape 1 : le formateur unique (KiwiFormat, §6.3) et la
       journée commerciale côté client (§17.1). format-vectors-test tient le
       tableau de vecteurs en Node et dans Chromium ; la moitié WebKit passe
       par le simulateur iOS et dit « not run » quand il n'y en a pas, jamais
       « passed ». business-day-default-test compare le client au serveur, y
       compris la règle que les caisses livrent aujourd'hui ; config-business-day-test
       tient /api/config : `businessDay` s'ajoute, aucun champ existant ne bouge. */
    'format-vectors-test.mjs',
    'format-vectors-ios.mjs',
    'business-day-default-test.mjs',
    'day-report-formatter-cache-test.mjs',
    'merchant-hour-test.mjs',
    'config-business-day-test.mjs',
    'takeaway-cancel-authorization-test.mjs',
    /* Approuver puis se faire refuser : la passation refuse un manager SUR le
       pavé (plus par un toast après sa fermeture), et les actes qui sont une
       écriture serveur sans file d'attente (annuler ou rejeter une commande en
       ligne, annuler une table avec visite ou ticket envoyé) ne prennent aucun
       code hors ligne : « connexion requise · rien n'a changé », sans rejeu. */
    'till-approval-server-writes-test.mjs',
    'cashier-cancel-test.mjs',
    'order-controls-test.mjs',
    /* Les écarts de SURFACE : jetons recopiés, gris froids inventés, palette
       étrangère collée, sélecteur d'élément nu qui fuit dans une page qui ne
       l'attendait pas. Cette famille-là ne casse rien — la page rend 200, la
       console reste vide — et le produit se met simplement à ressembler à deux
       produits. Rien d'autre ici ne la voit. */
    'surface-parity-test.mjs',
    'caisse-stock-sync-test.mjs',
    'phone-test.mjs',
    'clients-sync-test.mjs',
    'pwa-shell-test.js',
    'pwa-update-poll-test.mjs',
    /* stamp-drift couvre les assets deja estampilles. Celui-ci refuse qu'un
       shell charge silencieusement une URL nue absente du manifeste. */
    'asset-stamp-coverage-test.mjs',
    /* pwa-shell-test vérifie que les copies d'une estampille s'accordent ;
       celui-ci vérifie qu'elle a bougé quand le fichier a bougé. Sans lui, un
       asset édité sans bump est parfaitement cohérent — sur l'ancienne URL. */
    'stamp-drift-test.js',
    /* --sw de bump-stamp (génération SW en quatre fichiers + estampilles des
       bootstraps) et le garde-fou pre-commit, sur un arbre jetable. */
    'bump-stamp-test.mjs',
    'pos-registry-sync-test.mjs',
    'pos-maison-test.mjs',
    'pos-maison-split-test.mjs',
    'pos-boutique-split-test.mjs',
    'boutique-ticket-owner-test.mjs',
    'caisse-app-split-test.mjs',
    'core-split-test.mjs',
    'home-split-test.mjs',
    'home-boundary-test.mjs',
    'home-sparkline-a11y-test.mjs',
    'dashboard-first-use-test.mjs',
    'serveur-split-test.mjs',
    'serveur-notice-archive-test.mjs',
    'serveur-identity-test.mjs',
    'stock-split-test.mjs',
    'stock-controller-split-test.mjs',
    'stock-strings-split-test.mjs',
    'hotel-split-test.mjs', 'hotel-reception-split-test.mjs',
    'interactive-split-test.mjs',
    'venues-split-test.mjs',
    'venues-split-browser-test.mjs',
    'caisse-money-properties-test.mjs',
    'retail-money-properties-test.mjs',
    'dashboard-money-properties-test.mjs',
    'dayreport-properties-test.mjs',
    'briefing-properties-test.mjs',
    'server-money-properties-test.mjs',
    'receivables-properties-test.mjs',
    'trades-money-properties-test.mjs',
    'live-link-queue-properties-test.mjs',
    'live-link-queue-ownership-test.mjs',
    'invoice-vat-properties-test.mjs',
    'payroll-properties-test.mjs',
    'customer-balance-properties-test.mjs',
    'credit-book-properties-test.mjs',
    'credit-book-store-test.mjs',
    'clients-properties-test.mjs',
    'queues-wave-n-test.mjs',
    'clients-display-properties-test.mjs',
    'clients-outbox-owner-test.mjs',
    'books-money-properties-test.mjs',
    'serveur-money-properties-test.mjs',
    'pressing-money-properties-test.mjs',
    'operator-properties-test.mjs',
    'tickets-split-test.mjs',
    'tickets-boundary-test.mjs',
    'tickets-properties-test.mjs',
    'tickets-mcp-auth-test.mjs',
    'tickets-workflow-browser-test.mjs',
    'operator-followups-browser-test.mjs',
    'console-dossier-keyboard-browser-test.mjs',
    'auth-properties-test.mjs',
    'employee-properties-test.mjs',
    'employee-split-test.mjs',
    'orderpro-properties-test.mjs',
    'channel-properties-test.mjs',
    'known-issues-test.mjs',
    'support-urgency-benchmark-test.mjs',
    'operational-glossary-test.mjs',
    'js-declarations-test.mjs',
    'split-edit-resilience-test.mjs',
    'pos-maison-split-browser-test.mjs',
    'maison-caisse-browser-test.mjs',
    'maison-shelf-price-browser-test.mjs',
    'maison-returns-business-day-test.mjs',
    'maison-dashboard-browser-test.mjs',
    'maison-movement-kpis-browser-test.mjs',
    'retail-return-stock-browser-test.mjs',
    'shared-day-selector-test.mjs',
    'avoir-customer-scope-browser-test.mjs',
    'clients-book-page-browser-test.mjs',
    'transactions-nav-stability-browser-test.mjs',
    'shared-day-selector-browser-test.mjs',
    'date-controls-browser-test.mjs',
    'overlay-stack-test.mjs',
    'entitlement-held-gesture-test.mjs',
    'entitlement-panel-language-test.mjs',
    'discount-policy-test.mjs',
    'discount-policy-api-test.mjs',
    'discount-policy-browser-test.mjs',
    'discount-policy-cloud-test.mjs',
    'discount-policy-live-browser-test.mjs',
    'caisse-viewport-guard-test.mjs',
    'boutique-printer-settings-test.mjs',
    /* Le panneau d'activation : il doit pouvoir se fermer. Il ne le pouvait
       pas, et rien ne le disait — voir l'en-tête de la suite. */
    'entitlements-test.mjs',
    /* Les modèles de rayons écrivent dans le catalogue d'un vrai commerce :
       la suite tient le stock à zéro et interdit qu'un modèle posé deux fois
       double le catalogue. */
    'store-templates-test.mjs',
    /* L'inventaire physique en caisse : il appelait deux méthodes du catalogue
       qui n'existent pas, s'ouvrait sur « 0 / 0 articles » et ne disait rien.
       La suite vérifie d'abord le CONTRAT — chaque méthode appelée existe. */
    'pos-inventory-count-test.mjs',
    /* Le locataire hôtelier de test : le socle sur lequel les douze phases de
       l'économat s'appuieront, parce qu'il est interdit de muter un marchand
       qui paie pour prouver une migration. Une fixture que rien ne garde
       pourrit en silence et emporte toutes les suites qui s'y adossent. */
    'hotel-seed-test.mjs',
  'hotel-units-test.mjs',
  'economat-unit-deactivation-test.mjs',
  'hotel-unit-scope-test.mjs',
  'hotel-location-attribution-test.mjs',
  'economat-catalogue-test.mjs',
  'department-catalogue-test.mjs',
  'internal-request-test.mjs',
  'economat-substitution-test.mjs',
  'economat-review-revision-test.mjs',
  'economat-v1-resolution-test.mjs',
  'economat-request-fields-test.mjs',
  'economat-review-test.mjs',
  'economat-handover-test.mjs',
  'economat-request-list-test.mjs',
  'hotel-transfer-test.mjs',
  'economat-real-d1-transfer-test.mjs',
  'room-charge-test.mjs',
  'hotel-reports-test.mjs',
  'hotel-economat-ui-test.mjs',
  'economat-pagination-test.mjs',
  'economat-transfer-provenance-test.mjs',
  'economat-procurement-location-test.mjs',
  'economat-custody-contract-test.mjs',
  'economat-rd-invariants-test.mjs',
    'formula-protocol-test.mjs',
    'formula-child-options-test.mjs',
    'formula-kitchen-paper-test.mjs',
    'orderpro-split-test.mjs',
    'orderpro-boundary-test.mjs',
    'orderpro-formula-explicit-choice-test.mjs',
    'orderpro-formula-choice-images-test.mjs',
    'orderpro-invalid-options-test.mjs',
    'orderpro-session-reorder-test.mjs',
    'orderpro-shared-table-test.mjs',
    'orderpro-cancellation-lifecycle-test.mjs',
    'orderpro-inbox-confirmation-test.mjs',
    'orderpro-floorplan-race-test.mjs',
    'orderpro-guest-bill-test.mjs',
    'orderpro-panel-plan-test.mjs',
    'orderpro-guest-api-test.mjs',
    'orderpro-guest-hub-test.mjs',
    'orderpro-guestpage-editor-test.mjs',
    'field-whole-item-split-test.mjs',
    'field-orderpro-acceptance-test.mjs',
    'field-table-transfer-test.mjs',
    'caisse-table-actions-test.mjs',
    'caisse-item-cancel-browser-test.mjs',
    'trade-copy-test.mjs',
    'floor-accept-test.mjs',
    'onboarding-gate-test.mjs',
    'store-creation-ack-test.mjs',
    'store-creation-api-test.mjs',
    'promotions-store-contract-test.mjs',
    'api-boundaries-test.mjs',
    /* L'app native (app/, Capacitor) embarque les surfaces du dépôt : le bundle
       se construit, est déterministe, charge api-base.js en premier, et la
       porte accepte les origines de l'app sur /api et /auth seulement. */
    'app-bundle-test.mjs',
    /* Les polices de la direction 2027 (étape 1, docs/specs/kiwi-design-2027.md §6.1,
       §6.5, §21.3) : une fonte ne quitte pas le bundle pendant qu'une règle la nomme
       (tools/app-bundle-manifest.json lu par les deux outils de build) ; chaque
       caractère sort du fichier prévu, cmap des vraies fontes à l'appui ; et chaque
       page qui écrit en IBM Plex Sans Arabic la déclare, vérifié sur le réseau, avec
       tools/plex-census.mjs qui découvre les pages au lieu de les lister. */
    'bundle-manifest-test.mjs',
    'font-coverage-test.mjs',
    'font-face-census-test.mjs',
    'app-release-test.mjs',
    /* Coquille Android (Compose, manifest, icône, plugins) : contrat statique,
       aucun JDK ne tourne ici. */
    'android-native-test.mjs',
    'biometric-unlock-test.mjs',
    'native-workspace-ux-test.mjs',
    'native-device-layout-test.mjs',
    'native-pass2-browser-test.mjs',
    /* « Consulter sans pointer » est en lecture seule, l'écran cuisine web suit la langue. */
    'team-browse-readonly-browser-test.mjs',
    'kds-language-fallback-browser-test.mjs',
    /* La caisse restaurant change de langue au comptoir : FR / EN / ع dans le rail. */
    'caisse-restaurant-lang-browser-test.mjs',
    'native-face-entry-test.mjs',
    /* Taille de texte système jusqu'à 200 % sur iPhone : le tableau de bord
       se réorganise (Accueil, Commandes, Clients, Réglages), la caisse garde 135 %. */
    'dynamic-type-200-browser-test.mjs',
    'native-premium-feel-test.mjs',
    'native-pass3-gates-test.mjs',
    'native-pass3-locale-test.mjs',
    'native-pass4-test.mjs',
    'native-pass5-test.mjs',
    'native-pass7-test.mjs',
    /* Haptiques (design 2027, §15) : le module KiwiHaptics, le plugin
       kiwi-haptics (mode stock = @capacitor/haptics), le plancher iOS 15.5,
       le balayage statique (ni navigator.vibrate ni générateur UIKit hors du
       plugin) et la copie des pages invité qui ne promet plus de vibration. */
    'haptics-test.js',
    'haptics-plugin-test.mjs',
    'haptics-scan-test.mjs',
    'guest-copy-test.js',
    'native-demo-ledger-test.mjs',
    'native-qa-six-fixes-test.mjs',
    'ticket151-browser-test.mjs',
    /* Menu page shell : sections en rail (pilules sous 900 px), plats en lignes
       prix · disponibilité · options, barre recherche + ajout collante, onglet
       et section qui tiennent après une modification et un tick. 390 et 1280. */
    'menu-shell-browser-test.mjs',
    'menu-formula-keyboard-browser-test.mjs',
    'catalog-workspace-test.mjs',
    'native-store-readiness-test.mjs',
    'native-host-bridge-test.mjs',
    'native-audit-fixes-test.mjs',
    /* « Delete my account » n'a rien à faire dans le menu du caissier : seul le tiroir du patron le garde. */
    'native-account-scope-test.mjs',
    'account-deletion-test.mjs',
    'account-deletion-ui-test.mjs',
    'push-registration-test.mjs',
    'morning-push-test.mjs',
    'security-regression-test.js',
    'kiwi-agent-access-test.mjs',
    'agent-mcp-remote-test.mjs',
    'kiwi-ui-qa-mcp-test.mjs',
    'sold-insights-test.js',
    'sold-insights-layout-test.mjs',
    'table-refresh-test.js',
    'table-transfer-merge-test.mjs',
    'kitchen-void-protocol-test.mjs',
    'multi-device-collision-test.mjs',
    'kitchen-modifiers-and-seating-test.mjs',
    'amira-integration-test.mjs',
    'security-and-channel-hardening-test.mjs',
    'employee-loyalty-bound-test.mjs',
    'waiter-queue-privacy-test.mjs',
    'password-policy-test.mjs',
    'plan-tier-test.mjs',
    'plan-catalog-test.mjs',
    'signup-plan-test.mjs',
    'starter-copy-test.mjs',
    'error-reporter-test.mjs',
    'tickets-retest-test.mjs',
    'tickets-taxonomy-test.mjs',
    'tickets-i18n-test.mjs',
    'tickets-storage-purge-test.mjs',
    'error-redaction-test.mjs',
    'supplier-actions-test.mjs',
    'print-paper-test.mjs',
    'invoicing-print-test.mjs',
    'invoicing-pdf-pages-browser-test.mjs',
    'invoicing-v2-browser-test.mjs',
    'invoicing-v2-real-server-browser-test.mjs',
    'day-report-print-format-test.mjs',
    'retail-tender-methods-test.mjs',
    'sale-tip-d1-test.mjs',
    'retail-tender-browser-test.mjs',
    'retail-acompte-api-test.mjs',
    'retail-acompte-browser-test.mjs',
    'z-refund-total-coherence-test.mjs',
    'caisse-boot-restore-guard-test.mjs',
    'close-register-durability-test.mjs',
    'kitchen-ticket-wrap-test.mjs',
    'escpos-arabic-browser-test.mjs',
    'escpos-unsupported-test.mjs',
    'settled-table-reopen-test.mjs',
    'order-line-cap-test.mjs',
    'kitchen-reprint-test.mjs',
    'kitchen-blind-outage-test.mjs',
    'relay-print-verdict-test.mjs',
    'station-printer-routing-test.mjs',
    'printer-station-unicode-test.mjs',
    'printer-split-test.mjs',
    'printer-transports-split-test.mjs',
    'print-socket-test.mjs',
    /* l'iPad n'a ni pont local ni WebUSB : la caisse dépose le ticket sur
       /api/print/jobs et le pont du comptoir vient le chercher. */
    'print-relay-test.mjs',
    'bridge-rust-parity-test.mjs',
    'android-print-bridge-test.mjs',
    'printer-page-test.mjs',
    /* beaucoup de comptoirs tournent encore sur Windows 7 : le binaire du pont
       et ses appels PowerShell doivent y démarrer. */
    'bridge-win7-test.mjs',
    'agent-voice-test.mjs',
    'agent-vision-test.mjs',
    'wave-o-truth-test.mjs',
    'briefing-test.mjs',
    'wave-q-scope-test.mjs',
    'wave-r-errother-test.mjs',
    'briefing-tenant-test.mjs',
    'register-phone-tickets-test.mjs',
    'order-queue-tenant-test.mjs',
    'clients-sync-tenant-test.mjs',
    'clients-split-test.mjs',
    'clients-book-contrast-test.mjs',
    'card-confirm-center-test.mjs',
    'scan-view-test.mjs',
    'till-scroll-test.mjs',
    'caisse-chip-gate-test.mjs',
    'kpi-same-slice-test.mjs',
    'date-range-calendar-truth-test.mjs',
    'date-range-selector-truth-test.mjs',
    'dashboard-currency-ar-test.mjs',
    'sidebar-language-test.mjs',
    /* Le français resté à l'écran sous l'anglais et l'arabe : chaque page de la
       démo ouverte d'un vrai clic, compté contre tools/french-leak-baseline.json. */
    'french-leak-browser-test.mjs',
    /* Le fil d'Ariane des pages Kiwi.appPage() : « Home » / « الرئيسية », et
       un changement de langue page ouverte garde le titre de la page. */
    'genpage-breadcrumb-language-test.mjs',
    /* Le lien de vue : la page et la période dans l'adresse, rouvertes dans un
       navigateur neuf et à travers la connexion, jamais un chiffre dedans. */
    'view-link-browser-test.mjs',
    'demo-morning-band-test.mjs',
    /* Santé Kiwi : la route sur une vraie base (chiffres, « non mesuré » hors
       score, module coupé, propriétaire seul, aucun code), puis la carte dans
       le vrai dashboard.html en FR, EN et AR, clair et sombre, téléphone. */
    'merchant-health-test.mjs',
    'merchant-health-browser-test.mjs',
    /* Charges fixes : l'éditeur et la page Marges réelle, en vrais clics.
       Saisie, erreur au champ, résultat net égal au calcul, retrait au mois
       prochain, arabe de droite à gauche, téléphone sans débordement. */
    'charges-browser-test.mjs',
    /* Premier passage : avec le vrai service worker, le tableau de bord, la
       caisse et Serveur ne se chargent qu'une fois (clients.claim() n'est pas
       une mise à jour) ; une vraie nouvelle génération se recharge toujours en
       silence sur une page jeune, ou montre la pastille après un geste. */
    'pwa-first-install-browser-test.mjs',
    /* Le vrai pavé du dashboard : migration du clair, preuve en ligne, ouverture
       hors ligne par la ligne salée, « non » du serveur final. */
    'dashboard-pin-vault-browser-test.mjs',
    /* Face ID sur le verrou natif : confirmation en ligne, refus qui retire
       l'enregistrement, repli hors ligne sur sept jours, révocation par le coffre. */
    'native-face-entry-test.mjs',
    'team-codes-browser-test.mjs',
    /* Le banc des suites navigateur (tools/browser-trace.mjs) : trace.md à
       l'échec, exit 3 quand c'est la machine, secrets jamais imprimés,
       captures comparées à leur référence. */
    'browser-trace-test.mjs',
    /* Design 2027, étape 1 · le livre unique, en mode ombre (assets/kit/ledger.js,
       adopté par rien) : mêmes valeurs que la journée du serveur pour chaque clé,
       sur les stores à cutoff 5, 3 et 0, sans ligne de cutoff, à cutoff changé,
       à la minute-frontière et au changement d'heure du Ramadan ; huit surfaces,
       un seul chiffre ; jamais sur un vrai commerçant. */
    'ledger-agreement-test.mjs',
    /* L'exemple travaillé (tools/fixtures/worked-example.json) : ses chiffres
       sont ceux du §18.0, ses sources s'accordent entre elles, sa table de
       mutations rougit, et l'aperçu embarque le même fichier à l'octet près. */
    'fixture-agreement-test.mjs',
    /* La démo est semée par magasin et journée d'activité, jamais par hasard :
       ni Math.random, ni horloge, ni quatre derniers chiffres inventés. */
    'no-random-demo-test.js',
    /* Promotions de la carte : la règle (assets/menu-promos.js), le serveur
       qui l'applique dans priceOrder, puis la caisse, Serveur et l'onglet
       « Promotions » du tableau de bord, en vrais clics sur la démo. */
    'promo-rules-properties-test.mjs', 'wave-p-money-test.mjs',
    'menu-promos-test.mjs',
    'menu-promos-server-test.mjs',
    'menu-promos-browser-test.mjs',
    'menu-promos-properties-test.mjs',
    'caisse-pay-subtitle-test.mjs',
    /* Le fil d'Ariane du tableau de bord : une seule peinture (Kiwi.breadcrumb),
       « Home » / « الرئيسية » sur chaque page, et un changement de langue page
       ouverte garde le titre de la page ; le retour à l'accueil rend le nœud à
       dash.breadcrumb. Vrai dashboard.html, vrais clics. */
    'dashboard-breadcrumb-language-test.mjs',
    'dashboard-truth-test.mjs',
    'team-truth-test.mjs',
    'team-member-editor-test.mjs',
    'team-editor-keyboard-browser-test.mjs',
    'menu-option-group-editor-test.mjs',
    'legacy-venue-modals-test.mjs',
    'pin-lockout-truth-test.mjs',
    'boutique-product-form-test.mjs',
    'stock-movement-modal-test.mjs',
    'stock-item-form-test.mjs',
    'boutique-product-sheet-test.mjs',
    'boutique-inventory-i18n-test.mjs',
    'color-palette-language-test.mjs',
    /* Historique des inventaires, revue propriétaire, journal des pertes et
       leurs CSV : lus en FR, EN et AR ; les valeurs stockées restent FR. */
    'stock-count-history-language-test.mjs',
    'caisse-color-picker-language-test.mjs',
    'booking-truth-test.mjs',
    'booking-lens-browser-test.mjs',
    'onboarding-truth-test.mjs',
    'onboarding-data-test.mjs',
    'onboarding-split-test.mjs',
    'onboarding-session-test.mjs',
    'onboarding-alignment-properties-test.mjs',
    'onboarding-team-recap-test.mjs',
    'onboarding-business-type-test.mjs',
    'menu-truth-test.mjs',
    'stock-truth-test.mjs',
    'kiwi-select-programmatic-test.mjs',
    'sheet-opacity-test.mjs',
    'module-gate-test.mjs',
    'terminaux-truth-test.mjs',
    'till-truth-test.mjs',
    /* « Carte » sans lecteur : le caissier confirme, aucun minuteur n'écrit la vente. */
    'card-confirm-test.mjs',
    /* Aucun fond d'ouverture présélectionné, démo comprise : le bouton reste éteint jusqu'au choix. */
    'clockin-float-test.mjs',
    /* La caisse « autre activité » vend dès le premier jour : montant libre, paiement, langues. */
    'pos-autre-custom-amount-test.mjs',
    'pos-truth-b-test.mjs',
    'order-truth-test.mjs',
    'order-hours-server-test.mjs',
    'guest-options-test.mjs',
    'pos-truth-a-test.mjs',
    'employee-truth-test.mjs',
    'team-codes-at-rest-test.mjs',
    /* Audit 2026-10-15 · fuites entre magasins et comptes, HTML venu des caisses */
    'sale-label-xss-test.mjs',
    'team-roster-purge-test.mjs',
    'tenant-purge-sales-test.mjs',
    'merchant-config-stale-test.mjs',
    'live-link-merchant-identity-test.mjs',
    'account-scope-test.mjs',
    'floorplan-lww-test.mjs',
    'serveur-kitchen-truth-test.mjs',
    'kds-data-states-test.mjs',
    'serveur-data-states-test.mjs',
    'retail-truth-test.mjs',
    'hotel-truth-test.mjs',
    /* L'hôtel d'un vrai marchand se lit en anglais et en arabe : aucun
       français visible, montants isolés, la page ouverte suit la langue. */
    'hotel-i18n-test.mjs',
    'pressing-truth-test.mjs',
    'support-triage-test.mjs',
    'support-triage-retry-test.mjs',
    'wave-n-server-test.mjs',
    'menu-analysis-test.mjs',
    'ai-vision-models-test.mjs',
    'menu-ledger-test.mjs',
    'food-trades-truth-test.mjs',
    'service-trades-truth-test.mjs',
    'specialty-retail-truth-test.mjs',
    'menu-sales-test.mjs',
    'foodcost-api-test.mjs',
    'simple-food-cost-test.mjs',
    'wave-r-errdash-test.mjs',
    'menu-insights-test.mjs',
    'restaurant-recipe-layout-test.mjs',
    'restaurant-item-editor-test.mjs',
    'stock-alert-truth-test.mjs',
    'caisse-frozen-cost-test.mjs',
    'lock-caisse-link-test.mjs',
    'lock-greeting-truth-test.mjs',
    'check-guard-test.mjs',
    'check-verdict-test.mjs',
    'wave-l-style-test.mjs',
    'pass-cache-test.mjs',
    /* Direction 2027, étape 1 · mouvement, mise en page, segmentation.
       motion.js (§14) : jetons, ressort de geste (1400 / 74,8 / 1/120 s et le
       tableau des temps de pose), seuils de geste, puis dans un vrai Chromium
       (transform et opacity seulement, départ depuis la valeur présentée,
       reduced motion, ressort, reprise d'une animation). motion-lint : aucune
       transition hors transform, opacité et les trois exceptions, sur assets/kit.
       layout.js (§13) : la règle de largeur de la caisse et son bloc d'en-tête de
       six lignes. segment.js : une seule segmentation client. target-audit :
       l'audit de zone de toucher (§10.6), prouvé sur le segmenté du cahier. */
    'motion-test.mjs',
    'motion-browser-test.mjs',
    'motion-lint-test.mjs',
    'layout-test.mjs',
    'segment-test.mjs',
    'target-audit-test.mjs',
    'check-parallel-test.mjs',
    'day-report-inset-test.mjs',
    'menu-phone-test.mjs',
    'caisse-client-sale-test.mjs',
    'customer-retention-test.mjs',
    'landing-demo-funnel-test.mjs',
    'demo-request-api-test.mjs',
    'app-audit-sweep-test.mjs',
    'briefing-sales-drop-test.mjs',
    'briefing-low-stock-test.mjs',
    'briefing-margin-test.mjs',
    'briefing-planning-test.mjs',
    'briefing-cancellations-test.mjs',
    'briefing-discounts-test.mjs',
    'briefing-cash-sessions-test.mjs',
    'briefing-late-orders-test.mjs',
    'weather-test.mjs',
    'briefing-card-placement-test.mjs',
    'dark-fixes-gradient-test.mjs',
    /* Démarrage en sombre : la passe de contraste lit puis écrit, un second
       regard par image, et les compteurs animés gardent leurs éléments. */
    'dark-fixes-batch-test.mjs',
    'dark-startup-browser-test.mjs',
    'rev-chart-daily-browser-test.mjs',
    'venue-type-refocus-browser-test.mjs',
    'action-center-loop-test.mjs',
    'err-reporter-silence-test.mjs',
    'depenses-demo-gate-test.mjs',
    'invoice-receipt-test.mjs',
    'receipt-logo-print-test.mjs',
    'receipt-voucher-print-test.mjs',
    'formula-receipt-pricing-test.mjs',
    'sale-invoice-test.mjs',
    'sale-invoice-cache-key-test.mjs',
    /* Facturation v2 : le serveur (numéros, totaux, verrou, avoirs, accès). */
    'invoices-v2-test.mjs',
    'net-wave-p-test.mjs',
    'fetch-deadline-test.mjs',
    'invoices-split-test.mjs',
    'invoicing-split-test.mjs',
    'order-queue-split-test.mjs',
    /* L'ICE se vérifie (15 chiffres, multiple de 97) au champ du formulaire
       Établissement, au vrai clic, et côté serveur pour les factures. */
    'ice-browser-test.mjs',
    'ai-routes-test.mjs',
    'inventory-count-test.mjs',
    'inventory-count-review-test.mjs',
    'ai-image-import-test.mjs',
    'menu-scan-test.mjs',
    'menu-scan-i18n-test.mjs',
    'printer-i18n-test.mjs',
    'menu-import-preserve-test.mjs',
    'modal-desc-escape-test.mjs',
    'intake-slice1-test.mjs',
    'intake-posting-test.mjs',
    'intake-conflict-test.mjs',
    'intake-archive-test.mjs',
    'intake-storage-fault-test.mjs',
    'media-owner-test.mjs',
    'admin-delete-r2-test.mjs',
    'admin-api-owner-test.mjs',
    'legacy-scan-test.mjs',
    'menu-translate-test.mjs',
    /* La carte dans la langue de chacun : traductions portées par les
       entités, jamais à la place du libellé du patron ; résolues par toutes
       les surfaces, tickets canoniques. */
    'menu-i18n-test.mjs',
    'order-langs-test.mjs',
    'salle-scan-test.mjs',
    'network-recovery-test.mjs',
    /* Le plan de salle du patron lit la salle que la caisse publie : statut,
       couverts, addition ouverte, demandes, tours du jour. Lecture seule. */
    'floor-live-test.mjs',
    'pin-dashboard-test.mjs',
    /* La porte du dashboard ne garde aucun code en clair (kiwiPins retiré) et n'en
       compare aucun : le serveur juge d'abord, une ligne salée prouvée en ligne
       sert seulement quand il n'a pas pu répondre. Balayage + coffre + ordre des
       juges ; le pavé réel, hors ligne, suit dans la suite navigateur. */
    'dashboard-pin-vault-test.mjs',
    'idle-lock-test.mjs',
    /* 2026-10-12 · on disk, named nowhere, so guarding nothing. Five were red
     * for reasons in the test alone (Playwright never installed, pins the code
     * outgrew, a fake document without classList); all are repaired. */
    'caisse-dna-test.js',
    'caisse-floor-gap-test.mjs',
    'caisse-link-success-test.js',
    'caisse-order-panel-space-test.mjs',
    'caisse-takeaway-ledger-dedup-test.mjs',
    'caisse-theme-contrast-test.mjs',
    'cash-move-custom-reason-test.mjs',
    'clients-pending-write-test.mjs', 'loyalty-confirmation-test.mjs',
    'store-pending-setup-test.mjs',
    'till-device-revoke-test.mjs',
    /* Espace comptable : lecture seule d'UN magasin pour son expert-comptable ;
       le cookie kiwi_acct n'ouvre rien d'autre, la porte du site n'ouvre que 3 entrées. */
    'accountant-portal-test.mjs',
    'critical-flow-test.mjs',
    'dashboard-kds-nav-test.mjs',
    'dashboard-notification-isolation-test.js',
    'day-report-menu-group-test.mjs',
    'employee-language-test.js',
    /* L'app serveur en anglais et en arabe : chaque texte du balisage et les
       phrases composées au rendu se traduisent, attributs compris. */
    'serveur-lang-coverage-test.mjs',
    'field-split-ui-test.mjs',
    'hospitality-plus-test.mjs',
    'maison-return-ledger-test.mjs',
    'menu-ordering-surfaces-test.js',
    'morocco-holidays-test.mjs',
    'pos-mobile-test.mjs',
    'pressing-edge-test.mjs',
    'procurement-test.mjs',
    'promotions-dashboard-test.mjs',
    'promo-window-browser-test.mjs',
    /* 2026-10-19 · la caisse boutique démo au téléphone : fiche, inventaire,
       Vendus après une vente encaissée au toucher. */
    'boutique-phone-browser-test.mjs',
    /* 2026-10-19 · chaque caisse sur un iPad tactile : − / + du ticket à
       32 px dans les treize métiers, champ code-barres de l'épicerie lisible. */
    'ipad-touch-browser-test.mjs',
    /* 2026-10-19 · livraisons à encaisser : le livreur rapporte l'argent au
       comptoir, encaissé une fois, compté le jour où il est reçu. */
    'delivery-collect-browser-test.mjs',
    /* 2026-10-19 · le grand livre de la synchro : ventes réelles sur une caisse
       restaurant et une caisse boutique (espèces, carte, partage, remboursement,
       annulation, hors ligne, la bascule de 05:00), et le tableau de bord qui
       doit dire les mêmes centimes, sans rien d'un autre commerçant. */
    'sync-ledger-browser-test.mjs',
    /* 2026-10-20 · sa moitié boutique, séparée pour tenir sous les cinq
       minutes par suite. */
    'sync-ledger-boutique-browser-test.mjs',
    /* 2026-10-22 · les douze caisses métier jamais servies à un vrai commerce :
       inscription, assistant, catalogue au centime, caisse appairée, ventes au
       toucher (espèces, carte), puis D1, l'Accueil et les Transactions. En trois
       tiers (bouche, commerce de détail, soins) pour tenir sous cinq minutes. */
    'trades-ledger-browser-test.mjs',
    'trades-ledger-retail-browser-test.mjs',
    'trades-ledger-care-browser-test.mjs',
    'restaurant-recipes-test.js',
    'wave-p-limits-test.mjs',
    'tickets-draft-test.mjs',
    'recipe-refund-feed-test.mjs',
    'retail-scan-test.mjs',
    'retail-stock-source-test.mjs',
    'service-requests-ui-test.mjs',
    'subscription-privacy-test.mjs',
    'takeout-confirmation-test.js',
    'trade-workspaces-test.js',
    'vertical-state-test.mjs',
    'credit-book-refund-browser-test.mjs',
    'credit-book-refund-ui-test.mjs', 'credit-book-test.mjs',
    'credit-book-dashboard-browser-test.mjs',
    'receivables-test.mjs',
    'vexel-insights-card-dna-test.mjs',
  ];
  suites.forEach((name) => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', name)], { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    /* « not run » n'est pas « passed » : une suite qui n'a rien pu exécuter (pas
       de simulateur iOS, par exemple) le dit sur une ligne `○ ... not run: <raison>`,
       et le gate l'affiche comme tel, sans la compter verte. */
    const notRun = r.status === 0 && out.split('\n').find((l) => /^○ .* not run/.test(l));
    if (notRun) warn(name + ' ' + notRun.replace(/^○\s*/, '').replace(/ \(not counted as passed\)$/, ''));
    else if (r.status === 0) ok(name + ' green');
    else {
      const lines = out.split('\n').filter((l) => /[✗·]|AssertionError|TimeoutError|Error:|ERR_ASSERTION|actual:|expected:/.test(l)).slice(-8);
      if (lines.length) lines.forEach((l) => fail(name + ' — ' + l.trim()));
      else fail(`${name} exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
    }
  });
}

/* ── 13a · l'argent et l'accessibilité, sur des milliers de cas ──────────
 * money-properties-test.mjs tire au hasard prix, remises, paiements et avoirs
 * (fast-check) contre le vrai code de la caisse boutique et le vrai registre
 * des avoirs ; ses défauts connus s'affichent sans bloquer, et la suite dit
 * quand l'un d'eux tient. a11y-browser-test.mjs passe axe-core sur l'accueil,
 * le tableau de bord, l'assistant et la caisse, et refuse toute violation
 * sérieuse au-delà de tools/a11y-baseline.json. Sans les dépendances de
 * développement de app/ (npm --prefix app ci), chacune se déclare SKIPPÉE. */
section('Money properties (tools/money-properties-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'money-properties-test.mjs')], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0 && out.includes('○ skip')) warn('money properties skipped (fast-check missing, npm --prefix app ci)');
  else if (r.status === 0) {
    ok(`money properties green (${(out.match(/✓/g) || []).length} properties)`);
    out.split('\n').filter((line) => /^\s*[◦!] known/.test(line)).forEach((line) => warn(line.trim()));
  } else {
    out.split('\n').filter((line) => line.includes('✗')).forEach((line) => fail(line.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`money-properties-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}
/* A test file the gate does not name guards nothing (the stock and hotel split
 * proofs sat unwired for a day and broke unseen). Every tools/*test* file must be
 * named in this file, or listed here with the reason it cannot run offline. */
const OFFLINE_TESTS = {
  'seo-live-test.mjs': 'reads the live site over the network',
  'supabase-tenancy-test.mjs': 'needs a Supabase project configured',
};
section('Every test file is wired');
{
  const offline = OFFLINE_TESTS;
  const self = fs.readFileSync(__filename, 'utf8');
  const unwired = fs.readdirSync(path.join(ROOT, 'tools'))
    .filter((f) => /test\.(?:m?js|cjs)$/.test(f) && !offline[f])
    .filter((f) => !self.includes("'" + f + "'") && !self.includes('"' + f + '"') && !self.includes('`' + f + '`') && !self.includes('/' + f));
  if (unwired.length) unwired.forEach((f) => fail(`tools/${f} is not named in tools/check.js: wire it or list it as offline-only`));
  else ok('every tools/*test* file is named by the gate (' + Object.keys(offline).length + ' network-only exceptions)');
  /* Discovery only looks in tools/: a test written anywhere else (functions/,
     app/, a tools/ subfolder) would never be found, so it is refused. */
  let elsewhere = [];
  try {
    elsewhere = require('child_process').execSync('git -c core.quotepath=false ls-files --cached --others --exclude-standard', { cwd: ROOT, encoding: 'utf8' })
      .split('\n').map((l) => l.trim()).filter(Boolean)
      .filter((f) => /(?:^|[-_.])(?:test|spec)\.(?:m?js|cjs|ts)$/.test(path.basename(f)) && !/^tools\/[^/]+$/.test(f) && !/(^|\/)node_modules\//.test(f));
  } catch (_) { elsewhere = []; }
  if (elsewhere.length) elsewhere.forEach((f) => fail(`${f} is a test outside tools/: move it to tools/ so the gate finds and runs it`));
  else ok('no test file outside tools/');
}

section('Coverage probe (tools/coverage-probe-test.mjs)');
{
  const r = require('child_process').spawnSync(process.execPath, [path.join(ROOT, 'tools', 'coverage-probe-test.mjs')], { encoding: 'utf8' });
  if (r.status !== 0) fail('coverage-probe-test: ' + ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-4).join(' | '));
  else ok('a coverage cell counts when its annotation is reached, not when it is written');
}

section('Coverage manifest (tools/coverage-manifest-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'coverage-manifest-test.mjs')], { encoding: 'utf8' });
  const todo = (r.stdout || '').split('\n').filter((l) => /^\s*TODO /.test(l)).length;
  if (r.stdout) console.log(r.stdout.split('\n').filter((l) => /^(Coverage:|✓|✗)/.test(l.trim())).map((l) => '  ' + l.trim()).join('\n'));
  if (todo) console.log(`  … ${todo} uncovered cells listed by node tools/coverage-manifest-test.mjs`);
  if (r.status === 0) ok('coverage manifest green');
  else fail('coverage manifest failed: ' + (r.stderr || '').trim());
}

section('Accessibility, axe-core (tools/a11y-browser-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'a11y-browser-test.mjs')], { encoding: 'utf8', timeout: 420000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0 && out.includes('○ skip')) warn('a11y suite skipped (no Chromium or axe-core, browser assertions not executed)');
  else if (r.status === 0) {
    ok(`a11y green (${(out.match(/✓/g) || []).length} surfaces, no new serious violation)`);
    out.split('\n').filter((line) => /^\s*! /.test(line)).forEach((line) => warn(line.trim()));
  } else {
    out.split('\n').filter((line) => line.includes('✗')).forEach((line) => fail(line.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`a11y-browser-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

section('Surface matrix (tools/surface-matrix-browser-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'surface-matrix-browser-test.mjs')], { encoding: 'utf8', timeout: 420000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0 && out.includes('○ skip')) warn('surface matrix skipped, browser assertions not executed');
  else if (r.status === 0) ok('surface matrix green');
  else fail(`surface-matrix-browser-test.mjs exited ${r.status}: ${out.trim()}`);
}

/* The dashboard destinations, the tills and the session-free apps at each
 * screen size, FR/EN/AR: one file per size so the pool runs them side by side. */
for (const file of ['surface-matrix-dash-desktop-browser-test.mjs', 'surface-matrix-dash-tablet-browser-test.mjs', 'surface-matrix-dash-phone-browser-test.mjs',
  'surface-matrix-till-desktop-browser-test.mjs', 'surface-matrix-till-tablet-browser-test.mjs', 'surface-matrix-till-phone-browser-test.mjs',
  'surface-matrix-apps-browser-test.mjs', 'keyboard-floor-booking-browser-test.mjs',
  'surface-matrix-states-boutique-browser-test.mjs', 'surface-matrix-states-credit-browser-test.mjs', 'surface-matrix-states-credit-real-browser-test.mjs', 'surface-matrix-states-ops-browser-test.mjs', 'surface-matrix-states-real-browser-test.mjs', 'analysis-calculator-browser-test.mjs',
  'surface-matrix-states-booking-floor-browser-test.mjs', 'surface-matrix-states-intake-browser-test.mjs', 'surface-matrix-states-pressing-browser-test.mjs',
  'surface-matrix-states-loyalty-till-browser-test.mjs', 'surface-matrix-states-agent-doc-browser-test.mjs',
  'surface-matrix-states-promos-catalogue-browser-test.mjs', 'surface-matrix-states-shopify-browser-test.mjs', 'surface-matrix-states-economat-browser-test.mjs',
  'surface-matrix-states-console-browser-test.mjs']) {
  section(`Surface matrix (tools/${file})`);
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', file)], { encoding: 'utf8', timeout: 420000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0 && out.includes('○ skip')) warn(`${file} skipped, browser assertions not executed`);
  else if (r.status === 0) ok(`${file} green`);
  else fail(`${file} exited ${r.status}: ${out.trim().split('\n').filter((l) => l.includes('✗')).slice(0, 12).join(' | ') || out.trim().slice(-600)}`);
}

/* ── 13b · coquille native, pilotée pour de vrai ──────────────────────────
 * app-bundle-test.mjs prouve le paquet ; celui-ci conduit la coquille dans un
 * vrai Chromium : boot borné, parcours guidé, appairage, imprimante, locales,
 * cibles tactiles, débordements, reduced motion. Sans Chromium ni
 * puppeteer-core la suite se déclare SKIPPÉE (vert explicite) plutôt que de
 * mentir : un navigateur absent est un trou d'environnement, pas une
 * régression produit. */
section('Native setup shell interaction (tools/app-interaction-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'app-interaction-test.mjs')], { encoding: 'utf8', timeout: 420000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0 && out.includes('○ skip')) warn('app interaction suite skipped (no Chromium — browser assertions not executed)');
  else if (r.status === 0) ok(`app interaction green (${(out.match(/✓/g) || []).length} controls)`);
  else {
    out.split('\n').filter((line) => line.includes('✗')).forEach((line) => fail(line.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`app-interaction-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* iPhone owner home and till, rendered: header over the status bar, revenue
 * first, native owner tabs, list rows, a phone-width chart, the bill pill.
 * Skips green without Chromium, like the setup-shell suite above. */
section('Native owner home and till on a phone (tools/native-owner-home-browser-test.mjs)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'native-owner-home-browser-test.mjs')], { encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0 && out.includes('○ skip')) warn('native owner home suite skipped (no Chromium — browser assertions not executed)');
  else if (r.status === 0) ok(`native owner home green (${(out.match(/✓/g) || []).length} controls)`);
  else {
    out.split('\n').filter((line) => line.includes('✗')).forEach((line) => fail(line.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`native-owner-home-browser-test.mjs exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── 14 · text contrast tokens ────────────────────────────────────────────
 * Low-contrast neutrals are valid borders and decoration, never body copy.
 * Keep the semantic distinction enforceable after the rendered theme audit. */
section('Text contrast (tools/text-contrast-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'text-contrast-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) ok('operational labels use readable neutrals');
  else {
    const lines = out.split('\n').filter((l) => l.includes('·'));
    if (lines.length) lines.forEach((l) => fail(l.trim()));
    else fail(`text-contrast-test.js exited ${r.status} — ${out.trim()}`);
  }
}

/* ── 14b · Kiwi 2027, étape 1 : les jetons ──────────────────────────────────
 * assets/kit/tokens-2027.css (docs/specs/kiwi-design-2027.md §5 à §7, §14, §20.7).
 * Rien ne le charge encore : ces gardes sont les seules à le tenir.
 *   token-contrast-test      palette §5.1/§5.2, contraste §5.3 recalculé, thème, cohabitation
 *   type-steps-lint          six pas de type, jamais un de plus (§6.2)
 *   kit-lint                 les règles du kit qui existent dès l'étape 1
 *   tokens-2027-browser-test la cascade du thème, du contraste accru et des pas, dans Chromium */
section('Kiwi 2027 · jetons (token-contrast-test, type-steps-lint, kit-lint, cascade)');
{
  const { spawnSync } = require('child_process');
  const gates = [
    ['token-contrast-test.js', 'token-contrast-test'],
    ['type-steps-lint.js', 'type-steps-lint'],
    ['kit-lint.js', 'kit-lint'],
    ['tokens-2027-browser-test.mjs', 'cascade des jetons 2027'],
  ];
  for (const [file, label] of gates) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', file)], { encoding: 'utf8', timeout: 300000 });
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status === 0 && out.includes('○ skip')) warn(`${label} sauté (pas de Chromium : les assertions du navigateur n'ont pas tourné)`);
    else if (r.status === 0) {
      const line = (out.split('\n').find((l) => l.startsWith('✓')) || out.split('\n').filter(Boolean).pop() || 'vert').replace(/^✓\s*/, '').trim();
      ok(line.startsWith(label) ? line : label + ' · ' + line);
    }
    else {
      const lines = out.split('\n').filter((l) => /[✗·]/.test(l)).slice(0, 12);
      if (lines.length) lines.forEach((l) => fail(label + ' · ' + l.replace(/^\s*[✗·]\s*/, '').trim()));
      else fail(`${file} exited ${r.status} · ${out.trim().split('\n').slice(-3).join(' | ')}`);
    }
  }
}

/* ── 14c · Kiwi 2027, étape 2 : le kit ────────────────────────────────────
 * Les composants de §10 et les modules de contrôle de §20.6, la galerie
 * kit.html, que rien d'autre n'adopte encore (§21.1). kit-lint (plus haut)
 * porte aussi les règles K9 à K13 de l'étape 2.
 *   kit-size-test             §19 : cœur JS ≤ 35 KB, sprite par surface ≤ 25 KB
 *   kit-gallery-browser-test  la galerie : clair/sombre × EN/AR × 390/1280, sans
 *                             erreur ni débordement, et ses captures de référence
 *   kit-in-host-browser-test  un élément du kit se peint pareil dans une page
 *                             hostile, dans les deux thèmes (§20.2, §20.7)
 *   haptics-map-browser-test  la carte de §15, contrôle par contrôle
 *   motion-park-browser-test  mouvement réduit : tout s'arrête sur une vraie image (§14.5)
 *   kpi-polarity-browser-test la couleur d'un écart suit la polarité du KPI (§10.21)
 *   kit-bidi-browser-test     en arabe, chaque chiffre se peint dans le bon sens (§6.3, §9.6)
 *   kit-budget-browser-test   recensement des racines (§20.6), CSS des racines ≤ 18 KB,
 *                             et le menu de 200 tuiles en proxy Chromium (l'iPhone 6s
 *                             sous iOS 15.8 reste à mesurer par le banc de capture) */
section('Kiwi 2027 · kit (taille, galerie, hôte, haptique, mouvement, polarité, bidi, budget)');
{
  const { spawnSync } = require('child_process');
  const gates = [
    ['kit-size-test.js', 'kit-size-test'],
    ['kit-gallery-browser-test.mjs', 'kit-gallery-browser-test'],
    ['kit-in-host-browser-test.mjs', 'kit-in-host-browser-test'],
    ['haptics-map-browser-test.mjs', 'haptics-map-browser-test'],
    ['motion-park-browser-test.mjs', 'motion-park-browser-test'],
    ['kpi-polarity-browser-test.mjs', 'kpi-polarity-browser-test'],
    ['kit-bidi-browser-test.mjs', 'kit-bidi-browser-test'],
    ['kit-budget-browser-test.mjs', 'kit-budget-browser-test'],
  ];
  for (const [file, label] of gates) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', file)], { encoding: 'utf8', timeout: 420000 });
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status === 0 && out.includes('○ skip')) warn(`${label} sauté (pas de Chromium : les assertions du navigateur n'ont pas tourné)`);
    else if (r.status === 0) {
      const line = (out.split('\n').filter((l) => l.startsWith('✓')).pop() || 'vert').replace(/^✓\s*/, '').trim();
      ok(line.startsWith(label) ? line : label + ' · ' + line);
    }
    else {
      const lines = out.split('\n').filter((l) => /✗/.test(l)).slice(0, 12);
      if (lines.length) lines.forEach((l) => fail(label + ' · ' + l.replace(/^\s*✗\s*/, '').trim()));
      else fail(`${file} exited ${r.status} · ${out.trim().split('\n').slice(-3).join(' | ')}`);
    }
  }
}

/* ── 14d · Kiwi 2027, étape 3a : le pavé de code et ce qui suit un code ─────
 * assets/kit/pin-flow.js décide, pour les huit usages de §10.2, ce que le
 * pavé montre après un code : la requête (8 s), la table des réponses, la
 * règle des nouvelles tentatives, les pauses, l'expiration d'un code de
 * pointage. Les portes, sur la vraie <k-pin-pad> :
 *   pin-flow-test                       la table des réponses et la règle des
 *                                       nouvelles tentatives, en Node, horloge factice
 *   pin-announce-browser-test           chaque refus de chaque usage écrit une fois
 *                                       dans sa région, répété sur une nouvelle frappe
 *   pin-focus-browser-test              le focus reste sur la touche (chargement,
 *                                       pause, connexion requise)
 *   clock-expiry-browser-test           pointage hors ligne : silence, puis
 *                                       clock.code_expired une fois à 5 minutes
 *   pair-redeem-timeout-browser-test    un code d'appairage sans réponse à 8 s n'est
 *                                       jamais renvoyé ; retapé, il « a peut-être servi »
 *   till-pin-browser-test               la caisse derrière kiwiSkin2027:till : le verrou,
 *                                       les deux niveaux d'autorisation, le vérificateur
 *                                       hors ligne (verdict et provenAt au journal), l'état
 *                                       « connexion requise » ; drapeau éteint, aucun
 *                                       fichier du kit chargé
 *   dash-pin-browser-test               le verrou du tableau de bord derrière
 *                                       kiwiSkin2027:dashboard : le serveur d'abord, son
 *                                       non est final, les lignes salées seulement sans
 *                                       réponse, session morte, pause, aucun code patron,
 *                                       démo ; drapeau éteint, aucun fichier du kit
 *   team-pin-browser-test               l'app équipe derrière kiwiSkin2027:team : la
 *                                       connexion en deux étapes (e-mail, puis pavé),
 *                                       le pointage d'arrivée et de départ à six
 *                                       chiffres ; drapeau éteint, aucun fichier du kit */
section('Kiwi 2027 · pavé de code (réponses, annonces, focus, pointage, appairage, caisse, tableau de bord, équipe)');
{
  const { spawnSync } = require('child_process');
  const gates = [
    ['pin-flow-test.mjs', 'pin-flow-test'],
    ['pin-announce-browser-test.mjs', 'pin-announce-browser-test'],
    ['pin-focus-browser-test.mjs', 'pin-focus-browser-test'],
    ['clock-expiry-browser-test.mjs', 'clock-expiry-browser-test'],
    ['pair-redeem-timeout-browser-test.mjs', 'pair-redeem-timeout-browser-test'],
    ['till-pin-browser-test.mjs', 'till-pin-browser-test'],
    ['dash-pin-browser-test.mjs', 'dash-pin-browser-test'],
    ['team-pin-browser-test.mjs', 'team-pin-browser-test'],
  ];
  for (const [file, label] of gates) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', file)], { encoding: 'utf8', timeout: 420000 });
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status === 0 && out.includes('○ skip')) warn(`${label} sauté (pas de Chromium : les assertions du navigateur n'ont pas tourné)`);
    else if (r.status === 0) {
      const line = (out.split('\n').filter((l) => /^(✓|pin-flow-test ·)/.test(l)).pop() || 'vert').replace(/^✓\s*/, '').trim();
      ok(line.startsWith(label) ? line : label + ' · ' + line);
    }
    else {
      const lines = out.split('\n').filter((l) => /✗/.test(l)).slice(0, 12);
      if (lines.length) lines.forEach((l) => fail(label + ' · ' + l.replace(/^\s*✗\s*/, '').trim()));
      else fail(`${file} exited ${r.status} · ${out.trim().split('\n').slice(-3).join(' | ')}`);
    }
  }
}

/* ── 14e · Kiwi 2027, étape 3b : la cuisine sur les couloirs du kit ─────────
 * assets/kit/kds-board.js met un <k-lane> dans chaque colonne de
 * kiwi-cuisine.html, derrière kiwiSkin2027:kds ; la page garde la file, les
 * postes, les gestes optimistes et leur file de reprise, le protocole
 * d'annulation. La porte :
 *   kds-board-browser-test              contre le VRAI functions/api/order/queue.js :
 *                                       drapeau éteint, aucun fichier du kit ; allumé,
 *                                       les tons, Commencer, Marquer prêt, Rappeler,
 *                                       Marquer servi, la base suit chaque geste ; le
 *                                       passage à 8 min sur le même nœud ; l'annulation
 *                                       de la caisse ; la carte « plus récentes » et sa
 *                                       feuille ; l'arabe */
section('Kiwi 2027 · cuisine sur les couloirs du kit');
{
  const { spawnSync } = require('child_process');
  const gates = [
    ['kds-board-browser-test.mjs', 'kds-board-browser-test'],
  ];
  for (const [file, label] of gates) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', file)], { encoding: 'utf8', timeout: 420000 });
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status === 0 && out.includes('○ skip')) warn(`${label} sauté (pas de Chromium : les assertions du navigateur n'ont pas tourné)`);
    else if (r.status === 0) {
      const line = (out.split('\n').filter((l) => /^✓/.test(l)).pop() || 'vert').replace(/^✓\s*/, '').trim();
      ok(line.startsWith(label) ? line : label + ' · ' + line);
    }
    else {
      const lines = out.split('\n').filter((l) => /✗/.test(l)).slice(0, 12);
      if (lines.length) lines.forEach((l) => fail(label + ' · ' + l.replace(/^\s*✗\s*/, '').trim()));
      else fail(`${file} exited ${r.status} · ${out.trim().split('\n').slice(-3).join(' | ')}`);
    }
  }
}

/* ── 14f · Kiwi 2027, étape 3c : une seule app de commande client ──────────
 * OrderPro.html reçoit ce que la page QR (kiwi-order.html) donnait au client,
 * avant que les QR imprimés y mènent (assets/orderpro-menu.js). La porte :
 *   orderpro-parity-browser-test        contre les VRAIS functions/api/menu.js et
 *                                       order/session.js : sans Order Pro, la carte à
 *                                       consulter et ses valeurs nutritionnelles ; cinq
 *                                       langues publiées, l'espagnol choisi sur la page
 *                                       QR gardé, l'arabe de droite à gauche ; fermé
 *                                       aujourd'hui, le bandeau et l'envoi éteint ; la
 *                                       démo ; la boutique dans son fichier ; le budget
 *                                       de script (60 KB gzip avant le premier écran) ;
 *                                       la peau 2027 (globe, volet panier 340 sur iPad,
 *                                       colonne 1000 au bureau, page de base)
 *   guest-redirect-test                 un QR imprimé (kiwi-order.html?merchant=) mène
 *                                       à /order avec sa table, par le serveur (302) et
 *                                       par la page ; sans commerce, la démo d'OrderPro ;
 *                                       les nouveaux QR impriment /order?s=&t=
 *   order-basic-test                    la page de base (§4.1) : la carte publique en
 *                                       liste, ordering.basic mot pour mot, sans script,
 *                                       publique, et seulement drapeau allumé
 *   orderpro-2027-polish-browser-test   les détails de la peau 2027 sur téléphone et iPad :
 *                                       chiffres sans mono, cibles de 44, noms au début
 *                                       en arabe, lignes du panier, toast, feuille
 *                                       d'options, écran de table, numéro à emporter */
section('Kiwi 2027 · une seule app de commande client');
{
  const { spawnSync } = require('child_process');
  const gates = [
    ['orderpro-parity-browser-test.mjs', 'orderpro-parity-browser-test'],
    ['guest-redirect-test.mjs', 'guest-redirect-test'],
    ['order-basic-test.mjs', 'order-basic-test'],
    ['orderpro-2027-polish-browser-test.mjs', 'orderpro-2027-polish-browser-test'],
  ];
  for (const [file, label] of gates) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', file)], { encoding: 'utf8', timeout: 420000 });
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status === 0 && out.includes('○ skip')) warn(`${label} sauté (pas de Chromium : les assertions du navigateur n'ont pas tourné)`);
    else if (r.status === 0) {
      const line = (out.split('\n').filter((l) => /^✓/.test(l)).pop() || 'vert').replace(/^✓\s*/, '').trim();
      ok(line.startsWith(label) ? line : label + ' · ' + line);
    }
    else {
      const lines = out.split('\n').filter((l) => /✗/.test(l)).slice(0, 12);
      if (lines.length) lines.forEach((l) => fail(label + ' · ' + l.replace(/^\s*✗\s*/, '').trim()));
      else fail(`${file} exited ${r.status} · ${out.trim().split('\n').slice(-3).join(' | ')}`);
    }
  }
}

/* ── 14g · Kiwi 2027, étape 4 : le cœur de la caisse ──────────────────────
 * assets/kit/till-frame.js met <k-menu-grid> et <k-bill> à la place de la
 * grille et du volet de l'addition de kiwi-caisse.html, derrière
 * kiwiSkin2027:till ; la caisse garde le panier, les commandes des tables,
 * l'envoi en cuisine et l'encaissement. La porte :
 *   till-frame-browser-test             caisse démo : drapeau éteint, aucun fichier
 *                                       du menu kit et la grille livrée ; allumé,
 *                                       une tuile par plat, l'addition vide, un plat
 *                                       ajouté au panier livré, le total de la caisse,
 *                                       le badge 2 sur la même tuile, le pas − jusqu'à
 *                                       l'addition vide ; l'encaissement dans le volet
 *                                       (pourboire 10 %, espèces, carte, autre = wallet,
 *                                       Retour), par finalizeTender
 *   pay-height-test                     les formes de hauteur (§18.3) : régulière à
 *                                       1032, compacte à 834, 820, 744, compacte courte
 *                                       à 560 (touches 56) ; clavier et bouton dans
 *                                       l'écran sans défiler ; à 500 la page défile
 *                                       d'un bloc, jamais une colonne
 *   components-sum-test                 chaque total montre ses parts (§2) : l'addition,
 *                                       la clé de paiement = base + pourboire, les parts
 *                                       d'une division au centime, l'attendu de caisse
 *                                       (pourboires espèces dedans, remboursements en
 *                                       sous-ligne), le pourboire hors du chiffre
 *   discount-reasons-test               les quatre motifs de remise : les puces et
 *                                       DISCOUNT_REASONS sont le même ensemble, chaque
 *                                       puce revient à son code, une vente par motif
 *                                       acceptée par le vrai /api/sale
 *   cash-count-browser-test             la clôture sur le kit (§18.9) : l'attendu est
 *                                       drawerExpected(), un motif hors tolérance, le
 *                                       total carte du terminal, puis closeRegister()
 *                                       livré avec gapReason dans l'événement
 *   attendance-code-current-test        un seul code de pointage par commerce (§10.34) :
 *                                       repris tant qu'il lui reste plus de 60 s, tiré
 *                                       à neuf sinon, un seul code pour deux caisses au
 *                                       même instant, generate le remplace toujours
 *   attendance-browser-test             la feuille du code sur le kit : current à
 *                                       l'ouverture, jamais generate ; renouvelé à
 *                                       expiresTs − 60 s du serveur ; toutes les 10 s ;
 *                                       Remplacer derrière une confirmation
 *   sale-unsynced-test                  une vente non envoyée (§10.26) : stockage plein,
 *                                       sync.not_synced et Envoyer maintenant par le même
 *                                       identifiant ; une table ; localStorage plein =
 *                                       sync.screen_only ; Live Link éteint, rien ; pas
 *                                       de commerce, sync.waiting_store
 *   banner-announce-test                ce qui s'annonce, et combien de fois : régions
 *                                       présentes avant le texte, une écriture par
 *                                       ligne, saved_again, rien sous le verrou (R7)
 *   online-inbox-test                   les commandes en ligne dans À emporter (§18.3) :
 *                                       ni pastille ni panneau, le badge du rail, Commit
 *                                       sur un ok en 600 ms, l'échec ne change rien,
 *                                       Refuser derrière l'approbation de la caisse
 *   opening-float-test                  le fond d'ouverture sur le kit (§18.9) : compté,
 *                                       rien de prérempli, le dernier fond à toucher,
 *                                       l'ouverture livrée, un Commit ; Paid à la
 *                                       clôture est dans cash-count-browser-test
 *   till-autre-frame-test               le métier « autre » sur le cadre partagé (§18.3) :
 *                                       rail, grille, addition simple, encaissement
 *                                       sans pourboire par KiwiPosSale.record
 *   till-phone-tabs-browser-test        la caisse sur téléphone (§10.20, §13.2) : à 390,
 *                                       la capsule d'onglets à la place du rail, chaque
 *                                       onglet mène à sa page par de vrais touchers, la
 *                                       barre de l'addition 8 au-dessus, l'encaissement
 *                                       dans la feuille, icônes seules quand les libellés
 *                                       ne tiennent pas (et la bulle), le point de
 *                                       synchronisation sur Plus, l'arabe en miroir ; à
 *                                       1180 rien ne change */
section('Kiwi 2027 · le cœur de la caisse sur le kit');
{
  const { spawnSync } = require('child_process');
  const gates = [
    ['till-frame-browser-test.mjs', 'till-frame-browser-test'],
    ['pay-height-test.mjs', 'pay-height-test'],
    ['components-sum-test.mjs', 'components-sum-test'],
    ['discount-reasons-test.mjs', 'discount-reasons-test'],
    ['cash-count-browser-test.mjs', 'cash-count-browser-test'],
    ['attendance-code-current-test.mjs', 'attendance-code-current-test'],
    ['attendance-browser-test.mjs', 'attendance-browser-test'],
    ['sale-unsynced-test.mjs', 'sale-unsynced-test'],
    ['banner-announce-test.mjs', 'banner-announce-test'],
    ['online-inbox-test.mjs', 'online-inbox-test'],
    ['opening-float-test.mjs', 'opening-float-test'],
    ['till-autre-frame-test.mjs', 'till-autre-frame-test'],
    ['till-phone-tabs-browser-test.mjs', 'till-phone-tabs-browser-test'],
  ];
  for (const [file, label] of gates) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', file)], { encoding: 'utf8', timeout: 420000 });
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status === 0 && out.includes('○ skip')) warn(`${label} sauté (pas de Chromium : les assertions du navigateur n'ont pas tourné)`);
    else if (r.status === 0) {
      const line = (out.split('\n').filter((l) => /^✓/.test(l)).pop() || 'vert').replace(/^✓\s*/, '').trim();
      ok(line.startsWith(label) ? line : label + ' · ' + line);
    }
    else {
      const lines = out.split('\n').filter((l) => /✗/.test(l)).slice(0, 12);
      if (lines.length) lines.forEach((l) => fail(label + ' · ' + l.replace(/^\s*✗\s*/, '').trim()));
      else fail(`${file} exited ${r.status} · ${out.trim().split('\n').slice(-3).join(' | ')}`);
    }
  }
}

/* ── 14h · Kiwi 2027, étape 5 : le tableau de bord ───────────────────────
 * Derrière kiwiSkin2027:dashboard, l'accueil se dessine sur le kit
 * (assets/kit/dash-home.js) avec les chiffres livrés : dateRange.js publie ce
 * qu'il vient d'écrire (KiwiDateRange.home(), kiwi:home-model). Décision du
 * propriétaire, 2026-10-15 : les chiffres livrés d'abord, le registre plus
 * tard (§21.2) ; la démo garde ses générateurs.
 *   dash-home-browser-test              drapeau éteint, rien n'est chargé ; allumé, le
 *                                       chiffre clé, l'objectif, la comparaison, les
 *                                       tuiles et les commandes sont ceux du rendu livré ;
 *                                       Hier déplace la période livrée ; une tuile et une
 *                                       commande ouvrent les livrées
 *   dash-orders-browser-test            les commandes (§18.2) : pages-pro.js publie son
 *                                       rendu (KiwiOrdersPage, kiwi:orders-model) ; le
 *                                       chiffre clé, le résumé et les lignes par heure
 *                                       sont ceux du rendu livré ; le filtre et la période
 *                                       déplacent les livrés ; une ligne ouvre la fiche
 *   dash-report-browser-test            l'en-tête du rapport (§12) : day-report-dash.js
 *                                       publie son rendu (KiwiReportPage,
 *                                       kiwi:report-model) ; le jour, le net et sa
 *                                       référence, les tuiles sont ceux du rendu livré ;
 *                                       Exporter est un menu des trois exports livrés ;
 *                                       un autre jour de la frise déplace l'en-tête
 *   dash-customers-browser-test         les clients (§18.5) : clients-directory.js
 *                                       publie son carnet (KiwiClientsPage,
 *                                       kiwi:customers-model) ; le résumé, les
 *                                       segments et les lignes sont ceux du livré ; le
 *                                       segment, la recherche, le menu, Ajouter et une
 *                                       ligne passent par les contrôles livrés
 *   dash-retention-browser-test         la fidélisation : customer-retention.js publie
 *                                       sa page (KiwiRetentionPage, kiwi:retention-model) ;
 *                                       les onglets, les groupes et les lignes de
 *                                       l'activité sont ceux du livré ; un autre onglet
 *                                       ouvre le panneau livré
 *   dash-compliance-browser-test        la conformité (§12) : chaque onglet livré est une
 *                                       ligne d'une liste à 360 à côté de son écran livré,
 *                                       avec un statut lu dans les données de l'onglet
 *   dash-ai-browser-test                le début d'une conversation Kiwi AI (§18.6) :
 *                                       l'intro, la carte du jour lue dans le registre
 *                                       (todayPace), les questions du métier puis celles
 *                                       du héros ; une ligne pose sa question
 *   dash-figures-agreement-test         un jour, un jeu de chiffres : le chiffre
 *                                       d'affaires, les commandes et le panier moyen de
 *                                       l'accueil, des commandes, du rapport et de Kiwi
 *                                       AI sont ceux du registre de démo du jour
 *   chart-legend-test                   la légende du graphique (§10.22) : la bande
 *                                       réservée, aucun point dedans, la grille du haut
 *                                       nommée par son maximum, le bord de début, 1,35,
 *                                       la droite en RTL
 *   dash-frame-browser-test             le cadre : la tête de chaque page (Heading,
 *                                       Footnote ink-2, le chiffre clé reste le plus
 *                                       grand) et de chaque tiroir (Heading, fermer 44
 *                                       rond sur surface-2)
 *   dash-desktop-browser-test           le bureau (900 et plus) : drapeau éteint, rien
 *                                       n'est chargé ; la barre latérale du kit liste
 *                                       les liens livrés dans leur ordre, un clic ouvre
 *                                       la page livrée ; l'accueil en grille (chiffre et
 *                                       courbe dans une carte, tuiles à côté, commandes
 *                                       à côté de l'objectif), aucun chevauchement ;
 *                                       900, 1024, 1920, sombre mesuré, arabe à droite,
 *                                       rien sous 900
 *   dash-phone-browser-test             le téléphone (390 × 844) : la barre de nav et la
 *                                       capsule d'onglets du kit à la place du bandeau
 *                                       sombre, l'accueil dans l'ordre du §18.1 (courbe,
 *                                       quatre tuiles, trois commandes et « Voir »), le
 *                                       titre d'une page dans la barre, Kiwi AI, l'arabe,
 *                                       et rien de tout cela drapeau éteint ou en large */
section('Kiwi 2027 · le tableau de bord sur le kit');
{
  const { spawnSync } = require('child_process');
  const gates = [
    ['dash-home-browser-test.mjs', 'dash-home-browser-test'],
    ['dash-orders-browser-test.mjs', 'dash-orders-browser-test'],
    ['dash-report-browser-test.mjs', 'dash-report-browser-test'],
    ['dash-customers-browser-test.mjs', 'dash-customers-browser-test'],
    ['dash-retention-browser-test.mjs', 'dash-retention-browser-test'],
    ['dash-compliance-browser-test.mjs', 'dash-compliance-browser-test'],
    ['dash-ai-browser-test.mjs', 'dash-ai-browser-test'],
    ['dash-figures-agreement-test.mjs', 'dash-figures-agreement-test'],
    ['chart-legend-test.mjs', 'chart-legend-test'],
    ['dash-frame-browser-test.mjs', 'dash-frame-browser-test'],
    ['dash-desktop-browser-test.mjs', 'dash-desktop-browser-test'],
    ['dash-phone-browser-test.mjs', 'dash-phone-browser-test'],
    /* Les finitions : pas de barre téléphone en large, l'unité espacée, les segments centrés ou défilants, Conformité au kit, la période depuis l'accueil, درهم sur Commandes. */
    ['dash-polish-browser-test.mjs', 'dash-polish-browser-test'],
    /* Chaque page du tableau de bord et ses sous-onglets, à 390 de large : rien ne dépasse l'écran (FR, AR, kit 2027 AR). */
    ['dash-phone-pages-browser-test.mjs', 'dash-phone-pages-browser-test'],
    ['dash-phone-pages-ar-browser-test.mjs', 'dash-phone-pages-ar-browser-test'],
    ['dash-phone-pages-kit-browser-test.mjs', 'dash-phone-pages-kit-browser-test'],
    /* Et chaque feuille, tiroir ou sélecteur que ces pages ouvrent, à 390 de large (FR, AR). */
    ['dash-phone-sheets-browser-test.mjs', 'dash-phone-sheets-browser-test'],
    ['dash-phone-sheets-ar-browser-test.mjs', 'dash-phone-sheets-ar-browser-test'],
    /* L'épicerie (Kiwi Basic) à 390 de large, FR et AR : vues et feuilles dans l'écran, l'ardoise d'un voisin lisible. */
    ['epicerie-phone-browser-test.mjs', 'epicerie-phone-browser-test'],
    /* Librairie, traiteur, fleuriste, gym à 390 de large : leur ticket (panier, devis, bouquet, panier) devient la feuille du bas. */
    ['trade-tickets-phone-browser-test.mjs', 'trade-tickets-phone-browser-test'],
    /* L'écran cuisine livré, de 1920 à 390 de large : chaque bon garde son bouton entier (≥ 52 px), même dans une colonne courte. */
    ['kds-cards-browser-test.mjs', 'kds-cards-browser-test'],
  ];
  for (const [file, label] of gates) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', file)], { encoding: 'utf8', timeout: 420000 });
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status === 0 && out.includes('○ skip')) warn(`${label} sauté (pas de Chromium : les assertions du navigateur n'ont pas tourné)`);
    else if (r.status === 0) {
      const line = (out.split('\n').filter((l) => /^✓/.test(l)).pop() || 'vert').replace(/^✓\s*/, '').trim();
      ok(line.startsWith(label) ? line : label + ' · ' + line);
    }
    else {
      const lines = out.split('\n').filter((l) => /✗/.test(l)).slice(0, 12);
      if (lines.length) lines.forEach((l) => fail(label + ' · ' + l.replace(/^\s*✗\s*/, '').trim()));
      else fail(`${file} exited ${r.status} · ${out.trim().split('\n').slice(-3).join(' | ')}`);
    }
  }
}

/* ── 14i · Kiwi 2027, étape 6 : l'accès, l'équipe, l'accueil des nouveaux ──
 * Derrière kiwiSkin2027:access (et les drapeaux de chaque surface), le reste :
 * le mot de passe oublié et sa réinitialisation (§18.8, R1 à R7) sur le kit.
 *   reset-states-test                   chaque réponse de /auth/forgot et de
 *                                       /auth/reset, prise aux vrais gestionnaires sur
 *                                       SQLite (dont un corps malformé, posté une fois),
 *                                       arrive sur son état de §18.8 dans Chromium ;
 *                                       l'adresse mémorisée ; drapeau éteint, le livré
 *   access-gate-browser-test            la porte de connexion (le vrai middleware) et
 *                                       la page de réinitialisation sur les jetons, en
 *                                       clair et en sombre : le contrôle de luminance du
 *                                       sombre sur chaque capture, 4,5:1 pour chaque
 *                                       texte ; le sombre reste le choix du commerçant
 *   team-split-browser-test             l'app équipe en vue scindée dès 768 : pas de
 *                                       téléphone dessiné, les onglets en rail de 88, la
 *                                       table ouverte à côté de la liste (360), sa ligne
 *                                       choisie, le verrou rendu en changeant de table,
 *                                       miroir en arabe, la pile livrée sur téléphone
 *   team-polish-browser-test            l'app équipe, finitions 2027 : le pavé tient sur
 *                                       un 375 × 667, 44 de haut pour chaque puce, la
 *                                       barre de commande hors du rail, la feuille
 *                                       centrée sur iPad, l'arabe (drapeau, compteur,
 *                                       total, options, nom latin)
 *   dash-onboarding-browser-test        l'accueil après le compte (§18.8, étapes 2 à 5) :
 *                                       le type, les objectifs, le code deux fois sur le
 *                                       pavé, cet appareil ; finish() livré crée le
 *                                       commerce ; l'appareil d'équipe déconnecte */
section('Kiwi 2027 · l\'accès et le reste sur le kit');
{
  const { spawnSync } = require('child_process');
  const gates = [
    ['reset-states-test.mjs', 'reset-states-test'],
    ['access-gate-browser-test.mjs', 'access-gate-browser-test'],
    ['team-split-browser-test.mjs', 'team-split-browser-test'],
    ['team-polish-browser-test.mjs', 'team-polish-browser-test'],
    ['onboarding-recovery-browser-test.mjs', 'onboarding-recovery-browser-test'],
    ['dash-onboarding-browser-test.mjs', 'dash-onboarding-browser-test'],
  ];
  for (const [file, label] of gates) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', file)], { encoding: 'utf8', timeout: 420000 });
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status === 0 && out.includes('○ skip')) warn(`${label} sauté (pas de Chromium : les assertions du navigateur n'ont pas tourné)`);
    else if (r.status === 0) {
      const line = (out.split('\n').filter((l) => /^✓/.test(l)).pop() || 'vert').replace(/^✓\s*/, '').trim();
      ok(line.startsWith(label) ? line : label + ' · ' + line);
    }
    else {
      const lines = out.split('\n').filter((l) => /✗/.test(l)).slice(0, 12);
      if (lines.length) lines.forEach((l) => fail(label + ' · ' + l.replace(/^\s*✗\s*/, '').trim()));
      else fail(`${file} exited ${r.status} · ${out.trim().split('\n').slice(-3).join(' | ')}`);
    }
  }
}

/* ── summary ────────────────────────────────────────────────────────────── */
section('Politique typographique (tools/type-policy-test.js)');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'type-policy-test.js')], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0) {
    out.split('\n').filter((line) => line.startsWith('✓')).forEach((line) => ok(line.slice(2)));
  } else {
    const lines = out.split('\n').filter((line) => line.includes('✗') || /^  \S/.test(line));
    if (lines.length) lines.slice(0, 80).forEach((line) => fail(line.trim()));
    else fail(`type-policy-test.js exited ${r.status} — ${out.trim()}`);
  }
}

/* ── Design 2027 · stage 1 · keyed strings (§9) ───────────────────────────
 * Bundles live at assets/kit/strings/<surface>.<lang>.js. completeness holds
 * them to the §9.6 table and §9.2's plural categories; lint holds §9.6's rules;
 * coverage holds §10 to §18's quoted strings; sw holds the stamp layout;
 * bidi holds the isolation of every argument (its DOM half needs Chromium). */
section('Chaînes à clé · design 2027 (strings-*-test, strings-lint)');
for (const test of ['wave-p-i18n-test.mjs', 'dynamic-i18n-test.mjs', 'strings-completeness-test.mjs', 'strings-lint.mjs', 'strings-coverage-test.mjs', 'strings-sw-test.mjs', 'strings-bidi-test.mjs']) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', test)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status === 0 && out.includes('○ skip')) warn(`${test}: browser half skipped (no Chromium)`);
  if (r.status === 0) ok(`${test} green (${(out.match(/✓/g) || []).length} controls)`);
  else {
    out.split('\n').filter((line) => line.includes('✗')).forEach((line) => fail(line.replace(/^\s*✗\s*/, '')));
    if (!out.includes('✗')) fail(`${test} exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
  }
}

/* ── Suite time ratchet (tools/check-guard.js cpuRatchet) ───────────────── */
section('Wave R locale and accessibility');
{
  const r = require('child_process').spawnSync(process.execPath, [require('path').join(__dirname, 'wave-r-i18n-test.mjs')], { encoding: 'utf8' });
  if (r.status !== 0) fail('wave-r-i18n-test: ' + (r.stdout || '') + (r.stderr || ''));
  else ok('Wave R locale and accessibility regressions');
}

/* Named is not run: a file mentioned only in a comment, or in a list no loop
 * reaches, passes the wiring check above and guards nothing. On the full gate,
 * every tools/*test* file must have been started (or replayed from the pool)
 * by this very run. The other tiers leave suites out by design. */
section('Every test file ran');
if (guard.tier() !== 'full') console.log('  ○ checked on the full gate only (this tier leaves suites out by design)');
else {
  const ran = guard.ranTests();
  const never = fs.readdirSync(path.join(ROOT, 'tools'))
    .filter((f) => /test\.(?:m?js|cjs)$/.test(f) && !OFFLINE_TESTS[f] && !guard.networkOnly(path.join(ROOT, 'tools', f)))
    .filter((f) => !ran.has(f));
  if (never.length) never.forEach((f) => fail(`tools/${f} is named in tools/check.js but this full run never started it: call it from a section`));
  else ok(`every tools/*test* file ran in this full gate (${ran.size} started or replayed)`);
}

/* A `// coverage:` comment is a declaration; the coverage probe
 * (tools/coverage-probe.mjs) records the annotations a suite really reached.
 * On the full gate every mandatory French cell (tools/coverage-required.json,
 * minus its blocked list) must have been reached by a passing suite in this run,
 * or by a cached pass with the same inputs. */
section('Coverage cells reached (tools/coverage-probe.mjs)');
if (guard.tier() !== 'full') console.log('  ○ checked on the full gate only (this tier leaves browser suites out)');
else if (process.env.KIWI_COVERAGE_PROBE === '0') fail('KIWI_COVERAGE_PROBE=0: the full gate cannot tell which coverage cells ran');
else {
  const reached = guard.reachedCells();
  const required = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'coverage-required.json'), 'utf8'));
  const blocked = new Set((required.blocked || []).map((b) => b.cell));
  const need = [];
  for (const row of required.required) for (const v of row.viewports) need.push(`${row.surface}|${row.locale}|${v}`);
  const unreached = need.filter((k) => !blocked.has(k) && !reached.has(k));
  if (unreached.length) unreached.forEach((k) => fail(`coverage cell ${k} is required and declared, but no passing suite reached its annotation in this run`));
  else ok(`${need.length - blocked.size} required French cells reached at run time (${[...reached.keys()].filter((k) => !k.startsWith('claim:')).length} annotated cells reached in all)`);
  /* Each landing claim names the assertions that prove it; finding the text in a
     test is not proof that it ran (tenth rating, landing#1). */
  const claims = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'landing-claims-map.json'), 'utf8')).claims || {};
  let anchors = 0;
  const silent = [];
  for (const [claim, entry] of Object.entries(claims)) (entry.contracts || []).forEach((c, i) => {
    anchors++;
    if (!reached.has(`claim:${claim}#${i}`)) silent.push(`${claim} → ${c.file} « ${c.assertion.trim()} »`);
  });
  if (silent.length) silent.forEach((x) => fail(`landing claim ${x}: the assertion is in the test but no passing run reached it`));
  else ok(`${anchors} landing claim assertions reached at run time (tools/landing-claims-map.json)`);
}

section('Suite CPU time (tools/suite-cpu-baseline.json)');
{
  guard.takeSkip();   // a skip flag left by the last child test is not this section's
  const r = guard.cpuRatchet();
  if (!r.measured) console.log('  ○ no suite timed (serial run, KIWI_CHECK_JOBS=1, or tracing off)');
  else {
    for (const o of r.over) fail(`${o.name}: ${Math.round(o.ms / 1000)} s of CPU, ${o.pin ? `pinned at ${Math.round(o.pin / 1000)} s` : `no pin`}, limit ${Math.round(o.limit / 1000)} s. Make it faster (one browser, one page per locale, a fixture built once); never raise a pin`);
    if (!r.hasBaseline && !r.wrote) warn('no tools/suite-cpu-baseline.json yet: KIWI_UPDATE_CPU_BASELINE=1 on a full run writes the first one');
    if (r.wrote) console.log(`  ✓ baseline written (${r.hasBaseline ? 'pins lowered' : 'first measurement'})`);
    else if (r.lower.length) console.log(`  ! ${r.lower.length} pin(s) could come down, KIWI_UPDATE_CPU_BASELINE=1: ${r.lower.map((x) => `${x.name} ${Math.round(x.pin / 1000)}→${Math.round(x.ms / 1000)} s`).join(' · ')}`);
    if (!r.over.length) ok(`${r.measured} suites within their CPU time (${r.pinned} pinned, ${Math.round(guard.CPU_BUDGET_MS / 1000)} s for any other)`);
  }
}

{
  const skipped = guard.dependencySkips();
  if (skipped.length && !MISSING_TEST_DEPS.length) fail(`${skipped.length} suite(s) skipped on a library that would not load (${skipped.join(', ')}): they did not run, so this run is not a pass. Check app/node_modules`);
}
if (MISSING_TEST_DEPS.length) fail(`KIWI_ALLOW_PROPERTY_SKIP=1 with ${MISSING_TEST_DEPS.join(', ')} missing: the property and accessibility suites did not run, so this run is not a pass (${guard.tier()} tier)`);
console.log('\n' + '─'.repeat(60));
if (guard.tier() === 'full') {
  const verdict = require('./check-verdict.cjs')({ failures, warnings });
  console.log(verdict.line);
  process.exit(verdict.code);
}
if (failures) { console.log(`✗ ${failures} failure(s), ${warnings} warning(s)`); process.exit(1); }

if (guard.tier() === 'changed') {
  const n = guard.selection().picked.size;
  console.log(`✓ changed tier passed (${warnings} warning(s)) · ${n} affected test(s) run, ${guard.skipped.length} left out, so this is not the gate: run \`npm run check:full\` before pushing`);
  process.exit(0);
}
if (guard.tier() === 'fast') {
  console.log(`✓ fast tier passed (${warnings} warning(s)) · ${guard.skipped.length} browser suite(s) NOT run, so this is not the gate: run \`npm run check:full\` (or \`node tools/check.js\`) before pushing`);
  process.exit(0);
}
console.log(`✓ all checks passed (${warnings} warning(s))`);
