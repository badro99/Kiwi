#!/usr/bin/env node
// The marketing landing ships as a compiled Next.js export, in eight pages and
// three Flight payload sets. This suite reads every built copy and pins two
// things that were wrong on 2026-10-12 (design audit, L12 and L13):
//
// 1. No page may claim end-to-end encryption, in any shipped language. Kiwi
//    encrypts in transit and at rest; Kiwi IQ reads figures on the server,
//    which end-to-end encryption would rule out.
// 2. Four priced plans: Basic, Plus, Pro, Ultra, with Ultimate on quote below.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pricingCopy, prices, formatPrice } from './landing-pricing.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
let checks = 0;
const failures = [];
const ok = (condition, message) => { checks++; if (!condition) failures.push(message); };

// Every French source string has an explicit, reviewable classification. Locale
// paths must match, so a new translated bullet cannot escape the inventory.
const leaves = (value, prefix = '') => typeof value === 'string' ? [[prefix, value]] : Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? prefix + '.' + key : key));
const sourceClaims = leaves(pricingCopy.fr);
const mapPath = 'tools/landing-claims-map.json';
ok(fs.existsSync(path.join(ROOT, mapPath)), 'bounded landing claims inventory exists');
const inventory = fs.existsSync(path.join(ROOT, mapPath)) ? JSON.parse(read(mapPath)) : { claims: {} };
const gate = read('tools/check.js');
for (const [key, text] of sourceClaims) {
  const claim = inventory.claims[key];
  ok(claim?.fr === text, `${key}: exact French claim mapped`);
  if (!claim) continue;
  if (claim.kind === 'copy-only') ok(typeof claim.reason === 'string' && claim.reason.length > 20, `${key}: non-functional wording explained`);
  else {
    ok(claim.kind === 'contract' && claim.contracts?.length > 0, `${key}: operational claim has contracts`);
    for (const contract of claim.contracts || []) {
      const exists = /^tools\/[\w.-]+test[\w.-]*\.(?:mjs|js)$/.test(contract.file) && fs.existsSync(path.join(ROOT, contract.file));
      ok(exists, `${key}: contract file exists`);
      ok(gate.includes("'" + path.basename(contract.file) + "'") || gate.includes("'" + contract.file + "'"), `${key}: contract named in gate`);
      ok(exists && typeof contract.assertion === 'string' && contract.assertion.length > 15 && read(contract.file).includes(contract.assertion), `${key}: exact assertion anchor exists`);
    }
  }
}
ok(Object.keys(inventory.claims).length === sourceClaims.length, 'no stale inventory entries');
for (const [locale, copy] of Object.entries(pricingCopy)) ok(JSON.stringify(leaves(copy).map(([key]) => key).sort()) === JSON.stringify(sourceClaims.map(([key]) => key).sort()), `${locale}: every localized claim has a French inventory path`);

const pages = { 'index.html': 'fr', 'fr/index.html': 'fr', 'en/index.html': 'en', 'ar/index.html': 'ar', 'de/index.html': 'de', 'it/index.html': 'it', 'nl/index.html': 'nl', 'es/index.html': 'es' };
const flightFiles = ['fr', 'en', 'ar'].flatMap(locale => {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir + '/' + entry.name;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.txt')) out.push(rel);
    }
  };
  walk(locale);
  return out;
});
const chunkRefs = new Set(Object.keys(pages).flatMap(page => [...read(page).matchAll(/\/(?:_next\/static\/chunks|es\/chunks)\/[\w.-]+\.js/g)].map(m => m[0].slice(1))));
for (const chunk of chunkRefs) ok(fs.existsSync(path.join(ROOT, chunk)), `${chunk} is referenced by a landing page and exists`);
const shipped = [
  ...Object.keys(pages),
  ...flightFiles,
  ...[...chunkRefs].filter(chunk => fs.existsSync(path.join(ROOT, chunk))),
  'assets/landing-runtime-translations.js',
  'content/landing-es.json',
];

