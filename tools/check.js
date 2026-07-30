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

/* ── summary ────────────────────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(60));
if (failures) { console.log(`✗ ${failures} failure(s), ${warnings} warning(s)`); process.exit(1); }
console.log(`✓ all checks passed (${warnings} warning(s))`);
