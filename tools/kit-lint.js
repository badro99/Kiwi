#!/usr/bin/env node
'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · kit-lint : les règles que le spec confie à `kit-lint`, celles qui
 * existent dès l'étape 1 (fondations).
 *
 *   node tools/kit-lint.js
 *
 * Il lit tout assets/kit/ (css, js, mjs) et refuse :
 *
 *   K1  une couleur brute (hex, rgb(), rgba(), hsl(), hsla()) hors de
 *       assets/kit/tokens-2027.css : la peinture vient des jetons (§2, principe 3).
 *   K2  une taille de police en px, en rem, en em ou en % (§3 ligne 6, §6.2).
 *       Les six pas se prennent par var(--k-fs-*) ; type-steps-lint juge le reste.
 *   K3  un font-size sur :host, ou sur un html qui n'est pas la cuisine :
 *       « un composant n'a jamais sa propre racine » (§6.2, ligne 817).
 *   K4  une règle imbriquée (CSS nesting) : le kit ne l'emploie pas (§4.1).
 *   K5  une @font-face hors de tokens-2027.css : le kit n'en a qu'une source (§6.1).
 *   K6  un gabarit `…${x}.js|.css|.woff2|.svg` : aucune URL de ressource n'est
 *       construite à l'exécution, le scanner d'estampilles ne la verrait jamais
 *       (§21.3).
 *   K7  une coupure de journée écrite en dur hors de business-day.js :
 *       DEFAULT_CUTOFF, 'Africa/Casablanca', `cutoff = 5` (§3 ligne 1, §17.1).
 *   K8  une affectation de window.KiwiLens hors de lens.js : un seul objet,
 *       quatre méthodes, étendu par Object.assign (§20.5).
 *
 * Étape 2 (composants) :
 *   K9  `data-action` dans le kit : un hôte ne porte jamais l'attribut du
 *       routeur historique, le kit parle par kiwi:action (§20.3).
 *   K10 un nom d'action hors de k.<composant>.<verbe> : le verbe d'un
 *       this.emit('…') en kebab minuscule, un nom écrit en entier commence
 *       par « k. », et seul core.js fabrique l'événement kiwi:action.
 *   K11 customElements.define hors de l'aide define() de core.js, sauf les
 *       deux éléments sans racine (k-icon, k-figure, elements.js) : chaque
 *       racine passe par le contrat d'hôte (§20.2).
 *   K12 un élément défini sans placeholder `:not(:defined)` dans kit.css :
 *       avant l'upgrade, la page réserve déjà sa place (§20.6, pas de saut).
 *   K13 un conteneur de texte à hauteur fixe : une règle qui pose une
 *       taille de texte et un `height` en longueur fixe coupe le texte dès
 *       que Dynamic Type ou l'arabe l'allongent ; min-height, jamais height.
 *
 * Reste à l'étape 3, parce qu'aucune surface n'adopte encore le kit : un
 * tablist hors kit dans une surface adoptée.
 *
 * Des contrôles négatifs finissent chaque passe : un lint qui ne sait pas
 * échouer ne garde rien.
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { parse, cssInJs, kitFiles, stripJsComments } = require('./kit-css');

const ROOT = path.resolve(__dirname, '..');

const RAW_COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])|\b(?:rgba?|hsla?)\(/;
const stripUrls = (v) => v.replace(/url\([^)]*\)/gi, 'url()');

