// Polish pass for the compiled home pages (7 locales). Every step is a pure
// string transform that applies, recognises its own output, or throws (the
// tools/landing-rewrite.mjs contract), so tools/rebuild-landing-locales.mjs can
// run it again over its own output and a changed Next export stops the build.
//
// Copy lives in content/landing-home.json (texts, Arabic fixes) and
// content/landing-pricing.json (WhatsApp messages, the Ultra annual note), so
// the same words reach the static HTML, the Flight payload and the client chunks.
import fs from 'node:fs';
import { rewrite } from './landing-rewrite.mjs';
import { pricingCopy, prices } from './landing-pricing.mjs';

export const homeContent = JSON.parse(fs.readFileSync('content/landing-home.json', 'utf8'));
export const LOCALES = ['fr', 'en', 'ar', 'es', 'de', 'it', 'nl'];
export const SIGNUP_PATH = '/dashboard.html?plan=basic&period=monthly';
export const WA = 'https://wa.me/212624495159';
export const waLink = (locale, key) => WA + '?text=' + encodeURIComponent(pricingCopy[locale].demoMessages[key]);
const htmlEsc = value => value.replace(/&/g, '&amp;');
const SIGNUP_HTML = htmlEsc(SIGNUP_PATH);
const flightPush = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

// Run fn over the decoded Flight payload of a built page and write it back as
// one push, the way landing-pricing.mjs does.
export function mapFlight(html, fn) {
  const flight = [...html.matchAll(flightPush)].map(match => JSON.parse(match[1])).join('');
  if (!flight) throw new Error('landing-home: no Flight payload in the page');
  const next = fn(flight);
  let wrote = false;
  return html.replace(flightPush, () => {
    if (wrote) return '';
    wrote = true;
    return `self.__next_f.push([1,${JSON.stringify(next)}])`;
  });
}

// --- 1. CTA destinations ---------------------------------------------------
// "Start" buttons (the black ones) open the Basic signup, monthly; every other
// WhatsApp link carries a prefilled message in the page language.
function role(cls, state) {
  if (/\bw-fit\b/.test(cls)) return null; // pricing cards: handled by the pricing chunk and landing-pricing.mjs
  if (/\bbg-black\b/.test(cls)) return 'start';
  if (/\bkw-onscene\b/.test(cls)) return 'write';
  if (/\bshrink-0\b/.test(cls)) return 'demo'; // header and footer buttons
  return ['demo', 'iq', 'demo'][state.section++] || null;
}
const hrefFor = (locale, r, html) => {
  if (r === 'start') return html ? SIGNUP_HTML : SIGNUP_PATH;
  const url = waLink(locale, r);
  return html ? htmlEsc(url) : url;
};

export function ctaHtml(html, locale) {
  const state = { section: 0 };
  const counts = {};
  const out = html.replace(/<a href="(https:\/\/wa\.me\/212624495159[^"]*|\/dashboard\.html\?plan=basic&amp;period=monthly)"((?: target="_blank" rel="noreferrer")?) class="([^"]*)">/g, (whole, href, targets, cls) => {
    const r = role(cls, state);
    if (!r) return whole;
    counts[r] = (counts[r] || 0) + 1;
    const open = r === 'start' ? '' : ' target="_blank" rel="noreferrer"';
    return `<a href="${hrefFor(locale, r, true)}"${open} class="${cls}">`;
  });
  const want = { start: 2, write: 1, demo: 4, iq: 1 };
  for (const [r, n] of Object.entries(want)) if (counts[r] !== n) throw new Error(`landing-home: ${locale}: expected ${n} "${r}" CTA anchors, found ${counts[r] || 0}`);
  return out;
}

