#!/usr/bin/env node
/* Pages « Fonctionnalités » de kiwi-os.com, en FR, EN et AR.
 *
 *   node tools/build-features.mjs           (écrit les pages)
 *   node tools/build-features.mjs --check   (échoue si une page diffère de sa source)
 *
 * Sources : content/features/manifest.mjs (adresses, titres, plan),
 * content/features/pages/*.mjs (texte), content/landing-pricing.json et
 * tools/landing-pricing.mjs (prix et contenu des plans, les mêmes que
 * l'accueil), content/guides/manifest.mjs (guides liés). Le cadre (en-tête,
 * pied de page, hreflang) vient de tools/site-chrome.mjs, partagé avec les
 * guides. Le sitemap est écrit par tools/build-guides.mjs, qui lit le même
 * manifeste.
 *
 * Chaque phrase qui décrit un comportement du logiciel porte `data-claim` :
 * tools/features-pages-test.mjs vérifie qu'elle pointe vers un test du gate
 * (tools/feature-claims-map.json). */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  LEGACY_FACES_V, ROOT, SITE, UI, absolute, alternateLinks, esc, extractFooter, header, icon, json,
  localizeFooterAnchors, stamp, writeOrCheck,
} from './site-chrome.mjs';
import { ASSET_VERSIONS, TOPICS, TOPIC_CARDS } from '../content/guides/manifest.mjs';
import { FEATURE_HUB, FEATURE_LOCALES, FEATURE_MORE, FEATURE_PAGES, FEATURES_MODIFIED, FEATURES_PUBLISHED } from '../content/features/manifest.mjs';
import hubCopy from '../content/features/pages/hub.mjs';
import caisseCopy from '../content/features/pages/caisse.mjs';
import stockCopy from '../content/features/pages/stock.mjs';
import orderproCopy from '../content/features/pages/orderpro.mjs';

const CHECK = process.argv.includes('--check');
const COPY = Object.freeze({ caisse: caisseCopy, stock: stockCopy, orderpro: orderproCopy });
const pricingCopy = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'landing-pricing.json'), 'utf8'));
/* tools/landing-pricing.mjs lit le JSON par un chemin relatif : on l'importe
 * depuis la racine pour avoir les mêmes prix et le même format que l'accueil. */
process.chdir(ROOT);
const { prices, formatPrice } = await import('./landing-pricing.mjs');

export const PLAN_INDEX = Object.freeze({ basic: 0, plus: 1, pro: 2, ultra: 3 });
/* Les plans montrés dans l'encadré de chaque page : le plan qui inclut la
 * fonction, puis ceux qui y ajoutent quelque chose dont la page parle. */
export const PLAN_LADDER = Object.freeze({ caisse: ['basic', 'plus'], stock: ['basic', 'plus', 'pro'], orderpro: ['pro'] });
export const WHATSAPP = 'https://wa.me/212624495159';

