#!/usr/bin/env node
/* motion-lint-test · the motion-lint gate (tools/motion-lint.js, spec §14.4)
 * proves it catches what it names, passes what the spec allows, and then runs
 * over the real kit (assets/kit/**) as the stage-1 gate.
 *   node tools/motion-lint-test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const lint = require(path.join(root, 'tools/motion-lint.js'));
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
console.log('motion-lint-test');

function css(text, file = 'assets/kit/x.css') { return lint.lintCss(text, file); }
function js(text, file = 'assets/kit/x.js') { return lint.lintJs(text, file); }
const bad = (findings, re, msg) => check(findings.length > 0 && findings.some((f) => re.test(f.msg)), `fails: ${msg}${findings[0] ? '  [' + findings[0].msg.slice(0, 70) + ']' : ''}`);
const good = (findings, msg) => check(findings.length === 0, `passes: ${msg}${findings[0] ? '  [' + findings[0].msg + ']' : ''}`);

/* ── CSS · properties ──────────────────────────────────────────────────── */
good(css('.k-row { transition: transform var(--k-dur-3) var(--k-glide), opacity var(--k-dur-2) var(--k-exit); }'), 'transform and opacity on tokens');
good(css('.k-row { transition: background-color var(--k-dur-1) var(--k-glide), color var(--k-dur-2) var(--k-glide), border-color var(--k-dur-2) var(--k-glide); }'), 'colour is exception 3');
good(css('.k-btn { transition: box-shadow var(--k-dur-2) var(--k-glide); }'), 'the colour of a box-shadow ring is exception 3');
good(css('.k-seg-lens { transition: transform var(--k-dur-4) var(--k-spring), width var(--k-dur-4) var(--k-spring); }'), 'the lens length is exception 1 (width in a horizontal track)');
good(css('.k-rail .k-lens { transition: transform var(--k-dur-4) var(--k-spring), height var(--k-dur-4) var(--k-spring); }'), 'the lens height in a rail');
good(css('.k-x { transition: none; } .k-y { transition: opacity 0s; }'), 'none, and a zero time');
good(css('@media (prefers-reduced-motion: reduce) { .k-x { transition: none; animation: none; } }'), 'a reduced-motion block that switches motion off');
bad(css('.k-card { transition: height var(--k-dur-3) var(--k-glide); }'), /outside the lens/, 'height on a card');
bad(css('.k-card { transition: width var(--k-dur-3) var(--k-glide); }'), /outside the lens/, 'width on a card');
bad(css('.k-card { transition: top var(--k-dur-3) var(--k-glide), left var(--k-dur-3) var(--k-glide); }'), /"top"/, 'top');
bad(css('.k-card { transition: margin-left var(--k-dur-3) var(--k-glide); }'), /margin-left/, 'margin');
bad(css('.k-card { transition: all var(--k-dur-3) var(--k-glide); }'), /"all"/, 'all');
bad(css('.k-card { transition: background var(--k-dur-2) var(--k-glide); }'), /background-color/, 'background (it can carry a gradient)');
bad(css('.k-card { transition: transform var(--k-dur-3) var(--k-glide), max-height var(--k-dur-3) var(--k-glide); }'), /max-height/, 'max-height beside a legal property');
bad(css('.k-card { transition-property: transform, left; transition-duration: var(--k-dur-3); }'), /"left"/, 'transition-property: left');
bad(css('.k-lens { transition: transform var(--k-dur-4) var(--k-spring), top var(--k-dur-4) var(--k-spring); }'), /"top"/, 'the lens may move its length, not its top');

