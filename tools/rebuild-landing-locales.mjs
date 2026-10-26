import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { applyPricing, pricingCopy, pricingFlight } from './landing-pricing.mjs';

// Keep the hydrated CTA in sync with the generated HTML and selected period.
const oldPricingChunk = fs.readdirSync('_next/static/chunks').find(name => /^2c2tj5hx4r2-w-[0-9a-f]{8}\.js$/.test(name));
let pricingChunk = '_next/static/chunks/' + oldPricingChunk;
fs.writeFileSync(pricingChunk, fs.readFileSync(pricingChunk, 'utf8').replace(
  'href:r.DEMO_HREF+(tier.name==="Plus"?"?text=plus":"")',
  'href:tier.signupPlan?"/dashboard.html?plan="+tier.signupPlan+"&period="+(annual?"annual":"monthly"):r.DEMO_HREF'
));

const pricingCode = fs.readFileSync(pricingChunk);
const pricingName = '2c2tj5hx4r2-w-' + createHash('sha256').update(pricingCode).digest('hex').slice(0, 8) + '.js';
if (pricingName !== oldPricingChunk) {
  fs.renameSync(pricingChunk, '_next/static/chunks/' + pricingName);
  pricingChunk = '_next/static/chunks/' + pricingName;
  for (const locale of ['en', 'fr', 'ar']) {
    for (const name of fs.readdirSync(locale).filter(name => /\.(html|txt)$/.test(name))) {
      const file = locale + '/' + name;
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll(oldPricingChunk, pricingName));
    }
  }
}

for (const locale of ['en', 'fr', 'ar']) {
  const page = `${locale}/index.html`;
  fs.writeFileSync(page, applyPricing(fs.readFileSync(page, 'utf8'), locale));
  for (const name of fs.readdirSync(locale).filter(name => name.endsWith('.txt'))) {
    const path = `${locale}/${name}`;
    fs.writeFileSync(path, pricingFlight(fs.readFileSync(path, 'utf8'), locale));
  }
}
fs.writeFileSync('index.html', fs.readFileSync('fr/index.html'));

const stampManifest = JSON.parse(fs.readFileSync('tools/asset-stamps.json', 'utf8'));
const assetUrl = file => '/' + file + (stampManifest[file] ? '?v=' + stampManifest[file].v : '');
const sourcePath = 'en/index.html';
const localePaths = ['de/index.html', 'it/index.html', 'nl/index.html'];
const source = fs.readFileSync(sourcePath, 'utf8');
const ogLocales = { fr: 'fr_MA', en: 'en_US', ar: 'ar_MA', de: 'de_DE', it: 'it_IT', nl: 'nl_NL', es: 'es_ES' };
const ogHead = (html, locale) => html.replace(/<meta property="og:locale:alternate" content="[^"]*"\/>/g, '').replace('</head>', Object.entries(ogLocales).filter(([code]) => code !== locale).map(([, value]) => `<meta property="og:locale:alternate" content="${value}"/>`).join('') + '</head>');

function visibleText(html) {
  const withoutRuntime = html
    .replace(/<section id="pricing"[\s\S]*?<\/section>/, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '');
  return [...withoutRuntime.matchAll(/>([^<>]+)</g)]
    .map(match => match[1].trim())
    .filter(Boolean);
}

const sourceText = visibleText(source);
const dictionaries = {};

