#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · fixtures de l'évaluation des modèles vision (tools/ai-model-eval.mjs)
 *
 *   NODE_PATH=/Users/zaka/Developer/kiwi/app/node_modules \
 *     node tools/fixtures/ai-eval/build-fixtures.mjs
 *
 * 100 % SYNTHÉTIQUE : établissements, plats et prix inventés, aucune donnée
 * marchande. Chaque image est rendue par Chrome headless à partir d'une
 * vérité terrain (truth.json) écrite ICI, une seule fois : l'image et la
 * réponse attendue ne peuvent pas diverger.
 *
 * Sortie : <nom>.png + truth.json dans ce dossier.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let puppeteer;
try {
  puppeteer = require(require.resolve('puppeteer-core', { paths: [process.env.NODE_PATH || '', '/Users/zaka/Developer/kiwi/app/node_modules'].filter(Boolean) }));
} catch (_) {
  console.error('puppeteer-core introuvable : lancer avec NODE_PATH=/Users/zaka/Developer/kiwi/app/node_modules');
  process.exit(2);
}
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/* 14.5 → « 14,50 » : la forme que le commerçant lit sur sa carte. */
const fr = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ','));

/* ── 1. Café, français ─────────────────────────────────────────────────── */
const CAFE = [
  ['Cafés', [['Espresso', 12], ['Café crème', 14.5], ['Cappuccino', 18], ['Latte macchiato', 22], ['Café frappé', 24.5]]],
  ['Thés et infusions', [['Thé à la menthe', 10], ['Thé vert gunpowder', 12.5], ['Verveine', 11], ['Chocolat chaud', 19.5]]],
  ['Viennoiseries', [['Croissant beurre', 8], ['Pain au chocolat', 9.5], ['Msemen au miel', 7.5], ['Baghrir', 9]]],
  ['Jus frais', [['Orange pressée', 15], ['Avocat banane', 22.5], ['Citronnade', 14], ['Smoothie fraise', 26]]],
];
const cafeItems = CAFE.flatMap(([cat, rows]) => rows.map(([name, price]) => ({ name, price, cat })));
const cafeHtml = () => `
<body style="margin:0;background:#f4efe4;font-family:'Inter Tight','Helvetica Neue',Arial,sans-serif;color:#1d2a24">
<div style="width:1000px;padding:46px 70px 50px;box-sizing:border-box">
  <div style="text-align:center;letter-spacing:.32em;font-size:15px;color:#0b6e4f">CAFÉ DES ORANGERS</div>
  <div style="text-align:center;font-size:44px;font-weight:600;margin:6px 0 26px">La carte</div>
  <div style="column-count:2;column-gap:60px">
  ${CAFE.map(([cat, rows]) => `<div style="break-inside:avoid;margin-bottom:22px">
    <div style="font-size:20px;font-weight:700;border-bottom:2px solid #0b6e4f;padding-bottom:4px;margin-bottom:8px">${esc(cat)}</div>
    ${rows.map(([n, p]) => `<div style="display:flex;justify-content:space-between;font-size:19px;padding:4px 0"><span>${esc(n)}</span><span style="font-weight:600">${fr(p)} MAD</span></div>`).join('')}
  </div>`).join('')}
  </div>
  <div style="text-align:center;font-size:13px;color:#667;margin-top:8px">Tous nos prix sont en dirhams, toutes taxes comprises · Wifi gratuit</div>
</div></body>`;

