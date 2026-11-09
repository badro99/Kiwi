/* Annuaire Kiwi · les pages, rendues sur le serveur depuis D1.
 *
 *   /fr/annuaire/                       le hub (recherche ?q=, filtres, pages ?page=)
 *   /fr/annuaire/<ville>/               une ville, si elle a des fiches (sinon 404 noindex)
 *   /fr/annuaire/<ville>/<metier>/      un métier dans une ville, même règle
 *   /fr/annuaire/<slug>/                une fiche
 *   /fr/annuaire/<slug>/signaler/       signaler, corriger, demander le retrait
 *   /fr/annuaire/ajouter/               inscrire un commerce (gratuit, modéré)
 * En anglais sous /en/directory/ (add, report), en arabe sous /ar/annuaire/.
 *
 * Rendu côté serveur, pour les moteurs et pour un téléphone sans JavaScript :
 * les deux formulaires sont des <form> ordinaires qui postent vers
 * /api/directory/submit et /api/directory/report. Le cadre (en-tête, pied de
 * page, feuilles) est celui des guides, écrit par tools/build-guides.mjs dans
 * ./_directory-chrome.js. Tout texte venu d'un commerce est échappé ; aucune
 * donnée de contact privée n'est lue ici (PUBLIC_COLUMNS, ./_directory.js).
 *
 * Table absente (migration pas encore appliquée) : listes vides, jamais 500. */
import { CHROME, ASSETS } from './_directory-chrome.js';
import { STR, fill } from './_directory-strings.js';
import {
  CITIES, TRADES, PER_PAGE, cityBySlug, tradeById, tradeBySlug,
  listListings, facets, listingBySlug, clientExtras, formToken,
} from './_directory.js';

export const SITE = 'https://kiwi-os.com';
export const LOCALES = ['fr', 'en', 'ar'];
export const BASE = { fr: '/fr/annuaire/', en: '/en/directory/', ar: '/ar/annuaire/' };
export const WORDS = { fr: { add: 'ajouter', report: 'signaler' }, en: { add: 'add', report: 'report' }, ar: { add: 'ajouter', report: 'signaler' } };

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ldJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const icon = (name, extra = '') => `<i class="ms${extra ? ' ' + extra : ''}" aria-hidden="true" style="--ms:url(/assets/icons/material/${name}.svg)"></i>`;
const num = (n, lang) => (lang === 'ar' ? `<bdi dir="ltr">${n}</bdi>` : String(n));
const cityName = (slug, lang) => { const c = cityBySlug(slug); return c ? c.label[lang] : slug; };
const tradeName = (id, lang) => { const t = tradeById(id); return t ? t.label[lang] : id; };

/* Les adresses d'une même page dans les trois langues : `rel` est le chemin
 * sous la base (« casablanca/ », « cafe-atlas-casablanca/signaler/ »). */
export const routes = (rel = '') => Object.fromEntries(LOCALES.map((l) => [l, BASE[l] + rel]));
const relFor = (lang, kind, a = '') => kind === 'add' ? WORDS[lang].add + '/' : kind === 'report' ? `${a}/${WORDS[lang].report}/` : a;

function count(n, lang) {
  const s = STR[lang];
  return n === 0 ? s.countZero : fill(n === 1 ? s.countOne : s.countMany, { n: num(n, lang) });
}

/* ── Le document ─────────────────────────────────────────────────────────── */
function page(lang, { title, description, rel, canonical = true, noindex = false, ld = [], body, query = '' }) {
  const s = STR[lang];
  const rts = routes(rel);
  const url = SITE + rts[lang] + query;
  let header = CHROME[lang].header;
  for (const l of LOCALES) header = header.split(`%%ROUTE_${l}%%`).join(rts[l]);
  const alternates = canonical && !noindex
    ? LOCALES.map((l) => `  <link rel="alternate" hreflang="${l}" href="${esc(SITE + rts[l] + query)}">`).join('\n')
      + `\n  <link rel="alternate" hreflang="x-default" href="${esc(SITE + rts.fr + query)}">` : '';
  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}">
${canonical && !noindex ? `  <link rel="canonical" href="${esc(url)}">\n${alternates}\n` : ''}  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Kiwi">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  <meta name="twitter:card" content="summary">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${ASSETS.legacyFaces}">
  <link rel="stylesheet" href="${ASSETS.articleCss}">
  <link rel="stylesheet" href="${ASSETS.directoryCss}">