// 1. No end-to-end encryption claim, in FR, EN, AR, ES, DE, IT or NL.
const e2e = [
  /end[\s -]*to[\s -]*end/i,          // EN, and the loanword in DE, IT and NL
  /\bE2EE?\b/,
  /de\s+bout\s+en\s+bout/i,                     // FR
  /extremo\s+a\s+extremo/i,                     // ES
  /ende[\s-]*zu[\s-]*ende/i,                    // DE
  /eind[\s-]*tot[\s-]*eind/i,                   // NL
  /da\s+un\s+capo\s+all.altro/i,                // IT
  /تشفير\s+شامل|تشفير\s+تام|من\s+(?:ال)?طرف\s+(?:إلى|الى)\s+(?:ال)?طرف/, // AR
];
for (const file of shipped) {
  const text = read(file);
  for (const pattern of e2e) {
    const hit = text.match(pattern);
    ok(!hit, `${file} claims end-to-end encryption: "${hit && text.slice(Math.max(0, hit.index - 40), hit.index + 60)}"`);
  }
}
// The accurate statement, already used by the card below the subtitle.
const accurate = { fr: 'Chiffrement en transit et au repos, aucune revente', en: 'Encryption in transit and at rest, no data resale', ar: 'تشفير أثناء النقل والتخزين، وعدم بيع البيانات', es: 'Cifrado en tránsito y en reposo, sin reventa' };
for (const [page, locale] of Object.entries(pages)) if (accurate[locale]) ok(read(page).includes('>' + accurate[locale]), `${page} subtitle says encrypted in transit and at rest`);
const runtime = read('assets/landing-runtime-translations.js');
for (const phrase of ['Verschlüsselung während der Übertragung und im Ruhezustand', 'Crittografia in transito e a riposo', 'Versleuteling tijdens transport en in rust']) ok(runtime.includes(phrase), `runtime translations say "${phrase}"`);

// 2. Four priced plans and the preserved Ultimate contact offer.
const tierNames = ['Basic', 'Plus', 'Pro', 'Ultra'];
const flightProps = text => text.split('\n').filter(line => line.includes('"tiers":')).map(line => JSON.parse(line.slice(line.indexOf(':') + 1))[3].t);
for (const file of flightFiles) {
  for (const props of flightProps(read(file))) {
    ok(JSON.stringify(props.tiers.map(t => t.name)) === JSON.stringify(tierNames), `${file} Flight plan order`);
    ok(JSON.stringify(props.tiers.map(t => t.features.length)) === '[7,8,13,6]', `${file} approved feature counts`);
    ok(props.ultimate?.name === 'Ultimate' && props.ultimate.features.length === 3, `${file} retains Ultimate separately`);
  }
}
for (const [page, locale] of Object.entries(pages)) {
  const html = read(page);
  const inline = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map(m => JSON.parse(m[1])).join('');
  const props = flightProps(inline);
  ok(props.length === 1, `${page} inline Flight has one pricing record`);
  ok(JSON.stringify(props[0]) === JSON.stringify(pricingCopy[locale]), `${page} inline pricing matches localized source`);
}
for (const file of [...Object.keys(pages), ...flightFiles]) ok(!/"name\\?":\\?"(?:Custom|Sur mesure|حسب الطلب|A medida)\\?"/.test(read(file)), `${file} has no "Custom" tier left`);

