#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · motion-lint: spec §14.4: "motion-lint fails a transition or animation
 * on any property outside transform, opacity and the three exceptions."
 *
 *   node tools/motion-lint.js                  lint assets/kit/** (the kit)
 *   node tools/motion-lint.js a.css b.js ...   lint exactly these files
 *
 * What it enforces, in kit CSS and kit JS (the shipped surfaces are not linted
 * here; they leave with their stages):
 *
 *  1. PROPERTIES. A transition, an animation or a keyframe may touch only
 *       transform, opacity (and -webkit-transform);
 *       the three named exceptions of §14.4:
 *         (1) the LENS length: width or height, and only where the rule, the
 *             keyframes or the call is the lens's (the selector, the animation
 *             name or the statement mentions "lens");
 *         (2) the segmented track's scrollLeft during snap (not a CSS
 *             property, so nothing to lint);
 *         (3) COLOUR: background-color, color, border-color (and the four
 *             border-*-color), outline-color, and box-shadow, whose only
 *             animated part is the colour of a ring. `background` is refused:
 *             it can carry an image or a gradient, `background-color` cannot.
 *     `all`, a layout property, or anything else is a failure.
 *  2. TOKENS. Durations and delays are var(--k-dur-*), var(--k-lens-stretch) or
 *     0s; curves are var(--k-spring|glide|exit). A raw 300ms, a raw
 *     cubic-bezier(), `ease`, `ease-in-out` or `steps()` in a kit rule is a
 *     failure ("no other values"). `linear` is allowed only with
 *     var(--k-dur-9), the spinner and skeleton loops. The tokens file itself
 *     may declare --k-* custom properties with raw values.
 *  3. RETIRED. The feel layer's cubic-bezier(.2,.8,.2,1), --expo, and the lens's
 *     `top .15s ease` / `height .15s ease` (§14.2, §20.5).
 *  4. JS. In a literal .animate([...]) / .animate({...}) the keyframe keys are
 *     held to rule 1; a literal `duration: 300` or a cubic-bezier( string
 *     outside motion.js is refused (use KiwiMotion.DUR / CURVES); a
 *     style.transition = '...' string is held to rules 1 to 3; and a file that
 *     animates must say how it honours prefers-reduced-motion (§14.5).
 *  5. ANIMATION NAMES. `animation: x ...` must name a @keyframes block that is
 *     in the linted set, and that block is held to rule 1.
 *
 * Zero dependencies.
 * ─────────────────────────────────────────────────────────────────────────── */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const TRANSFORM_OPACITY = new Set(['transform', '-webkit-transform', 'opacity']);
const COLOUR = new Set([
  'background-color', 'color', 'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-block-color', 'border-inline-color', 'outline-color', 'box-shadow', '-webkit-box-shadow', 'text-decoration-color',
]);
const LENS_LENGTH = new Set(['width', 'height']);
const NONE_WORDS = new Set(['none', 'initial', 'inherit', 'unset', 'revert']);

const TIMING_KEYWORDS = new Set(['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end']);
const ANIM_KEYWORDS = new Set(['infinite', 'alternate', 'alternate-reverse', 'normal', 'reverse', 'forwards', 'backwards', 'both', 'running', 'paused']);
const TIME_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:ms|s)$/i;
const ZERO_TIME_RE = /^[-+]?0*\.?0+(?:ms|s)$/i;
const NUMBER_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)$/;
const DUR_VAR_RE = /^var\(\s*--k-(?:dur-[1-9]|dur-toast|dur-toast-action|lens-stretch)\s*\)$/;
const CURVE_VAR_RE = /^var\(\s*--k-(?:spring|glide|exit)\s*\)$/;

/* Replace comments with spaces of the same length, newlines kept, so offsets
 * (and therefore line numbers) survive. */
function blank(text, js) {
  let out = '', i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i], d = text[i + 1];
    if (c === '/' && d === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (js && c === '/' && d === '/' && text[i - 1] !== ':') {
      const end = text.indexOf('\n', i);
      const stop = end < 0 ? n : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (js && (c === '"' || c === "'" || c === '`')) {
      let j = i + 1;
      while (j < n && text[j] !== c) { if (text[j] === '\\') j++; j++; }
      out += text.slice(i, j + 1);
      i = j + 1;
    } else { out += c; i++; }
  }
  return out;
}