${ld.map((x) => `  <script type="application/ld+json">${ldJson(x)}</script>`).join('\n')}
</head>
<body>
  <a class="skip-link" href="#annuaire">${esc(s.allListings)}</a>
  ${header}
  <main id="annuaire">
${body}
  </main>
  ${CHROME[lang].footer}
  <script src="${ASSETS.lens}" defer></script>
  <script src="${ASSETS.trades}" defer></script>
  <script src="${ASSETS.demoFunnel}" defer></script>
</body>
</html>
`;
}

function crumbs(lang, items) {
  const s = STR[lang];
  const all = [[`/${lang}/`, s.home], ...items];
  const html = all.map(([href, label], i) => (i === all.length - 1 || !href
    ? `<li aria-current="page">${esc(label)}</li>` : `<li><a href="${esc(href)}">${esc(label)}</a></li>`)).join('');
  const ld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: all.map(([href, label], i) => ({ '@type': 'ListItem', position: i + 1, name: label, ...(href ? { item: SITE + href } : {}) })),
  };
  return { html: `<nav class="breadcrumbs" aria-label="${lang === 'ar' ? 'مسار التصفح' : lang === 'en' ? 'Breadcrumb' : 'Fil d’Ariane'}"><ol>${html}</ol></nav>`, ld };
}

function searchForm(lang, { q = '', city = '', trade = '' } = {}) {
  const s = STR[lang];
  const opt = (v, label, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
  return `<form class="dir-search" method="get" action="${BASE[lang]}" role="search" aria-label="${esc(s.searchLabel)}">
<div class="search-field"><label class="visually-hidden" for="dir-q">${esc(s.searchLabel)}</label>${icon('search', 'search-icon')}<input type="search" id="dir-q" name="q" value="${esc(q)}" placeholder="${esc(s.searchPh)}" maxlength="80" autocomplete="off"></div>
<div class="dir-select"><label class="visually-hidden" for="dir-city">${esc(s.cityLabel)}</label><select id="dir-city" name="ville">${opt('', s.allCities, !city)}${CITIES.map((c) => opt(c.slug, c.label[lang], c.slug === city)).join('')}</select>${icon('expand_more')}</div>
<div class="dir-select"><label class="visually-hidden" for="dir-trade">${esc(s.tradeLabel)}</label><select id="dir-trade" name="metier">${opt('', s.allTrades, !trade)}${TRADES.map((t) => opt(t.slug, t.label[lang], t.slug === trade)).join('')}</select>${icon('expand_more')}</div>
<button class="button" type="submit">${esc(s.searchBtn)}</button>
</form>`;
}

function card(r, lang) {
  const s = STR[lang];
  const t = tradeById(r.trade);
  const summary = r.description ? r.description.replace(/\s+/g, ' ').slice(0, 180) : '';
  return `<li class="guide-card dir-card${r.client ? ' dir-card--client' : ''}"><article aria-labelledby="dir-${esc(r.slug)}"><a class="card-link" href="${BASE[lang]}${esc(r.slug)}/">
<span class="card-top"><span class="card-icon">${icon(t ? t.icon : 'storefront')}</span><span class="card-category">${esc(tradeName(r.trade, lang))}</span>${r.client ? `<span class="dir-badge">${icon('verified')}${esc(s.clientBadge)}</span>` : ''}</span>
<h3 class="card-title" id="dir-${esc(r.slug)}" dir="auto">${esc(r.name)}</h3>${summary ? `<span class="card-summary" dir="auto">${esc(summary)}</span>` : ''}
<span class="card-meta">${icon('location_on')}<span dir="auto">${esc(r.address ? `${r.address}, ${cityName(r.city, lang)}` : cityName(r.city, lang))}</span></span>
</a></article></li>`;
}

function listBlock(lang, rows, total, { heading, emptyCity = '' } = {}) {
  const s = STR[lang];
  const head = `<div class="section-rule"><h2 id="dir-list-title">${esc(heading || s.allListings)}</h2><p class="library-count" role="status">${count(total, lang)}</p></div>`;
  if (!rows.length) {
    return `<section aria-labelledby="dir-list-title">${head}<div class="dir-empty"><h3>${esc(emptyCity || s.emptyTitle)}</h3><p>${esc(s.emptyText)}</p><p>${esc(s.clientHint)}</p>
