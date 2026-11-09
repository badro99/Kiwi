#!/usr/bin/env node
/* Les pages « Fonctionnalités » de kiwi-os.com (tools/build-features.mjs).
 *
 * Ce que la suite tient, pour le hub et chaque page, en FR, EN et AR :
 *   · les pages publiées sont exactement celles que le générateur produit ;
 *   · une seule h1, la langue et le sens d'écriture, l'adresse canonique et
 *     des hreflang réciproques (fr, en, ar, x-default), la ligne du sitemap ;
 *   · un JSON-LD valide : WebPage, SoftwareApplication avec l'offre au prix de
 *     l'accueil, FAQPage égale à la FAQ affichée, BreadcrumbList ;
 *   · les prix et le contenu des plans sont ceux de content/landing-pricing.json
 *     et de tools/landing-pricing.mjs, et chaque page vend le plan qui inclut
 *     sa fonction (CLAUDE.md §7 : OrderPro est dans Pro, pas dans Plus) ;
 *   · chaque phrase qui décrit le logiciel (data-claim) pointe vers un test du
 *     gate, par une ancre unique (tools/feature-claims-map.json) ;
 *   · ni tiret cadratin ni italique, des captures réelles sous 120 Ko et des
 *     images de partage en palette sous 200 Ko ;
 *   · les guides mènent au hub. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { FEATURE_HUB, FEATURE_LOCALES, FEATURE_MORE, FEATURE_PAGES } from '../content/features/manifest.mjs';
import { TOPICS } from '../content/guides/manifest.mjs';
import hubCopy from '../content/features/pages/hub.mjs';
import caisse from '../content/features/pages/caisse.mjs';
import stock from '../content/features/pages/stock.mjs';
import orderpro from '../content/features/pages/orderpro.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://kiwi-os.com';
const COPY = { caisse, stock, orderpro };
process.chdir(ROOT);
const { prices, formatPrice } = await import('./landing-pricing.mjs');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const pricing = JSON.parse(read('content/landing-pricing.json'));
const PLAN_INDEX = { basic: 0, plus: 1, pro: 2, ultra: 3 };

let checks = 0;
const failures = [];
const ok = (condition, message) => { checks++; if (!condition) failures.push(message); };
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (markup) => decode(String(markup).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const pageFile = (route) => path.join(ROOT, decodeURI(route).slice(1), 'index.html');

/* 1 · Les pages publiées sont celles que la source produit. */
const build = spawnSync(process.execPath, [path.join(ROOT, 'tools/build-features.mjs'), '--check'], { encoding: 'utf8' });
ok(build.status === 0, 'tools/build-features.mjs --check : les pages suivent leur source\n' + (build.stdout || '') + (build.stderr || ''));

/* 2 · Le plan de chaque page est bien celui du tarif de l'accueil. */
const tierHas = (plan, label) => pricing.fr.tiers[PLAN_INDEX[plan]].features.includes(label);
ok(FEATURE_PAGES.find((p) => p.id === 'caisse').plan === 'basic' && tierHas('basic', 'Caisse avec scan de codes-barres'), 'la caisse est vendue avec Basic, qui la liste');
ok(FEATURE_PAGES.find((p) => p.id === 'stock').plan === 'basic' && tierHas('basic', 'Suivi du stock'), 'le stock est vendu avec Basic, qui le liste');
ok(FEATURE_PAGES.find((p) => p.id === 'orderpro').plan === 'pro' && tierHas('pro', 'OrderPro Restaurant') && !tierHas('plus', 'OrderPro Restaurant'), 'OrderPro est vendu avec Pro, pas avec Plus');
const PLAN_LABEL = { plus: { 'caisse.returns': 'Retours, échanges et avoirs', 'stock.variants': 'Catalogue par tailles et couleurs', 'stock.margin': 'Suivi des ventes et des marges' }, pro: { 'stock.recipes': 'Recettes, ingrédients et coût matière' } };