export function ctaFlight(flight, locale, strict = true) {
  const state = { section: 0 };
  const counts = {};
  let out = flight.replace(/\{"href":"(?:(\$[0-9a-f]+|https:\/\/wa\.me\/212624495159[^"]*)","target":"_blank","rel":"noreferrer"|(\/dashboard\.html\?plan=basic&period=monthly)"),"className":"([^"]*)"/g, (whole, wa, signup, cls) => {
    const r = role(cls, state);
    if (!r) return whole;
    counts[r] = (counts[r] || 0) + 1;
    const open = r === 'start' ? '' : ',"target":"_blank","rel":"noreferrer"';
    return `{"href":${JSON.stringify(hrefFor(locale, r, false))}${open},"className":${JSON.stringify(cls)}`;
  });
  if (!strict && !Object.keys(counts).length) return flight;
  // The footer button is the client LearnMore component, whose only prop is its label.
  let footer = 0;
  out = out.replace(/(\["\$","\$L[0-9a-f]+",null,\{"label":"[^"]*")(?:,"href":"[^"]*")?\}\]/g, (whole, head) => { footer++; return `${head},"href":${JSON.stringify(waLink(locale, 'demo'))}}]`; });
  if (footer !== 1) throw new Error(`landing-home: ${locale}: expected one footer LearnMore element in Flight, found ${footer}`);
  for (const [r, n] of Object.entries({ start: 1, write: 1, demo: 2, iq: 1 })) if ((counts[r] || 0) !== n) throw new Error(`landing-home: ${locale}: expected ${n} "${r}" CTA records in Flight, found ${counts[r] || 0}`);
  return out;
}

// --- 2. Copy fixes for the compiled fr / en / ar pages ----------------------
const esc = { html: s => s.replace(/&/g, '&amp;') };
const textFor = (locale, entry) => (locale === 'en' ? entry.en : entry.from?.[locale]);

export function textsFlight(flight, locale) {
  for (const entry of homeContent.texts) {
    const from = textFor(locale, entry), to = entry.to[locale];
    if (!from || !to || from === to || from.startsWith('~')) continue;
    flight = flight.split(JSON.stringify(from)).join(JSON.stringify(to));
  }
  return flight;
}
export function textsHtml(html, locale) {
  for (const entry of homeContent.texts) {
    const from = textFor(locale, entry), to = entry.to[locale];
    if (!from || !to || from === to || from.startsWith('~')) continue;
    html = html.split('>' + esc.html(from) + '<').join('>' + esc.html(to) + '<');
  }
  return html;
}
export function arabicFixes(text, isPage) {
  for (const [from, to] of homeContent.arFixes) {
    if (text.includes(from)) text = text.split(from).join(to);
    else if (isPage && !text.includes(to)) throw new Error(`landing-home: Arabic fix not found: ${from}`);
  }
  // Footer says "الدليل" where the nav says "الأدلة".
  return text.replace(/>الدليل</g, '>الأدلة<').replace(/(\\?")الدليل(\\?")/g, '$1الأدلة$2');
}

// --- 3. JSON-LD -------------------------------------------------------------
const NAMES = ['Basic', 'Plus', 'Pro', 'Ultra'];
export function jsonLd(locale) {
  const copy = pricingCopy[locale];
  const origin = 'https://kiwi-os.com';
  const url = `${origin}/${locale}/`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: 'Kiwi',
        url: `${origin}/`,
        logo: `${origin}/apple-icon.png`,
        contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', telephone: '+212 6 24 49 51 59', email: 'contact@kiwi-os.com', areaServed: 'MA', availableLanguage: ['fr', 'ar', 'en'] }],
        areaServed: 'MA',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${url}#software`,
        name: 'Kiwi',
        url,
        inLanguage: locale,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, iOS, Android',
        description: copy.metadataDescription,
        publisher: { '@id': `${origin}/#organization` },
        offers: NAMES.map((name, index) => ({
          '@type': 'Offer',
          name: `Kiwi ${name}`,
          price: String(prices[index].monthly),
          priceCurrency: 'MAD',
          priceSpecification: { '@type': 'UnitPriceSpecification', price: prices[index].monthly, priceCurrency: 'MAD', billingDuration: 'P1M', unitCode: 'MON' },
        })),
      },
    ],
  };
}
export function applyJsonLd(html, locale) {
  const block = `<script type="application/ld+json">${JSON.stringify(jsonLd(locale)).replace(/</g, '\\u003c')}</script>`;
  if (html.includes('<script type="application/ld+json">')) return html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, () => block);
  return rewrite(html, '</head>', block + '</head>', 'head end (json-ld)');
}

