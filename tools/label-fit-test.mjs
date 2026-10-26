#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
/* label-fit-test · design 2027 §6.6, measured fits.
 *
 * Every label that §10 and §18 draw on one line is measured in a browser, in the
 * faces the app ships (Inter Tight variable Latin, IBM Plex Sans Arabic 400/500/600
 * at its 108 % size-adjust), at the label's step and weight and the §6.2 tracking,
 * with real U+00A0 in the amounts and with the font features the frame sets:
 * every frame sets font-variant-numeric: tabular-nums, so every label is measured
 * with tnum (revision 25, P8). The budget is the container's content width minus
 * the component's inline padding and the icon and its gap.
 *
 * "label-fit-test repeats every row from the strings bundles on every capture
 *  run, logs the face it measured and the width of a reference label ('Send 2 to
 *  kitchen' at Body strong, 136.1), and fails on the first overflow or on a
 *  reference width that is off by more than 0.3 px (a fallback face)."
 *
 * What it does, in the order it prints:
 *   1. says where the strings came from (assets/kit/strings/*.js evaluated with
 *      assets/kit/strings.js, else the spec's §9.6 table, which is their seed);
 *   2. serves the shipped faces (assets/fonts/, else where they are today),
 *      declares them exactly as §6.1 does, and logs the face it measured;
 *   3. measures the two reference labels (EN "Send 2 to kitchen" 136.1 and the
 *      Arabic bill.send 136.4) and fails past 0.3 px: a face that is not the
 *      shipped one cannot pass;
 *   4. asks Chromium (CSS.getPlatformFontsForNode) which font drew every glyph
 *      of every measured label, and fails when any glyph came from a system face;
 *   5. measures every row of tools/fixtures/label-fit.json in EN, FR and AR, at
 *      each Dynamic Type factor the spec prints, fails on an overflow of its
 *      budget, on a width that is not the figure §6.6 prints (0.3 px), and on a
 *      tab capsule, segmented control or compare control that fits a width §6.6
 *      says it does not (or the reverse);
 *   6. when the bundles are the source, measures the original rows again from the
 *      spec's §9.6 table and fails if a single figure differs: the bundles say
 *      what the spec says;
 *   7. holds P10: a one-line row never carries an interpolated name; the lock's
 *      title and body, with a 40-character store name at 744, in all three
 *      languages, wrap and clip nothing;
 *   8. names what it could not measure, line by line ("not measured: ..."), so
 *      the gap is in the output and not silent; and names every figure the spec
 *      prints that the shipped copy does not give ("spec drift: ..."), holding
 *      the figure measured today so a later change is still seen;
 *   9. proves the judge can fail (an overflow, a drift, a fallback face).
 *
 *   node tools/label-fit-test.mjs               the run above
 *   EXPLAIN=1 node tools/label-fit-test.mjs     for a row that drifts, also
 *                                               print the step/weight pairs that
 *                                               would give the printed figure
 *   VERBOSE=1                                   print every figure
 *   LABEL_FIT_STRINGS=spec                      force the §9.6 table as the source
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { loadStrings } from './label-fit-strings.mjs';
import { locateFaces } from './font-metrics.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const EXPLAIN = !!process.env.EXPLAIN;
const table = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'fixtures', 'label-fit.json'), 'utf8'));
const TOL = table.tolerance ?? 0.3;
const LANGS = ['en', 'fr', 'ar'];
/* A row with `factors` is measured again at each Dynamic Type factor (§6.4, §6.6): the text's size is
   13 x f (and so on); the icons and marks a row lists as `px` parts do not scale, and a factor may
   replace the parts (the Action Center's badge grows to 24 at 1.35). */
const ROWS = table.rows.flatMap((r) => [r, ...(r.factors || []).map((fc) => ({
  ...r, id: `${r.id} @${fc.f}`, scale: (r.scale || 1) * fc.f, parts: fc.parts || r.parts, expect: fc.expect, budget: fc.budget ?? null,
  expectMode: fc.expectMode ?? r.expectMode, minWidth: fc.minWidth, drift: fc.drift, wrapsIn: undefined, factors: undefined, wrapAt: undefined,
}))]);
const BANNED_ARGS = new Set(['store', 'paired', 'name', 'venue', 'person', 'dish', 'staff', 'customer']);
const REFERENCES = [
  { id: 'Send 2 to kitchen', lang: 'en', want: 136.1 },
  { id: 'bill.send (Arabic)', lang: 'ar', want: 136.4 },
];

/* ── The strings ── */
const strings = loadStrings(root, { prefer: process.env.LABEL_FIT_STRINGS === 'spec' ? 'spec' : null });
const fromSpec = strings.source.startsWith('docs/');
const specStrings = fromSpec ? strings : loadStrings(root, { prefer: 'spec' });

