#!/usr/bin/env node
'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · token-contrast-test — les jetons 2027 tiennent leurs promesses.
 *
 *   node tools/token-contrast-test.js
 *
 * Porte `token-contrast-test` de docs/specs/kiwi-design-2027.md (§3 ligne 4,
 * §5.3). Il relit assets/kit/tokens-2027.css, résout chaque jeton, et
 *
 *   1 · compare la PALETTE au §5.1 et au §5.2, valeur par valeur ;
 *   2 · RECALCULE chaque rapport de contraste du §5.3 (texte sur surfaces,
 *       remplissages et leurs étiquettes, non-texte, texte sur chrome, les
 *       exemptions nommées) et le compare au tableau du spec, à 2 décimales ;
 *   3 · applique les SEUILS WCAG 2.x que le §5.3 donne (4,5 pour le texte, 3
 *       pour ce qui identifie un contrôle), exemptions nommées comprises ;
 *   4 · vérifie les règles du §5.4 et du §20.7 : le thème se déclare quatre fois
 *       (clair, clair du body, sombre, sombre système) et les quatre se
 *       valent déclaration par déclaration ; aucun jeton sombre ne vaut le
 *       vert de marque ; pas de blanc pur ;
 *   5 · vérifie la COHABITATION avec assets/tokens.css : le fichier ne déclare
 *       que des --k-*, et aucun nom --k-* n'est déclaré ailleurs dans le dépôt ;
 *   6 · vérifie les autres jetons : espace, rayons, élévation, type, grille,
 *       durées, courbes, polices.
 *
 * Méthode (§5.3) : luminance relative WCAG 2.x depuis le hex sRGB, rapports
 * arrondis à 2 décimales. Le chrome translucide est composé en sRGB comme le
 * font les navigateurs : « typique » = sur son propre canevas, « pire cas » =
 * sur du noir pur (clair) ou du blanc pur (sombre).
 *
 * Des CONTRÔLES NÉGATIFS finissent la passe : une palette altérée, un jeton
 * sombre égal à #0B6E4F et un bloc de thème qui dérive doivent être refusés.
 * Un test qui ne sait pas échouer ne garde rien.
 * ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { parse } = require('./kit-css');

const ROOT = path.resolve(__dirname, '..');
const KIT_CSS = path.join(ROOT, 'assets', 'kit', 'tokens-2027.css');

/* ── 1 · le spec, transcrit ───────────────────────────────────────────────── */
const PALETTE_LIGHT = {
  'bg': '#F7F5F0', 'surface-1': '#FFFDFA', 'surface-2': '#EFECE5', 'surface-3': '#E4E0D6',
  'line': '#E2DDD2', 'line-strong': '#8C877C',
  'ink-1': '#0A0F0D', 'ink-2': '#454B47', 'ink-3': '#666B65',
  'accent': '#0B6E4F', 'accent-ink': '#0B6E4F', 'accent-pressed': '#08573E', 'on-accent': '#FFFDFA', 'accent-tint': '#E2EFE8',
  'select': '#FFFDFA',
  'warning': '#8A5300', 'warning-tint': '#FBEBCB', 'warning-solid': '#F0A93E', 'on-warning': '#0A0F0D',
  'danger': '#B42318', 'danger-tint': '#FBE7E4', 'danger-solid': '#B42318', 'on-danger': '#FFFDFA',
  'info': '#2558A8', 'info-tint': '#E5EDF8',
  'inverse': '#1C2320', 'on-inverse': '#F7F5F0', 'inverse-accent': '#5FD9A3', 'inverse-danger': '#FF8A7A',
  'focus': '#0B6E4F',
  'scrim': 'rgba(10,15,13,.32)', 'scrim-push': 'rgba(10,15,13,.08)', 'chrome': 'rgba(247,245,240,.85)',
};
const PALETTE_DARK = {
  'bg': '#0A0D0C', 'surface-1': '#141917', 'surface-2': '#1C2220', 'surface-3': '#262D2A',
  'line': '#29302D', 'line-strong': '#6B746F',
  'ink-1': '#F2F0EA', 'ink-2': '#B3B9B4', 'ink-3': '#848B85',
  'accent': '#3CCB8F', 'accent-ink': '#5FD9A3', 'accent-pressed': '#2FB27C', 'on-accent': '#04140D', 'accent-tint': '#123528',
  'select': '#262D2A',
  'warning': '#F2B85B', 'warning-tint': '#3A2C12', 'warning-solid': '#F0A93E', 'on-warning': '#0A0F0D',
  'danger': '#FF8A7A', 'danger-tint': '#3D1A16', 'danger-solid': '#C8372D', 'on-danger': '#FFFDFA',
  'info': '#8AB4F8', 'info-tint': '#172436',
  'inverse': '#323A36', 'on-inverse': '#F2F0EA', 'inverse-accent': '#5FD9A3', 'inverse-danger': '#FF8A7A',
  'focus': '#7DF2B0',
  'scrim': 'rgba(0,0,0,.56)', 'scrim-push': 'rgba(0,0,0,.30)', 'chrome': 'rgba(20,25,23,.85)',
};