<div class="dir-hero-actions"><a class="button" href="${BASE[lang]}${WORDS[lang].add}/">${esc(s.addCta)} <span class="arrow" aria-hidden="true">${icon('north_east')}</span></a></div></div></section>`;
  }
  return `<section aria-labelledby="dir-list-title">${head}<ol class="dir-grid">${rows.map((r) => card(r, lang)).join('')}</ol></section>`;
}

function pager(lang, pageNo, total, hrefFor) {
  const pages = Math.ceil(total / PER_PAGE);
  if (pages <= 1) return '';
  const s = STR[lang];
  const prev = pageNo > 1 ? `<a class="button button--outline button--compact" rel="prev" href="${esc(hrefFor(pageNo - 1))}">${esc(s.prev)}</a>` : '';
  const next = pageNo < pages ? `<a class="button button--outline button--compact" rel="next" href="${esc(hrefFor(pageNo + 1))}">${esc(s.next)}</a>` : '';
  return `<nav class="dir-pager" aria-label="${esc(s.pagerLabel)}">${prev}<span>${fill(s.pageOf, { p: num(pageNo, lang), n: num(pages, lang) })}</span>${next}</nav>`;
}

function steps(lang) {
  const s = STR[lang];
  return `<section aria-labelledby="dir-how"><div class="section-rule"><h2 id="dir-how">${esc(s.howTitle)}</h2></div><ol class="dir-steps">${s.steps.map(([h, p]) => `<li><h3>${esc(h)}</h3><p>${esc(p)}</p></li>`).join('')}</ol></section>`;
}

function hero(lang, { crumbsHtml, eyebrow, h1, deck = '', extra = '' }) {
  return `<header class="library-hero"><div class="hero-inner">${crumbsHtml}<div class="hero-copy">
<p class="eyebrow">${esc(eyebrow)}</p>
${h1}
${deck ? `<p class="hero-deck">${esc(deck)}</p>` : ''}
${extra}
</div></div></header>`;
}

const pageParam = (url) => Math.min(500, Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1));

/* ── Le hub ──────────────────────────────────────────────────────────────── */
async function hub(env, lang, url) {
  const s = STR[lang];
  const q = String(url.searchParams.get('q') || '').trim().slice(0, 80);
  const tradeSlug = String(url.searchParams.get('metier') || '');
  const citySlug = String(url.searchParams.get('ville') || '');
  const city = cityBySlug(citySlug), trade = tradeBySlug(tradeSlug);
  /* Un filtre sans recherche a sa propre page, indexable. */
  if (!q && city) return redirect(BASE[lang] + city.slug + '/' + (trade ? trade.slug + '/' : ''));
  const pageNo = pageParam(url);
  const [list, f] = await Promise.all([
    listListings(env, { q, trade: trade ? trade.id : '', page: pageNo }),
    facets(env),
  ]);
  const totalAll = f.reduce((a, x) => a + x.n, 0);
  const citiesWith = cityCounts(f);
  const filtered = !!(q || trade);
  const { html: crumbsHtml, ld } = crumbs(lang, [[BASE[lang], s.directory]]);
  const facts = `<dl class="hero-facts"><div><dt>${esc(s.factListings)}</dt><dd>${num(totalAll, lang)}</dd></div><div><dt>${esc(s.factCities)}</dt><dd>${num(citiesWith.length, lang)}</dd></div><div><dt>${esc(s.factPrice)}</dt><dd>${esc(s.free)}</dd></div></dl>`;
  const actions = `<div class="dir-hero-actions"><a class="button button--light" href="${BASE[lang]}${WORDS[lang].add}/">${icon('add_circle')} ${esc(s.addCta)}</a></div>`;
  const body = hero(lang, {
    crumbsHtml, eyebrow: s.eyebrow,
    h1: `<h1 class="library-title">${esc(s.h1a)} <span class="accent-text">${esc(s.h1b)}</span></h1>`,
    deck: s.deck, extra: searchForm(lang, { q, trade: trade ? trade.slug : '' }) + actions + facts,
  }) + `<div class="library-shell">