/* ── CSS · tokens ──────────────────────────────────────────────────────── */
bad(css('.k-row { transition: transform 300ms var(--k-glide); }'), /raw time "300ms"/, 'a raw 300ms');
bad(css('.k-row { transition: transform var(--k-dur-3) cubic-bezier(0.2, 0.8, 0.2, 1); }'), /raw cubic-bezier/, 'a raw cubic-bezier');
bad(css('.k-row { transition: transform var(--k-dur-3) ease; }'), /"ease"/, 'ease');
bad(css('.k-row { transition: transform var(--k-dur-3) ease-in-out; }'), /ease-in-out/, 'ease-in-out');
bad(css('.k-row { transition: transform var(--k-dur-3) linear; }'), /linear/, 'linear outside the loops');
bad(css('.k-row { transition: transform var(--k-dur-3) var(--k-snappy); }'), /motion tokens/, 'an invented curve variable');
bad(css('.k-row { transition: transform var(--k-dur-3) var(--k-glide) 50ms; }'), /raw time "50ms"/, 'a raw delay');
bad(css('.k-row { transition-duration: .2s; }'), /raw time/, 'transition-duration: .2s');
bad(css('.k-row { animation-timing-function: ease-out; }'), /ease-out/, 'animation-timing-function: ease-out');
good(css('.k-row { transition-delay: var(--k-lens-stretch); }'), 'the lens stretch hold as a delay');
bad(css('.k-row { --k-dur-3: 300ms; }'), /declared once, in tokens-2027.css/, 'forking a motion token outside the tokens file');
good(css(':root { --k-dur-3: 240ms; --k-glide: cubic-bezier(0.32, 0.72, 0, 1); }', 'assets/kit/tokens-2027.css'), 'the tokens file declares raw values');

/* ── CSS · retired ─────────────────────────────────────────────────────── */
bad(css('.k-row { transition: transform var(--k-dur-3) cubic-bezier(.2,.8,.2,1); }'), /retired/, "the feel layer's curve");
bad(css('.x { transition: transform .31s cubic-bezier(0.2, 0.8, 0.2, 1); }'), /retired/, 'the same curve written with leading zeros');
bad(css('.x { transition: transform var(--expo); }'), /--expo is retired/, '--expo');
bad(css('.k-lens { transition: top .15s ease, height .15s ease; }'), /retired/, "the lens's 150 ms ease");

/* ── CSS · animations and keyframes ────────────────────────────────────── */
good(css('@keyframes k-pulse { from { opacity: 1; } 50% { opacity: .5; } to { opacity: 1; } } .k-skel { animation: k-pulse var(--k-dur-9) linear infinite; }'), 'the skeleton pulse: opacity, --k-dur-9, linear, infinite');
good(css('@keyframes k-spin { to { transform: rotate(360deg); } } .k-spin[data-k-loop] { animation: k-spin var(--k-dur-9) linear infinite; }'), 'the spinner revolution');
bad(css('@keyframes k-grow { from { height: 0; } to { height: 100px; } }'), /@keyframes k-grow.*height/, 'keyframes that animate height');
bad(css('@keyframes k-slide { from { left: 0; } to { left: 100px; } }'), /left/, 'keyframes that animate left');
good(css('@keyframes k-lens-stretch { from { width: 10px; } to { width: 20px; } }'), 'lens keyframes may animate the lens length');
bad(css('.k-x { animation: k-nowhere var(--k-dur-3) var(--k-glide); }'), /names no @keyframes/, 'an animation naming no keyframes');
bad(css('@keyframes k-a { to { opacity: 0; } } .k-x { animation: k-a 2s var(--k-glide); }'), /raw time "2s"/, 'an animation with a raw duration');
bad(css('@keyframes k-a { to { opacity: 0; } } .k-x { animation: k-a var(--k-dur-3) ease-in; }'), /ease-in/, 'an animation with a raw curve');
bad(css('@keyframes k-a { to { opacity: 0; } } .k-x { animation: k-a var(--k-dur-3) linear; }'), /linear/, 'linear without the --k-dur-9 loop');
good(css('@media (min-width: 600px) { .k-x { transition: opacity var(--k-dur-2) var(--k-glide); } }'), 'a rule inside @media is read');
bad(css('@media (min-width: 600px) { .k-x { transition: height var(--k-dur-2) var(--k-glide); } }'), /height/, 'a violation inside @media is found');
check(css('/* transition: height 2s ease */ .k-x { opacity: 1; }').length === 0, 'comments are ignored');
check(css('.k-a { opacity: 1; }\n.k-b { transition: top var(--k-dur-3) var(--k-glide); }')[0].line === 2, 'the finding carries its line');

