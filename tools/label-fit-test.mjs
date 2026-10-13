#!/usr/bin/env node
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
 *   1. says where the strings came from (strings/*.json, else the spec's §9.6
 *      table, which is their seed), counts the rows and the Arabic strings;
 *   2. serves the shipped faces (assets/fonts/, else where they are today),
 *      declares them exactly as §6.1 does, and logs the face it measured;
 *   3. measures the two reference labels (EN "Send 2 to kitchen" 136.1 and the
 *      Arabic bill.send 136.4) and fails past 0.3 px: a face that is not the
 *      shipped one cannot pass;
 *   4. asks Chromium (CSS.getPlatformFontsForNode) which font drew every glyph
 *      of every measured label, and fails when any glyph came from a system face;
 *   5. measures every row of tools/fixtures/label-fit.json in EN, FR and AR,
 *      fails on an overflow of its budget and on a width that is not the figure
 *      §6.6 prints (0.3 px);
 *   6. holds P10: a one-line row never carries an interpolated name; the lock's
 *      title and body, with a 40-character store name at 744, in all three
 *      languages, wrap and clip nothing;
 *   7. proves the judge can fail (an overflow, a drift, a fallback face).
 *
 *   node tools/label-fit-test.mjs               the run above
 *   EXPLAIN=1 node tools/label-fit-test.mjs     for a row that drifts, also
 *                                               print the step/weight pairs that
 *                                               would give the printed figure
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { loadStrings, fill, argumentsOf } from './label-fit-strings.mjs';
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
   13 x f (and so on), the icons and marks the row lists as `px` parts do not scale. */
const ROWS = table.rows.flatMap((r) => [r, ...(r.factors || []).map((fc) => ({ ...r, id: `${r.id} @${fc.f}`, scale: (r.scale || 1) * fc.f, expect: fc.expect, budget: fc.budget ?? null, expectMode: fc.expectMode ?? r.expectMode, wrapsIn: undefined, factors: undefined, wrapAt: undefined }))]);
const BANNED_ARGS = new Set(['store', 'paired', 'name', 'venue', 'person', 'dish', 'staff', 'customer']);
const REFERENCES = [
  { id: 'Send 2 to kitchen', lang: 'en', want: 136.1 },
  { id: 'bill.send (Arabic)', lang: 'ar', want: 136.4 },
];

/* ── The strings ── */
const strings = loadStrings(root);

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

const mime = { '.woff2': 'font/woff2', '.html': 'text/html' };
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://local').pathname;
  if (p === '/__lf/page.html') { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); res.end(pageHtml()); return; }
  if (FILES[p] && FILES[p]) { res.writeHead(200, { 'Content-Type': mime['.woff2'], 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(FILES[p])); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('label-fit', { browser });
const ok = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };

/* ── Pure parts (also run against synthetic input at the end) ── */

const r1 = (x) => Math.round(x * 10) / 10;
const sample = (v, lang) => (typeof v === 'string' && v.startsWith('$') ? table.samples[v.slice(1)][lang] : v);

/* One row in one language -> the pieces to measure, in order. */
function piecesOf(row, lang) {
  const out = [];
  for (const part of row.parts) {
    if (part.px != null) { out.push({ fixed: part.px }); continue; }
    if (part.sample) { /* a formatted value (an amount, a date): KiwiFormat's output for a fixed input */
      const text = table.samples[part.sample]?.[lang];
      if (text == null) throw new Error(`row ${row.id}: no sample "${part.sample}" in ${lang}`);
      out.push({ text, key: null, pad: part.pad || 0, gap: 0, step: part.step || row.step, weight: part.weight || row.weight });
      continue;
    }
    const entry = strings.map.get(part.key);
    if (!entry || typeof entry[lang] !== 'string') throw new Error(`row ${row.id}: key ${part.key} has no ${lang} string`);
    const args = Object.fromEntries(Object.entries(part.args || {}).map(([k, v]) => [k, sample(v, lang)]));
    const text = fill(entry[lang], args);
    const texts = part.split ? text.split(part.split) : [text];
    texts.forEach((t, i) => out.push({ text: t.trim(), key: part.key, pad: part.pad || 0, gap: i < texts.length - 1 ? part.gap || 0 : 0, step: part.step || row.step, weight: part.weight || row.weight }));
  }
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
  if (row.max) return Math.max(...pieces.map((p, i) => (p.text != null ? widths[i] + p.pad : -Infinity)));
  let sum = 0;
  pieces.forEach((p, i) => { sum += (p.fixed != null ? p.fixed : widths[i] + p.pad) + (p.gap || 0); });
  return sum;
}

/* The verdict on one measured figure. */
function judge(row, lang, got) {
  const out = [];
  const want = row.expect?.[lang];
  if (row.budget != null && got > row.budget + 0.05 && !(row.wrapsIn && row.wrapsIn[lang])) out.push(`${row.id} ${lang}: ${r1(got)} overflows its budget ${row.budget} by ${r1(got - row.budget)}`);
  if (want != null) {
    const drift = row.expectMode === 'max' ? (got > want + TOL ? got - want : 0) : Math.abs(got - want);
    if (drift > TOL) out.push(`${row.id} ${lang}: measured ${r1(got)}, §6.6 prints ${want} (off by ${r1(drift)}; the limit is ${TOL})`);
  }
  return out;
}

/* P10: no interpolated name on a one-line control. */
function nameProblems(row) {
  const out = [];
  for (const part of row.parts) {
    if (!part.key) continue;
    const entry = strings.map.get(part.key);
    for (const lang of LANGS) {
      for (const a of argumentsOf(entry?.[lang] || '')) {
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

try {
  await S.run('label fit (§6.6)', async (t) => {
    console.log(`  strings: ${strings.source}; ${strings.map.size} keys${strings.rows ? `, ${strings.rows} rows, ${strings.arabic} Arabic strings` : ''}`);
    assert.ok(strings.map.size > 0, 'no strings found: neither strings/*.json nor the spec\'s §9.6 table');
    console.log(`  faces: ${[...new Set(Object.values(sources))].join(', ')}`);
    for (const k of ['latin', 'latinExt', 'arabic400', 'arabic500', 'arabic600']) assert.ok(faces[k], `the ${k} face file is missing`);
    const m = await openMeasurer(t);

    /* 1 · build every job */
    const jobs = []; const index = []; // index: {row, lang, from, pieces}
    for (const row of ROWS) {
      for (const lang of LANGS) {
        const pieces = piecesOf(row, lang);
        const from = jobs.length;
        for (const p of pieces) if (p.text != null) jobs.push({ text: p.text, lang, ...styleOf(p.step, p.weight, lang, row.scale || 1) });
        index.push({ row, lang, from, pieces });
      }
    }
    /* the reference labels, exactly as the spec words them */
    const refJobs = REFERENCES.map((r) => {
      const text = r.lang === 'en' ? 'Send 2 to kitchen' : fill(strings.map.get('bill.send').ar, { n: '2' });
      return { text, lang: r.lang, ...styleOf('body', 'strong', r.lang) };
    });
    const all = await m.measure([...refJobs, ...jobs]);
    const refW = all.widths.slice(0, refJobs.length), W = all.widths.slice(refJobs.length);

    /* 2 · the face, logged */
    const used = new Map();
    for (const fs_ of all.fonts) for (const f of fs_) used.set(fontLabel(f), (used.get(fontLabel(f)) || 0) + f.glyphCount);
    console.log(`  face measured: ${[...used].map(([k, n]) => `${k} (${n} glyphs)`).join(', ')}; ${Object.entries(FILES).filter(([, f]) => f).length} face files served, Inter Tight ${fs.statSync(faces.latin).size.toLocaleString('en-US')} B`);

    /* 3 · the reference labels */
    const bad = [];
    REFERENCES.forEach((r, i) => {
      console.log(`  reference "${r.id}" at Body strong: ${r1(refW[i])} (§6.6 prints ${r.want})`);
      if (Math.abs(refW[i] - r.want) > TOL) bad.push(`reference "${r.id}": ${r1(refW[i])}, not ${r.want} (off by ${r1(Math.abs(refW[i] - r.want))}): a face that is not the shipped one (a fallback?) measured it`);
    });
    if (bad.length) throw new Error(bad.join('\n'));
    ok(true, `both reference labels are within ${TOL} px of §6.6: the shipped faces measured them`);

    /* 4 · no glyph from a system face */
    const system = [];
    all.fonts.forEach((fl, i) => { for (const f of fl) if (!f.isCustomFont) system.push(`"${[...refJobs, ...jobs][i].text}" (${f.glyphCount} glyph${f.glyphCount > 1 ? 's' : ''} from ${f.familyName})`); });
    assert.deepEqual(system, [], 'glyphs drawn by a system face, not a shipped one:\n' + system.slice(0, 10).join('\n'));
    const usedCustom = new Set(); all.fonts.forEach((fl) => fl.forEach((f) => usedCustom.add(f.familyName)));
    ok(true, `every glyph of ${all.fonts.length} measured labels came from a shipped face (${[...usedCustom].join(', ')}), none from a system face`);

    /* 5 · every row */
    const problems = [];
    let figures = 0;
    for (const { row, lang, from, pieces } of index) {
      const measured = pieces.filter((p) => p.text != null);
      const widths = []; let k = 0;
      for (const p of pieces) widths.push(p.text != null ? W[from + k++] : 0);
      const got = combine(row, pieces, widths);
      figures++;
      const v = judge(row, lang, got);
      problems.push(...v);
      if (v.length && EXPLAIN) {
        const want = row.expect?.[lang];
        const tries = [];
        for (const step of Object.keys(table.steps)) for (const weight of ['regular', 'strong']) {
          const js = measured.map((p) => ({ text: p.text, lang, ...styleOf(step, weight, lang, row.scale || 1) }));
          const r = await m.measure(js);
          let kk = 0; const ws = pieces.map((p) => (p.text != null ? r.widths[kk++] : 0));
          const g = combine(row, pieces, ws);
          if (want != null && Math.abs(g - want) <= TOL) tries.push(`${step}/${weight} = ${r1(g)}`);
        }
        console.log(`  · explain ${row.id} ${lang}: got ${r1(got)}, prints ${want}; reproduced by: ${tries.join(', ') || 'no step/weight pair'}`);
      }
      if (process.env.VERBOSE) console.log(`    ${row.id.padEnd(22)} ${lang} ${String(r1(got)).padStart(6)}${row.expect?.[lang] != null ? ` (prints ${row.expect[lang]})` : ''}${row.budget != null ? ` budget ${row.budget}` : ''}`);
    }
    if (problems.length) throw new Error(`${problems.length} of ${figures} figures fail, first: ${problems[0]}\n${problems.join("\n")}`);
    ok(true, `${table.rows.length} rows, ${ROWS.length - table.rows.length} of them again at a Dynamic Type factor: ${figures} figures in EN, FR and AR; none overflows its budget, each is the figure §6.6 prints (within ${TOL} px)`);

    /* a sentence that may wrap (not a one-line label) never needs more lines than §6.6 says */
    const wraps = table.rows.filter((r) => r.wrapAt);
    for (const row of wraps) {
      for (const lang of LANGS) {
        const text = piecesOf(row, lang).filter((p) => p.text != null).map((p) => p.text).join(' ');
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

    /* 6 · P10 */
    const named = table.rows.flatMap(nameProblems);
    assert.deepEqual(named, [], named.join('\n'));
    ok(true, 'no one-line row holds an interpolated store, person or dish name (P10)');

    /* the lock: title and body, 40-character store name, 744, in all three languages */
    const STORE = 'Cafés Atlas Marrakech Guéliz Médina 2026'; // 40 characters
    assert.equal([...STORE].length, 40);
    const lock = await m.page.evaluate(async (store, keys) => {
      document.body.textContent = '';
      const out = [];
      for (const lang of ['en', 'fr', 'ar']) {
        const box = document.createElement('section');
        box.lang = lang; box.dir = lang === 'ar' ? 'rtl' : 'ltr';
        box.style.cssText = 'width:744px;box-sizing:border-box;padding:32px;font-family:var(--k-font)';
        const mk = (text, px, w, ls, lh) => {
          const el = document.createElement('div'); el.textContent = text;
          el.style.cssText = `font-size:${px}px;font-weight:${w};letter-spacing:${lang === 'ar' ? 0 : ls}em;line-height:${lh};white-space:normal`;
          box.appendChild(el); return el;
        };
        const title = mk(keys.title[lang], 28, 600, -0.01, lang === 'ar' ? 1.35 : 1.15);
        const body = mk(keys.body[lang].replaceAll('{store}', store), 17, 400, 0.01, lang === 'ar' ? 1.6 : 1.4);
        document.body.appendChild(box);
        await document.fonts.ready;
        const lines = (el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
        const inside = (el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= box.getBoundingClientRect().right + 0.5 && el.getBoundingClientRect().left >= box.getBoundingClientRect().left - 0.5;
        out.push({ lang, titleLines: lines(title), bodyLines: lines(body), titleInside: inside(title), bodyInside: inside(body), boxWidth: box.getBoundingClientRect().width });
      }
      return out;
    }, STORE, { title: strings.map.get('lock.store.title'), body: strings.map.get('lock.store.body') });
    for (const l of lock) {
      assert.equal(l.boxWidth, 744, `${l.lang}: the lock is drawn at 744`);
      assert.ok(l.titleInside && l.bodyInside, `${l.lang}: the lock's title or body is clipped or leaves its box`);
      assert.ok(l.bodyLines >= 2, `${l.lang}: the lock's body does not wrap (${l.bodyLines} line) with a 40-character store name`);
    }
    ok(true, `the store lock's title and body with a 40-character store name at 744 wrap and clip nothing (body ${lock.map((l) => `${l.lang} ${l.bodyLines} lines`).join(', ')})`);
  });

  /* 7 · the judge can fail */
  await S.run('the judge can fail', async () => {
    const row = { id: 'probe', budget: 100, expect: { en: 50 } };
    ok(judge(row, 'en', 50.2).length === 0, 'a figure inside the budget and within 0.3 of the print passes');
    ok(judge(row, 'en', 100.4).some((p) => /overflows/.test(p)), 'a figure past its budget is an overflow');
    ok(judge(row, 'en', 51).some((p) => /prints/.test(p)), 'a figure 1 px off the printed one fails (a fallback face)');
    ok(judge({ id: 'w', budget: 100, wrapsIn: { fr: 2 } }, 'fr', 140).length === 0, 'a row declared to wrap in one language is not an overflow there');
    ok(judge({ id: 'w', budget: 100, wrapsIn: { fr: 2 } }, 'en', 140).length === 1, 'and still is in the others');
    ok(judge({ id: 'm', budget: 200, expect: { en: 100 }, expectMode: 'max' }, 'en', 90).length === 0, 'a "<=" row passes when below its printed maximum');
    /* the strings loader reads both bundle shapes, and prefers them to the spec's table */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-lf-'));
    fs.mkdirSync(path.join(tmp, 'strings'));
    fs.writeFileSync(path.join(tmp, 'strings', 'a.json'), JSON.stringify({ 'x.one': { en: 'One', fr: 'Un', ar: 'واحد' }, 'x.plural': { en: { one: 'a', other: 'many' }, fr: 'f', ar: 'ع' } }));
    let s1 = loadStrings(tmp);
    ok(s1.map.get('x.one').fr === 'Un' && s1.map.get('x.plural').en === 'many' && /strings\/\*\.json/.test(s1.source), 'strings/*.json as {key: {en, fr, ar}} is read, a plural by its "other" form');
    fs.writeFileSync(path.join(tmp, 'strings', 'a.json'), JSON.stringify({ en: { 'y.k': 'Y' }, fr: { 'y.k': 'Y fr' }, ar: { 'y.k': 'Y ar' } }));
    s1 = loadStrings(tmp);
    ok(s1.map.get('y.k').ar === 'Y ar', 'strings/*.json as {en: {key}, fr: {key}, ar: {key}} is read too');
    fs.rmSync(tmp, { recursive: true, force: true });
    const bannedRow = { id: 'p10', parts: [{ key: 'lock.store.body', args: {} }] };
    ok(nameProblems(bannedRow).some((p) => /\{store\}/.test(p)), 'a one-line row whose string holds {store} fails P10');
  });
} finally {
  server.close();
}
await S.finish();
