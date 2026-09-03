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

const JS_FILES = list(path.join(ROOT, 'assets'), '.js');
const CSS_FILES = list(path.join(ROOT, 'assets'), '.css');
const HTML_FILES = list(ROOT, '.html');

let failures = 0;
let warnings = 0;
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const warn = (msg) => { warnings++; console.log('  ⚠ ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);
const section = (t) => console.log('\n■ ' + t);

/* ── 1 · SYNTAX (compile only — nothing is executed) ────────────────────── */
section('Syntax (vm.Script compile)');
{
  let bad = 0;
  for (const f of JS_FILES) {
    try { new vm.Script(read(f), { filename: f }); }
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
  // background:var(--ink) inverts in dark mode — the bug that broke the
  // sidebar once. Existing instances are covered at runtime (theme.css
  // overrides + dark-fixes), so this is a debt WARNING with per-file counts;
  // keep the number from growing. Scope: the token/dark-mode surfaces.
  const INK_SCOPE = [...CSS_FILES, ...JS_FILES, path.join(ROOT, 'dashboard.html')];
  const inkCounts = [];
  for (const f of INK_SCOPE) {
    const n = (read(f).match(/background(?:-color)?\s*:\s*var\(--ink\)/g) || []).length;
    if (n) inkCounts.push(`${path.relative(ROOT, f)}: ${n}`);
  }
  if (inkCounts.length) warn(`background:var(--ink) debt (runtime-patched today, do not add more) — ${inkCounts.join(' · ')}`);
  else ok('no background:var(--ink) in dark-mode surfaces');

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

  const SCAN_FILES = trackedFiles
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
 * The POS must not convert missing devices into successful business events.
 * This gate executes the shipped hardware wrapper as a hosted real till and
 * rejects fake card approvals, barcodes, prints and drawer openings. */
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

/* ── 4e · durable browser outbox wiring ────────────────────────────────────
 * The behavioral fixtures run in a real browser; this zero-dependency gate
 * locks their tested engine into every operational shell and the PWA cache. */
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
  'platform-kernel-test.mjs', 'platform-ops-test.mjs', 'media-upload-test.mjs', 'hotel-media-cleanup-test.mjs', 'operations-system-test.mjs',
  'vertical-feature-parity-test.mjs', 'pos-sale-cloud-sync-test.mjs',
  'caisse-opening-gate-test.mjs',
  'hotel-rooms-test.mjs', 'hotel-stays-test.mjs', 'hotel-channel-sync-test.mjs', 'hotel-sync-worker-test.mjs', 'hotel-caisse-catalog-test.mjs',
  'sw-immutable-revalidation-test.mjs', 'load-test-suite-test.mjs',
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

/* ── 4g · les suites du jour, branchées sur la barrière ────────────────────
 * Une suite posée dans tools/ n'est pas une barrière : elle ne protège que ce
 * que check.js appelle. Ces huit-là existaient, passaient, et ne gardaient
 * rien — la régression de demain sur les réservations, le planning, la
 * réservation en ligne, la livraison, l'encaissement des tables ou le schéma
 * D1 serait passée sans un mot. */
section('Réservations, planning, livraison, encaissement, schéma');
for (const test of [
  'booking-api-test.mjs',
  'd1-schema-test.mjs',
  'order-delivery-test.mjs',
  'planning-core-test.mjs',
  'planning-layout-test.mjs',
  'reservations-test.mjs',
  'serveur-menu-live-test.mjs',
  'menu-availability-test.mjs',
  'service-settlement-test.mjs',
  'recipe-heal-test.js',
  'sale-line-v2-test.mjs',
  'sales-centime-precision-test.mjs',
  'pin-hardening-test.mjs',
  'config-pin-projection-test.mjs',
  'team-doc-redaction-test.mjs',
  'tenant-guard-test.mjs',
  'pressing-workspace-test.js',
  'pressing-auto-ready-test.mjs',
  'inventory-waste-test.mjs',
  'inventory-universal-count-test.mjs',
  'inventory-expiry-test.mjs',
  'hotel-exceptions-test.mjs',
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
for (const script of ['agent-features-test.mjs', 'agent-ops-simulations.mjs']) {
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
    'dashboard-analytics-toggle-test.mjs',
    'vexel-startup-test.mjs',
    'channel-percentage-test.mjs',
    'sales-day-contrast-test.mjs',
    'day-report-export-test.mjs',
    'day-report-paired-scope-test.mjs',
    'live-feed-backfill-test.mjs',
    'kpi-card-layout-test.mjs',
    'dashboard-card-truth-test.mjs',
    'install-card-icon-test.mjs',
    'caisse-menu-add-contrast-test.mjs',
    'caisse-product-art-test.mjs',
    'check-godmode.mjs',
    'floorplan-sync-test.js',
    'kitchen-relay-test.js',
    'takeout-kds-ready-test.mjs',
    'caisse-godmode-toggles-test.mjs',
    'kitchen-print-queue-test.mjs',
    'payment-kitchen-dispatch-test.mjs',
    'food-production-print-test.mjs',
    'order-mode-exit-test.js',
    'resto-carte-test.js',
    'restaurant-menu-route-test.js',
    'menu-pull-route-test.js',
    'restaurant-menu-performance-test.js',
    'restaurant-menu-nutrition-tab-test.js',
    /* Le patron éditorial public : SEO, article sémantique, RTL, mobile et
       fonctionnement sans JS restent présents à chaque nouveau guide. */
    'build-guides-check.mjs',
    'article-template-test.mjs',
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
    'void-stock-test.js',
    'caisse-stock-test.mjs',
    'boutique-variant-stock-test.mjs',
    'catalog-stock-transaction-test.mjs',
    'inventory-ledger-test.mjs',
    'stock-costing-migration-test.mjs',
    'stock-category-management-test.mjs',
    'pairing-resolver-test.mjs',
    /* pairing-resolver vérifie qui LIT l'appairage ; celui-ci vérifie qu'il n'y
       a qu'un seul ÉCRIVAIN. La cuisine s'appaire sur la même route que la
       caisse et écrivait les quatre clés à la main — sans la purge du commerce
       précédent. */
    'pairing-parity-test.mjs',
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
  'hotel-transfer-test.mjs',
  'economat-real-d1-transfer-test.mjs',
  'room-charge-test.mjs',
  'hotel-reports-test.mjs',
  'hotel-economat-ui-test.mjs',
  'economat-transfer-provenance-test.mjs',
  'economat-procurement-location-test.mjs',
  'economat-custody-contract-test.mjs',
  'economat-rd-invariants-test.mjs',
    'formula-protocol-test.mjs',
    'formula-kitchen-paper-test.mjs',
    'orderpro-formula-explicit-choice-test.mjs',
    'orderpro-formula-choice-images-test.mjs',
    'trade-copy-test.mjs',
    'floor-accept-test.mjs',
    'onboarding-gate-test.mjs',
    'api-boundaries-test.mjs',
    /* L'app native (app/, Capacitor) embarque les surfaces du dépôt : le bundle
       se construit, est déterministe, charge api-base.js en premier, et la
       porte accepte les origines de l'app sur /api et /auth seulement. */
    'app-bundle-test.mjs',
    'app-release-test.mjs',
    'biometric-unlock-test.mjs',
    'push-registration-test.mjs',
    'security-regression-test.js',
    'sold-insights-test.js',
    'table-refresh-test.js',
    'table-transfer-merge-test.mjs',
    'kitchen-void-protocol-test.mjs',
    'multi-device-collision-test.mjs',
    'kitchen-modifiers-and-seating-test.mjs',
    'amira-integration-test.mjs',
    'security-and-channel-hardening-test.mjs',
    'password-policy-test.mjs',
    'plan-tier-test.mjs',
    'error-reporter-test.mjs',
    'error-redaction-test.mjs',
    'supplier-actions-test.mjs',
    'print-paper-test.mjs',
    'day-report-print-format-test.mjs',
    'station-printer-routing-test.mjs',
    'print-socket-test.mjs',
    /* l'iPad n'a ni pont local ni WebUSB : la caisse dépose le ticket sur
       /api/print/jobs et le pont du comptoir vient le chercher. */
    'print-relay-test.mjs',
    'android-print-bridge-test.mjs',
    'agent-voice-test.mjs',
    'agent-vision-test.mjs',
    'briefing-test.mjs',
    'briefing-sales-drop-test.mjs',
    'briefing-low-stock-test.mjs',
    'briefing-margin-test.mjs',
    'briefing-planning-test.mjs',
    'briefing-cancellations-test.mjs',
    'briefing-discounts-test.mjs',
    'briefing-cash-sessions-test.mjs',
    'briefing-late-orders-test.mjs',
    'briefing-card-placement-test.mjs',
    'dark-fixes-gradient-test.mjs',
    'action-center-loop-test.mjs',
    'err-reporter-silence-test.mjs',
    'depenses-demo-gate-test.mjs',
    'invoice-receipt-test.mjs',
    'receipt-logo-print-test.mjs',
    'formula-receipt-pricing-test.mjs',
    'sale-invoice-test.mjs',
    'ai-routes-test.mjs',
    'inventory-count-test.mjs',
    'menu-scan-test.mjs',
    'menu-translate-test.mjs',
    /* La carte dans la langue de chacun : traductions portées par les
       entités, jamais à la place du libellé du patron ; résolues par toutes
       les surfaces, tickets canoniques. */
    'menu-i18n-test.mjs',
    'order-langs-test.mjs',
    'salle-scan-test.mjs',
    'pin-dashboard-test.mjs',
    'idle-lock-test.mjs',
  ];
  suites.forEach((name) => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', name)], { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status === 0) ok(name + ' green');
    else {
      const lines = out.split('\n').filter((l) => /[✗·]/.test(l)).slice(-8);
      if (lines.length) lines.forEach((l) => fail(name + ' — ' + l.trim()));
      else fail(`${name} exited ${r.status} — ${out.trim().split('\n').slice(-3).join(' | ')}`);
    }
  });
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

console.log('\n' + '─'.repeat(60));
if (failures) { console.log(`✗ ${failures} failure(s), ${warnings} warning(s)`); process.exit(1); }
console.log(`✓ all checks passed (${warnings} warning(s))`);
