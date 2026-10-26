#!/usr/bin/env node
/* Hôtel · ce qu'un vrai hôtel voit se lit dans la langue de l'écran.
 *
 * 2026-10-12. Sous EN et AR, assets/hotel.js parlait encore français presque
 * partout : titres de page, colonnes, boutons, toasts, états vides, puces de
 * statut, tiroirs. Seule la démo Riad Yasmina (données de vitrine) a le droit
 * de rester en français ; une session réelle ne la peint jamais.
 *
 * Deux moitiés :
 *  A · statique, sur le fichier livré : chaque clé tx()/txk() a son anglais et
 *      son arabe dans HX_T, les {variables} concordent, aucun appel dynamique
 *      hors de la liste connue, aucun tiret cadratin dans une chaîne.
 *  B · dans un vrai Chromium, interactive.js + hotel.js tels quels, session
 *      réelle (KiwiEnv.isReal) : les surfaces principales n'affichent aucun
 *      français sous EN et AR, l'arabe isole montants et numéros, et un
 *      changement de langue réécrit la page ouverte sans la rouvrir.
 */
import { hotelTestSource } from './hotel-test-source.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'app', 'package.json'));
const ts = require('typescript');
const puppeteer = require('puppeteer-core');
const SRC = hotelTestSource();

let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* ── A · statique ───────────────────────────────────────────────────────── */
console.log('\n■ A · dictionnaire HX_T et appels tx()');
const a = SRC.indexOf('/* hx-i18n:begin */');
const b = SRC.indexOf('/* hx-i18n:end */');
check(a > 0 && b > a, 'HX_T carries its hx-i18n:begin / hx-i18n:end markers');
const HX_T = new Function(`return {${SRC.slice(a + '/* hx-i18n:begin */'.length, b)}};`)();

const sf = ts.createSourceFile('hotel.js', SRC, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const keys = new Map(); // fr → [{ vars:Set, line }]
const dynamic = [];
const dashed = [];
const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
(function visit(n) {
  if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) && n.text.includes('—')) dashed.push(lineOf(n));
  if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 'tx' || n.expression.text === 'txk')) {
    const lits = [];
    const collect = (x) => {
      if (!x) return false;
      if (ts.isParenthesizedExpression(x)) return collect(x.expression);
      if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) { lits.push(x.text); return true; }
      if (ts.isConditionalExpression(x)) { const t = collect(x.whenTrue); const f = collect(x.whenFalse); return t && f; }
      return false;
    };
    const v = n.arguments[1];
    const vars = new Set(v && ts.isObjectLiteralExpression(v)
      ? v.properties.map((p) => p.name && (p.name.text || p.name.escapedText)).filter(Boolean) : []);
    const opaqueVars = !!v && !ts.isObjectLiteralExpression(v);
    if (collect(n.arguments[0])) lits.forEach((k) => { if (!keys.has(k)) keys.set(k, []); keys.get(k).push({ vars, opaqueVars, line: lineOf(n) }); });
    else dynamic.push({ line: lineOf(n), arg: n.arguments[0] ? n.arguments[0].getText(sf).replace(/\s+/g, ' ').slice(0, 60) : '' });
  }
  ts.forEachChild(n, visit);
})(sf);

check(keys.size > 1000, `tx()/txk() route ${keys.size} distinct strings, the hotel's whole UI`);
const missing = [...keys.keys()].filter((k) => !HX_T[k] || !HX_T[k].en || !HX_T[k].ar);
check(missing.length === 0, `every tx()/txk() key has English and Arabic${missing.length ? ' · missing: ' + missing.slice(0, 5).map((k) => JSON.stringify(k)).join(', ') : ''}`);
const orphans = Object.keys(HX_T).filter((k) => !keys.has(k));
check(orphans.length === 0, `HX_T holds no orphan entry${orphans.length ? ' · ' + orphans.slice(0, 5).join(' | ') : ''}`);