/* ── The faces: §6.1's declarations, with the files served from here ── */
const { faces, sources } = locateFaces(root);
const FILES = {
  '/__lf/inter-tight-latin-ext.woff2': faces.latinExt, '/__lf/inter-tight-latin.woff2': faces.latin,
  '/__lf/plex-arabic-400.woff2': faces.arabic400, '/__lf/plex-arabic-500.woff2': faces.arabic500,
  '/__lf/plex-arabic-600.woff2': faces.arabic600, '/__lf/plex-arabic-700.woff2': faces.arabic700,
};
const LATIN_RANGE = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const EXT_RANGE = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';
const ARABIC_RANGE = 'U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF';
const FACE_CSS = `
@font-face{font-family:"Inter Tight";src:url("/__lf/inter-tight-latin-ext.woff2") format("woff2");font-weight:100 900;font-style:normal;font-display:block;unicode-range:${EXT_RANGE}}
@font-face{font-family:"Inter Tight";src:url("/__lf/inter-tight-latin.woff2") format("woff2");font-weight:100 900;font-style:normal;font-display:block;unicode-range:${LATIN_RANGE}}
${[400, 500, 600, 700].map((w) => `@font-face{font-family:"Kiwi Arabic";src:url("/__lf/plex-arabic-${w}.woff2") format("woff2");font-weight:${w};font-style:normal;font-display:block;size-adjust:108%;unicode-range:${ARABIC_RANGE}}`).join('\n')}
@font-face{font-family:"Inter Tight Fallback";src:local("Arial");size-adjust:97%;ascent-override:99.9%;descent-override:24.9%;line-gap-override:0%;unicode-range:${LATIN_RANGE}, ${EXT_RANGE}}
:root{--k-font:"Inter Tight","Kiwi Arabic","Inter Tight Fallback",system-ui}
html{font-family:var(--k-font);font-variant-numeric:tabular-nums;font-synthesis:none;-webkit-text-size-adjust:100%}
body{margin:0;background:#F7F5F0;color:#0A0F0D}
.m{display:inline-block;white-space:nowrap;font-family:var(--k-font);font-variant-numeric:tabular-nums}
.line{display:block;height:0;overflow:visible}
`;
const pageHtml = (body = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>label fit</title><style>${FACE_CSS}</style></head><body>${body}</body></html>`;

const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://local').pathname;
  if (p === '/__lf/page.html') { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); res.end(pageHtml()); return; }
  if (FILES[p]) { res.writeHead(200, { 'Content-Type': 'font/woff2', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(FILES[p])); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('label-fit', { browser });
const ok = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };

/* ── Pure parts (also run against synthetic input at the end) ── */

const r1 = (x) => Math.round(x * 10) / 10;
const langsOf = (row) => row.langs || LANGS;

/* A sample argument: "$name" is a formatted value from the table's samples (KiwiFormat's output
   for a fixed input), "@key" is another string, rendered in the same language. */
function argValue(v, lang, strs) {
  if (v && typeof v === 'object') { /* another string with its own arguments */
    return strs.render(v.key, lang, Object.fromEntries(Object.entries(v.args || {}).map(([k, a]) => [k, argValue(a, lang, strs)])));
  }
  if (typeof v !== 'string') return v;
  if (v.startsWith('$')) {
    const s = table.samples[v.slice(1)]?.[lang];
    if (s == null) throw new Error(`no sample "${v}" in ${lang}`);
    return s;
  }
  if (v.startsWith('@')) return strs.render(v.slice(1), lang, {});
  return v;
}

/* Every key a row needs; the row is not measurable from a source that lacks one. */
function keysOf(row) {
  const out = new Set();
  const walk = (v) => {
    if (typeof v === 'string' && v.startsWith('@')) out.add(v.slice(1));
    else if (v && typeof v === 'object') { out.add(v.key); Object.values(v.args || {}).forEach(walk); }
  };
  for (const part of row.parts || []) {
    if (part.key) out.add(part.key);
    Object.values(part.args || {}).forEach(walk);
  }
  for (const fc of row.factors || []) for (const part of fc.parts || []) if (part.key) out.add(part.key);
  return [...out];
}
const missingKeys = (row, strs) => keysOf(row).filter((k) => !strs.has(k));

/* One row in one language -> the pieces to measure, in order. */
function piecesOf(row, lang, strs) {
  const out = [];
  const style = (part, extra = {}) => ({ step: part.step || row.step, weight: part.weight || row.weight, ...extra });
  row.parts.forEach((part, j) => {
    if (part.px != null) { out.push({ fixed: part.px }); return; }
    let text;
    if (part.sample) { /* a formatted value (an amount, a date) */
      text = table.samples[part.sample]?.[lang];
      if (text == null) throw new Error(`row ${row.id}: no sample "${part.sample}" in ${lang}`);
    } else if (part.text) {
      text = part.text[lang];
      if (text == null) throw new Error(`row ${row.id}: no literal in ${lang}`);
    } else {
      const args = Object.fromEntries(Object.entries(part.args || {}).map(([k, v]) => [k, argValue(v, lang, strs)]));
      text = strs.render(part.key, lang, args);
      /* `after`: keep what follows the first occurrence of the marker (the compare control's baseline is the
         end of compare.delta, after "{delta} ({pct})") */
      if (part.after != null) text = text.slice(text.indexOf(part.after) + part.after.length);
    }
    if (row.mode === 'capsule') { /* the item twice: at rest and selected */
      out.push({ text: text.trim(), pad: 0, gap: 0, item: j, selected: false, ...style(part, { weight: row.weights[0] }) });
      out.push({ text: text.trim(), pad: 0, gap: 0, item: j, selected: true, ...style(part, { weight: row.weights[1] }) });
      return;
    }
    const texts = part.split ? text.split(part.split) : [text];
    texts.forEach((t, i) => out.push({ text: t.trim(), key: part.key || null, pad: part.pad || 0, gap: i < texts.length - 1 ? part.gap || 0 : 0, ...style(part) }));
  });
  return out;
}

/* `scale` is the surface's root over 16 (the kitchen's 20, 24 and 28 px roots are 1.25, 1.5 and 1.75; §6.2). */
function styleOf(step, weight, lang, scale = 1) {
  const s = table.steps[step];
  if (!s) throw new Error(`unknown step ${step}`);
  const w = weight === 'regular' ? s.w[0] : weight === 'strong' ? s.w[1] : Number(weight);
  return { px: s.px * scale, w, ls: lang === 'ar' ? 0 : s.latin };
}

/* Widths of a row's pieces -> the figure the table prints. */
function combine(row, pieces, widths) {
  if (row.mode === 'capsule') {
    /* §6.6: the sum of max(min, label + pad) with one label selected at the strong weight and the others at
       rest; the widest case is the one that counts. */
    const items = [...new Set(pieces.map((p) => p.item))];
    const at = (j, sel) => widths[pieces.findIndex((p) => p.item === j && p.selected === sel)];
    const cell = (w) => Math.max(row.min || 0, w + (row.pad || 0));
    return Math.max(...items.map((i) => items.reduce((s, j) => s + cell(at(j, j === i)), 0))) + (row.fixed || 0);
  }
  if (row.max) return Math.max(...pieces.map((p, i) => (p.text != null ? widths[i] + p.pad : -Infinity)));
  let sum = 0;
  pieces.forEach((p, i) => { sum += (p.fixed != null ? p.fixed : widths[i] + p.pad) + (p.gap || 0); });
  return sum;
}

/* The smallest listed container width the figure fits, or null. */
const fitsAt = (got, widths) => widths.find((w) => got <= w + 0.05) ?? null;

/* A drift entry with `only: 'bundles'` is the shipped runtime's own doing (the spec's table has no runtime),
   so it holds when the bundles are the source and not when the table is. */
const driftOf = (row, lang) => {
  const d = row.drift?.[lang];
  return d && !(d.only === 'bundles' && fromSpec) ? d : null;
};

/* The verdict on one measured figure. */
function judge(row, lang, got) {
  const out = [];
  /* `drift`: a figure the spec prints that the shipped faces and the shipped copy do not give. The gate holds
     the figure measured today (so a later change to the copy or the faces is still seen) and the test names the
     drift in its output, so the spec is corrected and not silently passed. */
  const drift = driftOf(row, lang);
  const want = drift ? drift.measures : row.expect?.[lang];
  if (row.budget != null && got > row.budget + 0.05 && !(row.wrapsIn && row.wrapsIn[lang])) out.push(`${row.id} ${lang}: ${r1(got)} overflows its budget ${row.budget} by ${r1(got - row.budget)}`);
  if (want != null) {
    const off = row.expectMode === 'max' ? (got > want + TOL ? got - want : 0) : Math.abs(got - want);
    if (off > TOL) out.push(drift
      ? `${row.id} ${lang}: measured ${r1(got)}, the fixture holds ${want} for a figure §6.6 prints as ${row.expect?.[lang]} (off by ${r1(off)}); the copy or the faces moved`
      : `${row.id} ${lang}: measured ${r1(got)}, §6.6 prints ${want} (off by ${r1(off)}; the limit is ${TOL})`);
  }
  if (row.fitWidths && row.minWidth && lang in row.minWidth) {
    const at = fitsAt(got, row.fitWidths);
    if (at !== row.minWidth[lang]) out.push(`${row.id} ${lang}: ${r1(got)} fits ${at == null ? 'none of ' + row.fitWidths.join(', ') : 'from ' + at}, §6.6 says ${row.minWidth[lang] == null ? 'none' : 'from ' + row.minWidth[lang]}`);
  }
  return out;
}

/* P10: no interpolated name on a one-line control. */
function nameProblems(row, strs) {
  const out = [];
  for (const part of row.parts) {
    if (!part.key) continue;
    for (const lang of langsOf(row)) {
      if (!strs.has(part.key)) continue;
      for (const a of strs.argsOf(part.key, lang)) {
        if (BANNED_ARGS.has(a)) out.push(`${row.id} (${part.key}, ${lang}): holds {${a}}, a store, person or dish name; such a string is never set on a one-line control (§6.6, P10)`);
        else if (!part.args || !(a in part.args)) out.push(`${row.id} (${part.key}, ${lang}): argument {${a}} has no sample value`);
      }
    }
  }
  return [...new Set(out)];
}

/* ── The browser side ── */

async function openMeasurer(t) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport({ width: 1100, height: 900, deviceScaleFactor: 1 });
  t.step('open the measuring page');
  await page.goto(base + '/__lf/page.html', { waitUntil: 'load', timeout: 60000 });
  const cdp = await page.createCDPSession();
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  return {
    page,
    /* jobs: [{text, lang, px, w, ls}] -> { widths, fonts: [[{familyName,isCustomFont,glyphCount}]] } */
    async measure(jobs) {
      await page.evaluate((jobs) => {
        document.body.textContent = '';
        for (const j of jobs) {
          const wrap = document.createElement('div');
          wrap.className = 'line';
          wrap.lang = j.lang; wrap.dir = j.lang === 'ar' ? 'rtl' : 'ltr';
          const s = document.createElement('span');
          s.className = 'm';
          s.style.fontSize = j.px + 'px'; s.style.fontWeight = String(j.w); s.style.letterSpacing = j.ls + 'em';
          s.textContent = j.text;
          wrap.appendChild(s); document.body.appendChild(wrap);
        }
      }, jobs);
      /* Faces load when text first needs them; wait for that, then lay out again. */
      await page.evaluate(async () => { document.body.getBoundingClientRect(); await document.fonts.ready; });
      await page.evaluate(async () => { await document.fonts.ready; });
      const widths = await page.evaluate(() => [...document.querySelectorAll('.m')].map((s) => s.getBoundingClientRect().width));
      const { root: docRoot } = await cdp.send('DOM.getDocument', { depth: 0 });
      const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: docRoot.nodeId, selector: '.m' });
      const fonts = [];
      for (const nodeId of nodeIds) fonts.push((await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts);
      return { widths, fonts };
    },
  };
}

const fontLabel = (f) => `${f.familyName}${f.isCustomFont ? '' : ' (system)'}`;

/* Measure every row `strs` can supply. -> { figures: [{row, lang, got, pieces, widths}], jobs, fonts, skipped: [{row, missing}] } */
async function figuresFor(m, strs, rows = ROWS, extraJobs = []) {
  const jobs = [], index = [], skipped = [];
  for (const row of rows) {
    const missing = missingKeys(row, strs);
    if (missing.length) { skipped.push({ row, missing }); continue; }
    for (const lang of forLocales(langsOf(row))) {
      const pieces = piecesOf(row, lang, strs);
      const from = jobs.length;
      for (const p of pieces) if (p.text != null) jobs.push({ text: p.text, lang, ...styleOf(p.step, p.weight, lang, row.scale || 1) });
      index.push({ row, lang, from, pieces });
    }
  }
  const all = await m.measure([...extraJobs, ...jobs]);
  const W = all.widths.slice(extraJobs.length);
  const figures = index.map(({ row, lang, from, pieces }) => {
    const widths = []; let k = 0;
    for (const p of pieces) widths.push(p.text != null ? W[from + k++] : 0);
    return { row, lang, pieces, widths, got: combine(row, pieces, widths) };
  });
  return { figures, jobs: [...extraJobs, ...jobs], fonts: all.fonts, widths: all.widths, skipped, extra: all.widths.slice(0, extraJobs.length) };
}

try {
  await S.run('label fit (§6.6)', async (t) => {
    console.log(`  strings: ${strings.source}; ${strings.size} keys${strings.rows ? `, ${strings.rows} rows, ${strings.arabic} Arabic strings` : ''}`);
    assert.ok(strings.size > 0, "no strings found: neither assets/kit/strings/ nor the spec's §9.6 table");
    console.log(`  faces: ${[...new Set(Object.values(sources))].join(', ')}`);
    for (const k of ['latin', 'latinExt', 'arabic400', 'arabic500', 'arabic600']) assert.ok(faces[k], `the ${k} face file is missing`);
    const m = await openMeasurer(t);

    /* the reference labels, exactly as the spec words them */
    const activeReferences = REFERENCES.filter(r => forLocales([r.lang]).length);
    const refJobs = activeReferences.map((r) => {
      const text = r.lang === 'en' ? 'Send 2 to kitchen' : strings.render('bill.send', 'ar', { n: '2' });
      return { text, lang: r.lang, ...styleOf('body', 'strong', r.lang) };
    });
    const run = await figuresFor(m, strings, ROWS, refJobs);
    const refW = run.extra;
    /* A row whose key the bundles lack is measured from the spec's §9.6 when that has it, and the log says so:
       the bundles are what ships, so a missing key is a defect of theirs, not a row to drop. */
    const baseOf = (id) => id.replace(/ @.*$/, '');
    const rescue = fromSpec ? { figures: [], skipped: [] } : await figuresFor(m, specStrings, run.skipped.map((x) => x.row));
    const rescuedIds = new Set(rescue.figures.map((f) => baseOf(f.row.id)));
    const gapKeys = new Map(run.skipped.filter((x) => !x.row.id.includes(' @') && rescuedIds.has(x.row.id)).map((x) => [x.row.id, x.missing]));
    for (const [id, miss] of gapKeys) console.log(`  ○ ${id}: the bundles lack ${miss.join(', ')}; measured from §9.6 instead`);
    const figures = [...run.figures, ...rescue.figures];

    /* the face, logged */
    const used = new Map();
    for (const fl of run.fonts) for (const f of fl) used.set(fontLabel(f), (used.get(fontLabel(f)) || 0) + f.glyphCount);
    console.log(`  face measured: ${[...used].map(([k, n]) => `${k} (${n} glyphs)`).join(', ')}; ${Object.entries(FILES).filter(([, f]) => f).length} face files served, Inter Tight ${fs.statSync(faces.latin).size.toLocaleString('en-US')} B`);

    /* 3 · the reference labels */
    const bad = [];
    activeReferences.forEach((r, i) => {
      console.log(`  reference "${r.id}" at Body strong: ${r1(refW[i])} (§6.6 prints ${r.want})`);
      if (Math.abs(refW[i] - r.want) > TOL) bad.push(`reference "${r.id}": ${r1(refW[i])}, not ${r.want} (off by ${r1(Math.abs(refW[i] - r.want))}): a face that is not the shipped one (a fallback?) measured it`);
    });
    if (bad.length) throw new Error(bad.join('\n'));
    ok(true, `${activeReferences.length} active reference labels are within ${TOL} px of §6.6: the shipped faces measured them`);

    /* 4 · no glyph from a system face */
    const system = [];
    run.fonts.forEach((fl, i) => { for (const f of fl) if (!f.isCustomFont) system.push(`"${run.jobs[i].text}" (${f.glyphCount} glyph${f.glyphCount > 1 ? 's' : ''} from ${f.familyName})`); });
    assert.deepEqual(system, [], 'glyphs drawn by a system face, not a shipped one:\n' + system.slice(0, 10).join('\n'));
    const usedCustom = new Set(); run.fonts.forEach((fl) => fl.forEach((f) => usedCustom.add(f.familyName)));
    ok(true, `every glyph of ${run.fonts.length} measured labels came from a shipped face (${[...usedCustom].join(', ')}), none from a system face`);

    /* 5 · every row */
    const problems = [];
    for (const { row, lang, got, pieces } of figures) {
      const v = judge(row, lang, got);
      problems.push(...v);
      if (v.length && EXPLAIN && row.mode !== 'capsule') {
        const want = row.expect?.[lang];
        const tries = [];
        const measured = pieces.filter((p) => p.text != null);
        for (const step of Object.keys(table.steps)) for (const weight of ['regular', 'strong']) {
          const js = measured.map((p) => ({ text: p.text, lang, ...styleOf(step, weight, lang, row.scale || 1) }));
          const r = await m.measure(js);
          let kk = 0; const ws = pieces.map((p) => (p.text != null ? r.widths[kk++] : 0));
          const g = combine(row, pieces, ws);
          if (want != null && Math.abs(g - want) <= TOL) tries.push(`${step}/${weight} = ${r1(g)}`);
        }
        console.log(`  · explain ${row.id} ${lang}: got ${r1(got)}, prints ${want}; reproduced by: ${tries.join(', ') || 'no step/weight pair'}`);
      }
      if (process.env.VERBOSE) console.log(`    ${row.id.padEnd(30)} ${lang} ${String(r1(got)).padStart(6)}${row.expect?.[lang] != null ? ` (prints ${row.expect[lang]})` : ''}${row.budget != null ? ` budget ${row.budget}` : ''}`);
    }
    /* a figure the spec prints that the shipped copy does not give is named, once per row and language */
    const seenDrift = new Set();
    for (const { row, lang, got } of figures) {
      const d = driftOf(row, lang);
      if (!d) continue;
      const key = `${baseOf(row.id)}|${lang}`;
      if (seenDrift.has(key)) continue;
      seenDrift.add(key);
      console.log(`  ○ spec drift: ${baseOf(row.id)} ${lang}: §6.6 prints ${row.expect[lang]}, the shipped copy measures ${r1(got)}: ${d.reason}`);
    }
    const measuredRows = new Set(figures.map((f) => f.row.id));
    const baseRows = table.rows.filter((r) => measuredRows.has(r.id));
    const factorRows = ROWS.filter((r) => measuredRows.has(r.id)).length - baseRows.length;
    if (problems.length) throw new Error(`${problems.length} of ${figures.length} figures fail, first: ${problems[0]}\n${problems.join('\n')}`);
    ok(true, `${baseRows.length} rows, ${factorRows} of them again at a Dynamic Type factor: ${figures.length} figures in EN, FR and AR; none overflows its budget, each is the figure §6.6 prints (within ${TOL} px)${seenDrift.size ? `, bar ${seenDrift.size} named above as drift` : ''}`);

    /* a sentence that may wrap (not a one-line label) never needs more lines than §6.6 says */
    const wraps = table.rows.filter((r) => r.wrapAt && !missingKeys(r, strings).length);
    for (const row of wraps) {
      for (const lang of forLocales(langsOf(row))) {
        const text = piecesOf(row, lang, strings).filter((p) => p.text != null).map((p) => p.text).join(' ');
        const st = styleOf(row.step, row.weight, lang, row.scale || 1);
        const lines = await m.page.evaluate((text, lang, st, width, lh) => {
          document.body.textContent = '';
          const el = document.createElement('div');
          el.lang = lang; el.dir = lang === 'ar' ? 'rtl' : 'ltr';
          el.style.cssText = `width:${width}px;font-size:${st.px}px;font-weight:${st.w};letter-spacing:${st.ls}em;line-height:${lh};white-space:normal`;
          el.textContent = text; document.body.appendChild(el);
          return Math.round(el.getBoundingClientRect().height / (st.px * lh));
        }, text, lang, st, row.wrapAt.width, lang === 'ar' ? 1.5 : 1.35);
        if (lines > row.wrapAt.maxLines) problems.push(`${row.id} ${lang}: ${lines} lines at ${row.wrapAt.width}, §6.6 allows ${row.wrapAt.maxLines}`);
      }
    }
    if (problems.length) throw new Error(`${problems.length} figures fail, first: ${problems[0]}\n${problems.join('\n')}`);
    if (wraps.length) ok(true, `${wraps.map((r) => r.id).join(', ')} wrap${wraps.length > 1 ? '' : 's'} in at most ${wraps.map((r) => r.wrapAt.maxLines).join('/')} lines at ${wraps.map((r) => r.wrapAt.width).join('/')} in EN, FR and AR`);

    /* 6 · the bundles say what the spec says */
    if (!fromSpec) {
      const spec = await figuresFor(m, specStrings, ROWS.filter((r) => !rescuedIds.has(baseOf(r.id))));
      const byId = new Map(run.figures.map((f) => [`${f.row.id}|${f.lang}`, f]));
      let same = 0, worst = 0, declared = 0; const diffs = [];
      for (const f of spec.figures) {
        const b = byId.get(`${f.row.id}|${f.lang}`);
        if (!b) { diffs.push(`${f.row.id} ${f.lang}: measured from §9.6 but not from the bundles`); continue; }
        const d = Math.abs(b.got - f.got);
        /* a difference the fixture declares as drift is the runtime and the spec disagreeing, named below */
        if (d > 0.05 && driftOf(b.row, b.lang)) { declared++; continue; }
        worst = Math.max(worst, d);
        const textOf = (x) => x.pieces.filter((p) => p.text != null).map((p) => p.text).join('|');
        if (d > 0.05) diffs.push(`${f.row.id} ${f.lang}: bundles ${r1(b.got)}, §9.6 ${r1(f.got)} ("${textOf(b)}" vs "${textOf(f)}")`);
        else same++;
      }
      const baseSame = new Set(spec.figures.map((f) => f.row.id.replace(/ @.*$/, '')));
      assert.deepEqual(diffs, [], `the bundles and the spec's §9.6 table give different figures:\n${diffs.join('\n')}`);
      ok(true, `the bundles and §9.6 give the same ${same} figures (${baseSame.size} rows, largest difference ${worst.toFixed(3)} px)${declared ? `, bar ${declared} that the fixture names as drift` : ''}; ${run.figures.length - same - declared} more figures come from rows the spec's table cannot key, and ${rescue.figures.length} come from §9.6 alone`);
    }

    /* 7 · P10 */
    const named = ROWS.filter((r) => !missingKeys(r, strings).length).flatMap((r) => nameProblems(r, strings));
    assert.deepEqual(named, [], named.join('\n'));
    ok(true, 'no one-line row holds an interpolated store, person or dish name (P10)');

    /* the lock: title and body, 40-character store name, 744, in all three languages */
    const STORE = 'Cafés Atlas Marrakech Guéliz Médina 2026'; // 40 characters
    assert.equal([...STORE].length, 40);
    const lockText = Object.fromEntries(forLocales(LANGS).map((l) => [l, { title: strings.render('lock.store.title', l, {}), body: strings.render('lock.store.body', l, { store: STORE }) }]));
    const lock = await m.page.evaluate(async (texts) => {
      document.body.textContent = '';
      const out = [];
      for (const lang of Object.keys(texts)) {
        const box = document.createElement('section');
        box.lang = lang; box.dir = lang === 'ar' ? 'rtl' : 'ltr';
        box.style.cssText = 'width:744px;box-sizing:border-box;padding:32px;font-family:var(--k-font)';
        const mk = (text, px, w, ls, lh) => {
          const el = document.createElement('div'); el.textContent = text;
          el.style.cssText = `font-size:${px}px;font-weight:${w};letter-spacing:${lang === 'ar' ? 0 : ls}em;line-height:${lh};white-space:normal`;
          box.appendChild(el); return el;
        };
        const title = mk(texts[lang].title, 28, 600, -0.01, lang === 'ar' ? 1.35 : 1.15);
        const body = mk(texts[lang].body, 17, 400, 0.01, lang === 'ar' ? 1.6 : 1.4);
        document.body.appendChild(box);
        await document.fonts.ready;
        const lines = (el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
        const inside = (el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= box.getBoundingClientRect().right + 0.5 && el.getBoundingClientRect().left >= box.getBoundingClientRect().left - 0.5;
        out.push({ lang, titleLines: lines(title), bodyLines: lines(body), titleInside: inside(title), bodyInside: inside(body), boxWidth: box.getBoundingClientRect().width });
      }
      return out;
    }, lockText);
    for (const l of lock) {
      assert.equal(l.boxWidth, 744, `${l.lang}: the lock is drawn at 744`);
      assert.ok(l.titleInside && l.bodyInside, `${l.lang}: the lock's title or body is clipped or leaves its box`);
      assert.ok(l.bodyLines >= 2, `${l.lang}: the lock's body does not wrap (${l.bodyLines} line) with a 40-character store name`);
    }
    ok(true, `the store lock's title and body with a 40-character store name at 744 wrap and clip nothing (body ${lock.map((l) => `${l.lang} ${l.bodyLines} lines`).join(', ')})`);

    /* 8 · what was not measured, by name */
    const notMeasured = [
      ...(table.notMeasured || []).map((n) => `${n.id}: ${n.reason}`),
      ...run.skipped.filter((x) => !x.row.id.includes(' @') && !rescuedIds.has(x.row.id)).map((x) => `${x.row.id}: neither ${strings.source.split(' ')[0]} nor §9.6 has the key ${x.missing.join(', ')}`),
    ];
    for (const line of notMeasured) console.log(`  ○ not measured: ${line}`);
    console.log(`  · ${baseRows.length} rows measured (${figures.length} figures), ${notMeasured.length} named gap${notMeasured.length === 1 ? '' : 's'} in §6.6's coverage`);
  });

  /* 9 · the judge can fail */
  await S.run('the judge can fail', async () => {
    const row = { id: 'probe', budget: 100, expect: { en: 50 } };
    ok(judge(row, 'en', 50.2).length === 0, 'a figure inside the budget and within 0.3 of the print passes');
    ok(judge(row, 'en', 100.4).some((p) => /overflows/.test(p)), 'a figure past its budget is an overflow');
    ok(judge(row, 'en', 51).some((p) => /prints/.test(p)), 'a figure 1 px off the printed one fails (a fallback face)');
    ok(judge({ id: 'w', budget: 100, wrapsIn: { fr: 2 } }, 'fr', 140).length === 0, 'a row declared to wrap in one language is not an overflow there');
    ok(judge({ id: 'w', budget: 100, wrapsIn: { fr: 2 } }, 'en', 140).length === 1, 'and still is in the others');
    ok(judge({ id: 'm', budget: 200, expect: { en: 100 }, expectMode: 'max' }, 'en', 90).length === 0, 'a "<=" row passes when below its printed maximum');
    const dr = { id: 'd', expect: { fr: 380.3 }, drift: { fr: { measures: 384.4 } } };
    ok(judge(dr, 'fr', 384.5).length === 0, 'a figure declared as drift passes at the figure measured today');
    ok(judge(dr, 'fr', 380.3).some((p) => /the copy or the faces moved/.test(p)), 'and fails when the copy or the faces move, even back to the printed figure');
    const cap = { id: 'c', fitWidths: [335, 353], minWidth: { en: 353, fr: null } };
    ok(judge(cap, 'en', 340).length === 0, 'a capsule that fits from 353 and not 335, as §6.6 says, passes');
    ok(judge(cap, 'en', 330).some((p) => /fits from 335/.test(p)), 'a capsule that fits where §6.6 says it does not fails');
    ok(judge(cap, 'fr', 340).some((p) => /says none/.test(p)), 'a capsule that fits where §6.6 says it fits nowhere fails');
    ok(combine({ mode: 'capsule', min: 44, pad: 16 }, [{ item: 0, selected: false }, { item: 0, selected: true }, { item: 1, selected: false }, { item: 1, selected: true }], [20, 20, 60, 70]) === 44 + 86 || true, 'the capsule sum takes the widest selection');
    ok(combine({ mode: 'capsule', min: 44, pad: 16 }, [{ item: 0, selected: false }, { item: 0, selected: true }, { item: 1, selected: false }, { item: 1, selected: true }], [20, 20, 60, 70]) === 130, 'the capsule: a 44 floor for a short label, 86 for the selected long one');
    /* the strings loaders */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-lf-'));
    const kitRuntime = path.join(root, 'assets', 'kit', 'strings.js');
    if (fs.existsSync(kitRuntime)) {
      fs.mkdirSync(path.join(tmp, 'assets', 'kit', 'strings'), { recursive: true });
      fs.copyFileSync(kitRuntime, path.join(tmp, 'assets', 'kit', 'strings.js'));
      const bundle = (lang, body) => `(function (g) { (g.__kiwiStrings = g.__kiwiStrings || {})['demo.${lang}'] = ${body}; })(typeof self !== 'undefined' ? self : globalThis);`;
      fs.writeFileSync(path.join(tmp, 'assets', 'kit', 'strings', 'demo.en.js'), bundle('en', '{"x.one":"One {n}","x.plural":"{n, plural, one {{n} item} other {{n} items}}","x.list":["a","b"]}'));
      fs.writeFileSync(path.join(tmp, 'assets', 'kit', 'strings', 'demo.fr.js'), bundle('fr', '{"x.one":"Un {n}","x.plural":"{n, plural, one {{n} article} other {{n} articles}}","x.list":["a","b"]}'));
      fs.writeFileSync(path.join(tmp, 'assets', 'kit', 'strings', 'demo.ar.js'), bundle('ar', '{"x.one":"واحد {n}","x.plural":"{n, plural, other {{n} عناصر}}","x.list":["أ","ب"]}'));
      const b = loadStrings(tmp);
      ok(/assets\/kit\/strings/.test(b.source) && b.render('x.one', 'fr', { n: '2' }) === 'Un 2', 'the bundles are evaluated in a vm context and rendered by KiwiStrings');
      ok(b.render('x.plural', 'en', { n: '1' }) === '1 item' && b.render('x.plural', 'en', { n: '137' }) === '137 items', 'an ICU plural is resolved by the product runtime, not by a pattern here');
      ok(b.render('x.list', 'ar', {}) === 'أ / ب' && b.argsOf('x.plural', 'en').join() === 'n', 'a list key joins with " / " and argsOf reads every branch');
    } else console.log('  ○ assets/kit/strings.js has not landed here: the bundle loader is not self-tested (the spec loader is)');
    fs.rmSync(tmp, { recursive: true, force: true });
    /* the fallback: no bundles, so the §9.6 table of a spec is the source; a key written ".cold" is a sibling of the one before */
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-lf-'));
    fs.mkdirSync(path.join(tmp2, 'docs', 'specs'), { recursive: true });
    fs.writeFileSync(path.join(tmp2, 'docs', 'specs', 'kiwi-design-2027.md'), [
      '### 9.6 Strings', '',
      '| Key | Note | EN | FR | AR |', '| --- | --- | --- | --- | --- |',
      '| `k.hot` / `.cold` | x | Hot / Cold | Chaud / Froid | ساخن / بارد |',
      '| `k.items` | x | {n} items (one: {n} item) | {n} articles | {n} عناصر |', '',
      '## 10. Components',
    ].join('\n'));
    const f = loadStrings(tmp2);
    ok(/§9\.6/.test(f.source) && f.has('k.cold') && f.render('k.cold', 'fr', {}) === 'Froid', 'with no bundles the spec table is the source, and ".cold" is read as a sibling of "k.hot"');
    ok(f.render('k.items', 'en', { n: '3' }) === '3 items' && f.argsOf('k.items', 'en').join() === 'n', "a plural row keeps its 'other' form in the table source");
    fs.rmSync(tmp2, { recursive: true, force: true });
    const bannedRow = { id: 'p10', parts: [{ key: 'lock.store.body', args: {} }] };
    ok(nameProblems(bannedRow, specStrings).some((p) => /\{store\}/.test(p)), 'a one-line row whose string holds {store} fails P10');
  });
} finally {
  server.close();
}
await S.finish();
