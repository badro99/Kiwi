#!/usr/bin/env node
'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · type-steps-lint : six pas de type, pas un de plus (§6.2).
 *
 *   node tools/type-steps-lint.js                  lit le kit (statique) + contrôles négatifs
 *   node tools/type-steps-lint.js --frames f.json  juge des tailles CALCULÉES
 *
 * Le spec : « Au plus 6 tailles distinctes par surface. type-steps-lint divise
 * chaque taille calculée par la taille de la racine de la surface où elle
 * s'affiche, fois le facteur Dynamic Type (§6.4), et refuse tout quotient qui
 * n'est pas l'une des six valeurs rem (2,75 · 1,75 · 1,25 · 1,0625 · 0,9375 ·
 * 0,8125), sur chaque image de capture. »
 *
 * Deux gardes, parce que les tailles calculées n'existent qu'une fois un
 * composant dessiné (étape 2) :
 *
 *   A · STATIQUE (tourne dès l'étape 1, sur tout assets/kit/) :
 *       · tokens-2027.css définit exactement six --k-fs-*, ceux du spec, en rem
 *         fois --type-scale ;
 *       · toute déclaration font-size du kit vaut l'un des six jetons (ou
 *         inherit) : jamais px, rem, em, % ni une valeur nue ;
 *       · la forme courte `font:` n'a pas de taille littérale ;
 *       · font-size sur :host est refusé (« un composant n'a jamais sa propre
 *         racine », §6.2) ; sur html, seule la cuisine pose une racine
 *         (html[data-k-surface="kds"], 20, 24 ou 28 px) ;
 *       · au plus six jetons de taille distincts sont consommés par fichier.
 *   B · CALCULÉ : `lintComputed(frames)`, que la capture (tools/design-capture/)
 *       appellera sur chaque image : { frame, root, factor, sizes:[px…] }.
 *       Le mode --frames le lance sur un JSON, et le navigateur de
 *       tokens-2027-browser-test.mjs l'exerce sur les six pas à quatre racines
 *       et six facteurs.
 *
 * Des contrôles négatifs finissent chaque passe : un Caption de 12 px, un
 * 14 px, un `font-size:1rem` et un :host qui pose sa taille doivent être
 * refusés. Un lint qui ne sait pas échouer ne garde rien.
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { parse, cssInJs, kitFiles, stripJsComments } = require('./kit-css');

const ROOT = path.resolve(__dirname, '..');
const STEPS = Object.freeze([2.75, 1.75, 1.25, 1.0625, 0.9375, 0.8125]);
const STEP_NAMES = Object.freeze({ display: 2.75, title: 1.75, heading: 1.25, body: 1.0625, callout: 0.9375, footnote: 0.8125 });
const TOLERANCE = 0.002;   /* un quotient de float, pas une tolérance de design */

/* Le quotient du spec : taille calculée / (racine × facteur Dynamic Type). */
const quotient = (px, root, factor = 1) => px / (root * factor);
const nearestStep = (q) => STEPS.reduce((best, s) => (Math.abs(s - q) < Math.abs(best - q) ? s : best), STEPS[0]);
const isStep = (q) => STEPS.some((s) => Math.abs(s - q) <= TOLERANCE);

/* B · tailles calculées. frames: [{ frame, root, factor, sizes:[px] }] */
function lintComputed(frames) {
  const failures = [];
  for (const f of frames) {
    const root = Number(f.root), factor = f.factor === undefined ? 1 : Number(f.factor);
    if (!(root > 0) || !(factor > 0)) { failures.push(`${f.frame} : racine ou facteur illisible (${f.root} / ${f.factor})`); continue; }
    const seen = new Set();
    for (const px of f.sizes || []) {
      const q = quotient(px, root, factor);
      if (!isStep(q)) failures.push(`${f.frame} : ${px}px / (${root}px × ${factor}) = ${q.toFixed(4)}, pas l'un des six pas (le plus proche : ${nearestStep(q)})`);
      else seen.add(nearestStep(q));
    }
    if (seen.size > 6) failures.push(`${f.frame} : ${seen.size} pas distincts`);   /* inatteignable si tout est un pas, gardé par honnêteté */
  }
  return failures;
}

