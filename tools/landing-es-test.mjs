#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
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
ok(esHtml.includes('property="og:image" content="https://kiwi-os.com/es/opengraph-image?841dff4e1d96fdb3"'), 'es/index.html has Spanish og:image URL');
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

// Check that every other landing page points to /es/
const otherPages = ['index.html', 'fr/index.html', 'en/index.html', 'ar/index.html', 'de/index.html', 'it/index.html', 'nl/index.html'];
for (const p of otherPages) {
  const content = read(p);
  const head = content.slice(content.indexOf('<head>'), content.indexOf('</head>'));
  ok(head.includes('hrefLang="es" href="https://kiwi-os.com/es/"'), `${p} head includes hreflang="es"`);
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
  'Compatible con su equipamiento',
  'Nunca revendidos',
  'Diseñado en Colonia, creado para Marruecos',
  'En palabras de un responsable.',
  'Una suscripción. Sin comisiones.',
  'El software, en su propio equipamiento.',
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

console.log(`\nResults: ${checks - failures.length}/${checks} checks passed.`);
if (failures.length > 0) {
  console.error('\nFailures:\n  - ' + failures.join('\n  - '));
  process.exit(1);
} else {
  console.log('✓ All Spanish landing page regression checks passed.');
}
