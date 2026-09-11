#!/usr/bin/env node

import { PUBLISHED_LOCALES, TOPICS } from '../content/guides/manifest.mjs';

const SITE = 'https://kiwi-os.com';
const expectedRoutes = [
  ...PUBLISHED_LOCALES.map((locale) => `/${locale}/`),
  ...PUBLISHED_LOCALES.map((locale) => `/${locale}/guides/`),
  ...TOPICS.flatMap((topic) => PUBLISHED_LOCALES.map((locale) => topic.routes[locale])),
];
const expectedUrls = expectedRoutes.map((route) => SITE + route);
const routeClusters = [
  Object.fromEntries(PUBLISHED_LOCALES.map((locale) => [locale, `/${locale}/`])),
  Object.fromEntries(PUBLISHED_LOCALES.map((locale) => [locale, `/${locale}/guides/`])),
  ...TOPICS.map((topic) => topic.routes),
];
const expectedAlternatesByUrl = new Map(routeClusters.flatMap((routes) => {
  const alternates = new Map([
    ...PUBLISHED_LOCALES.map((locale) => [locale, SITE + routes[locale]]),
    ['x-default', SITE + routes.fr],
  ]);
  return PUBLISHED_LOCALES.map((locale) => [SITE + routes[locale], alternates]);
}));
const failures = [];

const fetchChecked = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      ...options,
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': 'Kiwi-SEO-Watch/1.0', ...(options.headers || {}) },
    });
    return { response, body: await response.text() };
  } finally {
    clearTimeout(timer);
  }
};

const checkRedirect = async (url, expectedLocation, label) => {
  try {
    const { response } = await fetchChecked(url);
    if (response.status !== 308) failures.push(`${label} returned ${response.status}, expected 308`);
    if (response.headers.get('location') !== expectedLocation) {
      failures.push(`${label} redirects to ${response.headers.get('location') || '(none)'}, expected ${expectedLocation}`);
    }
  } catch (error) {
    failures.push(`${label} could not be fetched: ${error.message}`);
  }
};

await checkRedirect(`${SITE}/`, `${SITE}/fr/`, 'apex root');
await checkRedirect('https://www.kiwi-os.com/en/guides/restaurant-food-cost/?seo_watch=1', `${SITE}/en/guides/restaurant-food-cost/?seo_watch=1`, 'www guide URL');

let sitemapText = '';
try {
  const { response, body } = await fetchChecked(`${SITE}/sitemap.xml?seo_watch=${Date.now()}`);
  if (response.status !== 200) failures.push(`sitemap.xml returned ${response.status}`);
  sitemapText = body;
} catch (error) {
  failures.push(`sitemap.xml could not be fetched: ${error.message}`);
}

const sitemapUrls = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
if (sitemapUrls.length !== expectedUrls.length) failures.push(`sitemap has ${sitemapUrls.length} URLs, expected ${expectedUrls.length}`);
if (new Set(sitemapUrls).size !== sitemapUrls.length) failures.push('sitemap contains duplicate canonical URLs');
for (const url of expectedUrls) if (!sitemapUrls.includes(url)) failures.push(`sitemap is missing ${url}`);
for (const url of sitemapUrls) {
  if (!url.startsWith(`${SITE}/`) || url.includes('://www.')) failures.push(`sitemap contains a non-apex URL: ${url}`);
  if (!url.endsWith('/')) failures.push(`sitemap contains a slashless URL: ${url}`);
}

for (let start = 0; start < expectedUrls.length; start += 6) {
  const batch = expectedUrls.slice(start, start + 6);
  await Promise.all(batch.map(async (url) => {
    try {
      const { response, body: html } = await fetchChecked(`${url}?seo_watch=${Date.now()}`);
      if (response.status !== 200) failures.push(`${url} returned ${response.status}`);
      const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      if (canonical !== url) failures.push(`${url} declares canonical ${canonical || '(none)'}`);
      const alternateTags = html.match(/<link\b[^>]*\brel="alternate"[^>]*>/gi) || [];
      const alternates = alternateTags.map((tag) => [
        tag.match(/\bhref[Ll]ang="([^"]+)"/)?.[1],
        tag.match(/\bhref="([^"]+)"/)?.[1],
      ]);
      const actualAlternates = new Map(alternates);
      const expectedAlternates = expectedAlternatesByUrl.get(url);
      if (alternates.length !== expectedAlternates.size || actualAlternates.size !== expectedAlternates.size
        || [...expectedAlternates].some(([locale, href]) => actualAlternates.get(locale) !== href)) {
        failures.push(`${url} does not expose its exact reciprocal locale alternates`);
      }
      if (/<meta name="robots" content="[^"]*noindex/i.test(html)) failures.push(`${url} is noindex`);

      const locale = new URL(url).pathname.split('/')[1];
      if (url === `${SITE}/${locale}/`) {
        const missingCards = TOPICS.map((topic) => topic.routes[locale]).filter((route) => !html.includes(`href="${route}"`));
        if (missingCards.length) failures.push(`${url} is missing ${missingCards.length} manifested guide card(s)`);
      }
    } catch (error) {
      failures.push(`${url} could not be fetched: ${error.message}`);
    }
  }));
}

if (failures.length) {
  console.error(`\n  ✗ SEO live contract · ${failures.length} failure(s)`);
  failures.forEach((failure) => console.error('     · ' + failure));
  process.exit(1);
}

console.log(`  ✓ SEO live contract (${expectedUrls.length} canonical pages, sitemap, redirects and landing discovery)`);