const FEAT = Object.freeze({
  fr: {
    skip: 'Aller au contenu', breadcrumbs: 'Fil d’Ariane', essentials: 'L’essentiel',
    start: 'Commencer mes 15 jours', demo: 'Demander une démo', plan: 'Plan',
    perMonth: 'par mois', included: 'Ce plan comprend',
    annual: (a, t) => `ou ${a} MAD par mois en annuel, soit ${t} MAD par an`,
    trial: '15 jours gratuits, sans engagement, sans commission sur vos ventes.',
    planLine: (name, m) => `Kiwi ${name} · ${m} MAD par mois · 15 jours d’essai`,
    ladderFrom: 'dès',
    faq: 'Questions fréquentes', related: 'Pour aller plus loin', relatedDeck: 'Les guides Kiwi qui vont avec cette fonction.',
    others: 'Les autres fonctions', allFeatures: 'Toutes les fonctionnalités', guide: 'Guide',
    ctaTitle: 'Essayez-le sur votre commerce.', ctaBody: 'Créez votre compte, chargez quelques articles et faites une vraie vente. Les 15 premiers jours sont gratuits.',
    shotNote: 'Capture de la démo Kiwi, sans données de client.',
    orgDescription: 'Kiwi édite un logiciel de caisse et de gestion utilisé par des cafés, restaurants et commerces au Maroc.',
    trialShort: '15 jours gratuits', from: 'dès',
  },
  en: {
    skip: 'Skip to content', breadcrumbs: 'Breadcrumb', essentials: 'The essentials',
    start: 'Start my 15 days', demo: 'Book a demo', plan: 'Plan',
    perMonth: 'a month', included: 'This plan includes',
    annual: (a, t) => `or ${a} MAD a month on the annual plan, ${t} MAD a year`,
    trial: '15 days free, no commitment, no commission on your sales.',
    planLine: (name, m) => `Kiwi ${name} · ${m} MAD a month · 15-day trial`,
    ladderFrom: 'from',
    faq: 'Frequently asked questions', related: 'Go further', relatedDeck: 'The Kiwi guides that go with this feature.',
    others: 'Other features', allFeatures: 'All features', guide: 'Guide',
    ctaTitle: 'Try it on your own business.', ctaBody: 'Create your account, load a few items and make a real sale. The first 15 days are free.',
    shotNote: 'Screenshot of the Kiwi demo, with no customer data.',
    orgDescription: 'Kiwi builds point-of-sale and management software used by cafes, restaurants and shops in Morocco.',
    trialShort: '15 days free', from: 'from',
  },
  ar: {
    skip: 'انتقل إلى المحتوى', breadcrumbs: 'مسار التنقل', essentials: 'الأساسي',
    start: 'ابدأ أيامي الخمسة عشر', demo: 'اطلب عرضا توضيحيا', plan: 'الباقة',
    perMonth: 'في الشهر', included: 'تشمل هذه الباقة',
    annual: (a, t) => `أو <bdi dir="ltr">${a}</bdi> درهم في الشهر في الاشتراك السنوي، أي <bdi dir="ltr">${t}</bdi> درهم في السنة`,
    trial: '15 يوما مجانا، دون التزام، ودون عمولة على مبيعاتك.',
    planLine: (name, m) => `Kiwi ${name} · <bdi dir="ltr">${m}</bdi> درهم في الشهر · تجربة 15 يوما`,
    ladderFrom: 'ابتداء من',
    faq: 'أسئلة شائعة', related: 'للتعمق أكثر', relatedDeck: 'أدلة Kiwi المرتبطة بهذه الخاصية.',
    others: 'خصائص أخرى', allFeatures: 'كل الخصائص', guide: 'دليل',
    ctaTitle: 'جربه في محلك.', ctaBody: 'أنشئ حسابك، وأضف بعض السلع، وقم بعملية بيع حقيقية. الأيام الخمسة عشر الأولى مجانية.',
    shotNote: 'لقطة من العرض التجريبي لـ Kiwi، دون بيانات زبائن.',
    orgDescription: 'تطوّر Kiwi برنامج كاشير وإدارة تستعمله مقاه ومطاعم ومتاجر في المغرب.',
    trialShort: '15 يوما مجانا', from: 'ابتداء من',
  },
});

