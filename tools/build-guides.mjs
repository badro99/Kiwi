#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ASSET_VERSIONS, HUBS, PUBLISHED_LOCALES, TOPICS } from '../content/guides/manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://kiwi-os.com';
const CHECK = process.argv.includes('--check');

const UI = Object.freeze({
  fr: {
    dir: 'ltr', language: 'fr-MA', ogLocale: 'fr_MA', home: 'Accueil',
    brandLabel: 'Kiwi · accueil', navLabel: 'Navigation principale', features: 'Fonctionnalités',
    guides: 'Guides', pricing: 'Tarifs', signIn: 'Se connecter', demo: 'Demander une démo',
    languagePicker: 'Choisir la langue', skipArticle: 'Aller à l’article', skipHub: 'Aller aux guides',
    author: 'Équipe Kiwi',
  },
  en: {
    dir: 'ltr', language: 'en-MA', ogLocale: 'en_US', home: 'Home',
    brandLabel: 'Kiwi · Home', navLabel: 'Main navigation', features: 'Features',
    guides: 'Guides', pricing: 'Pricing', signIn: 'Sign in', demo: 'Book a demo',
    languagePicker: 'Choose language', skipArticle: 'Skip to the article', skipHub: 'Skip to the guides',
    author: 'Kiwi Team',
  },
  ar: {
    dir: 'rtl', language: 'ar-MA', ogLocale: 'ar_MA', home: 'الرئيسية',
    brandLabel: 'Kiwi · الرئيسية', navLabel: 'التنقل الرئيسي', features: 'الخصائص',
    guides: 'الأدلة', pricing: 'الأسعار', signIn: 'تسجيل الدخول', demo: 'اطلب عرضا توضيحيا',
    languagePicker: 'اختر اللغة', skipArticle: 'انتقل إلى المقال', skipHub: 'انتقل إلى الأدلة',
    author: 'فريق Kiwi',
  },
});

const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
const json = (value) => JSON.stringify(value, null, 2)
  .replaceAll('<', '\\u003c')
  .replaceAll('\u2028', '\\u2028')
  .replaceAll('\u2029', '\\u2029');
