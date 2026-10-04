#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { copyNodes } from './landing-copy-nodes.mjs';
import { onRequest } from '../functions/_middleware.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let checks = 0;
const failures = [];
const ok = (condition, message) => {
  checks += 1;
  if (!condition) failures.push(message);
};

console.log('Testing Spanish (es) landing page integration...');

// 1. es/index.html presence and basic attributes
const esPath = path.join(ROOT, 'es', 'index.html');
ok(fs.existsSync(esPath), 'es/index.html exists on disk');
const esHtml = fs.existsSync(esPath) ? fs.readFileSync(esPath, 'utf8') : '';
ok(esHtml.length > 50000, 'es/index.html has substantial content (>50KB)');
ok(esHtml.includes('<html lang="es" dir="ltr">'), 'es/index.html declares <html lang="es" dir="ltr">');

// 2. Head metadata
ok(esHtml.includes('<title>Kiwi · El sistema operativo para los comercios marroquíes</title>'), 'es/index.html has Spanish <title>');
ok(esHtml.includes('name="description" content="Su TPV, sala, cocina, inventario, equipo e informes en un solo sistema, en francés y árabe.'), 'es/index.html has Spanish meta description');
ok(esHtml.includes('<link rel="canonical" href="https://kiwi-os.com/es/"/>'), 'es/index.html canonical points to https://kiwi-os.com/es/');
ok(esHtml.includes('property="og:title" content="Kiwi · El sistema operativo para los comercios marroquíes"'), 'es/index.html has Spanish og:title');
ok(esHtml.includes('property="og:locale" content="es_ES"'), 'es/index.html has og:locale es_ES');
ok(esHtml.includes('property="og:url" content="https://kiwi-os.com/es/"'), 'es/index.html has og:url https://kiwi-os.com/es/');
ok(/property="og:image" content="https:\/\/kiwi-os\.com\/es\/opengraph-image(?:\?[^"]*)?"/.test(esHtml), 'es/index.html has Spanish og:image URL');
ok(esHtml.includes('name="twitter:title" content="Kiwi · El sistema operativo para los comercios marroquíes"'), 'es/index.html has Spanish twitter:title');

// 3. Reciprocal hreflangs
const requiredLocales = ['fr', 'en', 'ar', 'de', 'it', 'nl', 'es', 'x-default'];
const esHead = esHtml.slice(esHtml.indexOf('<head>'), esHtml.indexOf('</head>'));
for (const loc of requiredLocales) {
  const expectedTag = loc === 'x-default'
    ? 'hrefLang="x-default" href="https://kiwi-os.com/fr/"'
    : `hrefLang="${loc}" href="https://kiwi-os.com/${loc}/"`;
  ok(esHead.includes(expectedTag), `es/index.html head has reciprocal hreflang for ${loc}`);
}

// Every landing, including the root French fallback, has the same reciprocal set.
const otherPages = ['index.html', 'fr/index.html', 'en/index.html', 'ar/index.html', 'de/index.html', 'it/index.html', 'nl/index.html'];
for (const p of otherPages) {
  const content = read(p);
  const head = content.slice(content.indexOf('<head>'), content.indexOf('</head>'));
  for (const locale of requiredLocales) {
    const route = locale === 'x-default' ? 'fr' : locale;
    ok(head.includes(`hrefLang="${locale}" href="https://kiwi-os.com/${route}/"`), `${p} head includes reciprocal ${locale}`);
  }
}