/* ── JS ────────────────────────────────────────────────────────────────── */
const GOOD_JS = `
  const reduced = KiwiMotion.reduced();
  el.animate([{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: KiwiMotion.DUR.dur3, easing: KiwiMotion.CURVES.glide });`;
good(js(GOOD_JS), 'an animate() of transform and opacity on the tokens, honouring reduced motion');
bad(js('const reduced = 1; el.animate([{ height: "0px" }, { height: "100px" }], { duration: KiwiMotion.DUR.dur3 });'), /height/, 'animate() of height');
bad(js('const reduced = 1; el.animate({ top: ["0px", "10px"] }, { duration: KiwiMotion.DUR.dur3 });'), /"top"/, 'animate() of top, object form');
bad(js('const reduced = 1; el.animate([{ marginLeft: "0" }, { marginLeft: "8px" }], { duration: KiwiMotion.DUR.dur3 });'), /margin-left/, 'camelCase marginLeft');
good(js('const reduced = 1; el.animate([{ backgroundColor: "#fff" }, { backgroundColor: "#eee" }], { duration: KiwiMotion.DUR.dur2 });'), 'backgroundColor is colour');
good(js('const reduced = 1; lens.animate([{ width: a + "px" }, { width: b + "px" }], { duration: KiwiMotion.DUR.dur4 });', 'assets/kit/lens.js'), 'width inside the lens module');
bad(js('const reduced = 1; el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });'), /raw duration/, 'a raw duration in animate()');
bad(js('const reduced = 1; el.animate([{ opacity: 0 }, { opacity: 1 }], 300);'), /raw duration/, 'a bare numeric duration');
bad(js('const reduced = 1; el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: KiwiMotion.DUR.dur2, easing: "ease-out" });'), /raw easing/, 'a raw easing string');
bad(js('const reduced = 1; el.style.transition = "height 0.3s ease";'), /style\.transition/, 'style.transition of height');
bad(js('const reduced = 1; el.style.transition = "transform 300ms var(--k-glide)";'), /raw time/, 'style.transition with a raw time');
good(js('const reduced = 1; el.style.transition = "transform var(--k-dur-3) var(--k-glide)";'), 'style.transition on tokens');
bad(js('const reduced = 1; const c = "cubic-bezier(0.3, 0, 0.2, 1)";'), /raw cubic-bezier/, 'a curve string outside motion.js');
good(js('const CURVES = { glide: "cubic-bezier(0.32, 0.72, 0, 1)" };', 'assets/kit/motion.js'), 'motion.js owns the curve strings');
bad(js('el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: KiwiMotion.DUR.dur2 });'), /reduced/, 'a file that animates and never mentions reduced motion');
good(js('el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: KiwiMotion.DUR.dur2 }); if (KiwiMotion.reduced()) return;'), 'KiwiMotion.reduced() in the file counts');
good(js('KiwiMotion.animate(el, { opacity: 1 }, { dur: "dur2" });'), 'handing the move to KiwiMotion.animate counts (it honours reduced motion itself)');
check(js('// el.animate([{ height: 1 }], { duration: 5 })\nconst x = "/* el.animate */";').length === 0, 'comments and strings are not calls');
good(js('el.animate(frames, { duration: ms, easing: CURVES[curve], fill: "none" }); function reduced() {}', 'assets/kit/motion.js'), 'a call with variable keyframes (motion.js itself) is not second-guessed');

/* ── the real kit ──────────────────────────────────────────────────────── */
{
  const files = lint.kitFiles();
  check(files.some((f) => f.endsWith(path.join('kit', 'motion.js'))), `the kit has ${files.length} CSS/JS files and motion.js is one of them`);
  const findings = lint.lintFiles(files);
  for (const f of findings) console.log(`    ${f.file}:${f.line} [${f.rule}] ${f.msg}`);
  check(findings.length === 0, 'assets/kit/** has no motion finding');
}
console.log('\n✓ motion-lint-test');
