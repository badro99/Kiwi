#!/usr/bin/env node
/* icon-vendored-test · design 2027 §8: Material Symbols, vendored, never edited.
 *
 * "tools/icon-vendored-test.mjs fails when a kit file or sprite names an icon
 *  whose <name>.svg is absent. The weight and fill variants are added with the
 *  README's one-line command; until a variant is checked in, the icon renders as
 *  default 24, which is the state the test accepts."
 *
 * What it holds, on the real tree and again on small broken trees (so the test
 * can be seen to fail):
 *   1. every file in assets/icons/material/ is a Material glyph: viewBox
 *      "0 -960 960 960", one filled <path>, no script, no link; a variant file
 *      (`name.style.size.svg`) belongs to a vendored `name.svg`;
 *   2. every sprite (`sprite.<surface>.svg`) names only vendored icons, keeps
 *      Material's viewBox on each <symbol>, carries each glyph byte for byte
 *      (a retouched path is a failure), and is what tools/build-icon-sprite.js
 *      would write today;
 *   3. the manifest (tools/icon-sprites.json) names only vendored icons;
 *   4. kit files (assets/kit/**) name only vendored icons, in <k-icon name>,
 *      and in a `<use href="...sprite.<surface>.svg#id">` that exists in that
 *      sprite; they load no icon web font and no Google Fonts icon link;
 *   5. the spec's preview draws only vendored icons, and the symbols it embeds
 *      are the vendored glyphs byte for byte.
 *
 *   node tools/icon-vendored-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sprite = require('./build-icon-sprite.js');
const REAL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = 'assets/icons/material';

const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (root, rel) => fs.existsSync(path.join(root, rel));

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) { if (d.name !== 'node_modules') walk(p, exts, out); }
    else if (exts.test(d.name) && !/ 2\./.test(d.name)) out.push(p);
  }
  return out;
}

/* The glyph of a vendored file, or a reason it is not one. */
function glyphOf(root, file) {
  try { return { markup: sprite.readGlyph(root, file) }; } catch (e) { return { error: e.message }; }
}

/* An icon name must have its plain `<name>.svg`; a variant may be absent. */
function checkName(root, key, where, problems) {
  let icon;
  try { icon = sprite.parseIconKey(key); } catch (e) { problems.push(`${where}: ${e.message}`); return null; }
  if (!exists(root, `${ICONS}/${icon.fallbackFile}`)) problems.push(`${where}: names "${key}" but ${ICONS}/${icon.fallbackFile} is absent`);
  return icon;
}