const num = (value, locale) => (locale === 'ar' ? `<bdi dir="ltr">${value}</bdi>` : value);
const money = (amount, locale) => formatPrice(amount, locale);
const tier = (plan, locale) => pricingCopy[locale].tiers[PLAN_INDEX[plan]];
const planName = (plan) => pricingCopy.fr.tiers[PLAN_INDEX[plan]].name;
export const signupHref = (plan) => `/dashboard.html?plan=${plan}&period=monthly`;
export const demoHref = (message) => `${WHATSAPP}?text=${encodeURIComponent(message)}`;
const outputPath = (route) => path.join(ROOT, decodeURI(route).replace(/^\//, ''), 'index.html');

/* Les images : URL versionnée par le contenu (une capture refaite change
 * d'URL, donc aucun cache ne sert l'ancienne), largeur et hauteur lues dans le
 * fichier pour réserver la place avant le chargement. */
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
function webpSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`${file}: pas un WebP`);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8L') { const bits = b.readUInt32LE(21); return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 }; }
  if (chunk === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  throw new Error(`${file}: en-tête WebP inconnu`);
}
export function shotFile(name, locale) { return path.join(ROOT, 'assets', 'features', `${name}-${locale}.webp`); }
function img(name, locale, alt, { eager = false, phone = false } = {}) {
  const file = shotFile(name, locale);
  if (!fs.existsSync(file)) throw new Error(`capture manquante : ${path.relative(ROOT, file)} (node tools/capture-feature-shots.mjs ${name})`);
  const { w, h } = webpSize(file);
  const src = `/assets/features/${name}-${locale}.webp?v=${hash(file)}`;
  return `<img src="${src}" width="${w}" height="${h}" alt="${esc(alt)}"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"${phone ? ' class="is-phone"' : ''}>`;
}
const CSS = path.join(ROOT, 'assets', 'features', 'features.css');

function claimsOf(copy) {
  const byId = new Map();
  for (const fact of copy.facts) byId.set(fact.claim, fact.text);
  for (const section of copy.sections) for (const point of section.points) if (point.text) byId.set(point.claim, point.text);
  return byId;
}
/* Une promesse peut revenir dans une section sans réécrire son texte : elle
 * reprend alors celui de l'encadré « L'essentiel ». */
function pointText(copy, point) {
  const text = point.text || claimsOf(copy).get(point.claim);
  if (!text) throw new Error(`promesse ${point.claim} sans texte`);
  return text;
}

function breadcrumbs(locale, trail) {
  const items = trail.map(([label, href], index) => (index === trail.length - 1
    ? `<li aria-current="page">${esc(label)}</li>`
    : `<li><a href="${esc(href)}">${esc(label)}</a></li>`)).join('');
  return `<nav class="breadcrumbs" aria-label="${esc(FEAT[locale].breadcrumbs)}"><ol>${items}</ol></nav>`;
}

function ctas(locale, plan, demoMessage, extra = '') {
  const f = FEAT[locale];
  return `<div class="feature-ctas${extra}">`
    + `<a class="button button--dark" href="${esc(signupHref(plan))}" data-feature-cta="signup">${esc(f.start)} <span class="arrow" aria-hidden="true">${icon('arrow_forward')}</span></a>`
    + `<a class="button button--outline" href="${esc(demoHref(demoMessage))}" target="_blank" rel="noreferrer" data-feature-cta="demo">${esc(f.demo)}</a>`
    + `</div>`;
}

function planLadder(entry, locale) {
  const f = FEAT[locale];
  const p = pricingCopy[locale];
  return PLAN_LADDER[entry.id].map((plan) => {
    const price = prices[PLAN_INDEX[plan]];
    const main = plan === entry.plan;
    return `<li${main ? ' class="is-main"' : ''} data-plan="${plan}"><strong>Kiwi ${esc(planName(plan))}</strong>`
      + `<span class="ladder-price">${esc(f.ladderFrom)} ${num(money(price.monthly, locale), locale)} ${esc(p.currency)}${esc(p.monthlySuffix)}</span></li>`;
  }).join('');
}

function planBox(entry, copy, locale) {
  const f = FEAT[locale];
  const p = pricingCopy[locale];
  const plan = entry.plan;
  const price = prices[PLAN_INDEX[plan]];
  const features = tier(plan, locale).features.map((feature) => `<li>${icon('check')}<span>${esc(feature)}</span></li>`).join('');
  return `<section class="feature-plan" id="plan" aria-labelledby="plan-title">
<div class="plan-copy"><p class="section-kicker">${esc(f.plan)}</p><h2 id="plan-title">${esc(copy.plan.title)}</h2><p>${esc(copy.plan.body)}</p>
<ul class="plan-ladder">${planLadder(entry, locale)}</ul></div>
<div class="plan-card" data-plan="${plan}"><p class="plan-name">Kiwi ${esc(planName(plan))}</p>
<p class="plan-price"><span class="plan-amount">${num(money(price.monthly, locale), locale)}</span> <span class="plan-unit">${esc(p.currency)}${esc(p.monthlySuffix)}</span></p>
<p class="plan-annual">${locale === 'ar' ? f.annual(money(price.annual, locale), money(price.total, locale)) : esc(f.annual(money(price.annual, locale), money(price.total, locale)))}</p>
<p class="plan-trial">${esc(f.trial)}</p>
<p class="plan-includes">${esc(f.included)}</p><ul class="plan-features">${features}</ul>
${ctas(locale, plan, copy.plan.demo, ' feature-ctas--stack')}</div>
</section>`;
}

function faqSection(copy, locale) {
  const items = copy.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n');
  return `<section class="faq feature-faq" id="faq" aria-labelledby="faq-title"><h2 id="faq-title">${esc(FEAT[locale].faq)}</h2>\n${items}\n</section>`;
}

function relatedGuides(entry, locale) {
  const f = FEAT[locale];
  const cards = entry.guides.map((id) => {
    const topic = TOPICS.find((t) => t.id === id);
    if (!topic) throw new Error(`${entry.id}: guide inconnu ${id}`);
    return `<li><a class="related-guide" href="${esc(topic.routes[locale])}"><span class="related-kicker">${esc(f.guide)}</span>`
      + `<strong>${esc(topic.pages[locale].ogTitle)}</strong><span class="related-summary">${esc(TOPIC_CARDS[id][locale])}</span>`
      + `<span class="related-go">${icon('arrow_forward')}</span></a></li>`;
  }).join('');
  return `<section class="feature-related" aria-labelledby="related-title"><h2 id="related-title">${esc(f.related)}</h2><p>${esc(f.relatedDeck)}</p><ul>${cards}</ul></section>`;
}

function otherFeatures(entry, locale) {
  const f = FEAT[locale];
  const others = FEATURE_PAGES.filter((other) => other.id !== entry.id).map((other) => {
    const copy = COPY[other.id][locale];
    return `<li><a href="${esc(other.routes[locale])}">${icon(other.icon)}<span><strong>${esc(copy.nav)}</strong><small>${esc(copy.card)}</small></span></a></li>`;
  }).join('');
  return `<nav class="feature-others" aria-labelledby="others-title"><h2 id="others-title">${esc(f.others)}</h2><ul>${others}`
    + `<li><a href="${esc(FEATURE_HUB.routes[locale])}">${icon('arrow_forward')}<span><strong>${esc(f.allFeatures)}</strong></span></a></li></ul></nav>`;
}

function finalCta(plan, demoMessage, locale) {
  const f = FEAT[locale];
  return `<section class="article-cta feature-cta" aria-labelledby="cta-title"><div class="cta-top"><div class="cta-copy">`
    + `<h2 id="cta-title">${esc(f.ctaTitle)}</h2><p>${esc(f.ctaBody)}</p></div>${ctas(locale, plan, demoMessage)}</div></section>`;
}

function featureMain(entry, locale) {
  const copy = COPY[entry.id][locale];
  const f = FEAT[locale];
  const hubCopyLocale = hubCopy[locale];
  const price = prices[PLAN_INDEX[entry.plan]];
  const facts = copy.facts.map((fact) => `<li data-claim="${esc(fact.claim)}">${icon('check_circle')}<span>${esc(fact.text)}</span></li>`).join('');
  const sections = copy.sections.map((section, index) => {
    const points = section.points.map((point) => `<li data-claim="${esc(point.claim)}">${icon('check')}<span>${esc(pointText(copy, point))}</span></li>`).join('');
    const body = section.body.map((paragraph) => `<p>${esc(paragraph)}</p>`).join('');
    const shot = section.shot
      ? `<figure class="feature-shot${section.shot.phone ? ' feature-shot--phone' : ''}">${img(section.shot.name, locale, section.shot.alt, { phone: section.shot.phone })}</figure>`
      : '';
    const kicker = `${String(index + 1).padStart(2, '0')} · ${section.kicker}`;
    return `<section class="feature-section${shot ? '' : ' feature-section--text'}" id="${esc(section.id)}" aria-labelledby="${esc(section.id)}-title">
<div class="feature-copy"><p class="section-kicker">${locale === 'ar' ? `<bdi dir="ltr">${String(index + 1).padStart(2, '0')}</bdi> · ${esc(section.kicker)}` : esc(kicker)}</p><h2 id="${esc(section.id)}-title">${esc(section.title)}</h2>${body}<ul class="feature-points">${points}</ul></div>${shot}
</section>`;
  }).join('\n');

  return `<main id="feature" class="feature-page" data-feature="${esc(entry.id)}">
<article>
<header class="article-hero feature-hero"><div class="hero-inner">
${breadcrumbs(locale, [[UI[locale].home, `/${locale}/`], [hubCopyLocale.nav, FEATURE_HUB.routes[locale]], [copy.nav]])}
<div class="feature-hero-grid${copy.hero.phone ? ' feature-hero-grid--phone' : ''}"><div class="hero-copy">
<p class="eyebrow">${esc(copy.eyebrow)}</p>
<h1 class="article-title">${esc(copy.h1[0])} <span class="accent-text">${esc(copy.h1[1])}</span></h1>
<p class="hero-deck">${esc(copy.deck)}</p>
${ctas(locale, entry.plan, copy.plan.demo)}
<p class="feature-price-note">${f.planLine(esc(planName(entry.plan)), money(price.monthly, locale))}</p>
</div>
<figure class="feature-shot feature-shot--hero${copy.hero.phone ? ' feature-shot--phone' : ''}">${img(copy.hero.shot, locale, copy.hero.alt, { eager: true, phone: copy.hero.phone })}<figcaption>${esc(f.shotNote)}</figcaption></figure>
</div></div></header>
<div class="feature-body">
<section class="feature-facts" aria-labelledby="facts-title"><h2 id="facts-title" class="visually-hidden">${esc(f.essentials)}</h2><ul>${facts}</ul></section>
${sections}
${planBox(entry, copy, locale)}
${faqSection(copy, locale)}
${relatedGuides(entry, locale)}
${otherFeatures(entry, locale)}
${finalCta(entry.plan, copy.plan.demo, locale)}
</div>
</article>
</main>`;
}

function hubMain(locale) {
  const copy = hubCopy[locale];
  const f = FEAT[locale];
  const p = pricingCopy[locale];
  const cards = FEATURE_PAGES.map((entry) => {
    const page = COPY[entry.id][locale];
    const price = prices[PLAN_INDEX[entry.plan]];
    return `<li class="feature-card"><a href="${esc(entry.routes[locale])}" data-feature-link="${esc(entry.id)}">`
      + `<span class="feature-card-shot${page.hero.phone ? ' is-phone' : ''}">${img(page.hero.shot, locale, page.hero.alt, { phone: page.hero.phone })}</span>`
      + `<span class="feature-card-body"><span class="feature-card-top">${icon(entry.icon)}<span class="feature-card-plan">Kiwi ${esc(planName(entry.plan))} · ${esc(f.from)} ${num(money(price.monthly, locale), locale)} ${esc(p.currency)}${esc(p.monthlySuffix)}</span></span>`
      + `<h3>${esc(page.nav)}</h3><span class="feature-card-summary">${esc(page.card)}</span>`
      + `<span class="feature-card-go">${esc(copy.read)} ${icon('arrow_forward')}</span></span></a></li>`;
  }).join('');
  const more = FEATURE_MORE.map((entry) => {
    const [, tierIndex, , featureIndex] = entry.landingClaim.split('.');
    const label = p.tiers[Number(tierIndex)].features[Number(featureIndex)];
    return `<li data-landing-claim="${esc(entry.landingClaim)}">${icon(entry.icon)}<span><strong>${esc(label)}</strong><small>Kiwi ${esc(planName(entry.plan))}</small></span></li>`;
  }).join('');
  const plans = ['basic', 'plus', 'pro', 'ultra'].map((plan) => {
    const price = prices[PLAN_INDEX[plan]];
    return `<li data-plan="${plan}"><strong>Kiwi ${esc(planName(plan))}</strong><span>${num(money(price.monthly, locale), locale)} ${esc(p.currency)}${esc(p.monthlySuffix)}</span></li>`;
  }).join('');
  return `<main id="feature" class="feature-page feature-hub">
<header class="article-hero feature-hero feature-hero--hub"><div class="hero-inner">
${breadcrumbs(locale, [[UI[locale].home, `/${locale}/`], [copy.nav]])}
<div class="hero-copy">
<p class="eyebrow">${esc(copy.eyebrow)}</p>
<h1 class="article-title">${esc(copy.h1[0])} <span class="accent-text">${esc(copy.h1[1])}</span></h1>
<p class="hero-deck">${esc(copy.deck)}</p>
${ctas(locale, 'basic', copy.demo)}
</div></div></header>
<div class="feature-body">
<section class="feature-cards" aria-labelledby="pages-title"><h2 id="pages-title">${esc(copy.pagesTitle)}</h2><ul>${cards}</ul></section>
<section class="feature-more" aria-labelledby="more-title"><h2 id="more-title">${esc(copy.moreTitle)}</h2><p>${esc(copy.moreDeck)}</p><ul>${more}</ul></section>
<section class="feature-plans" aria-labelledby="plans-title"><h2 id="plans-title">${esc(copy.plansTitle)}</h2><p>${esc(copy.plansDeck)}</p><ul>${plans}</ul>
<a class="button button--outline" href="/${locale}/#pricing">${esc(copy.plansLink)} <span class="arrow" aria-hidden="true">${icon('arrow_forward')}</span></a></section>
${finalCta('basic', copy.demo, locale)}
</div>
</main>`;
}

const organization = (locale) => ({
  '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'Kiwi', url: absolute(`/${locale}/`),
  logo: { '@type': 'ImageObject', url: absolute('/images/kiwi-logo.svg') },
  description: FEAT[locale].orgDescription, areaServed: { '@type': 'Country', name: 'Morocco' },
});

function structuredData(entry, locale) {
  const ui = UI[locale];
  const meta = entry.pages[locale];
  const url = absolute(entry.routes[locale]);
  const hub = hubCopy[locale];
  if (entry.id === 'hub') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage', '@id': `${url}#collection`, url, name: meta.ogTitle, description: meta.description,
          inLanguage: ui.language, isPartOf: { '@id': `${SITE}/#organization` }, publisher: { '@id': `${SITE}/#organization` },
          datePublished: FEATURES_PUBLISHED, dateModified: FEATURES_MODIFIED,
          mainEntity: {
            '@type': 'ItemList', numberOfItems: FEATURE_PAGES.length, itemListOrder: 'https://schema.org/ItemListOrderAscending',
            itemListElement: FEATURE_PAGES.map((page, index) => ({
              '@type': 'ListItem', position: index + 1, url: absolute(page.routes[locale]),
              name: COPY[page.id][locale].nav, description: COPY[page.id][locale].card,
            })),
          },
        },
        organization(locale),
        { '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: [
          { '@type': 'ListItem', position: 1, name: ui.home, item: absolute(`/${locale}/`) },
          { '@type': 'ListItem', position: 2, name: hub.nav },
        ] },
      ],
    };
  }
  const copy = COPY[entry.id][locale];
  const price = prices[PLAN_INDEX[entry.plan]];
  const featureList = [...new Set([...claimsOf(copy).values()])];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage', '@id': `${url}#webpage`, url, name: meta.ogTitle, description: meta.description,
        inLanguage: ui.language, datePublished: FEATURES_PUBLISHED, dateModified: FEATURES_MODIFIED,
        isPartOf: { '@id': `${absolute(FEATURE_HUB.routes[locale])}#collection` },
        primaryImageOfPage: { '@type': 'ImageObject', url: absolute('/' + meta.image), width: 1200, height: 630 },
        about: { '@id': `${url}#software` }, breadcrumb: { '@id': `${url}#breadcrumb` },
        publisher: { '@id': `${SITE}/#organization` },
      },
      {
        '@type': 'SoftwareApplication', '@id': `${url}#software`, name: `Kiwi · ${copy.nav}`,
        applicationCategory: 'BusinessApplication', operatingSystem: 'Web', url, inLanguage: ui.language,
        description: meta.description, featureList, publisher: { '@id': `${SITE}/#organization` },
        offers: {
          '@type': 'Offer', name: `Kiwi ${planName(entry.plan)}`, price: String(price.monthly), priceCurrency: 'MAD',
          url: absolute(signupHref(entry.plan)), category: 'subscription', availability: 'https://schema.org/InStock',
          priceSpecification: { '@type': 'UnitPriceSpecification', price: String(price.monthly), priceCurrency: 'MAD', unitCode: 'MON', referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' } },
          eligibleRegion: { '@type': 'Country', name: 'Morocco' },
        },
      },
      organization(locale),
      {
        '@type': 'FAQPage', '@id': `${url}#faq`, inLanguage: ui.language,
        mainEntity: copy.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      },
      { '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`, itemListElement: [
        { '@type': 'ListItem', position: 1, name: ui.home, item: absolute(`/${locale}/`) },
        { '@type': 'ListItem', position: 2, name: hub.nav, item: absolute(FEATURE_HUB.routes[locale]) },
        { '@type': 'ListItem', position: 3, name: copy.nav },
      ] },
    ],
  };
}