const ph = (s) => new Set((String(s).match(/\{(\w+)\}/g) || []).map((x) => x.slice(1, -1)));
const phIssues = [];
for (const [fr, row] of Object.entries(HX_T)) {
  const F = ph(fr);
  const calls = keys.get(fr) || [];
  for (const lang of ['en', 'ar']) {
    const T = ph(row[lang]);
    for (const x of T) {
      if (!F.has(x) && x !== 'c') phIssues.push(`${lang} invents {${x}} · ${fr}`);
      // A variable the translation reads must be passed by every caller, or it prints « {c} ».
      for (const c of calls) if (!c.opaqueVars && !c.vars.has(x)) phIssues.push(`${lang} reads {${x}} not passed at line ${c.line} · ${fr}`);
    }
    // English keeps every figure; Arabic may say one and two in words (غرفة واحدة, غرفتان).
    if (lang === 'en') for (const x of F) if (!T.has(x) && !(x === 'n' && T.has('c'))) phIssues.push(`en drops {${x}} · ${fr}`);
  }
}
check(phIssues.length === 0, `placeholders agree between French, English and Arabic${phIssues.length ? ' · ' + phIssues.slice(0, 4).join(' | ') : ''}`);

const dashVals = Object.entries(HX_T).filter(([fr, r]) => /—/.test(fr + r.en + r.ar)).map(([fr]) => fr);
check(dashVals.length === 0, 'no U+2014 em dash in any key or translation');
check(dashed.length === 0, `no U+2014 em dash in any string literal of hotel.js${dashed.length ? ' · lines ' + dashed.slice(0, 8).join(',') : ''}`);
check(!/font-style\s*:\s*italic/.test(SRC), 'hotel.js sets no italic type');

/* A dynamic tx() reads a value that was written through txk() (a room note,
 * a load warning, a mapped error code). Anything else is a French string
 * built at runtime that no dictionary can catch. */