/* ── 2. Carte bilingue FR/AR ───────────────────────────────────────────── */
const BI = [
  ['Entrées', 'المقبلات', [['Harira', 'حريرة', 25], ['Salade marocaine', 'سلطة مغربية', 28.5], ['Zaalouk', 'زعلوك', 30], ['Briouates au fromage', 'بريوات بالجبن', 35]]],
  ['Plats', 'الأطباق', [["Tajine d'agneau aux pruneaux", 'طاجين لحم بالبرقوق', 95], ['Tajine de poulet aux olives', 'طاجين دجاج بالزيتون', 80], ['Couscous royal', 'كسكس ملكي', 110], ['Pastilla au poulet', 'بسطيلة بالدجاج', 85.5], ['Rfissa', 'رفيسة', 75]]],
  ['Desserts', 'الحلويات', [['Chebakia', 'شباكية', 20], ['Cornes de gazelle', 'كعب الغزال', 30], ['Salade d’oranges à la cannelle', 'سلطة البرتقال بالقرفة', 32.5]]],
  ['Boissons', 'المشروبات', [['Thé à la menthe', 'أتاي بالنعناع', 15], ['Jus d’orange', 'عصير البرتقال', 18], ['Eau minérale', 'ماء معدني', 10]]],
];
const biItems = BI.flatMap(([cat, catAr, rows]) => rows.map(([name, ar, price]) => ({ name, aliases: [ar], price, cat, catAliases: [catAr] })));
const AR_FONT = "'Geeza Pro','Baghdad','SF Arabic',serif";
const biHtml = () => `
<body style="margin:0;background:#fbf7ee;font-family:'Inter Tight','Helvetica Neue',Arial,sans-serif;color:#2a1d12">
<div style="width:1100px;padding:44px 64px 48px;box-sizing:border-box">
  <div style="text-align:center;font-size:42px;font-weight:600;color:#7a2e12">Dar Zitoun · دار الزيتون</div>
  <div style="text-align:center;font-size:14px;letter-spacing:.3em;margin:4px 0 24px">CUISINE MAROCAINE · المطبخ المغربي</div>
  ${BI.map(([cat, catAr, rows]) => `<div style="margin-bottom:18px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #7a2e12;margin-bottom:6px">
      <span style="font-size:23px;font-weight:700">${esc(cat)}</span>
      <span dir="rtl" style="font-family:${AR_FONT};font-size:25px;font-weight:700">${esc(catAr)}</span>
    </div>
    ${rows.map(([n, a, p]) => `<div style="display:grid;grid-template-columns:1fr 1fr 110px;gap:16px;align-items:baseline;font-size:20px;padding:5px 0">
      <span>${esc(n)}</span>
      <span dir="rtl" style="font-family:${AR_FONT};font-size:22px;text-align:right">${esc(a)}</span>
      <span style="text-align:right;font-weight:600">${fr(p)} DH</span></div>`).join('')}
  </div>`).join('')}
</div></body>`;

/* ── 3. Ardoise « manuscrite » ─────────────────────────────────────────── */
const BOARD = [
  ['Sandwichs', [['Sandwich kefta', 25], ['Panini poulet', 28], ['Tacos viande hachée', 35], ['Pizza margherita', 40]]],
  ['Salades', [['Salade composée', 22], ['Salade de fruits', 17.5]]],
  ['Boissons', [['Café', 8], ['Thé', 7], ['Jus d’avocat', 17.5], ['Coca-Cola', 10], ['Eau', 5]]],
];
const boardItems = BOARD.flatMap(([cat, rows]) => rows.map(([name, price]) => ({ name, price, cat })));
const boardHtml = () => `
<body style="margin:0;background:#3a2a1c">
<div style="width:900px;height:900px;box-sizing:border-box;padding:34px;background:#3a2a1c">
 <div style="height:100%;box-sizing:border-box;border:10px solid #8a6a43;border-radius:6px;background:radial-gradient(circle at 30% 20%,#2f4a3c,#21352b);padding:34px 48px;color:#f3f1e8;font-family:'Chalkboard SE','Chalkduster','Marker Felt',cursive">
  <div style="text-align:center;font-size:46px;margin-bottom:18px;transform:rotate(-1.2deg)">Chez Hamid · Snack</div>
  ${BOARD.map(([cat, rows]) => `<div style="margin-bottom:12px">
    <div style="font-size:30px;text-decoration:underline;margin-bottom:2px">${esc(cat)}</div>
    ${rows.map(([n, p]) => `<div style="display:flex;justify-content:space-between;font-size:28px;line-height:1.28"><span>${esc(n)}</span><span>${Number.isInteger(p) ? p : String(p).replace('.', ',')} dh</span></div>`).join('')}
  </div>`).join('')}
 </div>
</div></body>`;