/* §5.3 · texte sur surfaces : [clair bg/s1/s2/s3], [sombre bg/s1/s2/s3] */
const SURFACES = ['bg', 'surface-1', 'surface-2', 'surface-3'];
const TEXT_ON_SURFACES = {
  'ink-1':      { light: [17.73, 19.03, 16.37, 14.66], dark: [17.13, 15.60, 14.19, 12.36] },
  'ink-2':      { light: [8.20, 8.80, 7.57, 6.78],     dark: [9.77, 8.90, 8.09, 7.05] },
  'ink-3':      { light: [5.00, 5.36, 4.62, 4.13],     dark: [5.59, 5.09, 4.63, 4.03] },
  'accent-ink': { light: [5.74, 6.16, 5.30, 4.75],     dark: [11.10, 10.11, 9.19, 8.01] },
  'warning':    { light: [5.81, 6.23, 5.36, 4.80],     dark: [10.95, 9.98, 9.07, 7.90] },
  'danger':     { light: [6.03, 6.47, 5.57, 4.99],     dark: [8.52, 7.76, 7.06, 6.15] },
  'info':       { light: [6.34, 6.80, 5.86, 5.24],     dark: [9.26, 8.44, 7.67, 6.68] },
};
/* ink-3 ne se pose jamais sur s3 sauf en étiquette désactivée, que WCAG 1.4.3
   exempte (4,13 clair, 4,03 sombre). Seule case du tableau sous 4,5. */
const TEXT_EXEMPT = new Set(['ink-3|surface-3']);

/* §5.3 · remplissages et leurs étiquettes */
const FILLS = [
  ['on-accent on accent', 'on-accent', 'accent', 6.16, 9.12],
  ['on-accent on accent-pressed', 'on-accent', 'accent-pressed', 8.47, 7.00],
  ['on-danger on danger-solid', 'on-danger', 'danger-solid', 6.47, 5.12],
  ['on-warning on warning-solid', 'on-warning', 'warning-solid', 9.61, 9.61],
  ['on-inverse on inverse', 'on-inverse', 'inverse', 14.71, 10.27],
  ['inverse-accent on inverse', 'inverse-accent', 'inverse', 9.11, 6.66],
  ['inverse-danger on inverse', 'inverse-danger', 'inverse', 7.00, 5.11],
  ['ink-1 on accent-tint', 'ink-1', 'accent-tint', 16.32, 11.77],
  ['ink-2 on accent-tint', 'ink-2', 'accent-tint', 7.55, 6.72],
  ['accent-ink on accent-tint', 'accent-ink', 'accent-tint', 5.29, 7.63],
  ['ink-1 on warning-tint', 'ink-1', 'warning-tint', 16.42, 11.90],
  ['ink-2 on warning-tint', 'ink-2', 'warning-tint', 7.59, 6.79],
  ['warning on warning-tint', 'warning', 'warning-tint', 5.38, 7.61],
  ['danger on danger-tint', 'danger', 'danger-tint', 5.53, 6.75],
  ['info on info-tint', 'info', 'info-tint', 5.86, 7.42],
  ['ink-1 on select (lens)', 'ink-1', 'select', 19.03, 12.36],
  ['accent-ink on select (selected tab icon)', 'accent-ink', 'select', 6.16, 8.01],
  ['ink-2 on the s2 track', 'ink-2', 'surface-2', 7.57, 8.09],
  ['placeholder: ink-3 on s1 field', 'ink-3', 'surface-1', 5.36, 5.09],
];
/* L'étiquette désactivée (ink-3 sur s3) est exemptée : voir TEXT_EXEMPT. */

/* §5.3 · non-texte : 3:1 là où cela identifie un contrôle ou un état */
const NON_TEXT = [
  ['selection edge vs s2 track', 'line-strong', 'surface-2', 3.03, 3.35],
  ['selection edge vs s1 list', 'line-strong', 'surface-1', 3.52, 3.69],
  ['selection edge vs bg', 'line-strong', 'bg', 3.28, 4.05],
  ['field outline vs bg', 'line-strong', 'bg', 3.28, 4.05],
  ['primary fill vs bg', 'accent', 'bg', 5.74, 9.42],
  ['focus ring vs bg', 'focus', 'bg', 5.74, 14.13],
  ['focus ring vs s1', 'focus', 'surface-1', 6.16, 12.87],
  ['selected-row bar (accent) vs s1', 'accent', 'surface-1', 6.16, 8.58],
  ['KDS late frame (danger-solid) vs s1', 'danger-solid', 'surface-1', 6.47, 3.42],
  ['KDS header divider (line-strong) vs s1', 'line-strong', 'surface-1', 3.52, 3.69],
  ['date-range band edges (line-strong) vs s1', 'line-strong', 'surface-1', 3.52, 3.69],
];

/* §5.3 · texte sur chrome : [typique clair, pire cas clair, typique sombre, pire cas sombre] */
const ON_CHROME = [
  ['ink-1', 'ink-1', 17.73, 12.56, 15.86, 9.90],
  ['ink-2', 'ink-2', 8.20, 5.81, 9.05, 5.65],
  ['accent (light: icon only)', 'accent', 5.74, 4.07, 8.72, 5.45],
  ['accent-ink', 'accent-ink', null, null, 10.28, 6.42],
];
/* Le trait de sélection sur le chrome : typique 3,28 / 3,75 ; pire cas 2,33 / 2,34
   (sous 3:1, dit et porté par la forme, le poids et la couleur, §5.3). */