// The snapshot claimed end-to-end encryption. Kiwi encrypts in transit and at
// rest, and Kiwi IQ reads figures on the server, which end-to-end would rule
// out (2026-10-12). The snapshot is read with the accurate sentence.
const encryptionClaim = {
  de: ['End-to-End-Verschlüsselung, kein Weiterverkauf', 'Verschlüsselung während der Übertragung und im Ruhezustand, kein Weiterverkauf'],
  it: ['Crittografia end-to-end, nessuna rivendita', 'Crittografia in transito e a riposo, nessuna rivendita'],
  nl: ['End-to-end-codering, geen doorverkoop', 'Versleuteling tijdens transport en in rust, geen doorverkoop'],
};
// Product names (Kiwi Basic, Pro, Ultra, Ultimate), the currency code and the
// French dish names of the QR menu demo stay as written; "Thé à la menthe" is
// the French sample beside its translations, so it stays French everywhere.
// Keys holding {total} are templates: the runtime matches the rendered number.
const keep = { 'Basic': null, 'Plus': null, 'Pro': null, 'Ultra': null, 'Ultimate': null, 'Thé': null, 'menthe': null };
const corrections = {
  de: { ...keep,
    '68 MAD': '68 MAD',
    'Mar': 'Mär', 'Feb': 'Feb',
    'Cash': 'Bargeld', 'Takeaway': 'Zum Mitnehmen', 'Dining room': 'Gastraum',
    'Goals by service': 'Ziele nach Service',
    'Eighteen trades': 'Achtzehn Branchen', 'Your trade already has its screen.': 'Ihre Branche hat bereits ihren Bildschirm.',
    'Kiwi till': 'Kiwi Kasse', 'Table 4 · 2 covers': 'Tisch 4 · 2 Gedecke',
    'Stock': 'Lager', 'Stock that tells the truth': 'Ein Lager, das die Wahrheit sagt',
    'Your numbers stay yours.': 'Ihre Zahlen bleiben Ihre.',
    'Sucre': 'Zucker', 'Café': 'Kaffee', 'Poulet': 'Hähnchen', 'Riz': 'Reis', 'Avocat': 'Avocado',
    'Proof': 'Belege', 'Cookies': 'Cookies',
    '15 days free, then {total} MAD, billed once a year.': '15 Tage kostenlos, danach {total} MAD, einmal jährlich abgerechnet.',
  },
  it: { ...keep,
    '26,958 MAD': '26.958 MAD', '68 MAD': '68 MAD', '12,324 MAD': '12.324 MAD', '18 MAD': '18 MAD', 'MAD this month': 'MAD questo mese',
    '398,000 MAD Cards': '398.000 MAD Carte',
    'Jan': 'Gen', 'Feb': 'Feb', 'Mar': 'Mar', 'Apr': 'Apr', 'May': 'Mag', 'Jun': 'Giu', 'Jul': 'Lug', 'Aug': 'Ago', 'Sep': 'Set', 'Oct': 'Ott', 'Nov': 'Nov', 'Dec': 'Dic',
    'Revenue': 'Ricavi', 'Dining room': 'Sala', 'Goals by service': 'Obiettivi per servizio',
    'Eighteen trades, one till': 'Diciotto mestieri, una sola cassa', 'Your trade already has its screen.': 'Il tuo mestiere ha già il suo schermo.',
    'Kiwi till': 'Cassa Kiwi', 'Table 4 · 2 covers': 'Tavolo 4 · 2 coperti', 'Tables, slots, confirmations': 'Tavoli, fasce orarie, conferme',
    'Stock': 'Magazzino', 'Stock that tells the truth': 'Un magazzino che dice la verità',
    'Live': 'Dal vivo', 'Clock-in': 'Timbratura',
    'Sucre': 'Zucchero', 'Café': 'Caffè', 'Poulet': 'Pollo', 'Riz': 'Riso', 'Avocat': 'Avocado',
    'Cookies': 'Cookie',
    '15 days free, then {total} MAD, billed once a year.': "15 giorni gratuiti, poi {total} MAD, fatturati una volta all'anno.",
  },
  nl: { ...keep,
    'Jan': 'jan', 'Feb': 'feb', 'Mar': 'mrt', 'Apr': 'apr', 'May': 'mei', 'Jun': 'jun', 'Jul': 'jul', 'Aug': 'aug', 'Sep': 'sep', 'Oct': 'okt', 'Nov': 'nov', 'Dec': 'dec',
    'Home': 'Start', 'Revenue': 'Omzet', 'On premises': 'Ter plaatse', 'Dining room': 'Zaal', 'Goals by service': 'Doelen per service',
    'Eighteen trades': 'Achttien branches', 'Eighteen trades, one till': 'Achttien branches, één kassa', 'Your trade already has its screen.': 'Uw branche heeft al een eigen scherm.',
    'Kiwi till': 'Kiwi-kassa', 'Table 4 · 2 covers': 'Tafel 4 · 2 couverts',
    'Stock that tells the truth': 'Voorraad die de waarheid vertelt',
    'Your numbers stay yours.': 'Uw cijfers blijven van u.',
    'The till, live': 'De kassa, live',
    'Sucre': 'Suiker', 'Café': 'Koffie', 'Poulet': 'Kip', 'Riz': 'Rijst', 'Avocat': 'Avocado',
    'Cookies': 'Cookies',
    '15 days free, then {total} MAD, billed once a year.': '15 dagen gratis, daarna {total} MAD, eenmaal per jaar gefactureerd.',
  },
};
for (const localePath of localePaths) {
  const locale = localePath.split('/')[0];
  // The first localization commit contains the original locale copy. Read
  // that immutable snapshot so repeated rebuilds never translate translations.
  // The old snapshot's entry price is normalized before aligning hero copy;
  // pricing itself comes entirely from content/landing-pricing.json.
  let translated = execFileSync('git', ['show', `bf309397:${localePath}`], { encoding: 'utf8' })
    .replace(/\b249((?:<!-- --> <!-- -->|\s*)(?:MAD|درهم))/g, '150$1');
  const [claimWas, claimIs] = encryptionClaim[locale];
  if (!translated.includes(claimWas)) throw new Error(`${localePath}: encryption claim not found in snapshot`);
  translated = translated.replace(claimWas, claimIs).replace(/\b199(?=\s*MAD)/g, '150');
  const translatedText = visibleText(translated);
  if (translatedText.length !== sourceText.length) {
    throw new Error(`${localePath}: expected ${sourceText.length} text nodes, found ${translatedText.length}`);
  }

  const replacements = new Map();
  sourceText.forEach((english, index) => {
    const localized = translatedText[index];
    if (english !== localized && !replacements.has(english)) replacements.set(english, localized);
  });
  // The snapshot is machine translated and took several words in the wrong
  // sense (2026-10-12): the currency MAD as "mad", the French dish name "Thé"
  // as an article, the tier names as adjectives, "till" as a preposition,
  // "stock" as a share, "Mar" and "May" as a verb. Corrections win over the
  // alignment; null keeps the source text as it is written.
  for (const [english, localized] of Object.entries(corrections[locale])) {
    if (!english.includes('{total}') && !(english in keep) && !sourceText.includes(english)) throw new Error(`${localePath}: correction for missing text "${english}"`);
    if (localized === null) replacements.delete(english);
    else replacements.set(english, localized);
  }
  dictionaries[locale] = Object.fromEntries(replacements);

  const output = source
    .replace('<html lang="en" dir="ltr">', `<html lang="${locale}" dir="ltr">`)
    // React re-renders <html> from the Flight payload after a hydration
    // mismatch; an English lang there undid the static one (23 Oct 2026).
    .replace('\\"html\\",null,{\\"lang\\":\\"en\\"', `\\"html\\",null,{\\"lang\\":\\"${locale}\\"`)
    .split('https://kiwi-os.com/en/').join(`https://kiwi-os.com/${locale}/`)
    .replace(`hrefLang="en" href="https://kiwi-os.com/${locale}/"`, 'hrefLang="en" href="https://kiwi-os.com/en/"')
    .replace(`\\"hrefLang\\":\\"en\\",\\"href\\":\\"https://kiwi-os.com/${locale}/\\"`, `\\"hrefLang\\":\\"en\\",\\"href\\":\\"https://kiwi-os.com/en/\\"`)
    .replace('</body>', `<script src="${assetUrl('assets/landing-runtime-translations.js')}" defer></script></body>`);
  fs.writeFileSync(localePath, applyPricing(ogHead(output, locale), locale));
}