const pricingChunks = [...chunkRefs].filter(chunk => chunk.includes('2c2tj5hx4r2-w'));
ok(pricingChunks.length === 2, 'one shared pricing chunk and one Spanish copy: ' + pricingChunks);
for (const chunk of pricingChunks) {
  const code = read(chunk);
  const rows = code.match(/let x=(\[.*?\]);/)?.[1];
  ok(JSON.stringify(JSON.parse(rows || 'null')) === JSON.stringify(prices), `${chunk} explicit monthly, annual equivalent and annual total rows`);
  ok(code.includes('annual=m&&!price?.fixed'), `${chunk} gives Ultra no annual price`);
  ok(code.includes('l.billedYearly.replace("{total}",f(price.total))'), `${chunk} uses exact annual payments, preserving Pro 4,200`);
  ok(code.includes('tier.name==="Plus"?"?text=plus":""'), `${chunk} Plus uses the existing contact flow with its plan identifier`);
  const name = path.basename(chunk, '.js');
  const sha = crypto.createHash('sha256').update(code).digest('hex');
  const hashed = chunk.startsWith('es/') ? name.split('-').pop() === sha.slice(0, 16) : name.split('-').pop() === sha.slice(0, 8);
  ok(hashed, `${chunk} name matches its content hash`);
}
ok(JSON.stringify(prices.map(p => p.monthly)) === '[150,300,399,1499]', 'approved monthly prices');
ok(JSON.stringify(prices.slice(0,3).map(p => p.annual)) === '[99,249,349]', 'approved monthly equivalents');
ok(JSON.stringify(prices.slice(0,3).map(p => p.total)) === '[1188,2988,4200]', 'exact annual payments, Pro unchanged');
ok(prices[3].fixed && !prices[3].annual, 'Ultra remains monthly only');
for (const [page, locale] of Object.entries(pages)) {
  const html = read(page);
  const start = html.indexOf('<section id="pricing"');
  const section = html.slice(start, html.indexOf('</section>', start));
  const cards = section.split(/<div class="[^"]*kw-plan-card"[^>]*>/).slice(1);
  ok(cards.length === 4, `${page} renders exactly four priced cards`);
  const names = cards.map(card => card.match(/<h3[^>]*>([^<]*)<\/h3>/)?.[1]);
  ok(JSON.stringify(names) === JSON.stringify(tierNames), `${page} card names are ${tierNames.join(', ')}`);
  const price = card => card.match(/kw-price-in[^>]*>([^<]*)/)?.[1];
  for (let index = 0; index < 4; index++) {
    ok(price(cards[index]) === formatPrice(prices[index].monthly, locale), `${page} ${tierNames[index]} monthly price`);
    const bullets = [...cards[index].split('kw-contact-strip')[0].matchAll(/<li[^>]*>[\s\S]*?<span[^>]*>([^<]*)<\/span><\/li>/g)].map(m => m[1].replace(/&amp;/g, '&').replace(/&#x27;/g, "'"));
    // Ultra's card segment ends before the strip's opening div.
    ok(JSON.stringify(bullets) === JSON.stringify(pricingCopy[locale].tiers[index].features), `${page} ${tierNames[index]} complete localized bullet list`);
    if (index < 2) ok(!/OrderPro|employee|employé|Mitarbeiter|emplead|dipendent|Medewerker|الموظف/i.test(bullets.join(' ')), `${page} ${tierNames[index]} excludes restaurant and employee features`);
  }
  ok(section.includes('kw-contact-strip') && section.indexOf('kw-contact-strip') > section.lastIndexOf('kw-plan-card'), `${page} Ultimate is a separate full-width strip after the grid`);
  ok(!section.includes('OrderPro Boutique') && !section.includes('—'), `${page} no forbidden product or em dash`);
  ok(!/1[,.  ]?449/.test(section), `${page} no discounted Ultra price`);
}

// 3. The runtime translation table (DE, IT, NL, ES) keeps names and codes.
// Its DE/IT/NL part is machine translated from a snapshot, which once turned
// MAD into "mad", the dish name "Thé" into an article and Pro into "Profi".
const dictionaries = JSON.parse(runtime.match(/const dictionaries = (\{.*?\});\n/s)[1]);
const articles = new Set(['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'il', 'lo', 'la', 'le', 'gli', 'i', 'un', 'una', 'uno', 'de', 'het', 'een', 'el', 'los', 'las', 'the', 'a', 'an', 'er', 'sie', 'es', 'esso', 'lui', 'lei', 'hij', 'zij', 'ze', 'het', 'ik', 'du', 'tu', 'io', 'wir', 'noi', 'wij']);
const productNames = ['Basic', 'Plus', 'Pro', 'Ultra', 'Ultimate', 'Kiwi', 'Loyalty+', 'OrderPro Restaurant', 'Kiwi IQ'];
const damaged = ['VERRÜCKT', 'PAZZ', 'Beschädigen', 'Kunnen', 'Kiwi bis', 'Kiwi fino', 'Kiwi tot', 'una fino', 'één tot', 'Aktie', 'Erfolgreich', 'Anwalt', 'Avvocato', 'Advocaat', 'Kekse', 'Biscotti', 'Koekjes', 'Profi', 'Di base', 'Vivere', 'leef', 'Tabelle 4', 'Tabella 4', 'Tabel 4'];
for (const locale of ['de', 'it', 'nl', 'es']) {
  const dictionary = dictionaries[locale] || {};
  ok(Object.keys(dictionary).length > 100, `${locale} runtime dictionary is present`);
  for (const [key, value] of Object.entries(dictionary)) {
    if (/\bMAD\b/.test(key)) ok(/\bMAD\b/.test(value), `${locale}: "${key}" keeps the currency code MAD: "${value}"`);
    if (productNames.includes(key)) ok(value === key, `${locale}: product name "${key}" is not translated: "${value}"`);
    if (!/\s/.test(key) && key.length > 1) ok(!articles.has(value.toLowerCase()), `${locale}: "${key}" is not translated as an article or pronoun: "${value}"`);
    for (const word of damaged) ok(!value.includes(word), `${locale}: "${key}" no longer reads "${value}"`);
  }
  ok(!('Thé' in dictionary) || /^(?:Tee|Tè|Thee|Té)$/.test(dictionary['Thé']), `${locale}: "Thé" stays the dish name: ${dictionary['Thé']}`);
}
// The annual total line is rendered from a template, so it is matched by pattern.
const templateSource = runtime.match(/const templates = \((\{.*?\})\[lang\]/s);
ok(templateSource, 'runtime translations match templated lines');
const templates = templateSource ? JSON.parse(templateSource[1]) : {};
const annual = { de: '15 Tage kostenlos, danach 1.800 MAD, einmal jährlich abgerechnet.', it: "15 giorni gratuiti, poi 1.800 MAD, fatturati una volta all'anno.", nl: '15 dagen gratis, daarna 1.800 MAD, eenmaal per jaar gefactureerd.' };
for (const [locale, expected] of Object.entries(annual)) {
  const rendered = (templates[locale] || []).map(([pattern, value, group]) => { const m = '15 days free, then 1,800 MAD, billed once a year.'.match(new RegExp(pattern)); return m && value.replace('{total}', m[1].replace(/,/g, group)); }).find(Boolean);
  ok(rendered === expected, `${locale}: the annual total line is translated: ${rendered}`);
}

for (const locale of ['de', 'it', 'nl', 'es']) {
  const expected = pricingCopy[locale].billedYearly.replace('{total}', formatPrice(1188, locale));
  const source = pricingCopy.en.billedYearly.replace('{total}', '1,188');
  const rendered = templates[locale].map(([pattern, value, group]) => { const m = source.match(new RegExp(pattern)); return m && value.replace('{total}', m[1].replace(/,/g, group)); }).find(Boolean);
  ok(rendered === expected, `${locale}: new annual payment template is translated`);
}
console.log(`Landing claims: ${checks - failures.length}/${checks} checks passed.`);
if (failures.length) { console.error('\nFailures:\n  - ' + failures.join('\n  - ')); process.exit(1); }
