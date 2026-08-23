import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('docs/templates/article.html');
const css = read('assets/articles/article.css');
const js = read('assets/articles/article.js');

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
ok(/poster-landscape\.webp/.test(html) && /poster-portrait\.webp/.test(html), 'the article inherits the landing hero world in both orientations');
ok(/\.site-backdrop\s*\{[\s\S]*?position:\s*fixed/.test(css), 'the landing atmosphere remains fixed behind the editorial scenes');
ok(/\.site-header\s*\{[\s\S]*?height:\s*104px/.test(css) && /\.nav-center\s*\{[\s\S]*?height:\s*64px/.test(css), 'desktop header and glass navigation match landing geometry');
ok(/\.article-shell\s*\{[\s\S]*?backdrop-filter:\s*blur\(28px\)/.test(css), 'the reading surface keeps the landing glass depth');

try {
  new vm.Script(js, { filename: 'assets/articles/article.js' });
  ok(true, 'article JavaScript parses cleanly');
} catch (error) {
  ok(false, 'article JavaScript parses cleanly · ' + error.message);
}

console.log(`\n  ${checks - failures}/${checks} article-template checks passed`);
if (failures) process.exit(1);