function renderPage(entry, locale, footer) {
  const ui = UI[locale];
  const meta = entry.pages[locale];
  const url = absolute(entry.routes[locale]);
  const main = entry.id === 'hub' ? hubMain(locale) : featureMain(entry, locale);
  return `<!doctype html>
<html lang="${locale}" dir="${ui.dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${esc(url)}">
${alternateLinks(entry.routes, FEATURE_LOCALES)}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Kiwi">
  <meta property="og:locale" content="${ui.ogLocale}">
  <meta property="og:title" content="${esc(meta.ogTitle)}">
  <meta property="og:description" content="${esc(meta.ogDescription)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${esc(absolute('/' + meta.image))}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:alt" content="${esc(meta.imageAlt)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(meta.ogTitle)}">
  <meta name="twitter:description" content="${esc(meta.ogDescription)}">
  <meta name="twitter:image" content="${esc(absolute('/' + meta.image))}">
  <meta name="twitter:image:alt" content="${esc(meta.imageAlt)}">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/fonts/legacy-faces.css?v=${LEGACY_FACES_V}" />
  <link rel="stylesheet" href="/assets/articles/article.css?v=${ASSET_VERSIONS.css}">
  <link rel="stylesheet" href="/assets/features/features.css?v=${hash(CSS)}">
  <script type="application/ld+json">${json(structuredData(entry, locale))}</script>
</head>
<body>
  <a class="skip-link" href="#feature">${esc(FEAT[locale].skip)}</a>
  ${header(locale, entry.routes, FEATURE_LOCALES, 'features')}
  ${main}
  ${localizeFooterAnchors(footer, locale)}
  <script src="/assets/liquid-lens.js" defer></script>
  <script src="/assets/trades.js?v=${stamp('assets/trades.js')}" defer></script>
  <script src="/assets/landing-demo-funnel.js?v=${stamp('assets/landing-demo-funnel.js')}" defer></script>
</body>
</html>
`;
}

