#!/usr/bin/env node
/* menu-scan-reader-test · what « Scanner un menu » reads, run without its
 * screen (thirteenth blind rating, vision#0: the controller mixed its modal
 * with pdf.js loading and page rendering; the reading now lives in
 * assets/menu-scan-reader.js).
 *   · a PDF's text layer is read page by page, twelve pages at most;
 *   · a scanned PDF's first page becomes a JPEG no larger than 1600 px;
 *   · pdf.js that fails to load can be tried again (the failed promise used
 *     to be kept for the whole session, so every later PDF failed too);
 *   · the CSV keeps the menu import's exact columns and escapes « ; ».
 *   node tools/menu-scan-reader-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/menu-scan-reader.js', import.meta.url), 'utf8');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; console.log('  ✓ ' + msg); };

function realm({ loads = true } = {}) {
  const scripts = [], canvases = [];
  const pdf = (pages) => ({
    numPages: pages.length,
    getPage: async (i) => ({
      getTextContent: async () => ({ items: pages[i - 1].split(' ').map((str) => ({ str })) }),
      getViewport: ({ scale }) => ({ width: 3000 * scale, height: 2000 * scale }),
      render: () => ({ promise: Promise.resolve() }),
    }),
  });
  const window = {};
  const pdfjsLib = { GlobalWorkerOptions: {}, getDocument: ({ data }) => ({ promise: Promise.resolve(pdf(data.pages)) }) };
  const document = {
    head: { appendChild(el) { scripts.push(el); queueMicrotask(() => { if (loads) { window.pdfjsLib = pdfjsLib; el.onload(); } else el.onerror(); }); } },
    createElement(tag) {
      if (tag === 'canvas') { const c = { getContext: () => ({}), toDataURL: (type, q) => `data:${type};q=${q};${c.width}x${c.height}` }; canvases.push(c); return c; }
      return {};
    },
  };
  const ctx = vm.createContext({ window, document, queueMicrotask, Promise });
  vm.runInContext(source, ctx);
  return { R: window.KiwiMenuScanReader, window, scripts, canvases, setLoads: (v) => { loads = v; } };
}
const file = (pages) => ({ arrayBuffer: async () => ({ pages }) });

{
  const { R, scripts } = realm();
  const pages = Array.from({ length: 15 }, (_, i) => 'page' + (i + 1) + ' TAJINE 95');
  const text = await R.pdfText(file(pages));
  ok(text.startsWith('page1 TAJINE 95') && text.includes('page12 ') && !text.includes('page13'), 'the text layer is read from the first twelve pages only');
  ok(scripts.length === 1 && scripts[0].src === 'assets/vendor/pdfjs/pdf.min.js', 'pdf.js is fetched once, from the vendored build');
  await R.pdfText(file(['again']));
  ok(scripts.length === 1, 'a second PDF reuses the loaded pdf.js');
}
{
  const { R, canvases } = realm();
  const image = await R.pdfFirstPageImage(file(['scan']));
  ok(/^data:image\/jpeg;q=0\.85;1600x1067$/.test(image), `a scanned page becomes a JPEG, longest side 1600 px (${image})`);
  ok(canvases.length === 1, 'one page rendered');
}
{
  const r = realm({ loads: false });
  await assert.rejects(r.R.pdfText(file(['x'])), /pdfjs/);
  r.setLoads(true);
  ok((await r.R.pdfText(file(['menu du jour']))) === 'menu du jour' && r.scripts.length === 2, 'after pdf.js fails to load, the next PDF tries again and reads');
}
{
  const { R } = realm();
  const csv = R.toCsvText([{ name: 'Tajine; citron', cat: 'Plats', price: '95', desc: 'avec "olives"\nvertes' }, { name: 'Thé', price: 'x' }]);
  ok(csv === 'article;categorie;sous_categorie;prix_mad;description;disponible\n"Tajine; citron";Plats;;95;"avec ""olives"" vertes";oui\nThé;;;0;;oui', 'the CSV keeps the import columns, escapes « ; » and quotes, zero for an unreadable price');
  ok(JSON.stringify(R.dedupe([{ name: 'Thé', cat: 'B' }, { name: 'thé ', cat: 'b' }, { name: '', cat: 'B' }, { name: 'Thé', cat: 'C' }]).map((x) => x.cat)) === '["B","C"]', 'duplicates by name and category are dropped, nameless rows too');
}
console.log(`\n✓ menu-scan-reader-test · ${checks} checks`);