const EDGE_ON_CHROME = { lightTypical: 3.28, darkTypical: 3.75, lightWorst: 2.33, darkWorst: 2.34 };

/* §5.3 · exemptions nommées */
const EXEMPT = [
  ['hairline vs s1', 'line', 'surface-1', 1.33, 1.32],
  ['hairline vs bg', 'line', 'bg', 1.24, 1.45],
  ['warning-solid vs s1 (light KDS header)', 'warning-solid', 'surface-1', 1.98, null],
  ['inverse vs bg (dark toast boundary)', 'inverse', 'bg', null, 1.67],
];

/* ── 2 · couleur et contraste ─────────────────────────────────────────────── */
function parseColor(v) {
  v = String(v).trim();
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1);
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  return null;
}
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const la = lum(a), lb = lum(b); const [hi, lo] = la > lb ? [la, lb] : [lb, la]; return (hi + 0.05) / (lo + 0.05); };
const r2 = (x) => Math.round(x * 100) / 100;
/* Composition sRGB d'un calque translucide sur un fond opaque, comme un navigateur. */
const over = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1];

/* ── 3 · lecture du fichier ───────────────────────────────────────────────── */
const sheet = parse(fs.readFileSync(KIT_CSS, 'utf8'));
const declMap = (rules) => {
  const m = new Map();
  for (const r of rules) for (const d of r.decls) m.set(d.prop, d.value);
  return m;
};
const sel = (r, s) => r.selectors.length === s.length && s.every((x, i) => r.selectors[i] === x);
const pick = (at, ...s) => sheet.rules.filter((r) => (r.at || null) === at && sel(r, s));

const rootRules = pick(null, ':root');
const blocks = {
  root: declMap(rootRules),
  lightBody: declMap(pick(null, 'body[data-vexel-mode="light"]')),
  dark: declMap(pick(null, ':root[data-theme="dark"]', 'body[data-vexel-mode="dark"]')),
  darkSystem: declMap(pick('@media (prefers-color-scheme: dark)', ':root:not([data-theme="light"])')),
  contrast: declMap(pick('@media (prefers-contrast: more)', ':root:root:root', 'body[data-vexel-mode][data-vexel-mode]')),
};
const themedKeys = [...blocks.dark.keys()];

/* Résout var(--x[, repli]) dans un bloc ; `base` sert aux jetons que le bloc ne redéclare pas. */
function resolve(block, name, base = new Map(), depth = 0) {
  if (depth > 8) throw new Error('boucle de var() sur ' + name);
  let v = block.has(name) ? block.get(name) : base.get(name);
  if (v === undefined) return undefined;
  const m = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]*))?\)$/i.exec(v);
  if (m) {
    const r = resolve(block, m[1], base, depth + 1);
    return r === undefined ? (m[2] || '').trim() : r;
  }
  return v;
}
const SETS = {
  light: { block: blocks.root, base: new Map(), palette: PALETTE_LIGHT },
  dark: { block: blocks.dark, base: blocks.root, palette: PALETTE_DARK },
};
const tok = (theme, name) => resolve(SETS[theme].block, '--k-' + name, SETS[theme].base);
const colorOf = (theme, name) => {
  const c = parseColor(tok(theme, name));
  if (!c) throw new Error(`--k-${name} (${theme}) : « ${tok(theme, name)} » n'est pas une couleur`);
  return c;
};

/* ── 4 · assertions ───────────────────────────────────────────────────────── */
let passed = 0;
const failed = [];
const ok = (label, cond, detail) => { if (cond) passed++; else failed.push(detail ? `${label} · ${detail}` : label); };