// --- 4. Header language group (German, Italian, Dutch, Spanish) -------------
// Those pages were exported from the English one, so the header said EN.
export function headerLocale(html, locale) {
  if (['fr', 'en', 'ar'].includes(locale)) return html;
  html = html.replace('<a hrefLang="en" aria-current="true" data-on="true"', '<a hrefLang="en" data-on="false"');
  html = html.replace(/(<a hrefLang="en" data-on="false" class="[^"]*?)text-white( |")/, '$1text-white/55 hover:text-white/85$2');
  return mapFlight(html, flight => flight.replaceAll('"locale":"en"', `"locale":"${locale}"`));
}

// --- 5. Client chunks -------------------------------------------------------
export function patchMainChunk(code) {
  // Hero "start" button: the Basic signup, same tab, like the pricing cards.
  code = rewrite(code,
    'href:I.DEMO_HREF,target:"_blank",rel:"noreferrer",className:"flex h-12 items-center justify-center gap-2.5 rounded-[999px] bg-black',
    'href:"' + SIGNUP_PATH + '",className:"flex h-12 items-center justify-center gap-2.5 rounded-[999px] bg-black',
    'hero start CTA');
  // Ultra has no annual plan: say so when "Annuel" is selected.
  code = rewrite(code,
    'ultimate?l.quoteDetail:annual?l.billedYearly.replace("{total}",f(price.total)):l.billedMonthly',
    'ultimate?l.quoteDetail:annual?l.billedYearly.replace("{total}",f(price.total)):m&&price?.fixed?l.billedMonthly+" "+l.ultraNoAnnual:l.billedMonthly',
    'Ultra annual note');
  // The grid shares the other sections' px-10 container.
  code = rewrite(code,
    'id:"pricing",className:"flex flex-col items-center gap-14 ps-10 max-md:px-5"',
    'id:"pricing",className:"flex flex-col items-center gap-14 px-10 max-md:px-5"',
    'pricing container');
  return code;
}

export function patchHeaderChunk(code) {
  const messages = Object.fromEntries(LOCALES.map(locale => [locale, pricingCopy[locale].demoMessages.demo]));
  const labels = { fr: 'FR', en: 'EN', es: 'ES', ar: 'AR', de: 'DE', it: 'IT', nl: 'NL' };
  // LearnMore takes its destination from the page language.
  code = rewrite(code,
    'q="https://wa.me/212624495159";function f({label:e,block:r=!1}){return(0,t.jsxs)("a",{href:q,',
    `q="https://wa.me/212624495159",kwM=${JSON.stringify(messages)},kwW=e=>q+"?text="+encodeURIComponent(kwM[e]||kwM.fr);function f({label:e,block:r=!1,href:kwH}){return(0,t.jsxs)("a",{href:kwH||q,`,
    'LearnMore href');
  code = rewrite(code, '(0,t.jsx)(f,{label:l.demo,block:!0})', '(0,t.jsx)(f,{label:l.demo,block:!0,href:kwW(e)})', 'mobile demo href');
  code = rewrite(code, '(0,t.jsx)(f,{label:l.demo})', '(0,t.jsx)(f,{label:l.demo,href:kwW(e)})', 'header demo href');
  // The phone menu lists all seven languages (the desktop dropdown is mounted by assets/landing-locale-menu.js).
  code = rewrite(code, 's={fr:"FR",en:"EN",ar:"AR"};', `s=${JSON.stringify(labels)},kwL=["fr","en","es","ar","de","it","nl"];`, 'language labels');
  code = rewrite(code, 'o.map(r=>{let a=r===e;', '(n?kwL:o).map(r=>{let a=r===e;', 'language list');
  code = rewrite(code, 'h.replace(/^\\/(?:fr|en|ar)(?=\\/|$)/,"")', 'h.replace(/^\\/(?:fr|en|ar|es|de|it|nl)(?=\\/|$)/,"")', 'language path');
  code = rewrite(code, 'T=`/${e}/guides/`', 'T=`/${["fr","en","ar"].includes(e)?e:"en"}/guides/`', 'guides path');
  return code;
}
