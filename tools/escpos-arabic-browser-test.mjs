#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
/* L'arabe sur le papier (assets/escpos.js), dans un vrai navigateur.
 *
 * CP1252 n'a pas l'arabe : un reçu réglé en arabe, un plat « طاجين » ou un
 * client « سعاد » sortaient en « ????? ». Ces lignes partent maintenant en
 * image ESC * 33. On décode les octets imprimés en bitmap et on vérifie :
 *   · plus aucun « ? » à la place d'une lettre arabe ;
 *   · de l'encre là où doit être le texte : sur une ligne « libellé ⋯ montant »
 *     en arabe, le libellé à DROITE et le montant à GAUCHE, comme à l'écran ;
 *   · un bon de cuisine en double taille : la ligne arabe fait deux bandes ;
 *   · un ticket sans arabe reste octet pour octet celui d'avant (Node, sans
 *     canvas, produit exactement les mêmes octets) ;
 *   · le reçu complet (KiwiReceipt, langue arabe) passe par le même chemin.
 * KIWI_SHOTS=dir écrit les bitmaps décodés en PNG pour les regarder. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* Node, sans canvas : le chemin texte d'avant. */
const nodeWin = {};
vm.runInContext(fs.readFileSync(path.join(root, 'assets/escpos.js'), 'utf8'), vm.createContext({ window: nodeWin, btoa: (s) => Buffer.from(s, 'binary').toString('base64') }));
const NE = nodeWin.KiwiEscPos;
check(NE.needsRaster('طاجين') && !NE.needsRaster('Crêpe à 25 € · ok') && !NE.needsRaster('1 100 MAD'), 'only text the code page cannot carry is drawn');
const latinTicket = { paper: '80', title: 'CUISINE', table: 'T4', items: [{ qty: 2, name: 'Tajine poulet citron', note: 'sans olives' }] };
const nodeLatin = Array.from(NE.kitchenTicket(latinTicket));
const nodeArabic = Array.from(NE.kitchenTicket({ paper: '80', title: 'CUISINE', items: [{ qty: 1, name: 'طاجين' }] }));
check(nodeArabic.includes(0x3F), 'without a canvas the encoder still answers (old text path), it never throws');

let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log(`escpos-arabic: ${checks} passed · ○ browser part skipped (puppeteer-core unavailable)`); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log(`escpos-arabic: ${checks} passed · ○ browser part skipped (Chromium unavailable)`); process.exit(process.env.CI ? 1 : 0); }