${listBlock(lang, list.rows, list.total, { heading: q ? fill(s.resultsFor, { q }) : (trade ? trade.label[lang] : s.allListings) })}
${pager(lang, pageNo, list.total, (p) => BASE[lang] + '?' + new URLSearchParams({ ...(q ? { q } : {}), ...(trade ? { metier: trade.slug } : {}), page: String(p) }).toString())}
${citiesWith.length ? `<section aria-labelledby="dir-cities"><div class="section-rule"><h2 id="dir-cities">${esc(s.browseCities)}</h2></div><ul class="dir-cities">${citiesWith.map(([c, n]) => `<li><a href="${BASE[lang]}${c}/">${esc(cityName(c, lang))} <b>${num(n, lang)}</b></a></li>`).join('')}</ul></section>` : ''}
${steps(lang)}
</div>`;
  const query = !filtered && pageNo > 1 ? `?page=${pageNo}` : '';
  return html(page(lang, {
    title: s.hubTitle, description: s.hubDescription, rel: '', noindex: filtered, query, body,
    ld: [ld, { '@context': 'https://schema.org', '@type': 'CollectionPage', name: s.hubTitle, description: s.hubDescription, url: SITE + BASE[lang], inLanguage: lang }],
  }), filtered ? 60 : 300);
}

function cityCounts(f) {
  const by = new Map();
  for (const x of f) by.set(x.city, (by.get(x.city) || 0) + x.n);
  return CITIES.map((c) => [c.slug, by.get(c.slug) || 0]).filter(([, n]) => n > 0);
}

/* ── Une ville, un métier dans une ville ─────────────────────────────────── */
async function place(env, lang, url, city, trade) {
  const s = STR[lang];
  const pageNo = pageParam(url);
  const [list, f] = await Promise.all([listListings(env, { city: city.slug, trade: trade ? trade.id : '', page: pageNo }), facets(env)]);
  const cName = city.label[lang];
  const rel = city.slug + '/' + (trade ? trade.slug + '/' : '');
  const trail = [[BASE[lang], s.directory], [trade ? BASE[lang] + city.slug + '/' : '', cName]];
  if (trade) trail.push(['', trade.label[lang]]);
  const { html: crumbsHtml, ld } = crumbs(lang, trail);
  const title = trade ? fill(s.tradeTitle, { trade: trade.label[lang], city: cName }) : fill(s.cityTitle, { city: cName });
  const description = trade ? fill(s.tradeDescription, { trade: trade.label[lang], city: cName }) : fill(s.cityDescription, { city: cName });
  const trades = TRADES.map((t) => [t, f.filter((x) => x.city === city.slug && x.trade === t.id).reduce((a, x) => a + x.n, 0)]).filter(([, n]) => n > 0);
  const empty = list.total === 0;
  const h1 = trade ? `<h1 class="library-title">${esc(trade.label[lang])} <span class="accent-text">${esc(cName)}</span></h1>`
    : `<h1 class="library-title">${esc(s.cityH1a)} <span class="accent-text">${esc(cName)}</span></h1>`;
  const body = hero(lang, { crumbsHtml, eyebrow: s.eyebrow, h1, deck: description, extra: searchForm(lang, { city: city.slug, trade: trade ? trade.slug : '' }) })
    + `<div class="library-shell">