/* ── 4. Photo penchée et sombre ────────────────────────────────────────── */
const SNACK = [
  ['Burgers', [['Cheeseburger', 32], ['Double burger', 45], ['Chicken burger', 38.5], ['Tacos poulet', 30]]],
  ['Accompagnements', [['Frites maison', 12], ['Onion rings', 16.5]]],
  ['Boissons', [['Coca-Cola', 10], ['Orangina', 11.5], ['Eau minérale', 6], ['Milkshake vanille', 24.9]]],
];
const snackItems = SNACK.flatMap(([cat, rows]) => rows.map(([name, price]) => ({ name, price, cat })));
const snackHtml = () => `
<body style="margin:0;background:#15110e;overflow:hidden">
<svg width="0" height="0"><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .35 0"/></filter></svg>
<div style="position:relative;width:1000px;height:900px;overflow:hidden;filter:brightness(.55) contrast(1.12) blur(.7px)">
 <div style="position:absolute;left:90px;top:70px;width:820px;box-sizing:border-box;padding:40px 52px;background:#f2e6c9;transform:rotate(-2.6deg);box-shadow:0 30px 60px rgba(0,0,0,.6);font-family:'Inter Tight','Helvetica Neue',Arial,sans-serif;color:#2b1a10">
  <div style="text-align:center;font-size:40px;font-weight:700;color:#a8321c;letter-spacing:.04em">SNACK OCÉAN</div>
  ${SNACK.map(([cat, rows]) => `<div style="margin-top:18px">
    <div style="font-size:21px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;border-bottom:2px dashed #a8321c;margin-bottom:6px">${esc(cat)}</div>
    ${rows.map(([n, p]) => `<div style="display:flex;align-items:baseline;font-size:24px;padding:3px 0"><span>${esc(n)}</span><span style="flex:1;border-bottom:2px dotted rgba(43,26,16,.55);margin:0 8px"></span><span style="font-weight:700">${fr(p)} DH</span></div>`).join('')}
  </div>`).join('')}
 </div>
 <div style="position:absolute;inset:0;filter:url(#grain);opacity:.55;mix-blend-mode:overlay"></div>
 <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 60% 40%,rgba(0,0,0,0) 35%,rgba(0,0,0,.65) 100%)"></div>
</div></body>`;

/* ── 5-6. Croquis de salle ─────────────────────────────────────────────── */
const PAPER = '#fbf9f1';
const PEN = '#26323b';
const chair = (x, y) => `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${PEN}" stroke-width="2"/>`;
function roundTable(x, y, label, seats) {
  const r = 30;
  const out = [`<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${PEN}" stroke-width="2.6"/>`,
    `<text x="${x}" y="${y + 6}" text-anchor="middle" font-size="17" fill="${PEN}">${label}</text>`];
  for (let i = 0; i < seats; i++) {
    const a = (i / seats) * Math.PI * 2 + Math.PI / 4;
    out.push(chair(x + Math.cos(a) * (r + 17), y + Math.sin(a) * (r + 17)));
  }
  return out.join('');
}
const squareTable = (x, y, label) => `<rect x="${x - 26}" y="${y - 26}" width="52" height="52" fill="none" stroke="${PEN}" stroke-width="2.6"/>
  <text x="${x}" y="${y + 6}" text-anchor="middle" font-size="17" fill="${PEN}">${label}</text>${chair(x, y - 40)}${chair(x, y + 40)}`;
const rectTable = (x, y, label) => `<rect x="${x - 70}" y="${y - 24}" width="140" height="48" fill="none" stroke="${PEN}" stroke-width="2.6"/>
  <text x="${x}" y="${y + 6}" text-anchor="middle" font-size="17" fill="${PEN}">${label}</text>
  ${[-40, 0, 40].map((d) => chair(x + d, y - 38) + chair(x + d, y + 38)).join('')}`;
const wobble = '<filter id="hand"><feTurbulence type="turbulence" baseFrequency=".03" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/></filter>';
const sketchWrap = (inner) => `<body style="margin:0;background:${PAPER}"><svg xmlns="http://www.w3.org/2000/svg" width="1000" height="760" viewBox="0 0 1000 760" font-family="'Bradley Hand','Noteworthy','Marker Felt',cursive"><defs>${wobble}</defs><rect width="1000" height="760" fill="${PAPER}"/><g filter="url(#hand)">${inner}</g></svg></body>`;