function lineOf(text, offset) {
  let n = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text[i] === '\n') n++;
  return n;
}

/* Split on a separator outside (), [] and quotes. */
function splitTop(s, sep) {
  const out = [];
  let depth = 0, cur = '', q = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q && s[i - 1] !== '\\') q = ''; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === sep && depth === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}
function words(s) {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (/\s/.test(c) && depth === 0) { if (cur) { out.push(cur); cur = ''; } } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

/* ── property rule ─────────────────────────────────────────────────────── */
function propertyProblem(prop, lens) {
  const p = prop.toLowerCase();
  if (TRANSFORM_OPACITY.has(p) || COLOUR.has(p)) return null;
  if (LENS_LENGTH.has(p)) return lens ? null : `"${p}" is animated outside the lens (rule 1: the lens length is the only layout exception)`;
  if (p === 'all') return '"all" animates layout; name transform and opacity';
  if (p === 'background') return '"background" can carry an image or gradient; transition background-color';
  if (p === 'border') return '"border" is a layout property; transition border-color';
  return `"${p}" is not transform, opacity or a named exception (spec 14.4)`;
}

/* ── one transition item / one animation item ──────────────────────────── */
function timeProblem(w) {
  if (DUR_VAR_RE.test(w)) return null;
  if (ZERO_TIME_RE.test(w)) return null;
  if (TIME_RE.test(w)) return `raw time "${w}": use var(--k-dur-N) (14.1, no other values)`;
  return null;
}
function curveProblem(w, itemText) {
  if (CURVE_VAR_RE.test(w)) return null;
  if (/^cubic-bezier\(/i.test(w)) return `raw ${w.slice(0, 28)}: use var(--k-spring), var(--k-glide) or var(--k-exit) (14.2)`;
  if (/^steps\(/i.test(w)) return 'steps() is not one of the three curves (14.2)';
  if (w === 'linear') return /var\(\s*--k-dur-9\s*\)/.test(itemText) ? null : '"linear" is for the --k-dur-9 loops only (14.2)';
  if (TIMING_KEYWORDS.has(w)) return `"${w}" is not one of the three curves (14.2)`;
  return null;
}

function checkTransitionValue(value, lens, report) {
  const v = value.trim();
  if (!v || NONE_WORDS.has(v.toLowerCase())) return;
  for (const item of splitTop(v, ',')) {
    const ws = words(item.trim());
    let prop = null;
    for (const w of ws) {
      const lw = w.toLowerCase();
      if (TIME_RE.test(w) || DUR_VAR_RE.test(w)) { const t = timeProblem(w); if (t) report(t); continue; }
      if (CURVE_VAR_RE.test(w) || /^cubic-bezier\(/i.test(w) || /^steps\(/i.test(w) || TIMING_KEYWORDS.has(lw)) {
        const c = curveProblem(lw, item);
        if (c) report(c);
        continue;
      }
      if (/^var\(/i.test(w)) { report(`${w} in a transition: use the motion tokens only`); continue; }
      if (NONE_WORDS.has(lw)) continue;
      if (prop === null) prop = lw;
    }
    if (prop) { const p = propertyProblem(prop, lens); if (p) report(p); }
  }
}

function checkAnimationValue(value, lens, report, keyframeNames) {
  const v = value.trim();
  if (!v || NONE_WORDS.has(v.toLowerCase())) return;
  for (const item of splitTop(v, ',')) {
    const ws = words(item.trim());
    let name = null;
    for (const w of ws) {
      const lw = w.toLowerCase();
      if (TIME_RE.test(w) || DUR_VAR_RE.test(w)) { const t = timeProblem(w); if (t) report(t); continue; }
      if (CURVE_VAR_RE.test(w) || /^cubic-bezier\(/i.test(w) || /^steps\(/i.test(w) || TIMING_KEYWORDS.has(lw)) {
        const c = curveProblem(lw, item);
        if (c) report(c);
        continue;
      }
      if (ANIM_KEYWORDS.has(lw) || NUMBER_RE.test(w) || NONE_WORDS.has(lw)) continue;
      if (/^var\(/i.test(w)) { report(`${w} in an animation: use the motion tokens only`); continue; }
      if (name === null) name = w;
    }
    if (name) keyframeNames.push({ name, lens, report });
  }
}

/* ── CSS ───────────────────────────────────────────────────────────────── */
/* A flat, tolerant parse: rules, with at-rule bodies entered. Kit CSS has no
 * nesting (kit-lint fails it), so a block is `prelude { declarations }`. */
function parseCss(css) {
  const items = [];                // {prelude, body, start}
  function scan(from, to) {
    let i = from;
    while (i < to) {
      while (i < to && /\s/.test(css[i])) i++;
      if (i >= to) break;
      let j = i, depth = 0, q = '';
      while (j < to) {
        const c = css[j];
        if (q) { if (c === q && css[j - 1] !== '\\') q = ''; j++; continue; }
        if (c === '"' || c === "'") { q = c; j++; continue; }
        if (c === '(') depth++;
        if (c === ')') depth--;
        if (c === '{' && depth === 0) break;
        if (c === ';' && depth === 0) break;
        j++;
      }
      if (j >= to || css[j] === ';') { i = j + 1; continue; }              /* @import / @charset */
      const prelude = css.slice(i, j).trim();
      let k = j + 1, d = 1;
      while (k < to && d) { if (css[k] === '{') d++; else if (css[k] === '}') d--; k++; }
      const bodyStart = j + 1, bodyEnd = k - 1;
      if (/^@(media|supports|layer|container|document)\b/i.test(prelude)) scan(bodyStart, bodyEnd);
      else items.push({ prelude, body: css.slice(bodyStart, bodyEnd), start: bodyStart, at: prelude[0] === '@' });
      i = k;
    }
  }
  scan(0, css.length);
  return items;
}

function declarations(body, base, css) {
  const out = [];
  let off = 0;
  for (const part of splitTop(body, ';')) {
    const idx = body.indexOf(part, off);
    off = idx + part.length;
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    out.push({ prop: part.slice(0, colon).trim().toLowerCase(), value: part.slice(colon + 1).replace(/!important\s*$/i, '').trim(), at: base + idx });
  }
  return out;
}

/* lintCss(text, file, keyframes?) -> findings. `keyframes` (a Map shared across
 * files by lintFiles) lets an animation name resolve to a block in another file. */
function lintCss(text, file, shared) {
  const findings = [];
  const css = blank(text, false);
  const known = shared || { frames: new Map(), pending: [] };
  const add = (offset, rule, msg) => findings.push({ file, line: lineOf(text, offset), rule, msg });

  /* 3 · retired */
  const RETIRED = [
    [/cubic-bezier\(\s*0?\.2\s*,\s*0?\.8\s*,\s*0?\.2\s*,\s*1\s*\)/gi, 'the feel layer\'s cubic-bezier(.2,.8,.2,1) is retired (14.2)'],
    [/--expo\b/g, '--expo is retired (14.2)'],
    [/\btop\s+\.15s\s+ease\b/gi, 'the lens\'s "top .15s ease" is retired (20.5): translateY on the token curve'],
    [/\bheight\s+\.15s\s+ease\b/gi, 'the lens\'s "height .15s ease" is retired (20.5): the lens length on --k-spring over --k-dur-4'],
  ];
  for (const [re, msg] of RETIRED) { let m; while ((m = re.exec(css))) add(m.index, 'retired', msg); }

  for (const it of parseCss(css)) {
    const lensRule = /lens/i.test(it.prelude);
    /* @keyframes */
    const kf = /^@(?:-webkit-)?keyframes\s+([\w-]+)/i.exec(it.prelude);
    if (kf) {
      const name = kf[1], lens = /lens/i.test(name);
      const props = new Set();
      for (const frame of parseCss(it.body)) {
        for (const d of declarations(frame.body, it.start + frame.start, css)) {
          props.add(d.prop);
          const p = d.prop.startsWith('--') || d.prop === 'animation-timing-function' ? null : propertyProblem(d.prop, lens);
          if (p) add(d.at, 'property', `@keyframes ${name}: ${p}`);
        }
      }
      known.frames.set(name, props);
      continue;
    }
    if (it.at) continue;                                              /* @font-face and the like */
    for (const d of declarations(it.body, it.start, css)) {
      const report = (msg) => add(d.at, 'motion', `${it.prelude.replace(/\s+/g, ' ').slice(0, 60)} { ${d.prop} }: ${msg}`);
      const isCustom = d.prop.startsWith('--');
      if (isCustom) {
        /* The tokens file may hold raw values; everyone else may not fork a motion token. */
        if (/^--k-(dur|lens-stretch|spring|glide|exit)\b/.test(d.prop) && !/tokens/i.test(path.basename(file || ''))) report(`${d.prop} is a motion token; it is declared once, in tokens-2027.css`);
        continue;
      }
      if (/cubic-bezier\(/i.test(d.value) && !['transition', 'animation', 'transition-timing-function', 'animation-timing-function'].includes(d.prop)) {
        report('raw cubic-bezier(): use var(--k-spring), var(--k-glide) or var(--k-exit)');
      }
      switch (d.prop) {
        case 'transition': case '-webkit-transition':
          checkTransitionValue(d.value, lensRule, report); break;
        case 'transition-property':
          for (const p of splitTop(d.value, ',')) { const w = p.trim().toLowerCase(); if (w && !NONE_WORDS.has(w)) { const pr = propertyProblem(w, lensRule); if (pr) report(pr); } }
          break;
        case 'transition-duration': case 'transition-delay': case 'animation-duration': case 'animation-delay':
          for (const t of splitTop(d.value, ',')) { const pr = timeProblem(t.trim()); if (pr) report(pr); } break;
        case 'transition-timing-function': case 'animation-timing-function':
          for (const t of splitTop(d.value, ',')) { const pr = curveProblem(t.trim().toLowerCase(), d.value); if (pr) report(pr); } break;
        case 'animation': case '-webkit-animation':
          checkAnimationValue(d.value, lensRule, report, known.pending); break;
        case 'animation-name':
          for (const n of splitTop(d.value, ',')) { const w = n.trim(); if (w && !NONE_WORDS.has(w.toLowerCase())) known.pending.push({ name: w, lens: lensRule, report }); } break;
        default: break;
      }
    }
  }
  if (!shared) resolvePending(known);
  return findings;
}

/* An animation must name a keyframes block in the linted set. */
function resolvePending(known) {
  for (const p of known.pending) {
    if (!known.frames.has(p.name)) p.report(`animation "${p.name}" names no @keyframes in the linted files (the kit animates its own keyframes only)`);
  }
  known.pending.length = 0;
}

/* ── JS ────────────────────────────────────────────────────────────────── */
function balanced(src, openIdx) {
  const open = src[openIdx], close = open === '(' ? ')' : open === '[' ? ']' : '}';
  let d = 0, q = '';
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === q && src[i - 1] !== '\\') q = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === open) d++;
    else if (c === close) { d--; if (d === 0) return i; }
  }
  return -1;
}
const KF_META = new Set(['offset', 'easing', 'composite', 'computedOffset']);
const CAMEL_COLOUR = new Set(['backgroundColor', 'color', 'borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor', 'boxShadow']);

function lintJs(text, file) {
  const findings = [];
  const src = blank(text, true);
  const base = path.basename(file || '');
  const isMotion = base === 'motion.js';
  const add = (offset, rule, msg) => findings.push({ file, line: lineOf(text, offset), rule, msg });

  /* .animate( literal keyframes ) */
  const re = /\.animate\s*\(/g;
  let m, animates = false;
  while ((m = re.exec(src))) {
    animates = true;
    const open = m.index + m[0].length - 1;
    const close = balanced(src, open);
    if (close < 0) continue;
    const args = src.slice(open + 1, close);
    const parts = splitTop(args, ',');
    const first = (parts[0] || '').trim();
    const lens = /lens/i.test(base) || /lens/i.test(src.slice(Math.max(0, m.index - 160), close));
    if (first[0] === '[' || first[0] === '{') {
      const keyRe = /(?:^|[{,\s])['"]?([A-Za-z-][\w-]*)['"]?\s*:/g;
      let k;
      while ((k = keyRe.exec(first))) {
        const key = k[1];
        if (KF_META.has(key) || key === 'transform' || key === 'opacity' || CAMEL_COLOUR.has(key)) continue;
        const kebab = key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
        const p = propertyProblem(kebab, lens);
        if (p) add(m.index, 'property', `.animate keyframe: ${p}`);
      }
    }
    if (!isMotion) {
      const opt = parts.slice(1).join(',');
      if (/\bduration\s*:\s*[\d.]+/.test(opt) || /^\s*[\d.]+\s*$/.test(parts[1] || '')) add(m.index, 'tokens', '.animate with a raw duration: use KiwiMotion.DUR (14.1, no other values)');
      if (/\beasing\s*:\s*['"`]/.test(opt)) add(m.index, 'tokens', '.animate with a raw easing string: use KiwiMotion.CURVES (14.2)');
    }
  }

  /* style.transition / setProperty('transition', ...) strings */
  const tre = /(?:style\.(?:webkitT|t)ransition\s*=\s*|setProperty\(\s*['"](?:-webkit-)?transition['"]\s*,\s*)(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  while ((m = tre.exec(src))) {
    const lens = /lens/i.test(base) || /lens/i.test(src.slice(Math.max(0, m.index - 160), m.index));
    checkTransitionValue(m[2].replace(/\$\{[^}]*\}/g, ' var(--k-dur-3) '), lens, (msg) => add(m.index, 'motion', `style.transition: ${msg}`));
  }

  /* raw curves outside the one file that defines them */
  if (!isMotion) {
    const cre = /cubic-bezier\(/g;
    while ((m = cre.exec(src))) add(m.index, 'tokens', 'raw cubic-bezier( in script: use KiwiMotion.CURVES (14.2)');
    const re2 = /cubic-bezier\(\s*0?\.2\s*,\s*0?\.8\s*,\s*0?\.2\s*,\s*1\s*\)/g;
    while ((m = re2.exec(src))) add(m.index, 'retired', 'the feel layer\'s curve is retired (14.2)');
  }

  /* reduced motion: a file that animates says how it honours it */
  const moves = animates || /\brequestAnimationFrame\s*\(/.test(src) || /style\.transition\s*=/.test(src);
  if (moves && !/prefers-reduced-motion|\breduced\b|KiwiMotion\.(?:animate|flip|createSpring|bindSpring|lensPlan)/.test(src)) {
    add(0, 'reduced-motion', 'this file animates but never mentions prefers-reduced-motion, KiwiMotion.reduced() or a KiwiMotion mover (14.5)');
  }
  return findings;
}

/* ── files ─────────────────────────────────────────────────────────────── */
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return walk(p);
    return /\.(css|js)$/.test(d.name) && !/ \d+\.[a-z]+$/i.test(d.name) ? [p] : [];
  });
}

function lintFiles(files) {
  const known = { frames: new Map(), pending: [] };
  const arrays = [];
  const read = (f) => fs.readFileSync(f, 'utf8');
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    /* lintCss returns the array its late reports (animation names) append to. */
    arrays.push(f.endsWith('.css') ? lintCss(read(f), rel, known) : lintJs(read(f), rel));
  }
  resolvePending(known);
  return [].concat(...arrays);
}

function kitFiles() { return walk(path.join(ROOT, 'assets', 'kit')); }

module.exports = { lintCss, lintJs, lintFiles, kitFiles, propertyProblem };

if (require.main === module) {
  const args = process.argv.slice(2).map((a) => path.resolve(a));
  const files = args.length ? args : kitFiles();
  const findings = lintFiles(files);
  for (const f of findings) console.log(`${f.file}:${f.line}  [${f.rule}] ${f.msg}`);
  console.log(`motion-lint: ${files.length} file${files.length === 1 ? '' : 's'}, ${findings.length} finding${findings.length === 1 ? '' : 's'}`);
  process.exit(findings.length ? 1 : 0);
}