function runAll(opts = {}) {
  const get = opts.colorOf || colorOf;
  const T = opts.tok || tok;

  /* 4a · palette §5.1 / §5.2 */
  for (const theme of ['light', 'dark']) {
    for (const [name, want] of Object.entries(SETS[theme].palette)) {
      const got = T(theme, name);
      const norm = (s) => String(s).replace(/\s+/g, '').toLowerCase();
      ok(`${theme} · --k-${name} = ${want}`, got !== undefined && norm(got) === norm(want), `le fichier dit « ${got} »`);
    }
  }

  /* 4b · texte sur surfaces */
  for (const [fg, rows] of Object.entries(TEXT_ON_SURFACES)) {
    for (const theme of ['light', 'dark']) {
      SURFACES.forEach((s, i) => {
        const got = r2(ratio(get(theme, fg), get(theme, s)));
        const want = rows[theme][i];
        ok(`${theme} · ${fg} sur ${s} = ${want.toFixed(2)}`, got === want, `calculé ${got.toFixed(2)}`);
        if (!TEXT_EXEMPT.has(`${fg}|${s}`)) ok(`${theme} · ${fg} sur ${s} >= 4,5`, got >= 4.5, `calculé ${got.toFixed(2)}`);
        else ok(`${theme} · ${fg} sur ${s} (exempt, étiquette désactivée) >= 4,0`, got >= 4.0, `calculé ${got.toFixed(2)}`);
      });
    }
  }
  /* ink-2 et ink-3 se distinguent (§5.3) : 1,64:1 en clair, 1,75:1 en sombre. */
  ok('clair · ink-2 / ink-3 sur bg = 1,64:1', r2(8.20 / 5.00) === 1.64 && r2(ratio(get('light', 'ink-2'), get('light', 'bg')) / ratio(get('light', 'ink-3'), get('light', 'bg'))) >= 1.6);
  ok('sombre · ink-2 / ink-3 sur bg = 1,75:1', r2(ratio(get('dark', 'ink-2'), get('dark', 'bg')) / ratio(get('dark', 'ink-3'), get('dark', 'bg'))) >= 1.7);

  /* 4c · remplissages */
  for (const [label, fg, bg, light, dark] of FILLS) {
    for (const [theme, want] of [['light', light], ['dark', dark]]) {
      const got = r2(ratio(get(theme, fg), get(theme, bg)));
      ok(`${theme} · ${label} = ${want.toFixed(2)}`, got === want, `calculé ${got.toFixed(2)}`);
      ok(`${theme} · ${label} >= 4,5`, got >= 4.5, `calculé ${got.toFixed(2)}`);
    }
  }

  /* 4d · non-texte */
  for (const [label, a, b, light, dark] of NON_TEXT) {
    for (const [theme, want] of [['light', light], ['dark', dark]]) {
      const got = r2(ratio(get(theme, a), get(theme, b)));
      ok(`${theme} · ${label} = ${want.toFixed(2)}`, got === want, `calculé ${got.toFixed(2)}`);
      ok(`${theme} · ${label} >= 3`, got >= 3, `calculé ${got.toFixed(2)}`);
    }
  }

  /* 4e · chrome : typique (sur son canevas) et pire cas (noir pur / blanc pur) */
  for (const theme of ['light', 'dark']) {
    const chrome = get(theme, 'chrome');
    ok(`${theme} · le chrome est translucide`, chrome[3] > 0 && chrome[3] < 1);
    const typical = over(chrome, get(theme, 'bg'));
    const worst = over(chrome, theme === 'light' ? [0, 0, 0] : [255, 255, 255]);
    ON_CHROME.forEach(([label, fg, lt, lw, dt, dw]) => {
      const [wt, ww] = theme === 'light' ? [lt, lw] : [dt, dw];
      if (wt === null) return;
      const gt = r2(ratio(get(theme, fg), typical)), gw = r2(ratio(get(theme, fg), worst));
      ok(`${theme} · ${label} sur chrome, typique = ${wt.toFixed(2)}`, gt === wt, `calculé ${gt.toFixed(2)}`);
      ok(`${theme} · ${label} sur chrome, pire cas = ${ww.toFixed(2)}`, gw === ww, `calculé ${gw.toFixed(2)}`);
      ok(`${theme} · ${label} sur chrome, pire cas >= 4,0`, gw >= 4.0, `calculé ${gw.toFixed(2)}`);
    });
    const et = r2(ratio(get(theme, 'line-strong'), typical)), ew = r2(ratio(get(theme, 'line-strong'), worst));
    ok(`${theme} · trait de sélection sur chrome, typique = ${EDGE_ON_CHROME[theme + 'Typical'].toFixed(2)}`, et === EDGE_ON_CHROME[theme + 'Typical'], `calculé ${et.toFixed(2)}`);
    ok(`${theme} · trait de sélection sur chrome, typique >= 3`, et >= 3);
    ok(`${theme} · trait de sélection sur chrome, pire cas = ${EDGE_ON_CHROME[theme + 'Worst'].toFixed(2)}`, ew === EDGE_ON_CHROME[theme + 'Worst'], `calculé ${ew.toFixed(2)}`);
    /* Le spec le dit sous 3:1 et le porte par la forme : on refuse qu'il en dépende seul. */
    ok(`${theme} · trait de sélection, pire cas : sous 3:1 comme le dit le §5.3`, ew < 3);
  }

  /* 4f · exemptions nommées */
  for (const [label, a, b, light, dark] of EXEMPT) {
    for (const [theme, want] of [['light', light], ['dark', dark]]) {
      if (want === null) continue;
      const got = r2(ratio(get(theme, a), get(theme, b)));
      ok(`${theme} · exemption : ${label} = ${want.toFixed(2)}`, got === want, `calculé ${got.toFixed(2)}`);
    }
  }
  /* Le texte de la bascule sombre (toast) tient 10,27:1 : déjà dans FILLS. */
}

runAll();