const DYNAMIC_OK = [/^r\.meta\b/, /^load\.error$/, /^st\.error$/, /^cuChannelState\.error$/, /^s\.reportError$/, /^s\.error$/,
  /^\(cuStayLoads\.get\(cuStayScope\(/, /^\(\{ stale: txk\(/];
const rogue = dynamic.filter((d) => !DYNAMIC_OK.some((re) => re.test(d.arg)));
check(rogue.length === 0, `dynamic tx() calls only read txk()-written values${rogue.length ? ' · ' + rogue.map((d) => d.line + ': ' + d.arg).join(' | ') : ''}`);
check(/const cu = \(\) => isCustomHotel\(\) \|\| !!window\.KiwiEnv\?\.isReal\?\.\(\);/.test(SRC), 'a real session never paints the Riad Yasmina showroom (KiwiEnv.isReal gate)');
check(/addEventListener\('kiwi:langchange'/.test(SRC), 'hotel.js listens for kiwi:langchange');

/* ── B · navigateur ────────────────────────────────────────────────────── */
function findChrome() {
  if (process.env.KIWI_CHROMIUM_BIN) return process.env.KIWI_CHROMIUM_BIN;
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  for (const name of ['google-chrome', 'chromium', 'chromium-browser']) {
    try { return execFileSync('which', [name], { encoding: 'utf8' }).trim(); } catch (_) {}
  }
  throw new Error('Chromium/Chrome executable not found; set KIWI_CHROMIUM_BIN');
}

/* Merchant data is the merchant's own words: English names here, so that any
 * French on screen can only be Kiwi's. Room notes are stored as French keys
 * (txk) and must be read in the screen's language. */
const rooms = Array.from({ length: 12 }, (_, i) => {
  const n = 101 + i;
  const dirty = n === 104 || n === 109;
  return { id: `room:${n}`, n, typeId: n > 110 ? 'type:deluxe' : 'type:standard', typeName: n > 110 ? 'Deluxe' : 'Standard',
    floorId: n <= 106 ? 'f-garden' : 'f-upper', floor: n <= 106 ? 'Garden wing' : 'Upper deck', rate: 900 + (n > 110 ? 400 : 0),
    status: dirty ? 'sale' : n === 112 ? 'hs' : 'libre', hk: dirty ? 'dirty' : 'clean', guest: null,
    meta: dirty ? 'À remettre à blanc' : n === 112 ? 'Hors-service' : 'Libre · propre', updatedAt: 1000 + n, view: n % 2 ? 'Sea' : 'Garden', characteristics: [] };
});
const fixtureDoc = {
  v: 4, rooms,
  roomTypes: [
    { id: 'type:standard', name: 'Standard', rate: 900, maxGuests: 2, beds: 'Queen bed', public: true, updatedAt: 1000 },
    { id: 'type:deluxe', name: 'Deluxe', rate: 1300, maxGuests: 3, beds: 'King bed', public: true, updatedAt: 1000 },
  ],
  floors: [{ id: 'f-garden', name: 'Garden wing', order: 0, updatedAt: 1000 }, { id: 'f-upper', name: 'Upper deck', order: 1, updatedAt: 1001 }],
  views: ['Sea', 'Garden'], customCharacteristics: [], folios: [], roomAudits: [], updatedAt: 1001,
};
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/hotel.css"><link rel="stylesheet" href="/assets/genpage.css">
</head><body><nav class="breadcrumb">Home <span class="sep">/</span> <b></b></nav><main class="container"></main>
<script>
  const lang = new URLSearchParams(location.search).get('lang') || 'fr';
  window.__lang = lang;
  try { localStorage.setItem('kiwiLang', lang); } catch (_) {}
  document.documentElement.lang = lang;
  if (lang === 'ar') document.documentElement.dir = 'rtl';
  window.KiwiI18n = { getLang: () => window.__lang };
  const fixture = ${JSON.stringify(fixtureDoc)};
  localStorage.setItem('kiwi:hotel-rooms:v2:i18n-hotel', JSON.stringify(fixture));
  window.KiwiEnv = { isReal: () => true };
  window.KiwiVenue = {
    isCustom: () => true, getVenue: () => 'i18n-hotel', getVenueType: () => 'hotel',
    getCurrentVenueData: () => ({ slug: 'i18n-hotel', name: 'Harbour House', profileInfo: { rooms: 12 } }),
    subscribe: () => () => {},
  };
  window.KiwiStore = { slugFor: () => 'i18n-hotel' };
  window.KiwiCloudDoc = {
    currentSlug: () => 'i18n-hotel', slugFor: () => 'i18n-hotel',
    attach: (options) => ({ bind: async () => false, pull: async () => false, push: () => false,
      save: async (data) => ({ ok: true, status: 200, rev: 3, data }), pushNow: async () => ({ ok: true, status: 200, rev: 2, data: fixture }), options }),
  };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const plus = (d) => new Date(Date.parse(today + 'T00:00:00Z') + d * 86400000).toISOString().slice(0, 10);
  window.KiwiReservations = { get: () => ({ bookings: [
    { id: 'bk-in', resourceId: 'room:101', status: 'checked_in', partySize: 2, updatedAt: 2000, customer: { name: 'Amina Harbour' }, hotel: { checkIn: plus(-1), checkOut: plus(2) } },
    { id: 'bk-arr', resourceId: 'room:102', status: 'confirmed', partySize: 1, updatedAt: 2001, customer: { name: 'Omar Quay' }, hotel: { checkIn: today, checkOut: plus(1) } },
    { id: 'bk-dep', resourceId: 'room:103', status: 'checked_in', partySize: 2, updatedAt: 2002, customer: { name: 'Leila Pier' }, hotel: { checkIn: plus(-2), checkOut: today } },
    { id: 'bk-opt', resourceId: 'room:107', status: 'requested', partySize: 2, updatedAt: 2003, customer: { name: 'Sam Dock' }, hotel: { checkIn: plus(3), checkOut: plus(5) } },
  ] }) };
  window.Kiwi = { handlers: {}, toast: () => {} };
</script><script src="/assets/interactive/helpers.js"></script><script src="/assets/interactive/handlers.js"></script><script src="/assets/interactive.js"></script><script src="/assets/hotel-language.js"></script><script src="/assets/hotel-rates.js"></script><script src="/assets/hotel-housekeeping.js"></script><script src="/assets/hotel-folio.js"></script><script src="/assets/hotel-channels.js"></script><script src="/assets/hotel/model.js"></script><script src="/assets/hotel/views.js"></script><script src="/assets/hotel/groups.js"></script><script src="/assets/hotel/editors.js"></script><script src="/assets/hotel.js"></script></body></html>`;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); return; }
  if (u.pathname.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"ok":false,"error":"not-found"}'); return; }
  const rel = u.pathname.replace(/^\//, '');
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT + path.sep) || !/^assets\/[\w./-]+\.(js|css)$/.test(rel) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': rel.endsWith('.css') ? 'text/css' : 'text/javascript' });
  res.end(fs.readFileSync(f));
});

/* Visible French: accents English and Arabic never use (and guillemets,
 * which Arabic does use but English does not), plus French function words
 * and the hotel's own vocabulary. */
const FR_MARKS = { en: /[àâçéèêëîïôûùüÿœæ«»]/i, ar: /[àâçéèêëîïôûùüÿœæ]/i };
const FR_WORDS = /\b(le|la|les|des|du|une|et|pour|avec|sans|aucun|aucune|chambres?|nuits?|propre|libre|ménage|caisses?|enregistrer|ajouter|modifier|supprimer|annuler|valider|fermer|ouvrir|voir|dossiers?|mois|semaine|jours?|ce soir|TTC)\b/i;
const frenchIn = (text, lang = 'en') => String(text).split(/\n+/).map((l) => l.trim()).filter((l) => l && (FR_MARKS[lang].test(l) || FR_WORDS.test(l)));

const SURFACES = [
  ['nav-reception', 'Front desk', 'الاستقبال'],
  ['nav-chambres', 'Room plan', 'مخطط الغرف'],
  ['nav-sejours', 'Bookings & stays', 'الحجوزات والإقامات'],
  ['nav-menage', null, null],
  ['nav-tarifs', 'Rates & occupancy', 'الأسعار والإشغال'],
  ['nav-folios', null, null],
  ['nav-canaux', 'Channels & OTAs', 'القنوات ووكالات السفر'],
  ['nav-hotelintel', 'Hotel intelligence', 'ذكاء الفندق'],
  ['nav-points-vente', 'Outlets', 'نقاط البيع'],
  ['nav-hotes', null, null],
];
const MODALS = [['hx-stay-new'], ['hx-group-new'], ['hx-walkin'], ['hx-room', '105'], ['hx-room-types'], ['hx-floors']];

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await puppeteer.launch({ headless: true, executablePath: findChrome(), args: ['--no-sandbox'] });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(lang) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(base + '?lang=' + lang, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.Kiwi?.handlers?.['nav-reception'] === 'function');
  return { ctx, page, errors };
}
/* What a reader meets on the surface: visible text, then the words a screen
 * reader or a hover says (placeholder, title, aria-label), then <option>s. */
const read = (page, sel) => page.evaluate((sel) => {
  const root = document.querySelector(sel);
  if (!root) return null;
  const attrs = [...root.querySelectorAll('[placeholder],[title],[aria-label]')]
    .map((e) => [e.getAttribute('placeholder'), e.getAttribute('title'), e.getAttribute('aria-label')].filter(Boolean).join('\n'));
  const opts = [...root.querySelectorAll('option')].map((o) => o.textContent);
  return { text: root.innerText, attrs: attrs.join('\n'), opts: opts.join('\n'), h1: root.querySelector('.genpage-head h1')?.textContent || '' };
}, sel);
const closeModals = async (page) => {
  await page.evaluate(() => document.querySelectorAll('.kiwi-backdrop .kiwi-modal-close').forEach((b) => b.click()));
  await pause(320);
};

try {
  for (const lang of ['en', 'ar']) {
    console.log(`\n■ B · ${lang.toUpperCase()} · surfaces of a real hotel`);
    const { ctx, page, errors } = await open(lang);
    for (const [handler, en, ar] of SURFACES) {
      await page.evaluate((h) => window.Kiwi.handlers[h](), handler);
      await pause(450);
      const got = await read(page, '.dash-genpage');
      check(!!got && got.text.trim().length > 40, `${handler} paints a page`);
      const fr = frenchIn([got.h1, got.text, got.attrs, got.opts].join('\n'), lang);
      check(fr.length === 0, `${handler} shows no French${fr.length ? ' · ' + fr.slice(0, 3).map((l) => JSON.stringify(l.slice(0, 90))).join(' | ') : ''}`);
      if (lang === 'en' && en) check(got.h1 === en, `${handler} is titled « ${en} »`);
      if (lang === 'ar' && ar) check(got.h1 === ar, `${handler} is titled « ${ar} »`);
      if (lang === 'ar') check(/[؀-ۿ]/.test(got.text), `${handler} body reads in Arabic`);
      if (lang === 'en') check(!/[؀-ۿ]/.test(got.text), `${handler} body carries no Arabic`);
    }
    await page.evaluate(() => window.Kiwi.handlers['nav-reception']());
    await pause(300);
    for (const [handler, arg] of MODALS) {
      await page.evaluate((h, a) => window.Kiwi.handlers[h](null, a), handler, arg || null);
      await pause(350);
      const got = await read(page, '.kiwi-backdrop:last-of-type .kiwi-modal');
      check(!!got && got.text.trim().length > 10, `${handler} opens its window`);
      const fr = frenchIn([got.text, got.attrs, got.opts].join('\n'), lang);
      check(fr.length === 0, `${handler} window shows no French${fr.length ? ' · ' + fr.slice(0, 3).map((l) => JSON.stringify(l.slice(0, 90))).join(' | ') : ''}`);
      await closeModals(page);
    }

    if (lang === 'ar') {
      console.log('\n■ B · AR · figures keep their direction');
      await page.evaluate(() => window.Kiwi.handlers['nav-tarifs']());
      await pause(450);
      const amounts = await page.evaluate(() => {
        const out = { total: 0, bare: [] };
        const walker = document.createTreeWalker(document.querySelector('.dash-genpage'), NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const t = n.nodeValue;
          if (!/\d[\d\s .,]*\s?MAD/.test(t)) continue;
          out.total++;
          const isolated = /⁦[^⁩]*MAD[^⁩]*⁩/.test(t) || !!n.parentElement.closest('[dir="ltr"],bdi');
          if (!isolated) out.bare.push(t.trim().slice(0, 60));
        }
        return out;
      });
      check(amounts.total > 0, `rates page shows amounts in MAD (${amounts.total})`);
      check(amounts.bare.length === 0, `every MAD amount is isolated left to right${amounts.bare.length ? ' · ' + amounts.bare.slice(0, 3).join(' | ') : ''}`);
      await page.evaluate(() => window.Kiwi.handlers['nav-chambres']());
      await pause(450);
      const roomNo = await page.evaluate(() => document.querySelector('.dash-genpage').innerText.includes('105'));
      check(roomNo, 'room numbers stay Western digits inside the Arabic room plan');
    }
    check(errors.length === 0, `no page error under ${lang.toUpperCase()}${errors.length ? ' · ' + errors.slice(0, 2).join(' | ') : ''}`);
    await ctx.close();
  }

  console.log('\n■ B · a language switch rewrites the open page');
  {
    const { ctx, page, errors } = await open('en');
    await page.evaluate(() => window.Kiwi.handlers['nav-sejours']());
    await pause(450);
    const before = await page.evaluate(() => ({ el: document.querySelector('.dash-genpage'), h1: document.querySelector('.genpage-head h1').textContent }));
    check(before.h1 === 'Bookings & stays', 'opens in English');
    await page.evaluate(() => { window.__marker = document.querySelector('.dash-genpage'); window.__lang = 'ar'; document.documentElement.dir = 'rtl'; window.dispatchEvent(new CustomEvent('kiwi:langchange', { detail: { lang: 'ar' } })); });
    await pause(250);
    const after = await read(page, '.dash-genpage');
    const same = await page.evaluate(() => window.__marker === document.querySelector('.dash-genpage') && window.__marker.isConnected);
    check(same, 'the same page element is rewritten, not reopened');
    check(after.h1 === 'الحجوزات والإقامات', 'the title switches to Arabic');
    check(await page.evaluate(() => document.querySelector('.breadcrumb b').textContent) === 'الحجوزات والإقامات', 'the breadcrumb follows');
    check(/[؀-ۿ]/.test(after.text) && !/Bookings & stays/.test(after.text), 'the body re-renders in Arabic');
    check(frenchIn(after.text, 'ar').length === 0 && !/\bCheck-in\b.*\bCheck-out\b/.test(await page.evaluate(() => document.querySelector('.genpage-head p')?.textContent || '')), 'the context line re-reads too');
    await page.evaluate(() => { window.__lang = 'fr'; document.documentElement.dir = 'ltr'; window.dispatchEvent(new CustomEvent('kiwi:langchange', { detail: { lang: 'fr' } })); });
    await pause(250);
    const fr = await read(page, '.dash-genpage');
    check(fr.h1 === 'Réservations & séjours', 'and French reads exactly as it did');
    check(errors.length === 0, 'no page error across the switches');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\nhotel-i18n: ${checks} passed, 0 failed`);
