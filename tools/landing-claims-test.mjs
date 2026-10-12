#!/usr/bin/env node
// The marketing landing ships as a compiled Next.js export, in eight pages and
// three Flight payload sets. This suite reads every built copy and pins two
// things that were wrong on 2026-10-12 (design audit, L12 and L13):
//
// 1. No page may claim end-to-end encryption, in any shipped language. Kiwi
//    encrypts in transit and at rest; Kiwi IQ reads figures on the server,
//    which end-to-end encryption would rule out.
// 2. Pricing shows the owner's four tiers (CLAUDE.md §7): Basic 199 MAD, or
//    149 annually; Pro 399, or 349; Ultra 1 499 with no annual plan; Ultimate
//    on quote.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
let checks = 0;
const failures = [];
const ok = (condition, message) => { checks++; if (!condition) failures.push(message); };

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

// 2. Four tiers, in the Flight props of every FR, EN and AR payload.
const tierNames = ['Basic', 'Pro', 'Ultra', 'Ultimate'];
const flightTiers = text => [...text.matchAll(/"tiers":(\[.*?\])\}\}\]/g)].map(m => JSON.parse(m[1]));
for (const file of flightFiles) {
  for (const tiers of flightTiers(read(file))) {
    ok(JSON.stringify(tiers.map(t => t.name)) === JSON.stringify(tierNames), `${file} Flight tiers are ${tierNames.join(', ')}: ${tiers.map(t => t.name)}`);
    ok(tiers[2]?.features.length === 4 && tiers[3]?.features.length === 3, `${file} Ultra and Ultimate carry their own features`);
  }
}
for (const page of Object.keys(pages)) {
  const html = read(page);
  const inline = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map(m => JSON.parse(m[1])).join('');
  const tiers = flightTiers(inline);
  ok(tiers.length === 1, `${page} inline Flight has one pricing record`);
  ok(JSON.stringify(tiers[0]?.map(t => t.name)) === JSON.stringify(tierNames), `${page} inline Flight tiers are ${tierNames.join(', ')}`);
}
for (const file of [...Object.keys(pages), ...flightFiles]) ok(!/"name\\?":\\?"(?:Custom|Sur mesure|حسب الطلب|A medida)\\?"/.test(read(file)), `${file} has no "Custom" tier left`);

// The pricing chunk: four price rows, Ultra excluded from the annual discount,
// and a content-addressed name, since /_next/static is served immutable.
const pricingChunks = [...chunkRefs].filter(chunk => chunk.includes('2c2tj5hx4r2-w'));
ok(pricingChunks.length === 2, 'one pricing chunk for every locale, one Spanish copy: ' + pricingChunks);
for (const chunk of pricingChunks) {
  const code = read(chunk);
  ok(code.includes('let x=[{monthly:199},{monthly:399,glow:!0},{monthly:1499,fixed:!0},{monthly:null,wide:!0}];'), `${chunk} prices Basic 199, Pro 399, Ultra 1 499, Ultimate on quote`);
  ok(code.includes('g=m&&!p.fixed,h=null===p.monthly?null:p.monthly-50*!!g'), `${chunk} gives Ultra no annual price`);
  ok(code.includes('g?l.billedYearly.replace("{total}"'), `${chunk} bills Ultra monthly in the annual view`);
  const name = path.basename(chunk, '.js');
  const sha = crypto.createHash('sha256').update(code).digest('hex');
  const hashed = chunk.startsWith('es/') ? name.split('-').pop() === sha.slice(0, 16) : name.split('-').pop() === sha.slice(0, 8);
  ok(hashed, `${chunk} name matches its content hash`);
}

// Server-rendered pricing in every built page: four cards, Ultimate below the
// three priced tiers, the right figures, and no discounted Ultra.
const ultraPrice = { fr: '1 499', en: '1,499', ar: '1,499', de: '1,499', it: '1,499', nl: '1,499', es: '1 499' };
for (const [page, locale] of Object.entries(pages)) {
  const html = read(page);
  const start = html.indexOf('<section id="pricing"');
  const section = html.slice(start, html.indexOf('</section>', start));
  const cards = section.split('<div class="flex w-full overflow-hidden rounded-xl bg-[rgba(0,0,0,0.3)] backdrop-blur-[10px]"').slice(1);
  ok(cards.length === 4, `${page} renders four pricing cards (${cards.length})`);
  const names = cards.map(card => card.match(/<h3[^>]*>([^<]*)<\/h3>/)?.[1]);
  ok(JSON.stringify(names) === JSON.stringify(tierNames), `${page} card names are ${tierNames.join(', ')}: ${names}`);
  const price = card => card.match(/kw-price-in[^>]*>([^<]*)/)?.[1];
  ok(price(cards[0]) === '199' && price(cards[1]) === '399', `${page} shows Basic 199 and Pro 399`);
  ok(price(cards[2]) === ultraPrice[locale], `${page} shows Ultra at ${ultraPrice[locale]} MAD: ${price(cards[2])}`);
  ok(/kw-price-in[^>]*><span class="text-4xl/.test(cards[3] || ''), `${page} shows Ultimate on quote`);
  ok((cards[3] || '').startsWith(' style="grid-column:1 / -1">'), `${page} sets Ultimate as a full-width card below the three priced tiers`);
  ok(!/1[,.  ]?449/.test(section), `${page} shows no discounted Ultra price`);
}

console.log(`Landing claims: ${checks - failures.length}/${checks} checks passed.`);
if (failures.length) { console.error('\nFailures:\n  - ' + failures.join('\n  - ')); process.exit(1); }
