#!/usr/bin/env node
/* Kiwi · accueil : destinations des boutons, données structurées, mots corrigés.
 *
 * Contrôle, dans les sept pages construites (HTML et Flight) :
 *  - « Obtenir mon Kiwi » (héros) et « Commencer mes 15 jours » ouvrent
 *    l'inscription Basic mensuelle, dans le même onglet ;
 *  - tous les autres boutons WhatsApp portent un message prérempli dans la
 *    langue de la page (démo, Kiwi IQ, devis Ultimate, question) ;
 *  - un bloc JSON-LD par page (Organization + SoftwareApplication) dont les
 *    prix sont ceux du tarif (landing-pricing.mjs et content/landing-pricing.json) ;
 *  - les chunks clients portent les mêmes liens et les sept langues du menu ;
 *  - les textes de content/landing-home.json sont dans la page de chaque langue. */
import fs from 'node:fs';
import { pricingCopy, prices, formatPrice } from './landing-pricing.mjs';
import { homeContent, LOCALES, SIGNUP_PATH, waLink, jsonLd } from './landing-home.mjs';

let checks = 0;
const failures = [];
const ok = (cond, msg) => { checks++; if (!cond) failures.push(msg); };
const read = f => fs.readFileSync(f, 'utf8');
const decode = s => s.replace(/&amp;/g, '&');
const flightOf = html => [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map(m => JSON.parse(m[1])).join('');
const pageFiles = { fr: 'fr/index.html', en: 'en/index.html', ar: 'ar/index.html', es: 'es/index.html', de: 'de/index.html', it: 'it/index.html', nl: 'nl/index.html' };

for (const locale of LOCALES) {
  const html = read(pageFiles[locale]);
  const copy = pricingCopy[locale];
  const anchors = [...html.matchAll(/<a href="([^"]*)"((?: target="_blank" rel="noreferrer")?) class="([^"]*)">/g)].map(m => ({ href: decode(m[1]), target: m[2], cls: m[3] }));
  const wa = anchors.filter(a => a.href.startsWith('https://wa.me/212624495159'));
  const start = anchors.filter(a => a.href === SIGNUP_PATH && /\bbg-black\b/.test(a.cls));
  ok(start.length === 2, `${locale}: the hero and final start buttons open the Basic monthly signup`);
  ok(start.every(a => a.target === ''), `${locale}: start buttons stay in the same tab`);
  ok(wa.length === 8, `${locale}: eight WhatsApp links (found ${wa.length})`);
  ok(wa.every(a => /\?text=./.test(a.href)), `${locale}: every WhatsApp link carries a prefilled message`);
  const messages = new Set(wa.map(a => decodeURIComponent(a.href.split('?text=')[1])));
  for (const key of ['demo', 'iq', 'write']) ok(messages.has(copy.demoMessages[key]), `${locale}: "${key}" message is on the page in the page language`);
  ok(messages.has(copy.ultimate.contactMessage) && messages.has(copy.tiers[3].contactMessage), `${locale}: Ultra and Ultimate keep their own message`);
  ok(wa.filter(a => decodeURIComponent(a.href.split('?text=')[1]) === copy.demoMessages.demo).length === 4, `${locale}: header, footer and two section buttons ask for a demo`);

  const flight = flightOf(html);
  ok((flight.match(/"href":"\/dashboard\.html\?plan=basic&period=monthly","className"/g) || []).length === 1, `${locale}: Flight final start button opens the signup`);
  ok(!/"href":"\$[0-9a-f]+","target":"_blank","rel":"noreferrer","className":"[^"]*(?:bg-black|kw-onscene)/.test(flight), `${locale}: no Flight start button still points at the bare WhatsApp reference`);
  ok(flight.includes(`"href":${JSON.stringify(waLink(locale, 'demo'))}}]`), `${locale}: Flight footer LearnMore carries the demo message`);

  // JSON-LD: one block, parses, prices equal the plan table and the card text.
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  ok(blocks.length === 1, `${locale}: exactly one JSON-LD block`);
  let data = null;
  try { data = JSON.parse(blocks[0][1]); } catch { ok(false, `${locale}: JSON-LD parses`); }
  if (data) {
    ok(JSON.stringify(data) === JSON.stringify(jsonLd(locale)), `${locale}: JSON-LD is the generated one`);
    const org = data['@graph'].find(n => n['@type'] === 'Organization'), app = data['@graph'].find(n => n['@type'] === 'SoftwareApplication');
    ok(org?.name === 'Kiwi' && org.contactPoint[0].email === 'contact@kiwi-os.com' && org.contactPoint[0].telephone === '+212 6 24 49 51 59' && org.areaServed === 'MA', `${locale}: Organization carries name, contact and area`);
    ok(app?.applicationCategory === 'BusinessApplication' && app.operatingSystem === 'Web, iOS, Android', `${locale}: SoftwareApplication category and systems`);
    ok(app.offers.length === 4 && app.offers.every(o => o.priceCurrency === 'MAD'), `${locale}: four offers in MAD`);
    copy.tiers.forEach((tier, i) => {
      const offer = app.offers[i];
      ok(offer.name === 'Kiwi ' + tier.name, `${locale}: offer ${i} is Kiwi ${tier.name}`);
      ok(Number(offer.price) === prices[i].monthly && offer.priceSpecification.price === prices[i].monthly, `${locale}: ${tier.name} offer price equals the plan table (${prices[i].monthly})`);
      const card = html.match(new RegExp(`data-plan="${tier.name.toLowerCase()}"[\\s\\S]*?kw-price-in[^>]*>([^<]*)`))?.[1] || '';
      ok(card.replace(/[\s., ]/g, '') === String(prices[i].monthly), `${locale}: ${tier.name} card shows the JSON-LD price ${formatPrice(prices[i].monthly, locale)}`);
    });
    ok(app.description === copy.metadataDescription, `${locale}: description is the localized meta description`);
  }
  ok(html.includes('/assets/landing-home.css'), `${locale}: landing-home.css is linked`);
  ok(read('assets/landing-home.css').includes('#features { scroll-margin-top'), 'the #features anchor lands on the heading');
}