const absolute = (route) => SITE + route;
const outputPath = (route) => path.join(ROOT, route.replace(/^\//, ''), 'index.html');
const contentPath = (id, locale) => path.join(ROOT, 'content', 'guides', 'pages', id, `${locale}.html`);
const hubRoutes = Object.freeze(Object.fromEntries(PUBLISHED_LOCALES.map((locale) => [locale, `/${locale}/guides/`])));

const clusters = [
  { id: 'hub', routes: hubRoutes, pages: HUBS, type: 'hub' },
  ...TOPICS.map((topic) => ({ ...topic, type: 'article' })),
];

function extractFooter(source, label) {
  const matches = source.match(/<footer\b[\s\S]*?<\/footer>/g) || [];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one <footer>, found ${matches.length}`);
  return matches[0];
}

function validateManifest() {
  if (PUBLISHED_LOCALES.join(',') !== 'fr,en,ar') throw new Error('published locales must be exactly fr, en and ar');
  const ids = new Set();
  const routes = new Set();
  const images = new Set();

  for (const cluster of clusters) {
    if (ids.has(cluster.id)) throw new Error(`duplicate guide id: ${cluster.id}`);
    ids.add(cluster.id);
    for (const locale of PUBLISHED_LOCALES) {
      const route = cluster.routes[locale];
      const page = cluster.pages[locale];
      if (!route || !page) throw new Error(`${cluster.id}: missing ${locale} route or metadata`);
      if (!route.startsWith(`/${locale}/guides/`) || !route.endsWith('/')) {
        throw new Error(`${cluster.id}/${locale}: invalid localized route ${route}`);
      }
      if (routes.has(route)) throw new Error(`duplicate guide route: ${route}`);
      routes.add(route);
      for (const field of ['title', 'description', 'ogTitle', 'ogDescription', 'image', 'imageAlt']) {
        if (typeof page[field] !== 'string' || !page[field].trim()) throw new Error(`${cluster.id}/${locale}: missing ${field}`);
      }
      if (cluster.type === 'article' && (!page.section || !/^\d{4}-\d{2}-\d{2}T/.test(page.datePublished) || !/^\d{4}-\d{2}-\d{2}T/.test(page.dateModified))) {
        throw new Error(`${cluster.id}/${locale}: article section or publication dates are invalid`);
      }
      if (images.has(page.image)) throw new Error(`social image reused: ${page.image}`);
      images.add(page.image);
      if (!fs.existsSync(path.join(ROOT, page.image))) throw new Error(`${cluster.id}/${locale}: missing ${page.image}`);
    }
  }
}

function readFragment(cluster, locale) {
  const file = contentPath(cluster.id, locale);
  if (!fs.existsSync(file)) throw new Error(`${path.relative(ROOT, file)} is missing`);
  const source = fs.readFileSync(file, 'utf8').trim();
  const expectedId = cluster.type === 'hub' ? 'guides' : 'article';
  if (!source.startsWith(`<main id="${expectedId}"`) || !source.endsWith('</main>')) {
    throw new Error(`${path.relative(ROOT, file)} must contain only <main id="${expectedId}">…</main>`);
  }
  if ((source.match(/<main\b/g) || []).length !== 1 || (source.match(/<h1\b/g) || []).length !== 1) {
    throw new Error(`${path.relative(ROOT, file)} must contain exactly one main and one h1`);
  }
  return source;
}

function alternateLinks(routes) {
  return [
    ...PUBLISHED_LOCALES.map((locale) => `  <link rel="alternate" hreflang="${locale}" href="${esc(absolute(routes[locale]))}">`),
    `  <link rel="alternate" hreflang="x-default" href="${esc(absolute(routes.fr))}">`,
  ].join('\n');
}

function header(locale, routes) {
  const ui = UI[locale];
  const languageLinks = PUBLISHED_LOCALES.map((code) => {
    const current = code === locale ? ' aria-current="true"' : '';
    return `<a href="${esc(routes[code])}" hreflang="${code}" lang="${code}"${current}>${code.toUpperCase()}</a>`;
  }).join('');

  return `<header class="site-header">
    <div class="nav-shell">
      <a class="brand" href="/${locale}/" aria-label="${esc(ui.brandLabel)}"><img src="/images/kiwi-logo.svg" width="855" height="455" alt=""></a>
      <nav class="nav-center" aria-label="${esc(ui.navLabel)}">
        <a href="/${locale}/#features">${esc(ui.features)}</a><a href="/${locale}/guides/" aria-current="page">${esc(ui.guides)}</a><a href="/${locale}/#pricing">${esc(ui.pricing)}</a><a href="/dashboard.html">${esc(ui.signIn)}</a>
        <a class="button nav-demo" href="https://wa.me/212624495159" target="_blank" rel="noreferrer">${esc(ui.demo)} <span class="arrow" aria-hidden="true">↗</span></a>
      </nav>
      <div class="language-picker" role="group" aria-label="${esc(ui.languagePicker)}">${languageLinks}</div>
      <a class="button mobile-demo" href="https://wa.me/212624495159" target="_blank" rel="noreferrer">${esc(ui.demo)} <span class="arrow" aria-hidden="true">↗</span></a>
    </div>
  </header>`;
}

function structuredData(cluster, locale) {
  const ui = UI[locale];
  const page = cluster.pages[locale];
  const route = cluster.routes[locale];
  const url = absolute(route);
  const breadcrumbs = [
    { '@type': 'ListItem', position: 1, name: ui.home, item: absolute(`/${locale}/`) },
    { '@type': 'ListItem', position: 2, name: ui.guides, item: absolute(`/${locale}/guides/`) },
  ];

  if (cluster.type === 'hub') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage', '@id': `${url}#collection`,
          name: page.title.replace(/ · Kiwi$/, ''), description: page.description, url,
          inLanguage: ui.language,
          mainEntity: {
            '@type': 'ItemList', numberOfItems: TOPICS.length,
            itemListElement: TOPICS.map((topic, index) => ({
              '@type': 'ListItem', position: index + 1,
              url: absolute(topic.routes[locale]), name: topic.pages[locale].ogTitle,
            })),
          },
        },
        { '@type': 'BreadcrumbList', itemListElement: breadcrumbs.slice(0, 1).concat({ '@type': 'ListItem', position: 2, name: ui.guides }) },
      ],
    };
  }

  breadcrumbs.push({ '@type': 'ListItem', position: 3, name: page.ogTitle });
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article', '@id': `${url}#article`, headline: page.ogTitle,
        description: page.description, image: [absolute('/' + page.image)],
        datePublished: page.datePublished, dateModified: page.dateModified,
        inLanguage: ui.language,
        author: { '@type': 'Organization', name: ui.author, url: absolute(`/${locale}/`) },
        publisher: {
          '@type': 'Organization', name: 'Kiwi', url: absolute(`/${locale}/`),
          logo: { '@type': 'ImageObject', url: absolute('/images/kiwi-logo.svg') },
        },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      },
      { '@type': 'BreadcrumbList', itemListElement: breadcrumbs },
    ],
  };
}