const salleA = () => {
  let s = `<rect x="40" y="40" width="920" height="680" fill="none" stroke="${PEN}" stroke-width="5"/>`;
  s += `<rect x="440" y="716" width="120" height="10" fill="${PAPER}" stroke="none"/><text x="500" y="748" text-anchor="middle" font-size="18" fill="${PEN}">entrée</text>`;
  s += `<rect x="90" y="70" width="380" height="44" fill="none" stroke="${PEN}" stroke-width="3.4"/><text x="280" y="99" text-anchor="middle" font-size="22" fill="${PEN}">COMPTOIR</text>`;
  let n = 1;
  [[250, 240], [440, 240], [630, 240], [820, 240], [250, 420], [440, 420]].forEach(([x, y]) => { s += roundTable(x, y, 'T' + n, 4); n++; });
  [[690, 420], [830, 420], [250, 600], [440, 600]].forEach(([x, y]) => { s += squareTable(x, y, 'T' + n); n++; });
  return sketchWrap(s);
};
const salleB = () => {
  let s = `<path d="M40 60 H960 V700 H40 Z" fill="none" stroke="${PEN}" stroke-width="3.4" stroke-dasharray="14 9"/>`;
  s += `<text x="500" y="108" text-anchor="middle" font-size="34" fill="${PEN}">TERRASSE</text>`;
  s += `<text x="70" y="728" font-size="18" fill="${PEN}">parasols · jardin · pas de comptoir</text>`;
  let n = 1;
  [[200, 220], [500, 220], [800, 220], [350, 400], [650, 400]].forEach(([x, y]) => { s += rectTable(x, y, 'T' + n); n++; });
  [[130, 540], [270, 540], [410, 540], [550, 540], [690, 540], [830, 540], [200, 640], [760, 640]].forEach(([x, y]) => {
    s += `<circle cx="${x}" cy="${y}" r="24" fill="none" stroke="${PEN}" stroke-width="2.6"/><text x="${x}" y="${y + 6}" text-anchor="middle" font-size="16" fill="${PEN}">T${n}</text>${chair(x - 36, y)}${chair(x + 36, y)}`;
    n++;
  });
  return sketchWrap(s);
};

/* ── Manifeste ─────────────────────────────────────────────────────────── */
const FIXTURES = [
  { id: 'menu-cafe-fr', route: 'menu-import', file: 'menu-cafe-fr.png', title: 'Carte de café, français, prix à centimes', html: cafeHtml(), viewport: [1000, 620], items: cafeItems },
  { id: 'menu-bilingual-fr-ar', route: 'menu-import', file: 'menu-bilingual-fr-ar.png', title: 'Carte bilingue FR/AR, noms de plats en arabe', html: biHtml(), viewport: [1100, 1010], items: biItems },
  { id: 'menu-board-handwritten', route: 'menu-import', file: 'menu-board-handwritten.png', title: 'Ardoise manuscrite, prix « 25 dh »', html: boardHtml(), viewport: [900, 900], items: boardItems },
  { id: 'menu-lowlight-rotated', route: 'menu-import', file: 'menu-lowlight-rotated.png', title: 'Photo penchée, sombre, grain', html: snackHtml(), viewport: [1000, 900], items: snackItems },
  { id: 'salle-restaurant-sketch', route: 'salle-import', file: 'salle-restaurant-sketch.png', title: 'Croquis : 6 rondes de 4, 4 carrées de 2, comptoir', html: salleA(), viewport: [1000, 760],
    salle: { venue: 'restaurant', outdoor: false, counter: true, tables: [{ shape: 'round', seats: 4, count: 6 }, { shape: 'square', seats: 2, count: 4 }], tableCount: 10 } },
  { id: 'salle-terrasse-sketch', route: 'salle-import', file: 'salle-terrasse-sketch.png', title: 'Croquis de terrasse : 5 rectangulaires de 6, 8 rondes de 2', html: salleB(), viewport: [1000, 760],
    salle: { venue: 'cafe', outdoor: true, counter: false, tables: [{ shape: 'rect', seats: 6, count: 5 }, { shape: 'round', seats: 2, count: 8 }], tableCount: 13 } },
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const truth = [];
try {
  for (const f of FIXTURES) {
    const page = await browser.newPage();
    await page.setViewport({ width: f.viewport[0], height: f.viewport[1], deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"></head>${f.html}</html>`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.screenshot({ path: path.join(HERE, f.file), type: 'png', clip: { x: 0, y: 0, width: f.viewport[0], height: f.viewport[1] } });
    await page.close();
    const { html, viewport, ...meta } = f;
    truth.push(meta);
    console.log(`  ${f.file}  ${(fs.statSync(path.join(HERE, f.file)).size / 1024).toFixed(0)} Ko`);
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(HERE, 'truth.json'), JSON.stringify({
  note: 'Synthétique : établissements et prix inventés, aucune donnée marchande. Régénérer avec build-fixtures.mjs.',
  fixtures: truth,
}, null, 2) + '\n');
console.log(`truth.json : ${truth.length} fixtures`);
