#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · repo smoke checks — the project's automated safety net.
 *
 *   node tools/check.js
 *
 * Zero dependencies, no build step (in keeping with the vanilla-stack rule).
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
const list = (dir, ext) => fs.readdirSync(dir).filter((f) => f.endsWith(ext)).map((f) => path.join(dir, f));
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
  // (kiwi-order, kiwi-caisse, kiwi-serveur, …) carry their own inline dicts.
  for (const f of HTML_FILES.filter((f) => read(f).includes('assets/i18n.js'))) {
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

  // Secret-shaped strings. The repo is public-facing demo code — nothing
  // resembling a live credential may be committed.
  const SECRET = /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[bap]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY)/;
  let leaks = 0;
  for (const f of [...JS_FILES, ...HTML_FILES, ...CSS_FILES]) {
    const m = read(f).match(SECRET);
    if (m) { leaks++; fail(`${path.relative(ROOT, f)} contains a secret-shaped string: ${m[0].slice(0, 12)}…`); }
  }
  if (!leaks) ok('no secret-shaped strings');
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

/* ── 4d · production action honesty ────────────────────────────────────────
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

/* ── summary ────────────────────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(60));
if (failures) { console.log(`✗ ${failures} failure(s), ${warnings} warning(s)`); process.exit(1); }
console.log(`✓ all checks passed (${warnings} warning(s))`);