/* 4g · Le thème : quatre blocs qui se valent (§20.7) */
{
  const eq = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
  const themedLight = new Map(themedKeys.map((k) => [k, blocks.root.get(k)]));
  ok('thème · le bloc clair du :root porte tous les jetons du bloc sombre', themedKeys.every((k) => blocks.root.has(k)), themedKeys.filter((k) => !blocks.root.has(k)).join(', '));
  ok('thème · body[data-vexel-mode="light"] redéclare exactement le jeu clair', eq(blocks.lightBody, themedLight),
    `${blocks.lightBody.size} déclarations contre ${themedLight.size}`);
  ok('thème · @media (prefers-color-scheme: dark) porte exactement le jeu sombre', eq(blocks.darkSystem, blocks.dark),
    `${blocks.darkSystem.size} déclarations contre ${blocks.dark.size}`);
  ok('thème · color-scheme suit le jeu (clair / sombre)', blocks.root.get('color-scheme') === 'light' && blocks.lightBody.get('color-scheme') === 'light'
    && blocks.dark.get('color-scheme') === 'dark' && blocks.darkSystem.get('color-scheme') === 'dark');
  const invariants = [...blocks.root.keys()].filter((k) => !themedKeys.includes(k));
  ok('thème · le jeu sombre ne touche à aucun jeton invariant (espace, type, mouvement…)', invariants.every((k) => !blocks.dark.has(k)));
  /* Le jeu thématisé : couleur, élévation, liserés. Tout le reste est invariant. */
  const NON_THEMED_OK = /^--k-(font|space-|r-|fs-|lh-|track-|fw-|grid-|chrome-filter|focus-w|select-edge-w|dur-|lens-stretch|spring|glide|exit)/;
  ok('thème · chaque jeton thématisé est une couleur, une ombre, un liseré ou color-scheme',
    themedKeys.every((k) => k === 'color-scheme' || (k.startsWith('--k-') && !NON_THEMED_OK.test(k))), themedKeys.filter((k) => k !== 'color-scheme' && NON_THEMED_OK.test(k)).join(', '));
  ok('thème · le contraste accru passe devant toutes les règles de thème (sélecteurs renforcés)', blocks.contrast.size >= 6);
  /* Contraste accru : --k-line devient line-strong, ink-3 devient ink-2, chrome plein, bord 2 px, anneau 3 px. */
  ok('contraste accru · --k-line = --k-line-strong', blocks.contrast.get('--k-line') === 'var(--k-line-strong)');
  ok('contraste accru · --k-ink-3 = --k-ink-2', blocks.contrast.get('--k-ink-3') === 'var(--k-ink-2)');
  ok('contraste accru · le chrome devient plein (surface-1) et perd son filtre', blocks.contrast.get('--k-chrome') === 'var(--k-surface-1)' && blocks.contrast.get('--k-chrome-filter') === 'none');
  ok('contraste accru · bord de sélection 2 px, anneau de focus 3 px', blocks.contrast.get('--k-select-edge-w') === '2px' && blocks.contrast.get('--k-focus-w') === '3px');
  ok('base · bord de sélection 1 px, anneau de focus 2 px (§10.0)', blocks.root.get('--k-select-edge-w') === '1px' && blocks.root.get('--k-focus-w') === '2px');
}