function validate() {
  if (FEATURE_LOCALES.join(',') !== 'fr,en,ar') throw new Error('les pages Fonctionnalités sont en fr, en et ar');
  const routes = new Set();
  for (const entry of [FEATURE_HUB, ...FEATURE_PAGES]) {
    for (const locale of FEATURE_LOCALES) {
      const route = entry.routes[locale];
      if (!route || !route.startsWith(`/${locale}/`) || !route.endsWith('/')) throw new Error(`${entry.id}/${locale}: adresse invalide ${route}`);
      if (routes.has(route)) throw new Error(`adresse en double : ${route}`);
      routes.add(route);
      if (entry.id !== 'hub' && !route.startsWith(FEATURE_HUB.routes[locale])) throw new Error(`${entry.id}/${locale}: la page doit vivre sous le hub`);
      const meta = entry.pages[locale];
      for (const field of ['title', 'description', 'ogTitle', 'ogDescription', 'image', 'imageAlt']) {
        if (typeof meta[field] !== 'string' || !meta[field].trim()) throw new Error(`${entry.id}/${locale}: ${field} manquant`);
      }
      if (!fs.existsSync(path.join(ROOT, meta.image))) throw new Error(`${entry.id}/${locale}: image de partage manquante ${meta.image} (node tools/capture-feature-shots.mjs --og)`);
    }
    if (entry.id !== 'hub') {
      if (!(entry.plan in PLAN_INDEX) || !PLAN_LADDER[entry.id]?.includes(entry.plan)) throw new Error(`${entry.id}: plan inconnu ou absent de l'échelle`);
      for (const locale of FEATURE_LOCALES) {
        const copy = COPY[entry.id][locale];
        const ids = copy.facts.map((f) => f.claim).concat(copy.sections.flatMap((s) => s.points.map((p) => p.claim)));
        const en = COPY[entry.id].fr;
        const frIds = en.facts.map((f) => f.claim).concat(en.sections.flatMap((s) => s.points.map((p) => p.claim)));
        if (ids.join() !== frIds.join()) throw new Error(`${entry.id}/${locale}: les promesses ne suivent pas le français`);
        if (copy.faq.length !== en.faq.length) throw new Error(`${entry.id}/${locale}: la FAQ n'a pas autant de questions que le français`);
      }
    }
  }
}