/* A · statique. `file` sert aux messages ; `kind` : 'css' | 'js'. */
const TOKEN_FS = /^var\(\s*--k-fs-(display|title|heading|body|callout|footnote)\s*\)$/;
function lintCss(css, file, { tokensFile = false, line0 = 0 } = {}) {
  const failures = [];
  const where = (l) => `${file}:${l + line0}`;
  const sheet = parse(css);
  for (const r of sheet.rules) {
    for (const d of r.decls) {
      if (d.prop === 'font-size') {
        const onHost = r.selectors.some((s) => /^:host/.test(s));
        const onHtml = r.selectors.length > 0 && r.selectors.every((s) => /^(?:html|:root)(?![\w-])/.test(s));
        if (onHost) { failures.push(`${where(d.line)} · font-size sur ${r.selector} : un composant n'a jamais sa propre taille de racine (§6.2)`); continue; }
        if (onHtml) {
          const kds = r.selectors.every((s) => s.startsWith('html[data-k-surface="kds"]'));
          if (!(tokensFile && kds && /^var\(\s*--k-kds-root\s*,\s*(?:20|24|28)px\s*\)$/.test(d.value))) {
            failures.push(`${where(d.line)} · font-size sur ${r.selector} : seule la cuisine pose une racine, par var(--k-kds-root, 24px)`);
          }
          continue;
        }
        if (!(TOKEN_FS.test(d.value) || /^(?:inherit|initial|unset)$/.test(d.value))) failures.push(`${where(d.line)} · font-size: ${d.value} sur ${r.selector} : ce n'est pas l'un des six jetons var(--k-fs-*)`);
      } else if (d.prop === 'font') {
        if (/^(?:inherit|initial|unset)$/.test(d.value)) continue;
        if (!/var\(\s*--k-fs-/.test(d.value) && /(?:^|[\s/])[\d.]+(?:px|rem|em|pt|%)/.test(d.value)) failures.push(`${where(d.line)} · font: ${d.value} : la taille doit venir d'un jeton var(--k-fs-*)`);
        else if (!/var\(\s*--k-fs-/.test(d.value)) failures.push(`${where(d.line)} · font: ${d.value} : forme courte sans jeton de taille`);
      } else if (!tokensFile && /^--k-fs-/.test(d.prop)) {
        failures.push(`${where(d.line)} · ${d.prop} : les pas de type ne se redéfinissent que dans tokens-2027.css`);
      }
    }
  }
  return failures;
}

/* Les six définitions de tokens-2027.css, au rem près. */
function lintTokenDefinitions(css, file) {
  const failures = [];
  const sheet = parse(css);
  const defs = new Map();
  for (const r of sheet.rules) if (!r.at && r.selector === ':root') for (const d of r.decls) if (/^--k-fs-/.test(d.prop)) defs.set(d.prop, d.value);
  const names = [...defs.keys()].map((k) => k.slice('--k-fs-'.length));
  if (names.length !== 6) failures.push(`${file} · ${names.length} jetons --k-fs-* au lieu de six (${names.join(', ')})`);
  for (const [name, rem] of Object.entries(STEP_NAMES)) {
    const got = defs.get('--k-fs-' + name);
    const want = `calc(${rem}rem * var(--type-scale, 1))`;
    if (got !== want) failures.push(`${file} · --k-fs-${name} : « ${got} » au lieu de « ${want} »`);
  }
  return failures;
}

/* Les tailles écrites en JS hors d'un gabarit CSS : style.fontSize = '14px', setAttribute('style', …). */
function lintJs(js, file) {
  const failures = [];
  const src = stripJsComments(js);
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;
  let m;
  const re1 = /\bfontSize\s*=\s*(['"`])([^'"`]*)\1/g;
  while ((m = re1.exec(src))) if (!TOKEN_FS.test(m[2])) failures.push(`${file}:${lineOf(m.index)} · fontSize = ${m[2]} : ce n'est pas un jeton var(--k-fs-*)`);
  const re2 = /\bstyle\.setProperty\(\s*(['"`])font-size\1\s*,\s*(['"`])([^'"`]*)\2/g;
  while ((m = re2.exec(src))) if (!TOKEN_FS.test(m[3])) failures.push(`${file}:${lineOf(m.index)} · setProperty('font-size', ${m[3]}) : ce n'est pas un jeton var(--k-fs-*)`);
  for (const t of cssInJs(src)) failures.push(...lintCss(t.css, file, { line0: t.line - 1 }));
  /* Les attributs style="font-size:14px" dans du HTML construit en JS. */
  const re3 = /style\s*=\s*\\?["'][^"']*font-size\s*:\s*([^;"'\\]+)/g;
  while ((m = re3.exec(src))) if (!TOKEN_FS.test(m[1].trim())) failures.push(`${file}:${lineOf(m.index)} · style="font-size:${m[1].trim()}" : ce n'est pas un jeton var(--k-fs-*)`);
  return failures;
}

function lintKit() {
  const failures = [];
  const files = kitFiles(ROOT, ['.css', '.js', '.mjs']);
  const consumed = new Map();
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const txt = fs.readFileSync(f, 'utf8');
    if (f.endsWith('.css')) {
      const isTokens = path.basename(f) === 'tokens-2027.css';
      failures.push(...lintCss(txt, rel, { tokensFile: isTokens }));
      if (isTokens) failures.push(...lintTokenDefinitions(txt, rel));
    } else failures.push(...lintJs(txt, rel));
    const used = new Set();
    for (const mm of txt.matchAll(/var\(\s*--k-fs-([a-z]+)\s*\)/g)) used.add(mm[1]);
    consumed.set(rel, used);
    if (used.size > 6) failures.push(`${rel} · ${used.size} pas distincts consommés`);
  }
  return { failures, files: files.length };
}

/* Contrôles négatifs : le lint doit refuser ce que le spec interdit. */
function selfTest() {
  const bad = [];
  const expectFail = (label, fails) => { if (!fails.length) bad.push(`contrôle négatif non vu : ${label}`); };
  const expectPass = (label, fails) => { if (fails.length) bad.push(`faux positif : ${label} → ${fails[0]}`); };

  /* Calculé */
  expectPass('17 px à la racine 16 (Body)', lintComputed([{ frame: 't', root: 16, factor: 1, sizes: [44, 28, 20, 17, 15, 13] }]));
  expectPass('la cuisine : 25,5 px à la racine 24 (Body)', lintComputed([{ frame: 't', root: 24, factor: 1, sizes: [66, 42, 30, 25.5, 22.5, 19.5] }]));
  expectPass('Dynamic Type 1,35 : 17,55 px (Body)', lintComputed([{ frame: 't', root: 16, factor: 1.35, sizes: [17 * 1.35, 13 * 1.35] }]));
  expectPass('racines 20 et 28 (cuisine S et L)', lintComputed([{ frame: 't', root: 20, sizes: [55, 21.25] }, { frame: 'u', root: 28, sizes: [77, 22.75] }]));
  expectFail('Caption de 12 px, retiré par la révision 4', lintComputed([{ frame: 't', root: 16, sizes: [12] }]));
  expectFail('un 14 px', lintComputed([{ frame: 't', root: 16, sizes: [14] }]));
  expectFail('16 px (le quotient 1,0 n\'est pas un pas)', lintComputed([{ frame: 't', root: 16, sizes: [16] }]));
  expectFail('un 15 px sur la racine de la cuisine (le facteur oublié)', lintComputed([{ frame: 't', root: 24, sizes: [15] }]));
  expectFail('une racine illisible', lintComputed([{ frame: 't', root: 0, sizes: [17] }]));

  /* Statique */
  const good = ':root{--x:1}.a{font-size:var(--k-fs-body)}.b{font:var(--k-fw-body) var(--k-fs-callout)/1.4 var(--k-font)}.c{font-size:inherit}';
  expectPass('CSS conforme', lintCss(good, 'good.css'));
  expectFail('font-size: 14px', lintCss('.a{font-size:14px}', 'bad.css'));
  expectFail('font-size: 1rem', lintCss('.a{font-size:1rem}', 'bad.css'));
  expectFail('font-size: 120 %', lintCss('.a{font-size:120%}', 'bad.css'));
  expectFail('font-size: 12px sur .b (Caption)', lintCss('.b{font-size:12px}', 'bad.css'));
  expectFail('font-size sur :host', lintCss(':host{font-size:var(--k-fs-body)}', 'bad.css'));
  expectFail('font-size sur html hors cuisine', lintCss('html{font-size:20px}', 'bad.css'));
  expectFail('une racine de cuisine hors tokens-2027.css', lintCss('html[data-k-surface="kds"]{font-size:var(--k-kds-root, 24px)}', 'bad.css'));
  expectPass('la racine de cuisine dans tokens-2027.css', lintCss('html[data-k-surface="kds"]{font-size:var(--k-kds-root, 24px)}', 'tokens-2027.css', { tokensFile: true }));
  expectFail('une racine de cuisine à 22 px', lintCss('html[data-k-surface="kds"]{font-size:var(--k-kds-root, 22px)}', 'tokens-2027.css', { tokensFile: true }));
  expectFail('font: avec une taille en px', lintCss('.a{font:600 15px/1.2 Arial}', 'bad.css'));
  expectFail('font: sans jeton de taille', lintCss('.a{font:600 inherit/1.2 Arial}', 'bad.css'));
  expectFail('un pas redéfini hors du fichier de jetons', lintCss(':root{--k-fs-body:18px}', 'bad.css'));
  expectFail('un septième pas dans tokens-2027.css', lintTokenDefinitions(':root{--k-fs-display:calc(2.75rem * var(--type-scale, 1));--k-fs-title:calc(1.75rem * var(--type-scale, 1));--k-fs-heading:calc(1.25rem * var(--type-scale, 1));--k-fs-body:calc(1.0625rem * var(--type-scale, 1));--k-fs-callout:calc(0.9375rem * var(--type-scale, 1));--k-fs-footnote:calc(0.8125rem * var(--type-scale, 1));--k-fs-caption:calc(0.75rem * var(--type-scale, 1))}', 'tokens-2027.css'));
  expectFail('un pas qui change de valeur', lintTokenDefinitions(':root{--k-fs-display:calc(2.75rem * var(--type-scale, 1));--k-fs-title:calc(1.75rem * var(--type-scale, 1));--k-fs-heading:calc(1.25rem * var(--type-scale, 1));--k-fs-body:calc(1rem * var(--type-scale, 1));--k-fs-callout:calc(0.9375rem * var(--type-scale, 1));--k-fs-footnote:calc(0.8125rem * var(--type-scale, 1))}', 'tokens-2027.css'));
  expectFail('fontSize = "14px" en JS', lintJs("el.style.fontSize = '14px';", 'bad.js'));
  expectFail('un gabarit CSS en JS avec 13 px', lintJs('const css = `.a { font-size: 13px; color: var(--k-ink-1); }`;', 'bad.js'));
  expectPass('un gabarit CSS en JS avec un jeton', lintJs('const css = `.a { font-size: var(--k-fs-footnote); color: var(--k-ink-1); }`;', 'good.js'));
  expectPass('un commentaire JS qui cite font-size:14px', lintJs('// font-size: 14px était la taille du Caption\nconst a = 1;', 'good.js'));
  return bad;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const problems = [];
  const neg = selfTest();
  problems.push(...neg);
  const fi = args.indexOf('--frames');
  let summary;
  if (fi >= 0) {
    const frames = JSON.parse(fs.readFileSync(args[fi + 1], 'utf8'));
    problems.push(...lintComputed(Array.isArray(frames) ? frames : frames.frames));
    summary = `${(Array.isArray(frames) ? frames : frames.frames).length} images de capture`;
  } else {
    const r = lintKit();
    problems.push(...r.failures);
    summary = `${r.files} fichier(s) du kit`;
  }
  if (problems.length) {
    console.error(`✗ type-steps-lint : ${problems.length} problème(s)`);
    problems.slice(0, 60).forEach((p) => console.error('  · ' + p));
    process.exit(1);
  }
  console.log(`✓ type-steps-lint · six pas (${STEPS.join(', ')}) sur ${summary}, contrôles négatifs vus`);
}

module.exports = { STEPS, STEP_NAMES, quotient, isStep, lintComputed, lintCss, lintJs, lintTokenDefinitions, lintKit, selfTest };