// Words from content/landing-home.json reach every page of their language.
for (const locale of LOCALES) {
  const html = read(pageFiles[locale]);
  const nodes = new Set([...html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/g, '').matchAll(/>([^<>]+)</g)].map(m => decode(m[1]).trim()));
  for (const entry of homeContent.texts) {
    const value = entry.to[locale];
    if (value && !value.includes(' · ')) ok(nodes.has(value) || html.includes(value), `${locale}: "${value.slice(0, 40)}" is on the page`);
  }
  ok(!/>(?:Nouveau cette saison|New this season|جديد هذا الموسم)</.test(html), `${locale}: no dated "new this season" heading`);
}
for (const locale of ['es', 'de', 'it', 'nl']) ok(/\(EN\)/.test(read(pageFiles[locale]).match(/<nav[^>]*>[\s\S]*?<\/nav>/)?.[0] || ''), `${locale}: the Guides link says it opens English articles`);
const ar = read('ar/index.html');
for (const bad of ['منضدة', 'نظام الطرف الثالث', 'قسائم الاسترجاع', 'اكتشف ما يقدمه', 'ابدأ أيامي', 'يوماً']) ok(!ar.includes(bad), `ar: "${bad}" is gone`);
ok(ar.includes('من دون أن يتصل بك'), 'ar: the schedule app works "without calling you"');
ok(ar.includes('التغطية الصحية CNOPS/CNSS'), 'ar: pharmacy health cover reads CNOPS/CNSS');
for (const [locale, bad] of [['de', /Armaturenbrett|Tabellen|Kassenladen|Einhaltung|Ein Thread/], ['it', /cruscotto|le tabelle|atterrato|Iniziano i miei/], ['nl', /Eén draad|Naleving|Tabellen openen/]]) ok(!bad.test(read(pageFiles[locale])), `${locale}: wrong-meaning machine translations are gone`);
for (const locale of ['de', 'it', 'nl']) ok(!/>(?:Thermal printer|Payment terminal|Cash drawer|AT THE COUNTER|OFFLINE, WAITING|filed automatically)</.test(read(pageFiles[locale])), `${locale}: graphics and SVG titles are translated`);
ok(read(pageFiles.de).includes('>Impressum<') && read(pageFiles.de).includes('>Datenschutz<'), 'de: footer says Impressum and Datenschutz');

// Client chunks: hero start link, Ultra note, header language list and demo message.
const chunk = f => read('_next/static/chunks/' + fs.readdirSync('_next/static/chunks').find(n => n.startsWith(f) && n.endsWith('.js')));
const main = chunk('2c2tj5hx4r2-w-'), header = chunk('216g4fzfwrgwn-');
ok(main.includes(`href:"${SIGNUP_PATH}",className:"flex h-12 items-center justify-center gap-2.5 rounded-[999px] bg-black`), 'main chunk: hero start button opens the signup');
ok(main.includes('l.ultraNoAnnual'), 'main chunk: Ultra annual note');
ok(header.includes('kwL=["fr","en","es","ar","de","it","nl"]') && header.includes('(n?kwL:o)'), 'header chunk: the phone menu lists seven languages');
ok(header.includes('fr|en|ar|es|de|it|nl'), 'header chunk: language links drop every locale prefix');
for (const locale of LOCALES) ok(header.includes(JSON.stringify(pricingCopy[locale].demoMessages.demo).slice(1, -1)) || header.includes(encodeURIComponent(pricingCopy[locale].demoMessages.demo)) || header.includes(JSON.stringify({ [locale]: pricingCopy[locale].demoMessages.demo }).slice(1, -1)), `header chunk: demo message for ${locale}`);

if (failures.length) { console.error(`landing-home: ${failures.length} of ${checks} checks failed`); for (const f of failures) console.error('  ✗ ' + f); process.exit(1); }
console.log(`✓ landing home: ${checks} checks (CTA links, JSON-LD prices, copy, chunks) across 7 locales`);