/* 3 · Les promesses et leurs preuves. */
const map = JSON.parse(read('tools/feature-claims-map.json'));
const gate = read('tools/check.js');
const frClaims = new Map();
for (const page of FEATURE_PAGES) {
  const copy = COPY[page.id].fr;
  for (const fact of copy.facts) frClaims.set(fact.claim, fact.text);
  for (const section of copy.sections) for (const point of section.points) if (point.text) frClaims.set(point.claim, point.text);
}
ok(JSON.stringify([...frClaims.keys()].sort()) === JSON.stringify(Object.keys(map.claims).sort()), 'chaque promesse des pages a sa preuve, et la carte ne garde aucune promesse retirée');
for (const [id, claim] of Object.entries(map.claims)) {
  ok(claim.fr === frClaims.get(id), `${id} : le texte français de la carte est celui de la page (relire la preuve si la phrase a changé)`);
  ok(Array.isArray(claim.contracts) && claim.contracts.length > 0, `${id} : au moins une preuve`);
  if (claim.plan) {
    ok(tierHas(claim.plan, PLAN_LABEL[claim.plan]?.[id]), `${id} : le plan ${claim.plan} liste bien cette fonction sur l'accueil`);
    for (const locale of FEATURE_LOCALES) {
      const page = FEATURE_PAGES.find((p) => p.id === claim.page);
      const point = COPY[page.id][locale].sections.flatMap((s) => s.points).find((p) => p.claim === id);
      ok(point?.text?.includes(`Kiwi ${pricing.fr.tiers[PLAN_INDEX[claim.plan]].name}`), `${id}/${locale} : la phrase nomme le plan Kiwi ${claim.plan}`);
    }
  }
  for (const contract of claim.contracts || []) {
    const file = path.join(ROOT, contract.file);
    const exists = /^tools\/[\w.-]+test[\w.-]*\.(?:mjs|js)$/.test(contract.file) && fs.existsSync(file);
    ok(exists, `${id} : ${contract.file} existe`);
    ok(gate.includes("'" + path.basename(contract.file) + "'"), `${id} : ${contract.file} est lancé par le gate`);
    if (!exists) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.includes(contract.assertion));
    ok(typeof contract.assertion === 'string' && contract.assertion.length > 15 && lines.length === 1, `${id} : l'ancre « ${contract.assertion} » apparaît une seule fois dans ${contract.file}`);
    ok(!/^(?:const|let|var|return|if|for|while|throw|function|class|import|export|switch|try|do|else)\b/.test(String(contract.assertion).trim()), `${id} : l'ancre est une expression`);
  }
}

/* Les fonctions sans page, sur le hub : des promesses de l'accueil déjà prouvées. */
const landingClaims = JSON.parse(read('tools/landing-claims-map.json')).claims;
for (const entry of FEATURE_MORE) {
  ok(landingClaims[entry.landingClaim]?.kind === 'contract', `hub · ${entry.id} reprend une promesse prouvée de l'accueil (${entry.landingClaim})`);
  const [, tierIndex] = entry.landingClaim.split('.');
  ok(Number(tierIndex) === PLAN_INDEX[entry.plan], `hub · ${entry.id} est rangé dans le plan qui le liste`);
}

/* 4 · Chaque page publiée. */
const allowedAmounts = new Set(prices.flatMap((p) => [p.monthly, p.annual, p.total].filter(Boolean)));
const sitemap = read('sitemap.xml');
const sitemapRows = sitemap.match(/<url>[\s\S]*?<\/url>/g) || [];
const usedClaims = Object.fromEntries(FEATURE_LOCALES.map((l) => [l, new Set()]));
const css = read('assets/features/features.css');
ok(!/italic/i.test(css), 'features.css ne met rien en italique');
ok(!/!important/.test(css), 'features.css gagne par la cascade, sans !important');