// 4. Sitemap consistency with editorial manifest
const sitemap = read('sitemap.xml');
ok(sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'), 'sitemap.xml is valid urlset');
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
ok(sitemapLocs.every(u => !u.includes('://www.')), 'sitemap locs contain apex-origin URLs only');

// 5. Middleware allowlist
const middlewareCode = read('functions/_middleware.js');
ok(middlewareCode.includes("path === '/es' || path.startsWith('/es/')"), 'middleware allows /es and /es/*');

// Test middleware execution
{
  let nextCalls = 0;
  const res = await onRequest({
    request: new Request('https://kiwi-os.com/es/', { method: 'GET', headers: { Accept: 'text/html' } }),
    env: {},
    next: async () => {
      nextCalls += 1;
      return new Response('ok', { status: 200 });
    }
  });
  ok(nextCalls === 1, 'middleware allows GET /es/ without authentication gate');
  ok(res.status === 200, 'GET /es/ returns 200');
}

// 6. Language dropdown integration
const localeMenuJs = read('assets/landing-locale-menu.js');
ok(localeMenuJs.includes("['es', 'Español']"), 'landing-locale-menu.js includes Español');
ok(localeMenuJs.includes("es: 'Elegir idioma'"), 'landing-locale-menu.js includes Spanish label');
ok(esHtml.includes('/assets/landing-locale-menu.js'), 'es/index.html loads landing-locale-menu.js');

// 7. Runtime translations fallback
const runtimeJs = read('assets/landing-runtime-translations.js');
ok(runtimeJs.includes('"es":{'), 'landing-runtime-translations.js contains "es" dictionary');
ok(esHtml.includes('/assets/landing-runtime-translations.js'), 'es/index.html loads landing-runtime-translations.js');

// 8. OpenGraph asset & headers
const ogImageFile = path.join(ROOT, 'es', 'opengraph-image');
ok(fs.existsSync(ogImageFile), 'es/opengraph-image exists');
if (fs.existsSync(ogImageFile)) {
  const stat = fs.statSync(ogImageFile);
  ok(stat.size > 100000, `es/opengraph-image is non-empty PNG (${stat.size} bytes)`);
}
const headers = read('_headers');
ok(headers.includes('/es/opengraph-image\n  Content-Type: image/png'), '_headers configures image/png for /es/opengraph-image');

// 9. Primary copy sample in Spanish (no English leakage in 25+ key sections)
const keySpanishPhrases = [
  'El sistema operativo',
  'para los comercios marroquíes.',
  'Su TPV, sala, cocina, inventario, equipo e informes en un solo sistema',
  'Obtener Kiwi',
  'Ver cómo funciona',
  'Todo lo que un comercio necesita, en una sola herramienta.',
  'TPV, inventario, equipo e informes · más la pantalla adaptada a su actividad.',
  'Un TPV rápido',
  'Sin conexión, sin interrupciones',
  'Dieciocho sectores',
  'Dieciocho sectores, un solo TPV',
  'Su sector ya tiene su pantalla.',
  'El plano de sala, en un solo movimiento',
  'Haga la pregunta, obtenga la respuesta.',
  'Un solo hilo, de la mesa al ticket',
  'Novedades de esta temporada',
  'Una carta QR que se traduce sola',
  'Un inventario fiable y exacto',
  'El equipo, del fichaje a la nómina',
  'El TPV en un iPad, los tickets en el mostrador',
  'Sus cifras son solo suyas.',
  'Cifrado en tránsito y en reposo',
  'Compatible con su equipo',
  'Nunca revendidos',
  'Diseñado en Colonia, creado para Marruecos',
  'En palabras de un responsable.',
  'Una suscripción. Sin comisiones.',
  'El software, en su propio equipo.',
  'Soporte prioritario y Kiwi IQ avanzado. El plan más elegido.',
  'Todos los derechos reservados.'
];

for (const phrase of keySpanishPhrases) {
  ok(esHtml.includes(phrase), `es/index.html contains: "${phrase}"`);
}

// 10. Aria labels in Spanish
const keyAriaLabels = [
  'aria-label="Elegir idioma"',
  'aria-label="Abrir menú"',
  'aria-label="El plano de una sala'
];
for (const aria of keyAriaLabels) {
  ok(esHtml.includes(aria), `es/index.html contains aria attribute: ${aria}`);
}


// Explicit unchanged-copy allowlist. Each entry was inspected in the audit:
// brands/names, data/units/IDs, valid shared Spanish words and the deliberately
// multilingual Arabic IQ / French QR tea product demonstrations. Adding a new
// untranslated phrase requires editing this list and documenting why.
export const UNCHANGED_COPY = new Set([
  "FR",
  "EN",
  "AR",
  "Kiwi AI",
  "·",
  "YB",
  "Youssef Benali",
  "Principal",
  "3",
  "Café Atlas",
  "27 632",
  "MAD",
  "+2,5 %",
  "26 958 MAD",
  "412",
  "+0,5 %",
  "410",
  "67",
  "−1,5 %",
  "68 MAD",
  "12 632",
  "12 324 MAD",
  "1M",
  "800k",
  "600k",
  "400k",
  "200k",
  "0",
  "612 400 MAD",
  "21 060",
  "/ 27 000 MAD",
  "1 284",
  "+3,2 %",
  "74",
  "%",
  "92 980",
  "46",
  "28 546",
  "14",
  "14 008",
  "01",
  "/",
  "18",
  "T1",
  "T2",
  "T3",
  "T4",
  "T5",
  "T6",
  "Ticket",
  "85",
  "Total",
  "103",
  "MIX Restaurant",
  "Pasta Corner",
  "Claro",
  "Startoner",
  "02",
  "6 min",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "06 + 07",
  "Libre",
  "كم بلغت مبيعات الأمس؟",
  "KIWI IQ",
  "12 480 MAD",
  "12‎ ‎480 درهم",
  "مقارنة باليوم نفسه من الأسبوع الماضي",
  "آخر 7 أيام",
  "الأمس",
  "موضع الخلل",
  "هامش ربح العصائر الطازجة يتراجع.",
  "الخطوة التالية",
  "ارفع سعر عصير البرتقال بدرهمين.",
  "#248",
  "ESC/POS",
  "TPE",
  "HID",
  "PWA",
  "KDS",
  "RJ11",
  "Yassine",
  "ES",
  "ZH",
  "DE",
  "RU",
  "IT",
  "JA",
  "PT",
  "HE",
  "NL",
  "KO",
  "TR",
  "HI",
  "PL",
  "EL",
  "SV",
  "ID",
  "UK",
  "DA",
  "NO",
  "Thé",
  "à",
  "la",
  "menthe",
  "18 MAD",
  "8",
  "2",
  "4",
  "1",
  "6",
  "+48",
  "+120",
  "27 680",
  "27 800",
  "−1",
  "Café",
  "· 3",
  "SA",
  "08:02",
  "08:15",
  "RM",
  "12:30",
  "19:00",
  "20:00",
  "21:00",
  "22:00",
  "19:30",
  "T4 · 2",
  "T2 · 6",
  "1 240 MAD",
  "2026-0142",
  "TOTAL",
  "PDF",
  "180 g",
  "60 g",
  "40 g",
  "320",
  "540",
  "kcal",
  "P",
  "32",
  "g",
  "G",
  "48",
  "L",
  "21",
  "Gluten",
  "Basic",
  "249",
  "Pro",
  "399",
  "+212 624 495 159",
  "contact@kiwi-os.com",
  "Kiwi",
  "Tamminen"
]);
const foreignSource = new Set(['en', 'fr'].flatMap(locale => copyNodes(read(locale + '/index.html')).map(node => node.text)));
const leaks = copyNodes(esHtml).filter(node => foreignSource.has(node.text) && !UNCHANGED_COPY.has(node.text));
ok(leaks.length === 0, 'all source-identical text, SVG captions and descriptive attributes are explicitly allowlisted: ' + JSON.stringify(leaks));
ok(!fs.readFileSync(ogImageFile).equals(fs.readFileSync(path.join(ROOT, 'en/opengraph-image'))), 'Spanish OG card differs from English bytes');
const png = fs.readFileSync(ogImageFile);
ok(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630, 'Spanish OG card is a 1200x630 PNG');
ok(esHtml.includes('name="twitter:image" content="https://kiwi-os.com/es/opengraph-image'), 'twitter:image references the Spanish card');
for (const locale of ['fr','en','ar','de','it','nl','es']) {
  const page = read(locale + '/index.html');
  ok(page.includes('rel="canonical" href="https://kiwi-os.com/' + locale + '/"'), locale + ' canonical is self-referential');
  const row = (sitemap.match(/<url>[\s\S]*?<\/url>/g) || []).find(row => row.includes('<loc>https://kiwi-os.com/' + locale + '/</loc>')) || '';
  ok(['fr','en','ar','de','it','nl','es','x-default'].every(code => row.includes('hreflang="' + code + '"')), locale + ' sitemap has all landing alternates');
  if (locale !== 'es') ok(page.includes('property="og:locale:alternate" content="es_ES"'), locale + ' includes es_ES sharing alternate');
}
for (const block of esHtml.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
  try { JSON.parse(block[1]); ok(true, 'JSON-LD parses'); } catch { ok(false, 'JSON-LD parses'); }
}
ok(!/human-reviewed/i.test(read('content/landing-es.json') + read('tools/rebuild-landing-locales.mjs') + read('docs/audits/2026-10-04-landing-spanish.md')), 'translation provenance does not assert native approval');

console.log(`\nResults: ${checks - failures.length}/${checks} checks passed.`);
if (failures.length > 0) {
  console.error('\nFailures:\n  - ' + failures.join('\n  - '));
  process.exit(1);
} else {
  console.log('✓ All Spanish landing page regression checks passed.');
}