// Spanish copy is agent-edited; native-speaker review is pending.
const esDictionary = JSON.parse(fs.readFileSync('content/landing-es.json', 'utf8'));
dictionaries.es = esDictionary;
function pricingStrings(source, translated, dictionary) {
  if (typeof source === 'string') { dictionary[source] = translated; return; }
  if (source && typeof source === 'object') for (const key of Object.keys(source)) pricingStrings(source[key], translated[key], dictionary);
}
for (const locale of Object.keys(dictionaries)) pricingStrings(pricingCopy.en, pricingCopy[locale], dictionaries[locale]);
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, '\u00a0').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const lookup = value => esDictionary[decode(value).replace(/\u00a0/g, ' ').trim()];
const escape = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Clone only the landing's client components. Translate their exact string
// literals too: static HTML alone disagrees with React on its first render.
// Content-addressed URLs keep these locale-specific exports cache-safe.
const clientPaths = ['/_next/static/chunks/216g4fzfwrgwn.js', '/' + pricingChunk];
const scriptPaths = new Map();
fs.mkdirSync('es/chunks', { recursive: true });
for (const clientPath of clientPaths) {
  const original = fs.readFileSync(clientPath.slice(1), 'utf8');
  let localized = original.replace(/"(?:[^"\\]|\\.)*"/g, literal => {
    let value;
    try { value = JSON.parse(literal); } catch { return literal; }
    const translated = lookup(value);
    return translated ? JSON.stringify(value.replace(value.trim(), translated)) : literal;
  });
  if (clientPath.includes('2c2tj5hx4r2-w')) localized = localized.replace(/\{k:"([PGL])",v:(\d+),cls:/g, (_, key, amount) => `{k:${JSON.stringify(esDictionary['nutrition.' + key])},v:${amount},cls:`);
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(localized).digest('hex').slice(0,16);
  const outputPath = `/es/chunks/${clientPath.split('/').pop().replace('.js', '')}-${hash}.js`;
  scriptPaths.set(clientPath, outputPath);
  fs.writeFileSync(outputPath.slice(1), localized);
}

