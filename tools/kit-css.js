'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · kit-css.js — un lecteur de CSS minuscule, partagé par les gardes du kit.
 *
 * token-contrast-test, type-steps-lint et kit-lint lisent le même fichier
 * (assets/kit/tokens-2027.css) et les mêmes feuilles. Chacun avec sa propre
 * regex finit par lire autre chose que les autres ; un seul lecteur, donc.
 *
 * Zéro dépendance. Ce n'est PAS un parseur CSS complet : il connaît les règles
 * de style, @media / @supports / @layer / @container (récursion), @font-face
 * (déclarations à part), les autres at-règles (@keyframes… sautées), les
 * commentaires, les chaînes, les parenthèses (« ; » dans url(data:…)), et il
 * signale une règle imbriquée (CSS nesting), que le kit refuse (§4.1).
 *
 *   parse(css) → { rules, fontFaces, nested }
 *     rules     [{ selector, selectors[], at, decls:[{prop,value,important,line}], line }]
 *     fontFaces [{ decls:[{prop,value,line}], line }]
 *     nested    [{ selector, line }]   règle de style dans une règle de style
 *   cssInJs(js) → [{ css, line }]      les gabarits `…` qui ressemblent à du CSS
 * ═══════════════════════════════════════════════════════════════════════════ */

const CONTAINERS = new Set(['media', 'supports', 'layer', 'container', 'document', 'scope']);

function blankComments(src) {
  /* On garde les retours à la ligne : les numéros de ligne restent vrais. */
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

function parse(css) {
  const src = blankComments(String(css));
  /* Débuts de ligne, calculés une fois : un décompte naïf serait quadratique. */
  const starts = [0];
  for (let k = 0; k < src.length; k++) if (src.charCodeAt(k) === 10) starts.push(k + 1);
  const lineOf = (idx) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };

  const out = { rules: [], fontFaces: [], nested: [] };
  let i = 0;
  const n = src.length;

  /* Avance jusqu'au premier de `stops` hors chaîne et hors parenthèses. */
  function scan(stops) {
    let depth = 0, quote = null;
    for (; i < n; i++) {
      const c = src[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '(') { depth++; continue; }
      if (c === ')') { if (depth) depth--; continue; }
      if (!depth && stops.includes(c)) return c;
    }
    return null;
  }
  function skipBalanced() { /* i est sur « { » */
    let depth = 0, quote = null;
    for (; i < n; i++) {
      const c = src[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (!depth) { i++; return; } }
    }
  }
  function decl(text, at) {
    const k = text.indexOf(':');
    if (k < 0) return null;
    let prop = text.slice(0, k).trim();
    let value = text.slice(k + 1).trim();
    if (!prop) return null;
    if (!prop.startsWith('--')) prop = prop.toLowerCase();
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
    return { prop, value, important, line: lineOf(at) };
  }
  /* Lit le contenu d'un bloc de déclarations ; i est juste après « { ». */
  function declarations(selector, selLine, isRule) {
    const decls = [];
    for (;;) {
      while (i < n && /\s/.test(src[i])) i++;
      if (i >= n) break;
      if (src[i] === '}') { i++; break; }
      const startAt = i;
      const stop = scan([';', '{', '}']);
      if (stop === '{') {
        if (isRule) out.nested.push({ selector: (selector + ' > ' + src.slice(startAt, i).trim()).slice(0, 120), line: lineOf(startAt) });
        skipBalanced();
        continue;
      }
      const text = src.slice(startAt, i);
      if (stop === ';') i++;
      const d = decl(text, startAt);
      if (d) decls.push(d);
      if (stop === '}' || stop === null) { if (stop === '}') i++; break; }
    }
    return decls;
  }
  function list(container) {
    for (;;) {
      while (i < n && /\s/.test(src[i])) i++;
      if (i >= n) return;
      if (src[i] === '}') { i++; if (container !== null) return; continue; }
      const startAt = i;
      const stop = scan(['{', ';', '}']);
      const prelude = src.slice(startAt, i).trim();
      if (stop === null) return;
      if (stop === ';') { i++; continue; }          /* @import, @charset… */
      if (stop === '}') continue;
      i++;                                           /* après « { » */
      if (prelude.startsWith('@')) {
        const name = (/^@([a-z-]+)/i.exec(prelude) || [])[1] || '';
        const bare = name.toLowerCase().replace(/^-\w+-/, '');
        if (bare === 'font-face') { out.fontFaces.push({ decls: declarations('@font-face', lineOf(startAt), false), line: lineOf(startAt) }); }
        else if (CONTAINERS.has(bare)) {
          const before = out.rules.length;
          list(prelude);
          for (let k = before; k < out.rules.length; k++) if (!out.rules[k].at) out.rules[k].at = prelude;
        } else { i--; skipBalanced(); }
        continue;
      }
      const selectors = splitSelectors(prelude);
      out.rules.push({ selector: prelude, selectors, at: null, decls: declarations(prelude, lineOf(startAt), true), line: lineOf(startAt) });
    }
  }
  list(null);
  return out;
}

/* Sépare « a, b:not(c, d) » sur les virgules de premier niveau. */
function splitSelectors(s) {
  const parts = []; let depth = 0, cur = '', quote = null;
  for (const c of s) {
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ',' && !depth) { parts.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/* Les gabarits d'un fichier JS qui portent du CSS (composants du kit, étape 2).
 * Un gabarit compte s'il a au moins un « { … : … ; » : assez pour ne pas lire
 * du HTML ni des phrases. Les ${…} deviennent 0 (une valeur, pas du CSS). */
function cssInJs(js) {
  const found = [];
  const re = /`((?:\\[\s\S]|[^`\\])*)`/g;
  let m;
  while ((m = re.exec(js))) {
    const body = m[1].replace(/\$\{[^}]*\}/g, '0');
    if (/\{[^{}]*:[^{}]*;?[^{}]*\}/.test(body) && /[a-z-]+\s*:\s*[^;{}]+[;}]/i.test(body)) {
      let line = 1;
      for (let k = 0; k < m.index; k++) if (js.charCodeAt(k) === 10) line++;
      found.push({ css: body, line });
    }
  }
  return found;
}

/* Les fichiers du kit : assets/kit/, récursivement (sauf les copies iCloud « x 2.js »). */
function kitFiles(root, exts) {
  const fs = require('fs'), path = require('path');
  const base = path.join(root, 'assets', 'kit');
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
      else if (exts.includes(path.extname(e.name)) && !/ \d+\.[a-z]+$/i.test(e.name)) out.push(p);
    }
  };
  walk(base);
  return out.sort();
}

/* Retire les commentaires d'un fichier JS sans toucher aux chaînes (assez fin
 * pour des gardes : « // » dans une URL de chaîne est conservé). */
function stripJsComments(js) {
  let out = '', i = 0, quote = null;
  const n = js.length;
  while (i < n) {
    const c = js[i], d = js[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += js[i + 1] || ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; i++; continue; }
    if (c === '/' && d === '/') { while (i < n && js[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(js[i] === '*' && js[i + 1] === '/')) { if (js[i] === '\n') out += '\n'; i++; } i += 2; continue; }
    out += c; i++;
  }
  return out;
}

module.exports = { parse, cssInJs, splitSelectors, blankComments, kitFiles, stripJsComments };