${listBlock(lang, list.rows, list.total, { heading: trade ? trade.label[lang] : cName, emptyCity: fill(s.cityEmpty, { city: cName }) })}
${pager(lang, pageNo, list.total, (p) => `${BASE[lang]}${rel}?page=${p}`)}
${!trade && trades.length > 1 ? `<section aria-labelledby="dir-trades"><div class="section-rule"><h2 id="dir-trades">${esc(fill(s.browseTrades, { city: cName }))}</h2></div><ul class="dir-cities">${trades.map(([t, n]) => `<li><a href="${BASE[lang]}${city.slug}/${t.slug}/">${esc(t.label[lang])} <b>${num(n, lang)}</b></a></li>`).join('')}</ul></section>` : ''}
</div>`;
  /* Une page de ville sans fiche n'existe pas pour les moteurs : 404, noindex. */
  return html(page(lang, { title, description, rel, noindex: empty, query: pageNo > 1 ? `?page=${pageNo}` : '', body, ld: empty ? [] : [ld] }), 300, empty ? 404 : 200);
}

/* ── Une fiche ───────────────────────────────────────────────────────────── */
export function waNumber(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (/^0[567]\d{8}$/.test(d)) return '212' + d.slice(1);
  return d;
}
const telHref = (phone) => 'tel:' + String(phone || '').replace(/[^\d+]/g, '');
const mapHref = (r, lang) => 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(`${r.name}, ${r.address}, ${cityName(r.city, 'fr')}, Maroc`);
const DAY_LD = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };

export function listingLd(r, extras, lang) {
  const t = tradeById(r.trade);
  const out = {
    '@context': 'https://schema.org', '@type': t ? t.ld : 'LocalBusiness', name: r.name,
    url: SITE + BASE[lang] + r.slug + '/',
    address: { '@type': 'PostalAddress', addressLocality: cityName(r.city, 'fr'), addressCountry: 'MA', ...(r.address ? { streetAddress: r.address } : {}) },
  };
  if (r.description) out.description = r.description;
  if (r.phone) out.telephone = r.phone.startsWith('+') ? r.phone : '+' + waNumber(r.phone);
  if (r.website) out.sameAs = [r.website];
  if (extras && extras.menu) out.hasMenu = SITE + extras.menu;
  if (extras && extras.hours) {
    out.openingHoursSpecification = extras.hours.flatMap((d) => d.periods.map((p) => ({
      '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/' + DAY_LD[d.day], opens: p.from, closes: p.to,
    })));
  }
  return out;
}

async function listing(env, lang, slug) {
  const r = await listingBySlug(env, slug);
  if (!r) return notFound(lang);
  const s = STR[lang];
  const extras = r.client ? await clientExtras(env, r.merchant) : null;
  const t = tradeById(r.trade);
  const cName = cityName(r.city, lang);
  const { html: crumbsHtml, ld } = crumbs(lang, [[BASE[lang], s.directory], [BASE[lang] + r.city + '/', cName], [BASE[lang] + r.city + '/' + (t ? t.slug : r.trade) + '/', tradeName(r.trade, lang)], ['', r.name]]);
  const actions = [];
  if (extras && extras.menu) actions.push(`<a class="button button--light" href="${esc(extras.menu)}">${icon('menu_book')} ${esc(s.menu)}</a>`);
  if (extras && extras.booking) actions.push(`<a class="button button--light" href="${esc(extras.booking)}">${icon('calendar_month')} ${esc(s.booking)}</a>`);
  if (r.phone) actions.push(`<a class="button button--outline" href="${esc(telHref(r.phone))}">${icon('call')} ${esc(s.call)}</a>`);
  if (r.whatsapp) actions.push(`<a class="button button--outline" href="https://wa.me/${esc(waNumber(r.phone))}" rel="noopener">${icon('chat')} ${esc(s.whatsapp)}</a>`);
  if (r.website) actions.push(`<a class="button button--outline" href="${esc(r.website)}" rel="noopener nofollow ugc">${icon('language')} ${esc(s.visit)}</a>`);
  if (r.address) actions.push(`<a class="button button--outline" href="${esc(mapHref(r, lang))}" rel="noopener">${icon('location_on')} ${esc(s.directions)}</a>`);
  const h1 = `<div class="dir-title-row"><h1 class="library-title" dir="auto">${esc(r.name)}</h1>${r.client ? `<span class="dir-badge">${icon('verified')}${esc(s.clientBadge)}</span>` : ''}</div>`;
  const facts = [
    ['location_on', s.address, esc(r.address ? `${r.address}, ${cName}` : cName)],
    r.phone ? ['call', s.phone, `<a href="${esc(telHref(r.phone))}"><bdi dir="ltr">${esc(r.phone)}</bdi></a>`] : null,
    r.website ? ['language', s.website, `<a href="${esc(r.website)}" rel="noopener nofollow ugc">${esc(r.website.replace(/^https?:\/\//, ''))}</a>`] : null,
  ].filter(Boolean).map(([ic, dt, dd]) => `<div>${icon(ic)}<dt>${esc(dt)}</dt><dd>${dd}</dd></div>`).join('');
  const hours = extras && extras.hours ? `<section class="dir-panel" aria-labelledby="dir-hours"><h2 id="dir-hours">${esc(s.hours)}</h2><table class="dir-hours"><tbody>${extras.hours.map((d) => `<tr><th scope="row">${esc(s.days[d.day])}</th><td>${d.periods.length ? d.periods.map((p) => `<bdi dir="ltr">${esc(p.from)} – ${esc(p.to)}</bdi>`).join(', ') : esc(s.closed)}</td></tr>`).join('')}</tbody></table><p class="dir-note">${esc(s.hoursNote)}</p></section>` : '';
  const kiwi = r.client ? '' : `<section class="dir-panel dir-kiwi" aria-labelledby="dir-kiwi"><h2 id="dir-kiwi">${esc(s.kiwiTitle)}</h2><p>${esc(s.kiwiText)}</p><a class="button button--compact" href="/${lang}/">${esc(s.kiwiBtn)} <span class="arrow" aria-hidden="true">${icon('north_east')}</span></a></section>`;
  const body = hero(lang, { crumbsHtml, eyebrow: `${tradeName(r.trade, lang)} · ${cName}`, h1, extra: actions.length ? `<div class="dir-hero-actions">${actions.join('')}</div>` : '' })
    + `<div class="library-shell"><div class="dir-sheet"><div>
${r.description ? `<section class="dir-panel" aria-labelledby="dir-about"><h2 id="dir-about">${esc(s.about)}</h2><p class="dir-desc" dir="auto">${esc(r.description)}</p></section>` : ''}
<section class="dir-panel" aria-labelledby="dir-infos"><h2 id="dir-infos">${esc(s.infos)}</h2><dl class="dir-facts">${facts}</dl>
<p class="dir-note">${esc(r.client ? s.sourceClient : s.sourcePublic)}</p>
<a class="dir-report" href="${BASE[lang]}${esc(r.slug)}/${WORDS[lang].report}/" rel="nofollow">${icon('flag')} ${esc(s.report)}</a></section>
</div><div>${hours}${kiwi}</div></div></div>`;
  const title = `${r.name} · ${tradeName(r.trade, lang)} · ${cName} · ${lang === 'ar' ? 'دليل Kiwi' : lang === 'en' ? 'Kiwi directory' : 'Annuaire Kiwi'}`;
  const description = (r.description || `${r.name}, ${tradeName(r.trade, lang)}, ${r.address ? r.address + ', ' : ''}${cName}.`).replace(/\s+/g, ' ').slice(0, 158);
  return html(page(lang, { title, description, rel: r.slug + '/', body, ld: [listingLd(r, extras, lang), ld] }), 300);
}

/* ── Les formulaires ─────────────────────────────────────────────────────── */
function fieldText(id, label, { value = '', type = 'text', required = false, help = '', max = 80, auto = 'off', invalid = false, lang = 'fr', dir = '' } = {}) {
  const s = STR[lang];
  const helpId = help ? `${id}-help` : '';
  return `<div class="dir-field"><label for="${id}">${esc(label)}${required ? ` <span class="visually-hidden">(${esc(s.required)})</span><span aria-hidden="true"> *</span>` : ''}</label>
<input id="${id}" name="${id.replace(/^f-/, '')}" type="${type}" value="${esc(value)}" maxlength="${max}" autocomplete="${auto}"${dir ? ` dir="${dir}"` : ''}${required ? ' required' : ''}${helpId ? ` aria-describedby="${helpId}"` : ''}${invalid ? ' aria-invalid="true"' : ''}>${help ? `<small id="${helpId}">${esc(help)}</small>` : ''}</div>`;
}

function fieldSelect(id, label, options, value, lang, invalid) {
  const s = STR[lang];
  return `<div class="dir-field"><label for="${id}">${esc(label)} <span class="visually-hidden">(${esc(s.required)})</span><span aria-hidden="true"> *</span></label>
<select id="${id}" name="${id.replace(/^f-/, '')}" required${invalid ? ' aria-invalid="true"' : ''}><option value="">${esc(s.choose)}</option>${options.map(([v, l]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
}

const errorBox = (lang, error) => error ? `<p class="dir-error" role="alert" id="dir-error">${esc(STR[lang].errors[error] || STR[lang].errors.unavailable)}</p>` : '';

export async function renderAddPage(env, lang, { values = {}, error = '', thanks = false, status = 200 } = {}) {
  const s = STR[lang];
  const { html: crumbsHtml, ld } = crumbs(lang, [[BASE[lang], s.directory], ['', s.addShort]]);
  const v = values;
  const bad = (f) => error === f;
  const form = thanks
    ? `<div class="dir-ok" role="status"><h2>${esc(s.thanksTitle)}</h2><p>${esc(s.thanksText)}</p><a class="button button--compact" href="${BASE[lang]}">${esc(s.back)}</a></div>`
    : `<form class="dir-form" method="post" action="/api/directory/submit" accept-charset="utf-8" novalidate${error ? ' aria-describedby="dir-error"' : ''}>
${errorBox(lang, error)}
<input type="hidden" name="lang" value="${lang}"><input type="hidden" name="t" value="${esc(await formToken(env))}">
<div class="dir-trap" aria-hidden="true"><label for="f-homepage">Homepage</label><input id="f-homepage" name="homepage" type="text" tabindex="-1" autocomplete="off"></div>
<fieldset><legend>${esc(s.legendBusiness)}</legend>
${fieldText('f-name', s.name, { value: v.name, required: true, auto: 'organization', invalid: bad('name') || bad('duplicate'), lang })}
<div class="dir-row">${fieldSelect('f-trade', s.trade, TRADES.map((t) => [t.id, t.label[lang]]), v.trade, lang, bad('trade'))}${fieldSelect('f-city', s.city, CITIES.map((c) => [c.slug, c.label[lang]]), v.city, lang, bad('city'))}</div>
${fieldText('f-address', s.address2, { value: v.address, help: s.addressHelp, max: 160, auto: 'street-address', lang })}
<div class="dir-field"><label for="f-description">${esc(s.description)}</label><textarea id="f-description" name="description" maxlength="600" aria-describedby="f-description-help"${bad('description') ? ' aria-invalid="true"' : ''}>${esc(v.description)}</textarea><small id="f-description-help">${esc(s.descriptionHelp)}</small></div>
${fieldText('f-website', s.website2, { value: v.website, type: 'url', max: 200, auto: 'url', invalid: bad('website'), lang, dir: 'ltr' })}
${fieldText('f-phone', s.phone2, { value: v.phone, type: 'tel', max: 32, auto: 'tel', invalid: bad('phone') || bad('contact'), lang, dir: 'ltr' })}
<label class="dir-check"><input type="checkbox" name="showPhone" value="1"${v.showPhone ? ' checked' : ''}> ${esc(s.showPhone)}</label>
<label class="dir-check"><input type="checkbox" name="whatsapp" value="1"${v.whatsapp ? ' checked' : ''}> ${esc(s.waOn)}</label>
</fieldset>
<fieldset><legend>${esc(s.legendContact)}</legend>
<div class="dir-row">${fieldText('f-contactName', s.contactName, { value: v.contactName, max: 60, auto: 'name', lang })}${fieldText('f-email', s.email, { value: v.email, type: 'email', max: 160, auto: 'email', invalid: bad('email') || bad('contact'), lang, dir: 'ltr' })}</div>
<small class="dir-privacy">${esc(s.contactHelp)}</small>
</fieldset>
<p class="dir-privacy">${esc(s.privacy)} <a href="/privacy.html#annuaire">${esc(s.privacyLink)}</a></p>
<button class="button" type="submit">${esc(s.submit)} <span class="arrow" aria-hidden="true">${icon('north_east')}</span></button>
</form>`;
  const body = hero(lang, { crumbsHtml, eyebrow: s.eyebrow, h1: `<h1 class="library-title">${esc(s.addH1a)} <span class="accent-text">${esc(s.addH1b)}</span></h1>`, deck: s.addDeck })
    + `<div class="library-shell">${form}${steps(lang)}</div>`;
  return html(page(lang, { title: s.addTitle, description: s.addDescription, rel: relFor(lang, 'add'), noindex: thanks || !!error, body, ld: [ld] }), 0, status);
}

export async function renderReportPage(env, lang, slug, { values = {}, error = '', thanks = false, status = 200 } = {}) {
  const r = await listingBySlug(env, slug);
  if (!r) return notFound(lang);
  const s = STR[lang];
  const { html: crumbsHtml } = crumbs(lang, [[BASE[lang], s.directory], [BASE[lang] + r.slug + '/', r.name], ['', s.reportH1]]);
  const kind = values.kind === 'removal' ? 'removal' : 'correction';
  const form = thanks
    ? `<div class="dir-ok" role="status"><h2>${esc(s.reportThanks)}</h2><p>${esc(s.reportThanksText)}</p><a class="button button--compact" href="${BASE[lang]}">${esc(s.back)}</a></div>`
    : `<form class="dir-form" method="post" action="/api/directory/report" accept-charset="utf-8" novalidate${error ? ' aria-describedby="dir-error"' : ''}>
${errorBox(lang, error)}
<input type="hidden" name="lang" value="${lang}"><input type="hidden" name="slug" value="${esc(r.slug)}"><input type="hidden" name="t" value="${esc(await formToken(env))}">
<div class="dir-trap" aria-hidden="true"><label for="f-homepage">Homepage</label><input id="f-homepage" name="homepage" type="text" tabindex="-1" autocomplete="off"></div>
<fieldset><legend>${esc(s.kindLabel)}</legend>
<label class="dir-check"><input type="radio" name="kind" value="correction"${kind === 'correction' ? ' checked' : ''}> ${esc(s.kindCorrection)}</label>
<label class="dir-check"><input type="radio" name="kind" value="removal"${kind === 'removal' ? ' checked' : ''}> ${esc(s.kindRemoval)}</label>
</fieldset>
<div class="dir-field"><label for="f-message">${esc(s.message)} <span class="visually-hidden">(${esc(s.required)})</span><span aria-hidden="true"> *</span></label><textarea id="f-message" name="message" maxlength="1000" required aria-describedby="f-message-help"${error === 'message' ? ' aria-invalid="true"' : ''}>${esc(values.message)}</textarea><small id="f-message-help">${esc(s.messageHelp)}</small></div>
${fieldText('f-contact', s.contact, { value: values.contact, max: 160, auto: 'email', lang, dir: 'ltr' })}
<p class="dir-privacy">${esc(s.privacy)} <a href="/privacy.html#annuaire">${esc(s.privacyLink)}</a></p>
<button class="button" type="submit">${esc(s.reportSubmit)} <span class="arrow" aria-hidden="true">${icon('north_east')}</span></button>
</form>`;
  const body = hero(lang, { crumbsHtml, eyebrow: r.name, h1: `<h1 class="library-title">${esc(s.reportH1)}</h1>`, deck: s.reportDeck }) + `<div class="library-shell">${form}</div>`;
  return html(page(lang, { title: s.reportTitle, description: s.reportDeck, rel: relFor(lang, 'report', r.slug), noindex: true, body }), 0, status);
}

function notFound(lang) {
  const s = STR[lang];
  const { html: crumbsHtml } = crumbs(lang, [[BASE[lang], s.directory], ['', s.notFoundH1]]);
  const body = hero(lang, { crumbsHtml, eyebrow: s.eyebrow, h1: `<h1 class="library-title">${esc(s.notFoundH1)}</h1>`, deck: s.notFoundText, extra: searchForm(lang) })
    + `<div class="library-shell">${steps(lang)}</div>`;
  return html(page(lang, { title: s.notFoundTitle, description: s.notFoundText, rel: '', noindex: true, body }), 60, 404);
}

/* ── Réponses ────────────────────────────────────────────────────────────── */
function html(body, maxAge, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}
function redirect(to, status = 302) {
  return new Response(null, { status, headers: { Location: to, 'Cache-Control': 'no-store' } });
}

/* Le point d'entrée des trois dossiers de langue (functions/{fr,en,ar}/…/[[path]].js). */
export async function directoryPage(context, lang) {
  const { request, env } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const url = new URL(request.url);
  const base = BASE[lang];
  if (!url.pathname.endsWith('/')) return redirect(url.pathname + '/' + url.search, 308);
  const segs = url.pathname.slice(base.length - 1).split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x).toLowerCase(); } catch (_) { return ''; } });
  let res;
  try {
    if (!segs.length) res = await hub(env, lang, url);
    else if (segs.length === 1 && segs[0] === WORDS[lang].add) res = await renderAddPage(env, lang, { thanks: url.searchParams.get('merci') === '1' || url.searchParams.get('thanks') === '1' });
    else if (segs.length === 1 && cityBySlug(segs[0])) res = await place(env, lang, url, cityBySlug(segs[0]), null);
    else if (segs.length === 2 && cityBySlug(segs[0]) && tradeBySlug(segs[1])) res = await place(env, lang, url, cityBySlug(segs[0]), tradeBySlug(segs[1]));
    else if (segs.length === 1) res = await listing(env, lang, segs[0]);
    else if (segs.length === 2 && segs[1] === WORDS[lang].report) res = await renderReportPage(env, lang, segs[0], { thanks: url.searchParams.get('merci') === '1' });
    else res = notFound(lang);
  } catch (_) {
    /* Une base qui tousse : le hub vide, ou la page introuvable, plutôt qu'un 500. */
    res = segs.length ? notFound(lang) : await hub({}, lang, url);
  }
  return request.method === 'HEAD' ? new Response(null, { status: res.status, headers: res.headers }) : res;
}