const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><style>@font-face{font-family:"IBM Plex Sans Arabic";src:url(/assets/vendor/month-report/IBMPlexSansArabic-Regular.ttf)}body{background:#F7F5F0}</style></head><body>
<script src="/assets/escpos.js"></script><script src="/assets/receipt.js"></script>
<script>
/* Décode ESC * 33 : chaque bande = 24 points de haut, 3 octets par colonne.
   Les bandes consécutives d'une même ligne dessinée sont recollées. */
window.decode = function (bytes) {
  var images = [], cur = null, i = 0;
  while (i < bytes.length) {
    if (bytes[i] === 0x1B && bytes[i + 1] === 0x2A && bytes[i + 2] === 33) {
      var w = bytes[i + 3] | (bytes[i + 4] << 8), rows = [];
      for (var y = 0; y < 24; y++) rows.push(new Uint8Array(w));
      var p = i + 5;
      for (var x = 0; x < w; x++) for (var s = 0; s < 3; s++) { var b = bytes[p++]; for (var bit = 0; bit < 8; bit++) if (b & (0x80 >> bit)) rows[s * 8 + bit][x] = 1; }
      if (!cur) { cur = { w: w, rows: [] }; images.push(cur); }
      cur.rows = cur.rows.concat(rows);
      i = p; if (bytes[i] === 0x0A) i++;
      continue;
    }
    if (bytes[i] === 0x1B && bytes[i + 1] === 0x32) cur = null;
    i++;
  }
  return images.map(function (im) {
    var cols = new Array(im.w).fill(0);
    im.rows.forEach(function (r) { for (var x = 0; x < im.w; x++) cols[x] += r[x]; });
    var ink = cols.map(function (c) { return c > 0; });
    var first = ink.indexOf(true), last = ink.lastIndexOf(true);
    return { w: im.w, h: im.rows.length, ink: ink.filter(Boolean).length, first: first, last: last, rows: im.rows.map(function (r) { return Array.from(r).join(''); }) };
  });
};
/* Les octets hors image : ce que l'imprimante lit comme du texte. */
window.textBytes = function (bytes) {
  var out = [], i = 0;
  while (i < bytes.length) {
    if (bytes[i] === 0x1B && bytes[i + 1] === 0x2A && bytes[i + 2] === 33) { var w = bytes[i + 3] | (bytes[i + 4] << 8); i += 5 + w * 3; continue; }
    out.push(bytes[i]); i++;
  }
  return out;
};
window.png = function (im) {
  var c = document.createElement('canvas'); c.width = im.w; c.height = im.h;
  var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, im.w, im.h); ctx.fillStyle = '#000';
  im.rows.forEach(function (r, y) { for (var x = 0; x < im.w; x++) if (r[x] === '1') ctx.fillRect(x, y, 1, 1); });
  return c.toDataURL('image/png');
};
</script></body></html>`;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(HARNESS); }
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.ttf') ? 'font/ttf' : 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
await page.goto(base + '/', { waitUntil: 'load' });
await page.evaluate(() => document.fonts.load('500 21px "IBM Plex Sans Arabic"', 'طاجين').catch(() => null));
const shots = process.env.KIWI_SHOTS;
const save = async (name, im) => { if (!shots) return; const d = await page.evaluate((im) => window.png(im), im); fs.mkdirSync(shots, { recursive: true }); fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(d.split(',')[1], 'base64')); };

{
  const browserLatin = await page.evaluate((o) => Array.from(window.KiwiEscPos.kitchenTicket(o)), latinTicket);
  check(JSON.stringify(browserLatin) === JSON.stringify(nodeLatin), 'a ticket without Arabic is byte-for-byte the ticket it was before');
}
{
  const r = await page.evaluate(() => {
    const b = window.KiwiEscPos.builder('80').init();
    b.line(' المجموع' + ' '.repeat(30) + '120,00 MAD');
    b.line(' Tajine' + ' '.repeat(30) + '120,00 MAD');
    const bytes = Array.from(b.bytes());
    return { bytes, imgs: window.decode(bytes) };
  });
  const im = r.imgs[0];
  check(r.imgs.length === 1 && im.w === 576 && im.h === 24, `one Arabic line, one 24-dot band across 80 mm (${im && im.w}×${im && im.h})`);
  const left = im.rows.reduce((n, row) => n + [...row.slice(0, 200)].filter((c) => c === '1').length, 0);
  const right = im.rows.reduce((n, row) => n + [...row.slice(376)].filter((c) => c === '1').length, 0);
  check(left > 20 && right > 20, `ink on both sides: the amount on the left (${left}) and the Arabic label on the right (${right})`);
  const labelInk = im.rows.reduce((n, row) => n + [...row.slice(440)].filter((c) => c === '1').length, 0);
  check(labelInk > 20, 'the label sits at the right edge, as the receipt reads in Arabic');
  check(!r.bytes.length || (await page.evaluate((b) => window.textBytes(b).filter((x) => x === 0x3F).length, r.bytes)) === 0, 'no « ? » printed in place of the Arabic');
  const latinPart = r.bytes.slice(r.bytes.lastIndexOf(0x4A) + 3);
  check(String.fromCharCode(...latinPart).includes(' Tajine') && String.fromCharCode(...latinPart).includes('120,00 MAD'), 'the next Latin line is plain text again, in the printer font');
  await save('row-ar', im);
}
{
  const r = await page.evaluate(() => {
    const bytes = Array.from(window.KiwiEscPos.kitchenTicket({ paper: '80', title: 'CUISINE', table: 'T4', items: [{ qty: 2, name: 'طاجين دجاج بالليمون', note: 'بدون زيتون' }] }));
    return { imgs: window.decode(bytes), q: window.textBytes(bytes).filter((x) => x === 0x3F).length };
  });
  check(r.q === 0, 'kitchen ticket: no « ? » anywhere');
  check(r.imgs.length === 2 && r.imgs[0].h === 48 && r.imgs[1].h === 48, `the double-size dish name is two bands tall, and so is the note (${r.imgs.map((i) => i.h).join(', ')})`);
  await save('kitchen-note-ar', r.imgs[1]);
  check(r.imgs.every((i) => i.ink > 60), 'both lines carry real ink, not a blank image');
  check(r.imgs[0].last > 400, 'the Arabic dish name starts at the right edge');
  await save('kitchen-ar', r.imgs[0]);
}
{
  /* Le sens de lecture, prouvé au pixel : « 2× » et « 3× » ne diffèrent que
     par le chiffre. Dans une ligne arabe la quantité vient en premier, donc à
     DROITE ; dans une ligne latine, à gauche. */
  const r = await page.evaluate(() => {
    const cols = (s) => { const bytes = Array.from(window.KiwiEscPos.builder('80').init().line(s).bytes()); const i = bytes.indexOf(0x2A); const w = bytes[i + 2] | (bytes[i + 3] << 8); const out = []; let p = i + 4; for (let x = 0; x < w; x++) { out.push(bytes[p] | bytes[p + 1] | bytes[p + 2]); p += 3; } return out; };
    const diff = (a, b) => { const d = []; a.forEach((v, x) => { if (v !== b[x]) d.push(x); }); return [d[0], d[d.length - 1]]; };
    return { rtl: diff(cols('2× طاجين دجاج'), cols('3× طاجين دجاج')), ltr: diff(cols('Qty 2 طاجين'), cols('Qty 3 طاجين')),
      first: diff(cols('الفترة 12 34'), cols('الفترة 13 34')), second: diff(cols('الفترة 12 34'), cols('الفترة 12 35')) };
  });
  check(r.first[1] < r.second[0], `inside an Arabic line « 12 34 » keeps its own order: « 12 » (${r.first.join('–')}) left of « 34 » (${r.second.join('–')}), as the screen's <bdi> shows it`);
  check(r.rtl[0] > 500 && r.ltr[1] < 80, `the quantity of an Arabic line sits at the right edge (columns ${r.rtl.join('–')}), of a Latin line at the left (${r.ltr.join('–')})`);
}
{
  const r = await page.evaluate(() => {
    const b = window.KiwiEscPos.builder('58').init().size(2, 2);
    b.line('طاجين دجاج بالليمون والزيتون الأخضر مع البطاطس المقلية');
    return window.decode(Array.from(b.bytes()));
  });
  check(r.length === 1 && r[0].w === 384 && r[0].last < 384 && r[0].first >= 0, '58 mm: 384 dots, and a line too long is squeezed to fit, never cut');
}
for (const [lang, minImgs, what] of forLocales([['fr', 4, 'a French receipt with Arabic dish, cashier and client names'], ['ar', 12, 'a receipt set to Arabic']])) {
  const r = await page.evaluate((lang) => {
    window.KiwiCaisseLang = { get: () => lang };
    const R = window.KiwiReceipt;
    const doc = R.sample({ lang: 'ar' });
    const bytes = Array.from(R.escpos(doc, {}) || []);
    const imgs = window.decode(bytes);
    const stack = imgs.length ? { w: imgs[0].w, h: imgs.reduce((n, i) => n + i.h + 6, 0), rows: [].concat.apply([], imgs.map((i) => i.rows.concat(Array(6).fill('0'.repeat(i.w))))) } : null;
    return { lang: doc.lang, q: window.textBytes(bytes).filter((x) => x === 0x3F).length, imgs: imgs.length, stack };
  }, lang);
  if (r.stack) await save('receipt-' + lang, r.stack);
  check(r.lang === lang && r.imgs >= minImgs && r.q === 0, `${what}: ${r.imgs} Arabic lines drawn, not a single « ? »`);
}
check(problems.length === 0, 'no page error' + (problems.length ? ': ' + problems[0] : ''));

await browser.close();
server.close();
console.log(`escpos-arabic: ${checks} passed`);