/* 4h · §5.4 et marque */
{
  const darkValues = [...blocks.dark.entries()].filter(([k]) => k.startsWith('--k-')).map(([k]) => ({ k, v: tok('dark', k.slice(4)) }));
  const green = darkValues.filter(({ v }) => v && String(v).toUpperCase() === '#0B6E4F');
  ok('sombre · aucun jeton ne vaut #0B6E4F (§5.2)', green.length === 0, green.map((g) => g.k).join(', '));
  ok('clair · --k-bg est le papier #F7F5F0, jamais du blanc pur (CLAUDE.md §4)', tok('light', 'bg').toUpperCase() === '#F7F5F0');
  const css = fs.readFileSync(KIT_CSS, 'utf8');
  ok('le fichier ne contient aucun blanc pur (#fff, #ffffff)', !/#(?:fff|ffffff)\b/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('le fichier ne contient ni tiret cadratin ni italique', !/—/.test(css) && !/font-style\s*:\s*italic/i.test(css));
  ok('le fichier ne contient aucun !important', !/!\s*important/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('le fichier ne contient aucune règle imbriquée (CSS nesting, §4.1)', sheet.nested.length === 0, sheet.nested.map((n) => n.selector).join(' ; '));
  ok('le fichier n\'emploie pas color-mix() (§4.1)', !/color-mix\(/i.test(css));
}

/* ── 5 · cohabitation avec assets/tokens.css ─────────────────────────────── */
{
  const allowedStd = new Set(['color-scheme', 'font-size']);
  const strangers = [];
  for (const r of sheet.rules) for (const d of r.decls) {
    if (d.prop.startsWith('--k-')) continue;
    if (allowedStd.has(d.prop)) continue;
    strangers.push(`${d.prop} (ligne ${d.line})`);
  }
  ok('cohabitation · le fichier ne déclare que des --k-* (et color-scheme)', strangers.length === 0, strangers.join(', '));
  const fsDecls = sheet.rules.flatMap((r) => r.decls.filter((d) => d.prop === 'font-size').map((d) => ({ r, d })));
  ok('cohabitation · la seule racine posée est html[data-k-surface="kds"] (§6.2)', fsDecls.length === 1 && fsDecls[0].r.selector === 'html[data-k-surface="kds"]');
  const bad = sheet.rules.filter((r) => /\b(?:body|html)\b(?!\[)/.test(r.selector) && !/\[(?:lang|data-k-surface)=/.test(r.selector) && !/body\[data-vexel-mode/.test(r.selector));
  ok('cohabitation · aucun sélecteur d\'élément nu qui fuirait dans une page', bad.length === 0, bad.map((b) => b.selector).join(' ; '));

  /* Aucun nom --k-* n'est déclaré ailleurs que dans le kit. */
  const SKIP = new Set(['node_modules', '.git', '.claude', '.kiwi', 'docs', 'graphify-out', '.wrangler', 'kit']);
  const stray = [];
  const walk = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') && e.name !== '.') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP.has(e.name) || depth > 4) continue;
        if (!['', 'assets', 'app', 'tools', 'functions', 'bridge'].includes(path.relative(ROOT, dir).split(path.sep)[0]) && dir !== ROOT) continue;
        walk(p, depth + 1);
      } else if (/\.(?:css|html|js|mjs)$/.test(e.name) && !/ \d+\.[a-z]+$/i.test(e.name)) {
        if (path.relative(ROOT, p).startsWith(path.join('tools', ''))) continue;
        let txt; try { txt = fs.readFileSync(p, 'utf8'); } catch (_) { continue; }
        if (txt.length > 6e6) continue;
        const re = /(^|[\s;{"'`])(--k-[a-z0-9-]+)\s*:/g;
        let m;
        while ((m = re.exec(txt))) stray.push(`${path.relative(ROOT, p)} déclare ${m[2]}`);
      }
    }
  };
  walk(ROOT, 0);
  ok('cohabitation · aucun --k-* n\'est déclaré hors de assets/kit/', stray.length === 0, stray.slice(0, 5).join(' ; '));
  const legacy = fs.readFileSync(path.join(ROOT, 'assets', 'tokens.css'), 'utf8');
  ok('cohabitation · assets/tokens.css ne déclare aucun nom du kit', !/--k-[a-z]/.test(legacy));
}

/* ── 6 · les autres jetons ────────────────────────────────────────────────── */
{
  const R = blocks.root;
  const eqAll = (label, expected) => {
    for (const [k, v] of Object.entries(expected)) ok(`${label} · ${k} = ${v}`, R.get(k) === v, `le fichier dit « ${R.get(k)} »`);
  };
  eqAll('espace (§7.1)', { '--k-space-1': '4px', '--k-space-2': '8px', '--k-space-3': '12px', '--k-space-4': '16px', '--k-space-5': '20px', '--k-space-6': '24px', '--k-space-8': '32px', '--k-space-10': '40px', '--k-space-12': '48px', '--k-space-16': '64px' });
  ok('espace · aucun autre --k-space-*', [...R.keys()].filter((k) => k.startsWith('--k-space-')).length === 10);
  eqAll('rayons (§7.3)', { '--k-r-1': '8px', '--k-r-2': '12px', '--k-r-3': '20px', '--k-r-4': '28px' });
  ok('rayons · aucun autre --k-r-*', [...R.keys()].filter((k) => k.startsWith('--k-r-')).length === 4);
  eqAll('durées (§14.1)', { '--k-dur-1': '90ms', '--k-dur-2': '160ms', '--k-dur-3': '240ms', '--k-lens-stretch': '115ms', '--k-dur-4': '310ms', '--k-dur-5': '350ms', '--k-dur-6': '400ms', '--k-dur-7': '600ms', '--k-dur-8': '1100ms', '--k-dur-9': '1200ms', '--k-dur-toast': '4000ms', '--k-dur-toast-action': '8000ms' });
  ok('durées · aucune autre durée', [...R.keys()].filter((k) => /^--k-(dur-|lens-stretch)/.test(k)).length === 12);
  eqAll('courbes (§14.2)', { '--k-spring': 'cubic-bezier(0.34, 1.45, 0.5, 1)', '--k-glide': 'cubic-bezier(0.32, 0.72, 0, 1)', '--k-exit': 'cubic-bezier(0.4, 0, 1, 1)' });
  eqAll('type (§6.2) · pas', {
    '--k-fs-display': 'calc(2.75rem * var(--type-scale, 1))', '--k-fs-title': 'calc(1.75rem * var(--type-scale, 1))',
    '--k-fs-heading': 'calc(1.25rem * var(--type-scale, 1))', '--k-fs-body': 'calc(1.0625rem * var(--type-scale, 1))',
    '--k-fs-callout': 'calc(0.9375rem * var(--type-scale, 1))', '--k-fs-footnote': 'calc(0.8125rem * var(--type-scale, 1))',
  });
  ok('type · six pas, pas un de plus (§6.2)', [...R.keys()].filter((k) => k.startsWith('--k-fs-')).length === 6);
  eqAll('type (§6.2) · interlignes latin', { '--k-lh-display': '1.05', '--k-lh-title': '1.15', '--k-lh-heading': '1.25', '--k-lh-body': '1.4', '--k-lh-callout': '1.35', '--k-lh-footnote': '1.35' });
  eqAll('type (§6.1) · approche latin', { '--k-track-display': '-0.02em', '--k-track-title': '-0.01em', '--k-track-heading': '0', '--k-track-body': '0.01em', '--k-track-callout': '0.01em', '--k-track-footnote': '0.015em' });
  eqAll('type (§6.2) · graisses', { '--k-fw-display': '600', '--k-fw-title': '600', '--k-fw-heading': '600', '--k-fw-body': '400', '--k-fw-body-strong': '600', '--k-fw-callout': '500', '--k-fw-callout-strong': '600', '--k-fw-footnote': '500', '--k-fw-footnote-strong': '600' });
  ok('type · seules graisses 400, 500, 600 (700 est réservé à Bold Text)', [...R.entries()].filter(([k]) => k.startsWith('--k-fw-')).every(([, v]) => ['400', '500', '600'].includes(v)));
  /* Arabe : html[lang="ar"] remplace interlignes et met l'approche à 0 (§6.2, §20.2). */
  const ar = declMap(pick(null, 'html[lang="ar"]'));
  const AR_LH = { display: '1.25', title: '1.35', heading: '1.4', body: '1.6', callout: '1.5', footnote: '1.5' };
  for (const [s, v] of Object.entries(AR_LH)) ok(`arabe · --k-lh-${s} = ${v}`, ar.get('--k-lh-' + s) === v);
  for (const s of Object.keys(AR_LH)) ok(`arabe · --k-track-${s} = 0`, ar.get('--k-track-' + s) === '0');
  ok('arabe · les jetons d\'approche latins sont tous remplacés', [...R.keys()].filter((k) => k.startsWith('--k-track-')).every((k) => ar.get(k) === '0'));
  ok('polices · --k-font est la pile du §6.1, dans cet ordre',
    R.get('--k-font') === '"Inter Tight", "Kiwi Arabic", "Inter Tight Fallback", system-ui', `le fichier dit « ${R.get('--k-font')} »`);
  /* Matières, élévation. */
  eqAll('matières (§7.5)', { '--k-chrome-filter': 'blur(24px) saturate(180%)' });
  const L = blocks.root, D = blocks.dark;
  ok('élévation · niveau 1 : une ombre en clair, aucune en sombre (§7.4)', /^0 1px 2px/.test(L.get('--k-shadow-1')) && D.get('--k-shadow-1') === 'none');
  ok('élévation · niveau 2 sombre : 0 8px 24px rgba(0,0,0,.5)', D.get('--k-shadow-2') === '0 8px 24px rgba(0, 0, 0, .5)');
  ok('élévation · niveau 3 : ombre vers le haut', /^0 -4px 16px/.test(L.get('--k-shadow-3')) && D.get('--k-shadow-3') === '0 -16px 48px rgba(0, 0, 0, .6)');
  ok('élévation · popover : surface-1 en clair, surface-3 en sombre', L.get('--k-popover') === 'var(--k-surface-1)' && D.get('--k-popover') === 'var(--k-surface-3)');
  ok('élévation · liserés du chrome et du toast : sombre seulement (line, line-strong)', L.get('--k-chrome-edge') === 'transparent' && L.get('--k-toast-edge') === 'transparent'
    && D.get('--k-chrome-edge') === 'var(--k-line)' && D.get('--k-toast-edge') === 'var(--k-line-strong)');
  /* Grille (§7.2) : valeurs par classe de largeur. */
  const media = (q) => declMap(pick(`@media (min-width: ${q}px)`, ':root'));
  ok('grille · compact (< 402) : marge 16, 4 colonnes, gouttière 12', R.get('--k-grid-margin') === '16px' && R.get('--k-grid-cols') === '4' && R.get('--k-grid-gap') === '12px');
  ok('grille · compact (>= 402) : marge 20', media(402).get('--k-grid-margin') === '20px');
  const m600 = media(600);
  ok('grille · medium (>= 600) : marge 24, 8 colonnes, gouttière 16', m600.get('--k-grid-margin') === '24px' && m600.get('--k-grid-cols') === '8' && m600.get('--k-grid-gap') === '16px');
  ok('grille · expanded (>= 1024) : 12 colonnes', media(1024).get('--k-grid-cols') === '12');
  const m1440 = media(1440);
  ok('grille · wide (>= 1440) : marge 32, gouttière 24, contenu 1200 au plus', m1440.get('--k-grid-margin') === '32px' && m1440.get('--k-grid-gap') === '24px' && m1440.get('--k-grid-max') === '1200px');
  const kds = declMap(pick(null, 'html[data-k-surface="kds"]'));
  ok('grille · cuisine : marge 24, gouttière 16, sans plafond ; racine 24 px par défaut (§13.6)',
    kds.get('--k-grid-margin') === '24px' && kds.get('--k-grid-gap') === '16px' && kds.get('--k-grid-max') === 'none' && kds.get('font-size') === 'var(--k-kds-root, 24px)');
}

/* ── 7 · polices (§6.1) : les seules @font-face du kit ───────────────────── */
{
  const faces = sheet.fontFaces.map((f) => Object.fromEntries(f.decls.map((d) => [d.prop, d.value])));
  const byFamily = (fam) => faces.filter((f) => f['font-family'] === `"${fam}"`);
  const inter = byFamily('Inter Tight'), plex = byFamily('Kiwi Arabic'), fb = byFamily('Inter Tight Fallback');
  ok('polices · 2 faces Inter Tight, 4 faces Kiwi Arabic, 1 visage de secours', inter.length === 2 && plex.length === 4 && fb.length === 1, `${inter.length} / ${plex.length} / ${fb.length}`);
  ok('polices · rien d\'autre : toute @font-face est de l\'une de ces trois familles', faces.length === 7);
  ok('polices · Inter Tight : variable 100 à 900, roman, swap', inter.every((f) => f['font-weight'] === '100 900' && f['font-style'] === 'normal' && f['font-display'] === 'swap'));
  ok('polices · Inter Tight : latin étendu AVANT latin, comme fontsource', /latin-ext\.woff2/.test(inter[0] && inter[0].src) && /inter-tight-latin\.woff2/.test(inter[1] && inter[1].src));
  ok('polices · Kiwi Arabic : 400, 500, 600 et 700, size-adjust 108 %, swap',
    plex.map((f) => f['font-weight']).join() === '400,500,600,700' && plex.every((f) => f['size-adjust'] === '108%' && f['font-display'] === 'swap' && f['font-style'] === 'normal'));
  const ARABIC = 'U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF';
  ok('polices · Kiwi Arabic : plages arabes seulement', plex.every((f) => f['unicode-range'] === ARABIC));
  const f0 = fb[0] || {};
  ok('polices · visage de secours : local("Arial"), 97 %, ascent 99,9 %, descent 24,9 %, line-gap 0 %',
    f0.src === 'local("Arial")' && f0['size-adjust'] === '97%' && f0['ascent-override'] === '99.9%' && f0['descent-override'] === '24.9%' && f0['line-gap-override'] === '0%');
  const ranges = (s) => new Set(String(s || '').split(',').map((x) => x.trim()).filter(Boolean));
  const union = new Set([...ranges(inter[0] && inter[0]['unicode-range']), ...ranges(inter[1] && inter[1]['unicode-range'])]);
  const fbr = ranges(f0['unicode-range']);
  ok('polices · la plage du secours est l\'union des deux plages d\'Inter Tight (§6.1)', fbr.size === union.size && [...union].every((r) => fbr.has(r)), `${fbr.size} plages contre ${union.size}`);
  /* Plages en intervalles : l'arabe de Kiwi Arabic et le secours ne se recouvrent qu'en U+FEFF, une
     espace insécable de largeur nulle que le fichier latin porte (§6.1), jamais une lettre. */
  const interval = (r) => { const m = /^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/i.exec(r); return m ? [parseInt(m[1], 16), parseInt(m[2] || m[1], 16)] : null; };
  const arabic = ARABIC.split(',').map((x) => interval(x.trim()));
  const clash = new Set();
  for (const r of fbr) { const [a, b] = interval(r); for (const [c, d] of arabic) for (let cp = Math.max(a, c); cp <= Math.min(b, d); cp++) clash.add(cp); }
  ok('polices · le secours ne réclame aucune lettre arabe (seul U+FEFF est commun, §6.1)', clash.size === 1 && clash.has(0xFEFF), [...clash].slice(0, 5).map((c) => c.toString(16)).join(' '));
  const urls = [...inter, ...plex].map((f) => (/url\("([^"]+)"\)/.exec(f.src) || [])[1]);
  ok('polices · chaque url() est « ../fonts/<fichier>.woff2?v=N » (§21.3)', urls.every((u) => /^\.\.\/fonts\/[a-z0-9-]+\.woff2\?v=\d+$/.test(u || '')), urls.join(' '));
  const fontsDir = path.join(ROOT, 'assets', 'fonts');
  if (fs.existsSync(fontsDir)) {
    const missing = urls.filter((u) => u && !fs.existsSync(path.join(fontsDir, u.replace(/^\.\.\/fonts\//, '').replace(/\?.*$/, ''))));
    ok('polices · chaque fichier cité existe dans assets/fonts/', missing.length === 0, missing.join(', '));
  } else {
    console.log('  ○ assets/fonts/ n\'existe pas encore (livré par la tranche « polices ») : l\'existence des fichiers n\'est pas vérifiée ici');
  }
}

/* ── 8 · contrôles négatifs ───────────────────────────────────────────────── */
{
  /* Un test qui ne sait pas échouer ne garde rien : trois altérations, trois refus. */
  const before = failed.length;
  const realPassed = passed;

  /* a) une palette altérée : ink-3 clair éclairci jusqu'à passer sous 4,5 sur s1 */
  const tweaked = (theme, name) => (theme === 'light' && name === 'ink-3') ? '#8A8F89' : tok(theme, name);
  const tweakedColor = (theme, name) => parseColor(tweaked(theme, name));
  runAll({ tok: tweaked, colorOf: tweakedColor });
  const caughtA = failed.length > before;
  failed.length = before; passed = realPassed;
  ok('contrôle négatif · une ink-3 éclaircie est refusée', caughtA);

  /* b) un jeton sombre égal au vert de marque */
  const darkTok = (theme, name) => (theme === 'dark' && name === 'accent') ? '#0B6E4F' : tok(theme, name);
  const flagged = ['accent', 'accent-ink'].map((n) => darkTok('dark', n)).some((v) => v.toUpperCase() === '#0B6E4F');
  ok('contrôle négatif · un jeton sombre à #0B6E4F est vu', flagged);

  /* c) un bloc de thème qui dérive : le jeu sombre système perd un jeton */
  const drift = new Map(blocks.darkSystem); drift.delete('--k-info');
  const same = drift.size === blocks.dark.size && [...drift].every(([k, v]) => blocks.dark.get(k) === v);
  ok('contrôle négatif · un bloc de thème auquel il manque un jeton est vu', !same);

  /* d) une règle imbriquée et une propriété étrangère sont vues par le lecteur */
  ok('contrôle négatif · le lecteur voit une règle imbriquée', parse('a{b:c;d{e:f}}').nested.length === 1);
}

if (failed.length) {
  console.error(`✗ token-contrast-test : ${failed.length} échec(s) sur ${passed + failed.length}`);
  failed.slice(0, 60).forEach((f) => console.error('  · ' + f));
  process.exit(1);
}
console.log(`✓ token-contrast-test · ${passed} vérifications : palette, contraste du §5.3 recalculé, thème, cohabitation, jetons`);
