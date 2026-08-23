import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('docs/templates/article.html');
const css = read('assets/articles/article.css');
const js = read('assets/articles/article.js');
const landingHtml = read('fr/index.html');
const sitemap = read('sitemap.xml');
const published = [
  { path: 'fr/guides/index.html', url: 'https://kiwi-os.com/fr/guides/', type: 'CollectionPage', minWords: 650, image: 'assets/articles/guides-restaurant-maroc.png' },
  { path: 'fr/guides/logiciel-caisse-restaurant-maroc/index.html', url: 'https://kiwi-os.com/fr/guides/logiciel-caisse-restaurant-maroc/', type: 'Article', minWords: 1050, image: 'assets/articles/logiciel-caisse-restaurant-maroc.png' },
  { path: 'fr/guides/calcul-food-cost-restaurant/index.html', url: 'https://kiwi-os.com/fr/guides/calcul-food-cost-restaurant/', type: 'Article', minWords: 1050, image: 'assets/articles/calcul-food-cost-restaurant.png' },
  { path: 'fr/guides/gestion-stock-restaurant/index.html', url: 'https://kiwi-os.com/fr/guides/gestion-stock-restaurant/', type: 'Article', minWords: 1050, image: 'assets/articles/gestion-stock-restaurant.png' }
];
const articleShellRule = css.match(/\.article-shell\s*\{([\s\S]*?)\}/)?.[1] || '';
const footerFrom = (source) => source.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] || '';
const articleFooter = footerFrom(html);
const landingFooter = footerFrom(landingHtml);
const footerText = (source) => source
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#xA0;|&#160;/gi, ' ')
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();
const footerHrefs = (source) => [...source.matchAll(/<a\b[^>]*href="([^"]+)"/g)]
  .map((match) => match[1].replace(/^\/fr\/(?=#)/, ''));

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
ok(/\/model\/poster-landscape\.webp/.test(html) && /\/model\/poster-portrait\.webp/.test(html), 'the article reuses the landing camera treatment in both orientations');
ok(/sketchfab\.com\/tamminen/.test(html), 'the landing footer keeps its Tamminen model credit');
ok(/\.site-backdrop\s*\{[\s\S]*?position:\s*fixed/.test(css), 'the landing atmosphere remains fixed behind the editorial scenes');
ok(/\.site-header\s*\{[\s\S]*?height:\s*104px/.test(css) && /\.nav-center\s*\{[\s\S]*?height:\s*64px/.test(css), 'desktop header and glass navigation match landing geometry');
ok(/\.article-shell\s*\{[\s\S]*?backdrop-filter:\s*blur\(28px\)/.test(css), 'the reading surface keeps the landing glass depth');
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

const publishedVersions = new Set();
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
  const hrefs = [...source.matchAll(/href="(\/fr\/guides\/[^"]*)"/g)].map((match) => match[1].split('#')[0].split('?')[0]);
  const brokenGuideLinks = hrefs.filter((href) => {
    const rel = href.replace(/^\//, '').replace(/\/$/, '') + (href.endsWith('/') ? '/index.html' : '');
    return !fs.existsSync(new URL('../' + rel, import.meta.url));
  });

  ok(canonical === page.url, `${page.path} has its own canonical URL`);
  ok(!/noindex|TEMPLATE|guide-cover-template/.test(source), `${page.path} contains no template or indexing residue`);
  ok((source.match(/rel="alternate" hreflang=/g) || []).length === 2, `${page.path} declares only its published FR and x-default alternates`);
  ok(description.length >= 120 && description.length <= 165, `${page.path} has a useful search description`);
  ok((source.match(/<h1\b/g) || []).length === 1, `${page.path} has exactly one H1`);
  ok(words >= page.minWords, `${page.path} has substantive editorial content (${words} words)`);
  ok(graph.some((item) => item['@type'] === page.type), `${page.path} structured data matches its page type`);
  ok(width === 1200 && height === 630, `${page.path} has a unique 1200×630 PNG social image`);
  ok(footerText(footerFrom(source)) === footerText(landingFooter) && JSON.stringify(footerHrefs(footerFrom(source))) === JSON.stringify(footerHrefs(landingFooter)), `${page.path} preserves the exact landing footer`);
  ok(!/<script[^>]+src="https?:\/\//.test(source), `${page.path} needs no external JavaScript`);
  ok(!source.includes('—'), `${page.path} follows the no-em-dash brand voice`);
  ok(brokenGuideLinks.length === 0, `${page.path} has no broken internal guide links`);
  ok(sitemap.includes(`<loc>${page.url}</loc>`), `${page.path} is discoverable in sitemap.xml`);

  const cssVersion = source.match(/article\.css\?v=(\d+)/)?.[1];
  const jsVersion = source.match(/article\.js\?v=(\d+)/)?.[1];
  publishedVersions.add(`${cssVersion}:${jsVersion}`);
}
ok(publishedVersions.size === 1 && publishedVersions.has('9:2'), 'all published guides use the current shared asset versions');

try {
  new vm.Script(js, { filename: 'assets/articles/article.js' });
  ok(true, 'article JavaScript parses cleanly');
} catch (error) {
  ok(false, 'article JavaScript parses cleanly · ' + error.message);
}

console.log(`\n  ${checks - failures}/${checks} article-template checks passed`);
if (failures) process.exit(1);