function renderPage(cluster, locale, footer) {
  const ui = UI[locale];
  const page = cluster.pages[locale];
  const route = cluster.routes[locale];
  const url = absolute(route);
  const isArticle = cluster.type === 'article';
  const articleMeta = isArticle ? `
  <meta property="article:published_time" content="${esc(page.datePublished)}">
  <meta property="article:modified_time" content="${esc(page.dateModified)}">
  <meta property="article:section" content="${esc(page.section)}">` : '';
  const mainId = isArticle ? 'article' : 'guides';
  const skip = isArticle ? ui.skipArticle : ui.skipHub;

  return `<!doctype html>
<html lang="${locale}" dir="${ui.dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(page.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${esc(url)}">
${alternateLinks(cluster.routes)}
  <meta property="og:type" content="${isArticle ? 'article' : 'website'}">
  <meta property="og:site_name" content="Kiwi">
  <meta property="og:locale" content="${ui.ogLocale}">
  <meta property="og:title" content="${esc(page.ogTitle)}">
  <meta property="og:description" content="${esc(page.ogDescription)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${esc(absolute('/' + page.image))}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:alt" content="${esc(page.imageAlt)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">${articleMeta}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(page.twitterTitle || page.ogTitle)}">
  <meta name="twitter:description" content="${esc(page.twitterDescription || page.ogDescription)}">
  <meta name="twitter:image" content="${esc(absolute('/' + page.image))}">
  <meta name="twitter:image:alt" content="${esc(page.twitterImageAlt || page.imageAlt)}">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="/assets/articles/article.css?v=${ASSET_VERSIONS.css}">
  <script type="application/ld+json">${json(structuredData(cluster, locale))}</script>
</head>
<body>
  <a class="skip-link" href="#${mainId}">${esc(skip)}</a>
  <div class="reading-progress" data-reading-progress aria-hidden="true"></div>
  <div class="site-backdrop" aria-hidden="true"><picture><source media="(orientation: portrait)" srcset="/model/poster-portrait.webp"><img src="/model/poster-landscape.webp" alt="" width="1536" height="1024" fetchpriority="high"></picture><span></span></div>
  ${header(locale, cluster.routes)}
  ${readFragment(cluster, locale)}
  ${footer}
  <script src="/assets/articles/article.js?v=${ASSET_VERSIONS.js}" defer></script>
</body>
</html>
`;
}

function sitemapRow(route, routes, lastmod) {
  const links = [
    ...PUBLISHED_LOCALES.map((locale) => `<xhtml:link rel="alternate" hreflang="${locale}" href="${esc(absolute(routes[locale]))}" />`),
    `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(absolute(routes.fr))}" />`,
  ].join('');
  return `<url><loc>${esc(absolute(route))}</loc><lastmod>${lastmod}</lastmod>${links}</url>`;
}

function renderSitemap() {
  const current = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const existing = current.match(/<url>[\s\S]*?<\/url>/g) || [];
  const nonGuideRows = existing.filter((row) => !/<loc>https:\/\/kiwi-os\.com\/(?:fr|en|ar)\/guides\//.test(row));
  const newest = TOPICS.map((topic) => topic.pages.fr.dateModified.slice(0, 10)).sort().at(-1);
  const guideRows = clusters.flatMap((cluster) => {
    const lastmod = cluster.type === 'hub' ? newest : cluster.pages.fr.dateModified.slice(0, 10);
    return PUBLISHED_LOCALES.map((locale) => sitemapRow(cluster.routes[locale], cluster.routes, lastmod));
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${[...nonGuideRows, ...guideRows].join('\n')}\n</urlset>\n`;
}

function listPublishedGuideFiles() {
  const results = [];
  const walk = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name === 'index.html') results.push(file);
    }
  };
  for (const locale of PUBLISHED_LOCALES) walk(path.join(ROOT, locale, 'guides'));
  return results;
}

function writeOrCheck(file, expected, drift) {
  if (CHECK) {
    const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (actual !== expected) drift.push(path.relative(ROOT, file));
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, expected);
  console.log(`built ${path.relative(ROOT, file)}`);
}

validateManifest();
const expectedOutputs = new Set(clusters.flatMap((cluster) => PUBLISHED_LOCALES.map((locale) => outputPath(cluster.routes[locale]))));
const unexpected = listPublishedGuideFiles().filter((file) => !expectedOutputs.has(file));
if (unexpected.length) throw new Error(`published guide pages missing from manifest:\n${unexpected.map((file) => '  ' + path.relative(ROOT, file)).join('\n')}`);

const footers = Object.fromEntries(PUBLISHED_LOCALES.map((locale) => {
  const landing = path.join(ROOT, locale, 'index.html');
  return [locale, extractFooter(fs.readFileSync(landing, 'utf8'), path.relative(ROOT, landing))];
}));
const drift = [];
for (const cluster of clusters) {
  for (const locale of PUBLISHED_LOCALES) {
    writeOrCheck(outputPath(cluster.routes[locale]), renderPage(cluster, locale, footers[locale]), drift);
  }
}
writeOrCheck(path.join(ROOT, 'sitemap.xml'), renderSitemap(), drift);

if (drift.length) {
  console.error('generated guide files are stale:');
  drift.forEach((file) => console.error(`  ${file}`));
  console.error('run: node tools/build-guides.mjs');
  process.exit(1);
}
if (CHECK) console.log(`guide source is deterministic (${expectedOutputs.size} pages + sitemap.xml)`);