for (const name of fs.readdirSync('es/chunks')) {
  if (/^(?:216g4fzfwrgwn|2c2tj5hx4r2-w(?:-[0-9a-f]{8})?)-[0-9a-f]{16}\.js$/.test(name) && ![...scriptPaths.values()].includes('/es/chunks/' + name)) fs.unlinkSync('es/chunks/' + name);
}

// Translate text, descriptive attributes and metadata, including French source
// strings. Entity-decoded keys are shared by HTML, Flight and runtime DOM nodes.
let esOutput = source.replace(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)|>([^<>]+)</gi, (match, runtime, text) => {
  if (runtime) return runtime;
  const trimmed = text.trim();
  const translated = lookup(trimmed);
  return translated ? '>' + text.replace(trimmed, escape(translated)) + '<' : match;
});
esOutput = esOutput.replace(/\b(aria-label|alt|placeholder|title|content)="([^"]*)"/g, (match, attr, value) => {
  const translated = lookup(value);
  return translated ? `${attr}="${escape(translated)}"` : match;
});
esOutput = esOutput.replace(/(<span class="kw-nut-lbl\b[^>]*>[\s\S]*?<\/span>)([PGL])(?=<!--)/g, (_, prefix, key) => prefix + esDictionary['nutrition.' + key]);
esOutput = esOutput.replace('<html lang="en" dir="ltr">', '<html lang="es" dir="ltr">');

// Flight is a JSON string containing line-delimited React records. Decode both
// layers rather than substituting fragments of escaped source text.
function translateRecord(value) {
  if (typeof value === 'string') { const translated = lookup(value); return translated ? value.replace(value.trim(), translated) : value; }
  if (Array.isArray(value)) return value.map(translateRecord);
  if (value?.className?.includes('kw-nut-lbl') && Array.isArray(value.children)) value = { ...value, children: value.children.map(child => typeof child === 'string' && esDictionary['nutrition.' + child] ? esDictionary['nutrition.' + child] : child) };
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'lang' && child === 'en' ? 'es' : translateRecord(child)]));
  return value;
}
const flightPattern = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
const flight = [...esOutput.matchAll(flightPattern)].map(match => JSON.parse(match[1])).join('');
// Flight also has length-prefixed T records with no trailing newline. Consume
// their UTF-8 byte length before parsing the next JSON record.
const flightBytes = Buffer.from(flight);
let cursor = 0;
let translatedFlight = '';
while (cursor < flightBytes.length) {
  const remaining = flightBytes.subarray(cursor).toString();
  const textRecord = remaining.match(/^([0-9a-f]+):T([0-9a-f]+),/);
  if (textRecord) {
    const headerLength = Buffer.byteLength(textRecord[0]);
    const length = parseInt(textRecord[2], 16);
    const text = flightBytes.subarray(cursor + headerLength, cursor + headerLength + length).toString();
    const localized = lookup(text) || text;
    translatedFlight += `${textRecord[1]}:T${Buffer.byteLength(localized).toString(16)},${localized}`;
    cursor += headerLength + length;
    continue;
  }
  const newline = flightBytes.indexOf(10, cursor);
  const end = newline < 0 ? flightBytes.length : newline;
  const line = flightBytes.subarray(cursor, end).toString();
  const record = line.match(/^([0-9a-f]+:)(.*)$/);
  try { translatedFlight += record ? record[1] + JSON.stringify(translateRecord(JSON.parse(record[2]))) : line; }
  catch { translatedFlight += line; }
  if (newline >= 0) translatedFlight += '\n';
  cursor = end + (newline < 0 ? 0 : 1);
}
let wroteFlight = false;
esOutput = esOutput.replace(flightPattern, () => {
  if (wroteFlight) return '';
  wroteFlight = true;
  return `self.__next_f.push([1,${JSON.stringify(translatedFlight)}])`;
});
// Replace self-referential metadata only; EN guides remain an intentional fallback.
esOutput = esOutput.replace(/https:\/\/kiwi-os\.com\/en\/(?!(?:guides\/))/g, 'https://kiwi-os.com/es/');
esOutput = esOutput.replace('hrefLang="en" href="https://kiwi-os.com/es/"', 'hrefLang="en" href="https://kiwi-os.com/en/"');
esOutput = esOutput.replaceAll('\\"hrefLang\\":\\"en\\",\\"href\\":\\"https://kiwi-os.com/es/\\"', '\\"hrefLang\\":\\"en\\",\\"href\\":\\"https://kiwi-os.com/en/\\"');
esOutput = esOutput.replaceAll('en_US', 'es_ES');
const { createHash: hashOG } = await import('node:crypto');
const spanishOGHash = hashOG('sha256').update(fs.readFileSync('es/opengraph-image')).digest('hex').slice(0,16);
esOutput = esOutput.replace(/(https:\/\/kiwi-os\.com\/es\/opengraph-image)\?[^"\\]+/g, '$1?' + spanishOGHash);
for (const [original, localized] of scriptPaths) esOutput = esOutput.replaceAll(original, localized);
esOutput = esOutput.replace('</body>', `<script src="${assetUrl('assets/landing-runtime-translations.js')}" defer></script></body>`);
esOutput = esOutput.replace('</head>', `<link rel="stylesheet" href="${assetUrl('assets/landing-es.css')}"/></head>`);
fs.writeFileSync('es/index.html', applyPricing(ogHead(esOutput, 'es'), 'es'));

// Text rendered from a template ("15 days free, then 1,800 MAD, billed once a
// year.") never equals a dictionary key; match it by pattern and regroup the
// number the locale's way.
const grouping = { de: '.', it: '.', nl: '.', es: ' ' };
const escapeRegExp = part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templatesFor = (locale, dictionary) => Object.entries(dictionary)
  .filter(([key]) => key.includes('{total}'))
  .map(([key, value]) => ['^' + key.split('{total}').map(escapeRegExp).join('([0-9][0-9,]*)') + '$', value, grouping[locale] || ',']);
const templates = Object.fromEntries(Object.entries(dictionaries).map(([locale, dictionary]) => [locale, templatesFor(locale, dictionary)]));
const runtime = `(() => {
  const dictionaries = ${JSON.stringify(dictionaries)};
  const lang = document.documentElement.lang.split('-')[0];
  const dictionary = dictionaries[lang];
  if (!dictionary) return;
  const templates = (${JSON.stringify(templates)}[lang] || []).map(([pattern, value, group]) => [new RegExp(pattern), value, group]);
  const fromTemplate = text => {
    for (const [pattern, value, group] of templates) {
      const match = text.match(pattern);
      if (match) return value.replace('{total}', match[1].replace(/,/g, group));
    }
  };
  let observer;
  const observerOptions = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'alt', 'placeholder', 'title'] };
  const translate = () => {
    observer?.disconnect();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('script, style')) continue;
      const text = node.nodeValue.trim();
      const key = text.replace(/\\u00a0/g, ' ');
      const translation = dictionary[key] || fromTemplate(key);
      if (translation && translation !== text) node.nodeValue = node.nodeValue.replace(text, translation);
    }
    const title = document.title.trim();
    if (dictionary[title] && dictionary[title] !== title) document.title = dictionary[title];
    for (const el of document.querySelectorAll('[aria-label], [alt], [placeholder], [title]')) {
      for (const attr of ['aria-label', 'alt', 'placeholder', 'title']) {
        const value = el.getAttribute(attr);
        if (dictionary[value] && dictionary[value] !== value) el.setAttribute(attr, dictionary[value]);
      }
    }
    observer?.observe(document.body, observerOptions);
  };
  const start = () => {
    observer = new MutationObserver(translate);
    translate();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
`;
fs.writeFileSync('assets/landing-runtime-translations.js', runtime);
console.log('Rebuild complete for de, it, nl, es.');
