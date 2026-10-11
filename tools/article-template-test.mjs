import fs from 'node:fs';
import vm from 'node:vm';
import { CATEGORIES, FEATURED, GOALS, HUBS, PATHS, PUBLISHED_LOCALES, TOPIC_CARDS, TOPIC_CATEGORY, TOPICS } from '../content/guides/manifest.mjs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('docs/templates/article.html');
const css = read('assets/articles/article.css');
const js = read('assets/articles/article.js');
const landingByLocale = { fr: read('fr/index.html'), en: read('en/index.html'), ar: read('ar/index.html') };
const sitemap = read('sitemap.xml');
const SITE = 'https://kiwi-os.com';
const guideClusters = [
  Object.fromEntries(PUBLISHED_LOCALES.map((locale) => [locale, `/${locale}/guides/`])),
  ...TOPICS.map((topic) => topic.routes),
];
const LANDING_LOCALES = ['fr', 'en', 'ar', 'de', 'it', 'nl', 'es'];
const landingRoutes = Object.fromEntries(LANDING_LOCALES.map((locale) => [locale, `/${locale}/`]));
const articleRoutesByLocale = Object.fromEntries(PUBLISHED_LOCALES.map((locale) => [
  locale, TOPICS.map((topic) => topic.routes[locale]),
]));
const articleRouteSets = Object.fromEntries(PUBLISHED_LOCALES.map((locale) => [locale, new Set(articleRoutesByLocale[locale])]));
const articleGraph = new Map();
const alternatesByUrl = new Map(guideClusters.flatMap((routes) => {
  const expected = [
    ...PUBLISHED_LOCALES.map((locale) => [locale, SITE + routes[locale]]),
    ['x-default', SITE + routes.fr],
  ];
  return PUBLISHED_LOCALES.map((locale) => [SITE + routes[locale], expected]);
}));
const minimumWords = {
  CollectionPage: { fr: 500, en: 400, ar: 330 },
  Article: { fr: 1000, en: 900, ar: 800 },
};
const pageRecord = (route, metadata, locale, type) => ({
  path: route.slice(1) + 'index.html', url: SITE + route, type,
  minWords: minimumWords[type][locale], image: metadata.image, locale, alternates: 4,
  dateModified: metadata.dateModified, legalReviewDate: metadata.legalReviewDate,
});
const published = [
  ...PUBLISHED_LOCALES.map((locale) => pageRecord(`/${locale}/guides/`, HUBS[locale], locale, 'CollectionPage')),
  ...TOPICS.flatMap((topic) => PUBLISHED_LOCALES.map((locale) => pageRecord(topic.routes[locale], topic.pages[locale], locale, 'Article'))),
];
const articleShellRule = css.match(/\.article-shell\s*\{([\s\S]*?)\}/)?.[1] || '';
const footerFrom = (source) => source.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] || '';
const articleFooter = footerFrom(html);
const landingFooterByLocale = Object.fromEntries(Object.entries(landingByLocale).map(([locale, source]) => [locale, footerFrom(source)]));
const landingFooter = landingFooterByLocale.fr;
const footerText = (source) => source
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#xA0;|&#160;/gi, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();
const footerHrefs = (source, locale = 'fr') => [...source.matchAll(/<a\b[^>]*href="([^"]+)"/g)]
  .map((match) => match[1].replace(new RegExp(`^/${locale}/(?=#)`), ''));

let failures = 0;
let checks = 0;
const ok = (condition, message) => {
  checks += 1;
  if (condition) console.log('  ✓ ' + message);
  else { failures += 1; console.log('  ✗ ' + message); }
};