function listPublished() {
  const found = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) walk(file);
      else if (item.name === 'index.html') found.push(file);
    }
  };
  for (const locale of FEATURE_LOCALES) walk(path.join(ROOT, decodeURI(FEATURE_HUB.routes[locale]).slice(1)));
  return found;
}

validate();
const footers = Object.fromEntries(FEATURE_LOCALES.map((locale) => [locale, extractFooter(fs.readFileSync(path.join(ROOT, locale, 'index.html'), 'utf8'), `${locale}/index.html`)]));
const drift = [];
const expected = new Set();
for (const entry of [FEATURE_HUB, ...FEATURE_PAGES]) {
  for (const locale of FEATURE_LOCALES) {
    const file = outputPath(entry.routes[locale]);
    expected.add(file);
    writeOrCheck(file, renderPage(entry, locale, footers[locale]), drift, CHECK);
  }
}
const stray = listPublished().filter((file) => !expected.has(file));
if (stray.length) {
  console.error('pages publiées absentes du manifeste :');
  stray.forEach((file) => console.error('  ' + path.relative(ROOT, file)));
  process.exit(1);
}
if (drift.length) {
  console.error('pages Fonctionnalités en retard sur leur source :');
  drift.forEach((file) => console.error('  ' + file));
  console.error('lancer : node tools/build-features.mjs');
  process.exit(1);
}
if (CHECK) console.log(`  ✓ ${expected.size} pages Fonctionnalités conformes à leur source`);