/* Une feuille (fichier .css ou gabarit d'un .js). */
function lintSheet(css, file, { tokensFile = false, line0 = 0 } = {}) {
  const out = [];
  const where = (l) => `${file}:${l + line0}`;
  const sheet = parse(css);
  if (!tokensFile) {
    for (const r of sheet.rules) for (const d of r.decls) {
      if (RAW_COLOR.test(stripUrls(d.value))) out.push(`K1 ${where(d.line)} · ${d.prop}: ${d.value} : couleur brute, utiliser un jeton var(--k-*)`);
    }
    for (const f of sheet.fontFaces) out.push(`K5 ${where(f.line)} · @font-face hors de tokens-2027.css`);
  }
  for (const r of sheet.rules) for (const d of r.decls) {
    if (d.prop === 'font-size') {
      const onHost = r.selectors.some((s) => /^:host/.test(s));
      const onHtml = r.selectors.length > 0 && r.selectors.every((s) => /^(?:html|:root)(?![\w-])/.test(s));
      const kdsRoot = tokensFile && onHtml && r.selectors.every((s) => s.startsWith('html[data-k-surface="kds"]')) && /^var\(\s*--k-kds-root\s*,\s*(?:20|24|28)px\s*\)$/.test(d.value);
      if (kdsRoot) continue;
      if (onHost) out.push(`K3 ${where(d.line)} · font-size sur ${r.selector} : un composant n'a jamais sa propre racine`);
      else if (onHtml) out.push(`K3 ${where(d.line)} · font-size sur ${r.selector} : seule la cuisine pose une racine`);
      else if (/^[\d.]+(?:px|pt)\b/.test(d.value) || /(?:^|\s)[\d.]+(?:px|pt)\b/.test(d.value)) out.push(`K2 ${where(d.line)} · font-size: ${d.value} : pas de px, utiliser var(--k-fs-*)`);
      else if (!/^var\(\s*--k-fs-/.test(d.value) && !/^(?:inherit|initial|unset)$/.test(d.value) && !onHtml) out.push(`K2 ${where(d.line)} · font-size: ${d.value} : pas une taille du kit, utiliser var(--k-fs-*)`);
    } else if (d.prop === 'font' && /(?:^|[\s/])[\d.]+(?:px|pt)\b/.test(d.value)) {
      out.push(`K2 ${where(d.line)} · font: ${d.value} : pas de px, utiliser var(--k-fs-*)`);
    }
  }
  /* K13 · texte dans une boîte à hauteur fixe. */
  for (const r of sheet.rules) {
    const h = r.decls.find((d) => d.prop === 'height' && /^[\d.]+(?:px|rem|em|pt)$/.test(d.value.trim()));
    const txt = r.decls.some((d) => d.prop === 'font-size' || d.prop === 'font' || d.prop === '-webkit-line-clamp');
    if (h && txt) out.push(`K13 ${where(h.line)} · ${r.selector} : height: ${h.value} sur une règle de texte, utiliser min-height`);
  }
  for (const n of sheet.nested) out.push(`K4 ${where(n.line)} · règle imbriquée « ${n.selector} » : le kit n'emploie pas le CSS nesting`);
  return out;
}

/* Un fichier JS. */
function lintScript(js, file) {
  const out = [];
  const base = path.basename(file);
  const src = stripJsComments(js);
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;

  for (const t of cssInJs(src)) out.push(...lintSheet(t.css, file, { line0: t.line - 1 }));

  /* K1 · couleurs en JS : dans un contexte de propriété, ou une fonction rgb/hsl. */
  const re1 = /(?:color|background|border|fill|stroke|shadow|outline)[\w-]*\s*[:=]\s*['"`]?[^;'"`}\n]*#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/g;
  let m;
  while ((m = re1.exec(src))) out.push(`K1 ${file}:${lineOf(m.index)} · couleur hexadécimale brute : « ${m[0].trim().slice(0, 60)} »`);
  const re1b = /\b(?:rgba?|hsla?)\(/g;
  while ((m = re1b.exec(src))) out.push(`K1 ${file}:${lineOf(m.index)} · ${m[0]}…) : couleur brute, utiliser un jeton`);

  /* K6 · gabarits qui construisent une URL de ressource. */
  const reT = /`((?:\\[\s\S]|[^`\\])*)`/g;
  while ((m = reT.exec(src))) {
    if (/\$\{/.test(m[1]) && /\.(?:js|css|woff2|svg)(?:\?[^`$]*)?$/.test(m[1])) out.push(`K6 ${file}:${lineOf(m.index)} · gabarit « ${m[1].slice(0, 60)} » : une URL de ressource ne se construit pas à l'exécution (§21.3)`);
  }

  /* K7 · coupure de journée en dur. */
  if (base !== 'business-day.js') {
    const re7 = /\bDEFAULT_CUTOFF\b|\bDEFAULT_ZONE\b|['"`]Africa\/Casablanca['"`]|\b(?:businessCutoff|business_cutoff|cutoff)\b\s*(?:\?\?|\|\||=(?!=))\s*\d/g;
    while ((m = re7.exec(src))) out.push(`K7 ${file}:${lineOf(m.index)} · « ${m[0]} » : la coupure et le fuseau ne s'écrivent que dans business-day.js (§17.1)`);
  }

  /* K8 · window.KiwiLens. */
  if (base !== 'lens.js') {
    const re8 = /\bwindow\s*\.\s*KiwiLens\s*=(?!=)|Object\.assign\(\s*window\s*\.\s*KiwiLens\b|\bglobalThis\s*\.\s*KiwiLens\s*=(?!=)/g;
    while ((m = re8.exec(src))) out.push(`K8 ${file}:${lineOf(m.index)} · affectation de window.KiwiLens hors de lens.js (§20.5)`);
  }

  /* K9 · data-action, l'attribut du routeur historique. */
  const re9 = /\bdata-action\b|dataset\s*\.\s*action\b/g;
  while ((m = re9.exec(src))) out.push(`K9 ${file}:${lineOf(m.index)} · « ${m[0]} » : le kit ne porte pas data-action, il émet kiwi:action (§20.3)`);

  /* K10 · noms d'action. */
  const re10 = /\.emit\(\s*(['"])([^'"]*)\1/g;
  while ((m = re10.exec(src))) if (!/^[a-z][a-z0-9-]*$/.test(m[2])) out.push(`K10 ${file}:${lineOf(m.index)} · verbe « ${m[2]} » : k.<composant>.<verbe>, le verbe en kebab minuscule`);
  const re10b = /\bKiwiActions\s*\.\s*(?:on|off)\(\s*(['"])([^'"]*)\1|\bA\s*\.\s*(?:on|off)\(\s*(['"])([^'"]*)\3/g;
  while ((m = re10b.exec(src))) { const n = m[2] || m[4]; if (!/^k\.[a-z0-9-]+\.[a-z0-9-]+$/.test(n)) out.push(`K10 ${file}:${lineOf(m.index)} · action « ${n} » hors de k.<composant>.<verbe>`); }
  if (base !== 'core.js') {
    const re10c = /new\s+CustomEvent\(\s*['"]kiwi:action['"]/g;
    while ((m = re10c.exec(src))) out.push(`K10 ${file}:${lineOf(m.index)} · kiwi:action fabriqué hors de core.js : passer par emit()`);
  }

  /* K11 · customElements.define. */
  const re11 = /customElements\s*\.\s*define\(\s*([^,)]*)/g;
  while ((m = re11.exec(src))) {
    const arg = m[1].trim();
    const ok = (base === 'core.js' && arg === 'tag') || (base === 'elements.js' && /^['"]k-(?:icon|figure)['"]$/.test(arg));
    if (!ok) out.push(`K11 ${file}:${lineOf(m.index)} · customElements.define(${arg}) hors de define() : chaque racine passe par le contrat d'hôte (§20.2)`);
  }
  return out;
}

/* K12 · chaque élément défini a son placeholder dans kit.css. */
function lintPlaceholders(scripts, kitCss, cssFile) {
  const out = [];
  const have = new Set([...kitCss.matchAll(/(k-[a-z-]+)(?:\[[^\]]*\])?:not\(:defined\)/g)].map((x) => x[1]));
  for (const [file, js] of scripts) {
    for (const m of js.matchAll(/\bK\s*\.\s*define\(\s*['"](k-[a-z-]+)['"]/g)) {
      if (!have.has(m[1])) out.push(`K12 ${file} · ${m[1]} n'a pas de placeholder ${m[1]}:not(:defined) dans ${cssFile}`);
    }
  }
  return out;
}

function lintKit() {
  const failures = [];
  const files = kitFiles(ROOT, ['.css', '.js', '.mjs']);
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const txt = fs.readFileSync(f, 'utf8');
    if (f.endsWith('.css')) failures.push(...lintSheet(txt, rel, { tokensFile: path.basename(f) === 'tokens-2027.css' }));
    else failures.push(...lintScript(txt, rel));
  }
  const kitCss = path.join(ROOT, 'assets/kit/kit.css');
  if (fs.existsSync(kitCss)) {
    const scripts = files.filter((f) => /\.m?js$/.test(f)).map((f) => [path.relative(ROOT, f), stripJsComments(fs.readFileSync(f, 'utf8'))]);
    failures.push(...lintPlaceholders(scripts, fs.readFileSync(kitCss, 'utf8'), 'assets/kit/kit.css'));
  }
  return { failures, files: files.length };
}

function selfTest() {
  const bad = [];
  const fail = (label, list, rule) => { if (!list.some((x) => x.startsWith(rule + ' '))) bad.push(`contrôle négatif non vu (${rule}) : ${label}`); };
  const pass = (label, list) => { if (list.length) bad.push(`faux positif : ${label} → ${list[0]}`); };

  /* Conforme */
  pass('feuille conforme', lintSheet('.a{color:var(--k-ink-1);background:var(--k-surface-1);font-size:var(--k-fs-body);padding:var(--k-space-4)}', 'ok.css'));
  pass('tokens-2027.css lui-même', lintSheet(':root{--k-bg:#F7F5F0;--k-scrim:rgba(0,0,0,.5)}@font-face{font-family:"x";src:url("a.woff2")}html[data-k-surface="kds"]{font-size:var(--k-kds-root, 24px)}', 'tokens-2027.css', { tokensFile: true }));
  pass('url(data:…#fff) ne compte pas', lintSheet('.a{background:url("data:image/svg+xml,%3Csvg fill=\'%23fff\'%3E")}', 'ok.css'));
  pass('transparent et currentColor', lintSheet('.a{background:transparent;color:currentColor}', 'ok.css'));
  pass('script conforme', lintScript('const a = window.KiwiLens; a.rescan(); if (window.KiwiLens === a) a.refresh();\n// DEFAULT_CUTOFF = 5 dans un commentaire\nconst css = `.a { color: var(--k-ink-1); }`;', 'ok.js'));
  pass('business-day.js porte les défauts', lintScript("const DEFAULT_CUTOFF = 5; const DEFAULT_ZONE = 'Africa/Casablanca'; let cutoff = config.businessCutoff ?? 5;", '/x/assets/kit/business-day.js'));
  pass('lens.js étend KiwiLens', lintScript('Object.assign(window.KiwiLens || (window.KiwiLens = {}), { attach() {} });', '/x/assets/kit/lens.js'));

  /* Refus */
  fail('hex dans un composant', lintSheet('.a{color:#0B6E4F}', 'bad.css'), 'K1');
  fail('hex court', lintSheet('.a{background:#fff}', 'bad.css'), 'K1');
  fail('rgba()', lintSheet('.a{box-shadow:0 1px 2px rgba(0,0,0,.2)}', 'bad.css'), 'K1');
  fail('hsl()', lintSheet('.a{color:hsl(120 50% 50%)}', 'bad.css'), 'K1');
  fail('hex dans un gabarit JS', lintScript('const css = `.a { color: #0B6E4F; padding: 0; }`;', 'bad.js'), 'K1');
  fail('hex dans un style en ligne JS', lintScript("el.style.background = '#fff';", 'bad.js'), 'K1');
  fail('rgba() en JS', lintScript("el.style.boxShadow = 'rgba(0,0,0,.2)';", 'bad.js'), 'K1');
  fail('font-size en px', lintSheet('.a{font-size:14px}', 'bad.css'), 'K2');
  fail('font-size en rem', lintSheet('.a{font-size:1rem}', 'bad.css'), 'K2');
  fail('font: avec un px', lintSheet('.a{font:600 15px/1.2 Arial}', 'bad.css'), 'K2');
  fail('font-size sur :host', lintSheet(':host{font-size:var(--k-fs-body)}', 'bad.css'), 'K3');
  fail('font-size sur html', lintSheet('html{font-size:18px}', 'bad.css'), 'K3');
  fail('racine de cuisine hors du fichier de jetons', lintSheet('html[data-k-surface="kds"]{font-size:var(--k-kds-root, 24px)}', 'bad.css'), 'K3');
  fail('règle imbriquée', lintSheet('.a{color:var(--k-ink-1);.b{color:var(--k-ink-2)}}', 'bad.css'), 'K4');
  fail('@font-face dans un composant', lintSheet('@font-face{font-family:"x";src:url("a.woff2")}', 'bad.css'), 'K5');
  fail('URL construite : .woff2', lintScript('const u = `assets/fonts/${name}.woff2?v=1`;', 'bad.js'), 'K6');
  fail('URL construite : .js', lintScript('import(`./${n}.js`);', 'bad.js'), 'K6');
  pass('un gabarit sans extension de ressource', lintScript('const t = `${a} et ${b}`;', 'ok.js'));
  fail('DEFAULT_CUTOFF hors business-day.js', lintScript('const DEFAULT_CUTOFF = 5;', '/x/assets/kit/ledger.js'), 'K7');
  fail('fuseau en dur', lintScript("const z = 'Africa/Casablanca';", '/x/assets/kit/format.js'), 'K7');
  fail('cutoff = 5 ailleurs', lintScript('const cutoff = cfg.businessCutoff ?? 5;', '/x/assets/kit/ledger.js'), 'K7');
  fail('window.KiwiLens = hors de lens.js', lintScript('window.KiwiLens = { rescan() {} };', '/x/assets/kit/segment.js'), 'K8');
  fail('Object.assign(window.KiwiLens…) hors de lens.js', lintScript('Object.assign(window.KiwiLens, { a: 1 });', '/x/assets/kit/segment.js'), 'K8');

  /* Étape 2 */
  pass('emit et actions conformes', lintScript("this.emit('show-data', null); KiwiActions.on('k.chart.show-data', f); A.on('k.bill.pay', g);", '/x/assets/kit/dashboard.js'));
  pass('core.js fabrique kiwi:action et définit', lintScript("host.dispatchEvent(new CustomEvent('kiwi:action', {})); root.customElements.define(tag, Klass);", '/x/assets/kit/core.js'));
  pass('les deux éléments sans racine', lintScript("customElements.define('k-icon', KIcon); customElements.define('k-figure', KFigure);", '/x/assets/kit/elements.js'));
  pass('min-height sur du texte', lintSheet('.a{font-size:var(--k-fs-body);min-height:44px}', 'ok.css'));
  pass('height fixe sans texte', lintSheet('.dot{width:8px;height:8px}', 'ok.css'));
  fail('data-action dans un gabarit', lintScript("const h = '<button data-action=\"pay\">';", '/x/assets/kit/till.js'), 'K9');
  fail('dataset.action', lintScript('el.dataset.action = "pay";', '/x/assets/kit/till.js'), 'K9');
  fail('verbe en camelCase', lintScript("this.emit('showData');", '/x/assets/kit/dashboard.js'), 'K10');
  fail('verbe avec un point', lintScript("this.emit('k.chart.open');", '/x/assets/kit/dashboard.js'), 'K10');
  fail('action sans k.', lintScript("KiwiActions.on('chart.open', f);", '/x/assets/kit/gallery.js'), 'K10');
  fail('kiwi:action fabriqué ailleurs', lintScript("el.dispatchEvent(new CustomEvent('kiwi:action', {}));", '/x/assets/kit/till.js'), 'K10');
  fail('define hors de core', lintScript("customElements.define('k-x', X);", '/x/assets/kit/till.js'), 'K11');
  fail('define d\'un élément à racine dans elements.js', lintScript("customElements.define('k-button', X);", '/x/assets/kit/elements.js'), 'K11');
  fail('élément sans placeholder', lintPlaceholders([['till.js', "K.define('k-new', X, {});"]], 'k-old:not(:defined){display:block}', 'kit.css'), 'K12');
  pass('placeholder par attribut compte', lintPlaceholders([['x.js', "K.define('k-avatar', X, {});"]], 'k-avatar[size="44"]:not(:defined){width:44px}', 'kit.css'));
  fail('texte à hauteur fixe', lintSheet('.t{font-size:var(--k-fs-body);height:44px}', 'bad.css'), 'K13');
  fail('ligne bornée à hauteur fixe', lintSheet('.t{-webkit-line-clamp:2;height:2.5rem}', 'bad.css'), 'K13');
  return bad;
}

if (require.main === module) {
  const problems = selfTest();
  const r = lintKit();
  problems.push(...r.failures);
  if (problems.length) {
    console.error(`✗ kit-lint : ${problems.length} problème(s)`);
    problems.slice(0, 60).forEach((p) => console.error('  · ' + p));
    process.exit(1);
  }
  console.log(`✓ kit-lint · ${r.files} fichier(s) du kit, 13 règles (étapes 1 et 2), contrôles négatifs vus`);
}

module.exports = { lintSheet, lintScript, lintPlaceholders, lintKit, selfTest };