ok(/<meta name="robots" content="noindex, nofollow">/.test(html), 'the template cannot be indexed before publication');
ok(/<link rel="canonical" href="https:\/\/kiwi-os\.com\/fr\/guides\//.test(html), 'canonical URL is explicit');
ok((html.match(/rel="alternate" hreflang=/g) || []).length === 4, 'FR, EN, AR and x-default alternates are present');
ok(/property="og:type" content="article"/.test(html) && /name="twitter:card" content="summary_large_image"/.test(html), 'social article metadata is complete');
ok(/"@type": "Article"/.test(html) && /"@type": "BreadcrumbList"/.test(html), 'Article and Breadcrumb structured data are present');
ok(/itemprop="headline"/.test(html) && /itemprop="articleBody"/.test(html), 'visible article semantics match the structured record');
ok(/class="skip-link"/.test(html) && /<main id="article">/.test(html), 'keyboard users can skip directly to the article');
ok(/data-reading-progress/.test(html) && /IntersectionObserver/.test(js), 'reading progress and active contents are wired');
ok(/<details class="mobile-toc">/.test(html) && /class="faq"/.test(html), 'mobile contents and FAQ work without JavaScript');
ok(/@media \(prefers-reduced-motion: reduce\)/.test(css), 'reduced motion is honoured');
ok(/@media print/.test(css), 'long-form print layout exists');
ok(/html\[lang="ar"\]/.test(css) && /\[dir="rtl"\]/.test(css), 'Arabic type and RTL layout are supported');
ok(/@media \(max-width: 620px\)/.test(css), 'small-phone layout has a dedicated breakpoint');
ok(!/<script[^>]+src="https?:\/\//.test(html), 'no external JavaScript is required');
ok((html.match(/<h1\b/g) || []).length === 1, 'the article has exactly one H1');
/* La skin claire est une décision du propriétaire (11 octobre 2026) : les
 * guides sont un centre de ressources, pas une page produit. Les trois
 * assertions qui épinglaient le poster sombre, le fond fixe et le verre sont
 * remplacées par des assertions de force équivalente sur la palette papier,
 * pour que personne ne puisse réintroduire le noir plein écran par accident. */
ok(!/site-backdrop/.test(html) && !/poster-landscape|poster-portrait/.test(html), 'the dark photographic backdrop is gone from the guides template');
ok(/--paper:\s*#F7F5F0/i.test(css) && /--surface:\s*#FFFDFA/i.test(css) && /--ink:\s*#0A0F0D/i.test(css) && /--atlas:\s*#0B6E4F/i.test(css), 'the brand light editorial palette is declared');
ok(/background:\s*var\(--paper\)/.test(css) && !/background:\s*var\(--black\)/.test(css) && !/--black:/.test(css), 'the guides page surface is paper, never a black fill');
ok(/sketchfab\.com\/tamminen/.test(html), 'the landing footer keeps its Tamminen model credit');
ok(!/\.site-backdrop/.test(css), 'the fixed dark atmosphere layer is removed from the guides skin');
ok(/\.site-header\s*\{[\s\S]*?height:\s*104px/.test(css) && /\.nav-center\s*\{[\s\S]*?height:\s*64px/.test(css), 'desktop header and glass navigation match landing geometry');
ok(!/backdrop-filter/.test(css), 'no glassmorphism remains anywhere in the guides skin');
ok(/\.article-shell\s*\{[\s\S]*?background:\s*var\(--surface\)/.test(css), 'the reading surface is an opaque light card');
ok(/grid-template-columns:\s*170px minmax\(0, var\(--reading\)\) 150px/.test(articleShellRule) && /gap:\s*30px/.test(articleShellRule), 'the desktop grid preserves the 720px reading column');
ok(/class="operation-panel"/.test(html) && /class="operation-flow"/.test(html), 'the proof figure uses an operational product scene');
ok((html.match(/class="related-scene(?:\s|")/g) || []).length === 3, 'every related guide carries a visual scene');
ok(/class="footer-panel"/.test(html) && /class="footer-wordmark"/.test(html) && /class="footer-powered"/.test(html), 'the article carries the landing footer panel, powered badge and cropped wordmark');
ok(/Le produit/.test(html) && /La preuve/.test(html) && /Parler à quelqu’un/.test(html) && /tel:\+212624495159/.test(html), 'landing footer navigation and contact routes are preserved');
ok(footerText(articleFooter) === footerText(landingFooter), 'article and exported landing footers expose identical copy');
ok(JSON.stringify(footerHrefs(articleFooter)) === JSON.stringify(footerHrefs(landingFooter)), 'article and exported landing footers expose identical destinations');
ok(/\.footer-panel\s*\{[^}]*max-width:\s*1440px[^}]*border-radius:\s*32px/.test(css) && /grid-template-columns:\s*1\.6fr repeat\(4, minmax\(0, 1fr\)\)/.test(css), 'article footer preserves the landing shell and five-column geometry');
ok(/article\.css\?v=\d+/.test(html) && /article\.js\?v=\d+/.test(html), 'shared article assets carry explicit cache versions');
ok(/data-food-cost-calculator/.test(read('fr/guides/calcul-food-cost-restaurant/index.html')) && /updateCalculator/.test(js), 'the food-cost calculator is progressively enhanced');
ok(/Sans JavaScript/.test(read('fr/guides/calcul-food-cost-restaurant/index.html')), 'the calculator keeps its formulas without JavaScript');
ok(/data-break-even-calculator/.test(read('fr/guides/seuil-rentabilite-restaurant/index.html')) && /updateBreakEvenCalculator/.test(js), 'the break-even calculator is progressively enhanced');
ok(/Without JavaScript/.test(read('en/guides/restaurant-break-even-point/index.html')) && /من دون JavaScript/.test(read('ar/guides/نقطة-التعادل-للمطعم/index.html')), 'break-even formulas remain available without JavaScript in every locale');

const landingGuideRoutes = articleRoutesByLocale;
for (const [locale, source] of Object.entries(landingByLocale)) {
  const routes = landingGuideRoutes[locale];
  ok(source.includes(`href="/${locale}/guides/"`), `${locale.toUpperCase()} landing links to its localized guide hub in navigation`);
  ok(routes.every((href) => fs.existsSync(new URL('../' + href.slice(1) + 'index.html', import.meta.url))), `${locale.toUpperCase()} landing guide links resolve to committed static pages`);
}

const publishedVersions = new Set();
const publishedImages = new Set();
for (const page of published) {
  const source = read(page.path);
  const canonical = source.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const description = source.match(/<meta name="description" content="([^"]+)"/)?.[1] || '';
  const jsonText = source.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)?.[1] || '';
  const content = source.match(/<div class="article-body"[^>]*>([\s\S]*?)<\/div>\s*<aside class="article-aside"/)?.[1] || source.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] || '';
  const words = content.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-zA-Z0-9#]+;/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  let graph = [];
  try { graph = JSON.parse(jsonText)['@graph'] || []; } catch (_) { graph = []; }
  const image = fs.readFileSync(new URL('../' + page.image, import.meta.url));
  const width = image.length >= 24 ? image.readUInt32BE(16) : 0;
  const height = image.length >= 24 ? image.readUInt32BE(20) : 0;
  const hrefs = [...source.matchAll(/href="(\/(?:fr|en|ar)\/guides\/[^"]*)"/g)].map((match) => match[1].split('#')[0].split('?')[0]);
  const brokenGuideLinks = hrefs.filter((href) => {
    const rel = href.replace(/^\//, '').replace(/\/$/, '') + (href.endsWith('/') ? '/index.html' : '');
    return !fs.existsSync(new URL('../' + rel, import.meta.url));
  });
  if (page.type === 'Article') {
    const ownRoute = decodeURI(new URL(page.url).pathname);
    const linkedArticles = new Set(hrefs.filter((href) => articleRouteSets[page.locale].has(href) && href !== ownRoute));
    articleGraph.set(ownRoute, linkedArticles);
    ok(linkedArticles.size >= 2, `${page.path} links contextually to at least two localized articles`);
    const articleNode = graph.find((item) => item['@type'] === 'Article');
    ok(articleNode?.dateModified === page.dateModified, `${page.path} structured data exposes its current modification date`);
    if (page.legalReviewDate) {
      const sourceSection = source.match(/<section id="sources"[\s\S]*?<\/section>/)?.[0] || '';
      const visibleText = sourceSection.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const locale = { fr: 'fr-FR', en: 'en-US', ar: 'ar-u-nu-latn' }[page.locale];
      const reviewDate = new Intl.DateTimeFormat(locale, {
        timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
      }).format(new Date(`${page.legalReviewDate}T00:00:00Z`));
      const officialDomains = new Set([...sourceSection.matchAll(/href="https:\/\/([^/]+)\//g)]
        .map((match) => match[1])
        .filter((domain) => /^(?:www\.)?(?:finances\.gov\.ma|cndp\.ma|onssa\.gov\.ma|ompic\.ma|directentreprise\.ma|mcinet\.gov\.ma|rokhas\.ma|idarati\.ma)$/.test(domain)));
      ok((source.match(/href="#sources"/g) || []).length === 2 && source.includes('id="sources"'), `${page.path} exposes its official-source block from both contents menus`);
      ok(officialDomains.size >= 2, `${page.path} cites at least two relevant Moroccan primary-source domains`);
      ok(visibleText.includes(reviewDate), `${page.path} displays its legal-source verification date`);
    }
  }
  const expectedAlternates = alternatesByUrl.get(page.url) || [];
  const htmlAlternates = [...source.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)]
    .map((match) => [match[1], match[2]]);
  const sitemapRow = (sitemap.match(/<url>[\s\S]*?<\/url>/g) || [])
    .find((row) => row.includes(`<loc>${page.url}</loc>`)) || '';
  const sitemapAlternates = [...sitemapRow.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)]
    .map((match) => [match[1], match[2]]);

  ok(canonical === page.url, `${page.path} has its own canonical URL`);
  ok(!/noindex|TEMPLATE|guide-cover-template/.test(source), `${page.path} contains no template or indexing residue`);
  ok((source.match(/rel="alternate" hreflang=/g) || []).length === page.alternates, `${page.path} declares the correct published locale alternates`);
  ok(JSON.stringify(htmlAlternates) === JSON.stringify(expectedAlternates), `${page.path} targets its exact reciprocal FR/EN/AR/x-default cluster`);
  ok(description.length >= 120 && description.length <= 165, `${page.path} has a useful search description`);
  ok(new RegExp(`<html lang="${page.locale}" dir="${page.locale === 'ar' ? 'rtl' : 'ltr'}">`).test(source), `${page.path} declares its language and writing direction`);
  ok((source.match(/<h1\b/g) || []).length === 1, `${page.path} has exactly one H1`);
  ok(words >= page.minWords, `${page.path} has substantive editorial content (${words} words)`);
  ok(graph.some((item) => item['@type'] === page.type), `${page.path} structured data matches its page type`);
  ok(width === 1200 && height === 630, `${page.path} has a unique 1200×630 PNG social image`);
  publishedImages.add(page.image);
  const localeFooter = landingFooterByLocale[page.locale];
  ok(footerText(footerFrom(source)) === footerText(localeFooter) && JSON.stringify(footerHrefs(footerFrom(source), page.locale)) === JSON.stringify(footerHrefs(localeFooter, page.locale)), `${page.path} preserves the exact ${page.locale.toUpperCase()} landing footer`);
  /* Le pied de page de la landing porte des ancres nues (`#pricing`), justes
   * sur `/fr/` et fausses une fois recopiées dans `/fr/guides/` : le visiteur
   * cliquait « Tarifs » et ne bougeait pas. Le générateur les relocalise, donc
   * aucune page publiée ne doit plus contenir d'ancre nue dans son pied. */
  ok(!/href="#/.test(footerFrom(source)), `${page.path} footer sections point at the landing, not at missing anchors inside the guide`);
  /* FAQPage ne doit exister que si la page montre vraiment des questions. */
  const showsFaq = /<section class="faq"/.test(source) && /<details>/.test(source);
  const declaresFaq = graph.some((item) => item['@type'] === 'FAQPage');
  ok(showsFaq === declaresFaq, `${page.path} declares FAQ structured data only when it visibly answers questions`);
  if (page.type === 'Article') {
    const position = TOPICS.findIndex((topic) => topic.routes[page.locale] === decodeURI(new URL(page.url).pathname));
    const expectPrevious = position > 0 ? TOPICS[position - 1].routes[page.locale] : null;
    const expectNext = position < TOPICS.length - 1 ? TOPICS[position + 1].routes[page.locale] : null;
    const previousHref = source.match(/<a class="sequence-link sequence-link--prev" rel="prev" href="([^"]+)"/)?.[1];
    const nextHref = source.match(/<a class="sequence-link sequence-link--next" rel="next" href="([^"]+)"/)?.[1];
    ok(previousHref === (expectPrevious || undefined) && nextHref === (expectNext || undefined), `${page.path} previous and next navigation follows the manifest order`);
    const articleNode = graph.find((item) => item['@type'] === 'Article');
    ok(/^PT\d+M$/.test(articleNode?.timeRequired || ''), `${page.path} structured data states a measured reading duration`);
    ok(articleNode?.articleSection === CATEGORIES.find((entry) => entry.id === TOPIC_CATEGORY[TOPICS[position].id]).labels[page.locale], `${page.path} structured data names its library category`);
  }
  ok(!/<script[^>]+src="https?:\/\//.test(source), `${page.path} needs no external JavaScript`);
  ok(!source.includes('—'), `${page.path} follows the no-em-dash brand voice`);
  ok(page.locale !== 'ar' || /<bdi dir="ltr">/.test(source), `${page.path} isolates Arabic numeric runs`);
  ok(brokenGuideLinks.length === 0, `${page.path} has no broken internal guide links`);
  ok(sitemap.includes(`<loc>${page.url}</loc>`), `${page.path} is discoverable in sitemap.xml`);
  ok(JSON.stringify(sitemapAlternates) === JSON.stringify(expectedAlternates), `${page.path} sitemap row matches its exact reciprocal locale cluster`);

  const cssVersion = source.match(/article\.css\?v=(\d+)/)?.[1];
  const jsVersion = source.match(/article\.js\?v=(\d+)/)?.[1];
  publishedVersions.add(`${cssVersion}:${jsVersion}`);
}
for (const locale of PUBLISHED_LOCALES) {
  const routes = articleRoutesByLocale[locale];
  const stronglyConnected = routes.every((start) => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      for (const next of articleGraph.get(queue.shift()) || []) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    return routes.every((route) => seen.has(route));
  });
  ok(stronglyConnected, `${locale.toUpperCase()} article graph is strongly connected`);
}
ok(publishedImages.size === published.length, 'every published locale page has its own social image path');
ok(publishedVersions.size === 1 && publishedVersions.has('11:5'), 'all published guides use the current shared asset versions');

/* ── La bibliothèque · une page de centre de ressources, pas une liste ─────
 * Ces contrôles tiennent la promesse du redesign : la page des guides offre
 * une recherche, des entrées par objectif, des catégories, un tri, un état
 * vide et des parcours, dans les TROIS langues, et ses cartes décrivent
 * exactement les guides du manifeste. */
const libraryJs = read('assets/articles/guides-library.js');
ok(!/\bimport\b|\brequire\(|https?:\/\//.test(libraryJs), 'the library script has no dependency and loads nothing');
try {
  new vm.Script(libraryJs, { filename: 'assets/articles/guides-library.js' });
  ok(true, 'library JavaScript parses cleanly');
} catch (error) {
  ok(false, 'library JavaScript parses cleanly · ' + error.message);
}
ok(/js-library/.test(libraryJs) && /\.library-tools,\s*\n\.library-controls \{ display: none; \}/.test(css.replace(/\r/g, '')), 'the filters stay hidden until the script can answer them');

for (const locale of PUBLISHED_LOCALES) {
  const hub = read(`${locale}/guides/index.html`);
  const label = locale.toUpperCase();

  ok(/data-guides-search/.test(hub) && /role="search"/.test(hub), `${label} library offers an accessible search field`);
  ok(/data-guides-sort/.test(hub) && (hub.match(/<option value="(?:recommended|recent|reading)"/g) || []).length === 3, `${label} library sorts by recommendation, recency and reading time`);
  ok(/data-guides-empty/.test(hub) && /data-guides-reset/.test(hub), `${label} library has an empty state with a reset control`);
  ok(/data-guides-count/.test(hub) && /aria-live="polite"/.test(hub), `${label} library announces how many guides are shown`);

  const goals = [...hub.matchAll(/data-goal="([^"]+)"/g)].map((match) => match[1]);
  ok(goals.length === GOALS.length && GOALS.every((goal) => goals.includes(goal.id)), `${label} library exposes every goal-based entry point`);
  const categories = [...hub.matchAll(/data-category="([^"]+)"/g)].map((match) => match[1]);
  ok(categories.includes('all') && CATEGORIES.every((category) => categories.includes(category.id)), `${label} library exposes the full category taxonomy`);
  ok(GOALS.every((goal) => hub.includes(goal.labels[locale])) && CATEGORIES.every((category) => hub.includes(category.labels[locale])), `${label} library labels its goals and categories in its own language`);

  /* Une carte par guide publié, ni plus ni moins, et chacune porte la
   * catégorie, le résumé et la durée du manifeste. */
  const cards = [...hub.matchAll(/<li class="guide-card"[^>]*data-id="([^"]+)"[^>]*data-category="([^"]+)"[^>]*data-reading="(\d+)"/g)];
  ok(cards.length === TOPICS.length, `${label} library shows exactly one card per published guide`);
  ok(TOPICS.every((topic) => cards.some((card) => card[1] === topic.id)), `${label} library card set matches the manifest`);
  ok(cards.every((card) => card[2] === TOPIC_CATEGORY[card[1]]), `${label} library cards carry their manifested category`);
  ok(TOPICS.every((topic) => hub.includes(TOPIC_CARDS[topic.id][locale])), `${label} library cards use the localized card summary`);
  /* Le résumé de carte remplace les deux paragraphes que la page répétait
   * pour chaque article. */
  ok(!TOPICS.some((topic) => hub.includes(topic.pages[locale].ogDescription) && topic.pages[locale].ogDescription.length > 90), `${label} library no longer repeats full article paragraphs`);

  ok(FEATURED.every((id) => hub.includes(`data-id="${id}"`)) && (hub.match(/guide-card--featured/g) || []).length === FEATURED.length, `${label} library features the manifested guides`);
  ok(PATHS.every((path) => hub.includes(path.titles[locale]) && path.steps.every((step) => hub.includes(`data-path-link="${path.id}"`))), `${label} library publishes every learning path`);
  ok((hub.match(/<h1\b/g) || []).length === 1 && /class="hero-facts"/.test(hub), `${label} library hero states a counted fact under a single H1`);
  ok(hub.includes(`>${TOPICS.length}<`) || hub.includes(`<bdi dir="ltr">${TOPICS.length}</bdi>`), `${label} library hero publishes the real number of guides`);

  /* La carte et l'article doivent annoncer la MÊME durée : les deux viennent
   * désormais de la même mesure. */
  for (const card of cards) {
    const topic = TOPICS.find((entry) => entry.id === card[1]);
    const articleSource = read(topic.routes[locale].slice(1) + 'index.html');
    const byline = articleSource.match(/<div class="byline">[\s\S]*?<\/div>/)?.[0] || '';
    ok(new RegExp(`\\b${card[3]}\\b`).test(byline.replace(/<[^>]+>/g, ' ')), `${label} ${topic.id} card and article agree on the reading time (${card[3]} min)`);
  }

  const collection = JSON.parse(hub.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)[1])['@graph'];
  const itemList = collection.find((node) => node['@type'] === 'CollectionPage')?.mainEntity;
  ok(itemList?.['@type'] === 'ItemList' && itemList.numberOfItems === TOPICS.length && itemList.itemListElement.length === TOPICS.length, `${label} library publishes CollectionPage and ItemList structured data`);
  ok(collection.some((node) => node['@type'] === 'Organization' && node.knowsAbout?.length === CATEGORIES.length), `${label} library states Kiwi's operational expertise`);
}
const sitemapGuideRows = (sitemap.match(/<url>[\s\S]*?<\/url>/g) || []).filter((row) => /<loc>https:\/\/kiwi-os\.com\/(?:fr|en|ar)\/guides\//.test(row));
ok(sitemapGuideRows.length === guideClusters.length * PUBLISHED_LOCALES.length, 'sitemap has exactly one row for every manifested localized guide page');
const sitemapRows = sitemap.match(/<url>[\s\S]*?<\/url>/g) || [];
const sitemapLocs = sitemapRows.map((row) => row.match(/<loc>([^<]+)<\/loc>/)?.[1]).filter(Boolean);
ok(new Set(sitemapLocs).size === sitemapLocs.length, 'sitemap has no duplicate canonical URL');
ok(sitemapLocs.every((url) => url.startsWith(`${SITE}/`) && !url.includes('://www.')), 'sitemap contains only apex-origin URLs');
for (const locale of LANDING_LOCALES) {
  const expected = [...LANDING_LOCALES.map((code) => [code, SITE + landingRoutes[code]]), ['x-default', SITE + landingRoutes.fr]];
  const row = sitemapRows.find((entry) => entry.includes(`<loc>${SITE + landingRoutes[locale]}</loc>`)) || '';
  const actual = [...row.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((match) => [match[1], match[2]]);
  ok(JSON.stringify(actual) === JSON.stringify(expected), `${locale.toUpperCase()} landing sitemap row is slash-final and matches the exact locale cluster`);
}
ok(sitemapRows.length === published.length + LANDING_LOCALES.length, 'sitemap contains only the manifested landings, hubs and localized articles');
ok(!/<loc>https:\/\/kiwi-os\.com\/(?:fr|en|ar)<\/loc>/.test(sitemap), 'sitemap contains no redirecting slashless locale URL');

try {
  new vm.Script(js, { filename: 'assets/articles/article.js' });
  ok(true, 'article JavaScript parses cleanly');
} catch (error) {
  ok(false, 'article JavaScript parses cleanly · ' + error.message);
}

console.log(`\n  ${checks - failures}/${checks} article-template checks passed`);
if (failures) process.exit(1);