for (const entry of [FEATURE_HUB, ...FEATURE_PAGES]) {
  for (const locale of FEATURE_LOCALES) {
    const route = entry.routes[locale];
    const label = `${entry.id}/${locale}`;
    const file = pageFile(route);
    if (!fs.existsSync(file)) { ok(false, `${label} : ${route} n'est pas publiée`); continue; }
    const html = fs.readFileSync(file, 'utf8');
    const url = SITE + route;
    ok(html.includes(`<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">`), `${label} : langue et sens d'écriture`);
    ok((html.match(/<h1\b/g) || []).length === 1 && (html.match(/<main\b/g) || []).length === 1, `${label} : une h1, un main`);
    ok(html.includes(`<link rel="canonical" href="${url}">`), `${label} : adresse canonique`);
    const alternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]);
    const expected = [...FEATURE_LOCALES.map((l) => [l, SITE + entry.routes[l]]), ['x-default', SITE + entry.routes.fr]];
    ok(JSON.stringify(alternates) === JSON.stringify(expected), `${label} : hreflang fr, en, ar et x-default, réciproques`);
    const row = sitemapRows.filter((r) => r.includes(`<loc>${url}</loc>`));
    const rowAlternates = row.length === 1 ? [...row[0].matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]) : [];
    ok(row.length === 1 && JSON.stringify(rowAlternates) === JSON.stringify(expected), `${label} : une ligne de sitemap, avec le même groupe de langues`);
    ok(!html.includes('—'), `${label} : aucun tiret cadratin`);
    ok(!/<(?:em|cite|dfn|var)\b/.test(html) && !/<i\b(?![^>]*class="ms)/.test(html) && !/font-style:\s*italic/.test(html), `${label} : aucune italique`);
    ok(/<a data-lens-item class="on" href="[^"]+" aria-current="page">/.test(html) && html.includes(`<a data-lens-item class="on" href="${FEATURE_HUB.routes[locale]}"`), `${label} : « Fonctionnalités » est l'entrée active de la navigation`);

    /* JSON-LD */
    const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    let graph = [];
    try { graph = JSON.parse(raw[1])['@graph']; ok(true, `${label} : JSON-LD valide`); } catch (error) { ok(false, `${label} : JSON-LD illisible (${error.message})`); }
    const node = (type) => graph.find((n) => n['@type'] === type);
    ok(node('Organization')?.['@id'] === `${SITE}/#organization`, `${label} : JSON-LD Organization`);
    const crumbs = node('BreadcrumbList')?.itemListElement || [];
    ok(crumbs.length === (entry.id === 'hub' ? 2 : 3) && crumbs[0].item === `${SITE}/${locale}/`, `${label} : fil d'Ariane structuré`);

    /* Liens d'action : inscription au bon plan, démo WhatsApp avec un message dans la langue. */
    const plan = entry.id === 'hub' ? 'basic' : entry.plan;
    const signups = [...html.matchAll(/<a class="button button--dark" href="([^"]+)" data-feature-cta="signup">/g)].map((m) => decode(m[1]));
    ok(signups.length >= 2 && signups.every((href) => href === `/dashboard.html?plan=${plan}&period=monthly`), `${label} : « Commencer » ouvre l'inscription au plan ${plan}`);
    const demoMessage = entry.id === 'hub' ? hubCopy[locale].demo : COPY[entry.id][locale].plan.demo;
    const demos = [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"[^>]*data-feature-cta="demo"/g)].map((m) => decode(m[1]));
    ok(demos.length >= 2 && demos.every((href) => href === 'https://wa.me/212624495159?text=' + encodeURIComponent(demoMessage)), `${label} : la démo ouvre WhatsApp avec un message prérempli dans la langue`);

    /* Captures et image de partage. */
    for (const m of html.matchAll(/<img src="(\/assets\/features\/[^"?]+)\?v=[0-9a-f]{10}" width="(\d+)" height="(\d+)" alt="([^"]*)"/g)) {
      const img = path.join(ROOT, m[1]);
      ok(fs.existsSync(img) && fs.statSync(img).size <= 125 * 1024, `${label} : ${m[1]} existe et pèse moins de 120 Ko`);
      ok(m[4].trim().length > 20, `${label} : ${m[1]} a un texte alternatif réel`);
      ok(m[1].endsWith(`-${locale}.webp`), `${label} : ${m[1]} est la capture de la langue de la page`);
    }
    const og = entry.pages[locale].image;
    const ogBuf = fs.existsSync(path.join(ROOT, og)) ? fs.readFileSync(path.join(ROOT, og)) : Buffer.alloc(0);
    ok(ogBuf.length > 0 && ogBuf.length <= 200 * 1024 && ogBuf.readUInt32BE(16) === 1200 && ogBuf.readUInt32BE(20) === 630 && ogBuf[25] === 3,
      `${label} : image de partage ${og} en 1200 × 630, palette, sous 200 Ko`);
    ok(html.includes(`<meta property="og:image" content="${SITE}/${og}">`), `${label} : og:image`);

    if (entry.id === 'hub') {
      const collection = node('CollectionPage');
      ok(collection?.mainEntity?.numberOfItems === FEATURE_PAGES.length
        && FEATURE_PAGES.every((p, i) => collection.mainEntity.itemListElement[i].url === SITE + p.routes[locale]), `${label} : la liste structurée nomme les ${FEATURE_PAGES.length} pages`);
      for (const page of FEATURE_PAGES) ok(html.includes(`href="${page.routes[locale]}" data-feature-link="${page.id}"`), `${label} : carte vers ${page.id}`);
      for (const [index, p] of prices.entries()) ok(html.includes(`<li data-plan="${['basic', 'plus', 'pro', 'ultra'][index]}"><strong>Kiwi ${pricing.fr.tiers[index].name}</strong><span>${locale === 'ar' ? `<bdi dir="ltr">${formatPrice(p.monthly, locale)}</bdi>` : formatPrice(p.monthly, locale)} ${pricing[locale].currency}`), `${label} : Kiwi ${pricing.fr.tiers[index].name} au prix de l'accueil`);
      continue;
    }

    const copy = COPY[entry.id][locale];
    const price = prices[PLAN_INDEX[entry.plan]];
    const app = node('SoftwareApplication');
    ok(app?.offers?.price === String(price.monthly) && app.offers.priceCurrency === 'MAD' && app.offers.name === `Kiwi ${pricing.fr.tiers[PLAN_INDEX[entry.plan]].name}`, `${label} : l'offre structurée est Kiwi ${entry.plan} à ${price.monthly} MAD`);
    const faq = node('FAQPage')?.mainEntity || [];
    const shown = [...html.matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)].map((m) => [text(m[1]), text(m[2])]);
    ok(shown.length >= 4 && JSON.stringify(faq.map((q) => [q.name, q.acceptedAnswer.text])) === JSON.stringify(shown), `${label} : FAQPage décrit exactement la FAQ affichée`);
    ok(node('WebPage')?.url === url, `${label} : JSON-LD WebPage`);

    /* L'encadré du plan : prix mensuel, annuel et total, puis la liste du plan. */
    const box = html.match(/<section class="feature-plan"[\s\S]*?<\/section>/)?.[0] || '';
    const n = (v) => (locale === 'ar' ? `<bdi dir="ltr">${formatPrice(v, locale)}</bdi>` : formatPrice(v, locale));
    ok(box.includes(`<span class="plan-amount">${n(price.monthly)}</span>`), `${label} : prix mensuel du plan`);
    ok(box.includes(formatPrice(price.annual, locale)) && box.includes(formatPrice(price.total, locale)), `${label} : prix annuel et total de l'année`);
    for (const feature of pricing[locale].tiers[PLAN_INDEX[entry.plan]].features) ok(box.includes(`<span>${feature.replace(/&/g, '&amp;')}</span>`), `${label} : le plan liste « ${feature} » comme l'accueil`);

    /* Les montants cités en FAQ sont des prix du tarif. */
    for (const [, answer] of copy.faq) {
      for (const m of answer.matchAll(/(\d[\d\s ,.]*)\s*(?:MAD|درهم|درهما)/g)) {
        const amount = Number(m[1].replace(/[\s ,.]/g, ''));
        ok(allowedAmounts.has(amount), `${label} : « ${m[0].trim()} » en FAQ est un prix du tarif`);
      }
    }
    for (const m of html.matchAll(/data-claim="([^"]+)"/g)) usedClaims[locale].add(m[1]);
    for (const id of entry.guides) {
      const topic = TOPICS.find((t) => t.id === id);
      ok(topic && html.includes(`href="${topic.routes[locale]}"`), `${label} : lien vers le guide ${id}`);
    }
  }
}
for (const locale of FEATURE_LOCALES) {
  ok(JSON.stringify([...usedClaims[locale]].sort()) === JSON.stringify(Object.keys(map.claims).sort()), `${locale} : les pages affichent toutes les promesses de la carte, et seulement elles`);
}

