#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · landing : les pages allemande, italienne et néerlandaise sont servies
 * dans leur langue, pas seulement traduites après le chargement.
 *
 * Avant : de/, it/ et nl/ étaient la page ANGLAISE avec <html lang> changé ;
 * <title>, navigation, H1 et maquette du tableau de bord restaient en anglais
 * dans le HTML servi (robots, lecteurs sans JavaScript, aperçus de partage), et
 * le dictionnaire d'exécution les traduisait après coup. Le générateur
 * (tools/rebuild-landing-locales.mjs) écrit maintenant la langue dans le HTML,
 * le Flight React et les composants clients, comme pour l'espagnol.
 *
 * Contrôle aussi, pour toutes les pages de la landing, les alternates hreflang.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { copyNodes } from './landing-copy-nodes.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let checks = 0;
const failures = [];
const ok = (cond, msg) => { checks++; if (!cond) failures.push(msg); };

const en = read('en/index.html');
const text = (html, re) => (html.match(re) || [])[1] || '';
const enTitle = text(en, /<title>([^<]*)<\/title>/);
const enH1 = text(en, /<h1[^>]*>([\s\S]*?)<\/h1>/).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const enNodes = new Set(copyNodes(en).map((n) => n.text));
const OG = { de: 'de_DE', it: 'it_IT', nl: 'nl_NL' };

for (const locale of ['de', 'it', 'nl']) {
  const html = read(locale + '/index.html');
  const title = text(html, /<title>([^<]*)<\/title>/);
  const h1 = text(html, /<h1[^>]*>([\s\S]*?)<\/h1>/).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  ok(html.includes(`<html lang="${locale}" dir="ltr">`), `${locale}: <html lang="${locale}">`);
  ok(title && title !== enTitle && !/operating system/i.test(title), `${locale}: <title> is localized in the served HTML: ${title}`);
  ok(h1 && h1 !== enH1 && !/operating system/i.test(h1), `${locale}: H1 is localized in the served HTML: ${h1}`);
  ok(html.includes(`property="og:title" content="${title}"`), `${locale}: og:title follows the title`);
  ok(html.includes(`name="twitter:title" content="${title}"`), `${locale}: twitter:title follows the title`);
  ok(html.includes(`property="og:locale" content="${OG[locale]}"`), `${locale}: og:locale is ${OG[locale]}`);
  ok(!html.includes('content="en_US"') || html.includes('og:locale:alternate" content="en_US"'), `${locale}: en_US only appears as an alternate`);
  // Flight (the payload React hydrates from) must agree with the HTML, or React
  // rebuilds the page and the language flashes back to English.
  ok(!html.includes('The operating system'), `${locale}: no English hero left in HTML or Flight`);
  ok(html.includes(`\\"lang\\":\\"${locale}\\"`), `${locale}: Flight carries lang ${locale}`);
  // The nav and the dashboard mock: far fewer nodes identical to English than
  // the brand names, figures and multilingual demos that stay as they are.
  const nodes = copyNodes(html);
  const same = nodes.filter((n) => enNodes.has(n.text) && n.text.length > 3);
  ok(same.length / nodes.length < 0.32, `${locale}: ${same.length}/${nodes.length} nodes still identical to English (limit 32%)`);
  // The locale's own client chunk exists, and the page loads it.
  const chunk = (html.match(new RegExp(`/${locale}/chunks/[^"\\\\]+\\.js`)) || [])[0];
  ok(chunk && fs.existsSync(path.join(ROOT, chunk.slice(1))), `${locale}: cloned client chunk is referenced and on disk`);
  // Social image: only locales that ship a rendered card may name their own.
  const og = text(html, /property="og:image" content="https:\/\/kiwi-os\.com([^"?]+)/);
  ok(og && fs.existsSync(path.join(ROOT, og.slice(1))), `${locale}: og:image ${og} exists on disk`);
  ok(html.includes('rel="canonical" href="https://kiwi-os.com/' + locale + '/"'), `${locale}: canonical is self-referential`);
}

/* ── hreflang : toutes les pages se déclarent, et se répondent ──────────────
 * La page d'accueil existe en sept langues (+ x-default) ; les guides et la
 * page robot n'existent qu'en FR/EN/AR : leurs alternates se limitent à ce qui
 * existe, et chaque alternate renvoie vers la page qui le cite. */
const ALL = ['fr', 'en', 'ar', 'de', 'it', 'nl', 'es'];
const alternates = (html) => {
  const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
  const out = {};
  for (const m of head.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/gi)) out[m[1]] = m[2];
  for (const m of head.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)) out[m[1]] = m[2];
  return out;
};
const fileOf = (url) => url.replace('https://kiwi-os.com/', '').replace(/\/$/, '') + '/index.html';
for (const page of ['index.html', ...ALL.map((l) => l + '/index.html')]) {
  const alt = alternates(read(page));
  ok(ALL.every((l) => alt[l] === `https://kiwi-os.com/${l}/`) && alt['x-default'] === 'https://kiwi-os.com/fr/', `${page}: lists all seven locales and x-default`);
}
const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name === 'index.html' ? [path.join(dir, e.name)] : []);
for (const locale of ['fr', 'en', 'ar']) {
  for (const page of walk(locale).filter((p) => p !== locale + '/index.html')) {
    const html = read(page);
    const alt = alternates(html);
    if (!Object.keys(alt).length) continue;
    const self = alt[locale];
    ok(self && decodeURIComponent(fileOf(self)) === page, `${page}: hreflang names itself`);
    for (const [code, url] of Object.entries(alt)) {
      const target = decodeURIComponent(fileOf(url));
      ok(fs.existsSync(path.join(ROOT, target)), `${page}: alternate ${code} exists on disk (${target})`);
      if (code === 'x-default' || !fs.existsSync(path.join(ROOT, target))) continue;
      const back = alternates(read(target));
      ok(back[locale] && decodeURIComponent(fileOf(back[locale])) === page, `${page}: ${code} alternate links back`);
    }
  }
}

console.log(`\nResults: ${checks - failures.length}/${checks} checks passed.`);
if (failures.length) {
  console.error('\nFailures:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.log('✓ Landing DE/IT/NL served in their language; hreflang complete.');