function audit(root) {
  const problems = [];
  const stats = { files: 0, variants: 0, sprites: 0, symbols: 0, kitFiles: 0, previewNames: 0 };
  const dir = path.join(root, ICONS);

  /* 1 · the vendored files */
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.svg')) : [];
  for (const f of files) {
    if (/^sprite\.[a-z0-9-]+\.svg$/.test(f)) continue;
    const m = /^([a-z][a-z0-9_]*?)(?:\.(default|wght500)\.(20|24|40))?\.svg$/.exec(f);
    if (!m) { problems.push(`${ICONS}/${f}: not a vendored name (name.svg or name.style.size.svg)`); continue; }
    const g = glyphOf(root, f);
    if (g.error) problems.push(g.error);
    if (m[2]) {
      stats.variants++;
      if (!files.includes(`${m[1]}.svg`)) problems.push(`${ICONS}/${f}: a variant of "${m[1]}", whose ${m[1]}.svg is absent`);
      const head = read(root, `${ICONS}/${f}`);
      if (!new RegExp(`\\bheight="${m[3]}"`).test(head) && !new RegExp(`\\bwidth="${m[3]}"`).test(head)) problems.push(`${ICONS}/${f}: its width and height are not ${m[3]}, so it is not the optical size its name says`);
    } else stats.files++;
  }

  /* 2 · the sprites */
  let built = null;
  try { built = sprite.build(root); } catch (e) { problems.push(`tools/build-icon-sprite.js: ${e.message}`); }
  for (const f of files.filter((x) => /^sprite\.[a-z0-9-]+\.svg$/.test(x))) {
    stats.sprites++;
    const text = read(root, `${ICONS}/${f}`);
    const surface = f.slice(7, -4);
    for (const s of text.matchAll(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/g)) {
      stats.symbols++;
      const id = /\bid="([^"]+)"/.exec(s[1])?.[1];
      const where = `${ICONS}/${f}#${id}`;
      if (!id) { problems.push(`${ICONS}/${f}: a <symbol> has no id`); continue; }
      if (!/\bviewBox="0 -960 960 960"/.test(s[1])) problems.push(`${where}: the symbol does not keep Material's viewBox "0 -960 960 960"`);
      const icon = checkName(root, id, where, problems);
      if (!icon) continue;
      /* byte for byte: the symbol holds the variant's glyph, or the default 24 until the variant is vendored */
      const file = exists(root, `${ICONS}/${icon.file}`) ? icon.file : icon.fallbackFile;
      const g = glyphOf(root, file);
      if (g.markup && s[2] !== g.markup) problems.push(`${where}: the glyph differs from ${file} (a vendored path is never edited)`);
    }
    if (built && built[surface]) {
      if (built[surface].text !== text) problems.push(`${ICONS}/${f}: stale, run node tools/build-icon-sprite.js ${surface}`);
    } else if (built) problems.push(`${ICONS}/${f}: no surface "${surface}" in tools/icon-sprites.json, so nothing keeps it current`);
  }
  if (built) for (const [surface, b] of Object.entries(built)) if (!exists(root, b.file)) problems.push(`${b.file}: missing, run node tools/build-icon-sprite.js ${surface}`);

  /* 3 · the manifest */
  if (exists(root, sprite.MANIFEST)) {
    const man = JSON.parse(read(root, sprite.MANIFEST));
    for (const [surface, def] of Object.entries(man.surfaces || {})) for (const key of def.icons || []) checkName(root, key, `${sprite.MANIFEST} (${surface})`, problems);
  }

  /* 4 · kit files */
  const kitFiles = walk(path.join(root, 'assets/kit'), /\.(js|mjs|html|css|svg)$/);
  for (const abs of kitFiles) {
    stats.kitFiles++;
    const rel = path.relative(root, abs).split(path.sep).join('/');
    const text = fs.readFileSync(abs, 'utf8');
    for (const m of text.matchAll(/<k-icon\b[^>]*\bname="([^"$]+)"/g)) checkName(root, m[1], rel, problems);
    for (const m of text.matchAll(/href="([^"]*sprite\.([a-z0-9-]+)\.svg)(?:\?[^"#]*)?#([^"]+)"/g)) {
      const spriteFile = `${ICONS}/sprite.${m[2]}.svg`;
      if (!exists(root, spriteFile)) { problems.push(`${rel}: references ${spriteFile}, which does not exist`); continue; }
      if (!new RegExp(`<symbol\\b[^>]*\\bid="${m[3].replace(/\./g, '\\.')}"`).test(read(root, spriteFile))) problems.push(`${rel}: references #${m[3]} in ${spriteFile}, which holds no such symbol`);
    }
    if (/fonts\.googleapis\.com\/(?:css2?|icon)[^"']*(?:Material\+Symbols|Material\+Icons)/i.test(text) || /font-family\s*:[^;{}]*Material (?:Symbols|Icons)/i.test(text)) problems.push(`${rel}: loads an icon web font; the icons are vendored SVG (§8: no web font, no Google Fonts link)`);
  }

  /* 5 · the spec's preview */
  const prev = 'docs/specs/kiwi-design-2027-preview.html';
  if (exists(root, prev)) {
    const html = read(root, prev);
    const names = new Set();
    for (const m of html.matchAll(/data-i="([a-z][a-z0-9_]*)"/g)) names.add(m[1]);
    for (const m of html.matchAll(/href="#i-([a-z][a-z0-9_]*)"/g)) names.add(m[1]);
    for (const m of html.matchAll(/setGlyph\([^,]+,\s*'([a-z][a-z0-9_]*)'/g)) names.add(m[1]);
    stats.previewNames = names.size;
    for (const n of names) checkName(root, n, prev, problems);
    for (const s of html.matchAll(/<symbol id="i-([a-z0-9_]+)" viewBox="0 -960 960 960">([\s\S]*?)<\/symbol>/g)) {
      if (!exists(root, `${ICONS}/${s[1]}.svg`)) continue; // already reported above
      const g = glyphOf(root, `${s[1]}.svg`);
      if (g.markup && g.markup !== s[2]) problems.push(`${prev}: its embedded "${s[1]}" differs from ${ICONS}/${s[1]}.svg`);
    }
  }
  return { problems, stats };
}

/* ── The real tree ── */
let n = 0;
const ok = (yes, msg) => { assert.ok(yes, msg); n++; console.log('  ✓ ' + msg); };

const real = audit(REAL_ROOT);
assert.deepEqual(real.problems, [], '\n' + real.problems.join('\n'));
ok(true, `${real.stats.files} vendored glyphs and ${real.stats.variants} variant(s) are Material files (viewBox 0 -960 960 960, one path, no script)`);
ok(real.stats.sprites > 0, `${real.stats.sprites} sprite(s), ${real.stats.symbols} symbols: every one names a vendored icon, keeps Material's viewBox, carries its glyph byte for byte, and is current`);
ok(true, `the manifest names only vendored icons`);
ok(true, `${real.stats.kitFiles} kit file(s) name only vendored icons${real.stats.kitFiles ? '' : ' (assets/kit/ does not exist yet: stage 2)'}`);
ok(real.stats.previewNames > 0, `the preview draws ${real.stats.previewNames} icons, all vendored, its embedded symbols byte for byte`);

/* ── Broken trees: the test must be seen to fail ── */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-icons-'));
function fixture(name, mutate) {
  const root = path.join(tmp, name);
  fs.mkdirSync(path.join(root, ICONS), { recursive: true });
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  for (const f of ['close.svg', 'add.svg', 'error.svg', 'error.wght500.40.svg']) fs.copyFileSync(path.join(REAL_ROOT, ICONS, f), path.join(root, ICONS, f));
  fs.writeFileSync(path.join(root, sprite.MANIFEST), JSON.stringify({ surfaces: { demo: { icons: ['close', 'add', 'error.wght500.40'], scan: ['assets/kit'] } } }));
  mutate(root);
  return audit(root);
}
const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const build = (root) => { const b = sprite.build(root); for (const s of Object.values(b)) fs.writeFileSync(path.join(root, s.file), s.text); };

{
  const r = fixture('clean', (root) => { write(root, 'assets/kit/a.js', 'x = `<k-icon name="close"></k-icon>`'); build(root); });
  assert.deepEqual(r.problems, [], 'a clean tree must pass: ' + r.problems.join(' | '));
  ok(true, 'a clean fixture tree passes (so the failures below are the test, not the fixture)');
}
{
  const r = fixture('absent-manifest', (root) => { write(root, sprite.MANIFEST, JSON.stringify({ surfaces: { demo: { icons: ['close', 'nope_icon'], scan: [] } } })); });
  ok(r.problems.some((p) => /nope_icon/.test(p) && /absent/.test(p)), 'a manifest that names an icon with no file fails');
}
{
  const r = fixture('absent-kit', (root) => { write(root, 'assets/kit/a.js', '`<k-icon name="ghost"></k-icon>`'); });
  ok(r.problems.some((p) => /assets\/kit\/a\.js/.test(p) && /ghost/.test(p)), 'a kit file that names an icon with no file fails');
}
{
  const r = fixture('absent-sprite', (root) => {
    build(root);
    const f = path.join(root, `${ICONS}/sprite.demo.svg`);
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</svg>', '<symbol id="ghost_icon" viewBox="0 -960 960 960"><path d="M0 0Z"/></symbol></svg>'));
  });
  ok(r.problems.some((p) => /sprite\.demo\.svg#ghost_icon/.test(p) && /absent/.test(p)), 'a sprite symbol with no vendored file fails');
}
{
  const r = fixture('retouched', (root) => {
    build(root);
    const f = path.join(root, `${ICONS}/sprite.demo.svg`);
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/(<symbol id="close"[^>]*><path d=")/, '$1M0 0Z '));
  });
  ok(r.problems.some((p) => /#close/.test(p) && /differs/.test(p)), 'a retouched path in a sprite fails (a vendored path is never edited)');
  ok(r.problems.some((p) => /stale/.test(p)), 'and that sprite is also reported stale');
}
{
  const r = fixture('viewbox', (root) => {
    build(root);
    const f = path.join(root, `${ICONS}/sprite.demo.svg`);
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('<symbol id="add" viewBox="0 -960 960 960">', '<symbol id="add" viewBox="0 0 24 24">'));
  });
  ok(r.problems.some((p) => /#add/.test(p) && /viewBox/.test(p)), 'a symbol that drops Material\'s viewBox fails');
}
{
  const r = fixture('missing-variant', (root) => {
    fs.rmSync(path.join(root, `${ICONS}/error.wght500.40.svg`));
    build(root);
  });
  assert.deepEqual(r.problems, [], 'a variant that is not vendored yet must pass, drawing the default 24: ' + r.problems.join(' | '));
  ok(true, 'a variant that is not vendored yet passes and its symbol carries the default 24 glyph (the state §8 accepts)');
}
{
  const r = fixture('orphan-variant', (root) => { fs.rmSync(path.join(root, `${ICONS}/error.svg`)); });
  ok(r.problems.some((p) => /error\.wght500\.40\.svg/.test(p) && /absent/.test(p)), 'a variant file whose plain icon is absent fails');
}
{
  const r = fixture('webfont', (root) => { write(root, 'assets/kit/f.css', '.i{font-family:"Material Symbols Outlined"}'); });
  ok(r.problems.some((p) => /web font/.test(p)), 'an icon web font in a kit file fails');
}
{
  const r = fixture('dangling-use', (root) => { build(root); write(root, 'assets/kit/u.js', 'x = \'<use href="/assets/icons/material/sprite.demo.svg?v=1#nothing_here"/>\''); });
  ok(r.problems.some((p) => /#nothing_here/.test(p)), 'a <use> that points at a symbol the sprite does not hold fails');
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\nicon-vendored-test: ${n} checks passed`);