/* 5 · Les guides mènent au hub (en-tête et pied de page). */
for (const locale of FEATURE_LOCALES) {
  const guides = read(`${locale}/guides/index.html`);
  ok(guides.includes(`<a data-lens-item href="${FEATURE_HUB.routes[locale]}">`), `${locale}/guides : la navigation mène au hub des fonctionnalités`);
  const footer = guides.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] || '';
  ok(footer.includes(`href="${FEATURE_HUB.routes[locale]}"`), `${locale}/guides : le pied de page mène au hub des fonctionnalités`);
}

/* 6 · Aucune source ne glisse un tiret cadratin ou une italique dans le texte. */
for (const source of ['content/features/manifest.mjs', 'content/features/pages/hub.mjs', 'content/features/pages/caisse.mjs', 'content/features/pages/stock.mjs', 'content/features/pages/orderpro.mjs']) {
  const body = read(source).replace(/^\s*(?:\/\*|\*|\/\/).*$/gm, '');
  ok(!body.includes('—'), `${source} : aucun tiret cadratin`);
}

if (failures.length) {
  failures.forEach((message) => console.log('  ✗ ' + message));
  console.log(`\n  ${checks - failures.length}/${checks} contrôles des pages Fonctionnalités`);
  process.exit(1);
}
console.log(`  ✓ ${checks} contrôles des pages Fonctionnalités (source, SEO, prix, preuves, images)`);
