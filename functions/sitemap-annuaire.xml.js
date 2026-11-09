/* GET /sitemap-annuaire.xml · les adresses de l'annuaire Kiwi, lues dans D1.
 *
 * Le sitemap statique (sitemap.xml) est écrit par tools/build-guides.mjs et
 * vérifié par tools/seo-live-test.mjs ; on ne le tord pas pour des pages qui
 * changent chaque jour. robots.txt nomme les deux. Les trois langues de chaque
 * page y sont reliées (hreflang). Seules les villes et les métiers qui ont des
 * fiches y figurent ; table absente : le hub seul. */
import { facets, sitemapRows, cityBySlug, tradeById } from './api/_directory.js';
import { SITE, LOCALES, routes } from './api/_directory-page.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const day = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');

function rows(rel, ts) {
  const r = routes(rel);
  const links = LOCALES.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(SITE + r[l])}" />`).join('')
    + `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(SITE + r.fr)}" />`;
  const mod = ts ? `<lastmod>${day(ts)}</lastmod>` : '';
  return LOCALES.map((l) => `<url><loc>${esc(SITE + r[l])}</loc>${mod}${links}</url>`);
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  let f = [], listings = [];
  try { [f, listings] = await Promise.all([facets(env), sitemapRows(env)]); } catch (_) { /* hub seul */ }
  const newest = Math.max(0, ...f.map((x) => x.ts));
  const out = [...rows('', newest)];
  const cities = new Map();
  for (const x of f) cities.set(x.city, Math.max(cities.get(x.city) || 0, x.ts));
  for (const [city, ts] of cities) if (cityBySlug(city)) out.push(...rows(city + '/', ts));
  for (const x of f) {
    const t = tradeById(x.trade);
    if (cityBySlug(x.city) && t) out.push(...rows(`${x.city}/${t.slug}/`, x.ts));
  }
  for (const l of listings) out.push(...rows(l.slug + '/', Number(l.updated_ts) || 0));
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${out.join('\n')}\n</urlset>\n`;
  return new Response(request.method === 'HEAD' ? null : body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
