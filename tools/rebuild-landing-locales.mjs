import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const stampManifest = JSON.parse(fs.readFileSync('tools/asset-stamps.json', 'utf8'));
const assetUrl = file => '/' + file + (stampManifest[file] ? '?v=' + stampManifest[file].v : '');
const sourcePath = 'en/index.html';
const localePaths = ['de/index.html', 'it/index.html', 'nl/index.html'];
const source = fs.readFileSync(sourcePath, 'utf8');
const ogLocales = { fr: 'fr_MA', en: 'en_US', ar: 'ar_MA', de: 'de_DE', it: 'it_IT', nl: 'nl_NL', es: 'es_ES' };
const ogHead = (html, locale) => html.replace(/<meta property="og:locale:alternate" content="[^"]*"\/>/g, '').replace('</head>', Object.entries(ogLocales).filter(([code]) => code !== locale).map(([, value]) => `<meta property="og:locale:alternate" content="${value}"/>`).join('') + '</head>');

function visibleText(html) {
  const withoutRuntime = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '');
  return [...withoutRuntime.matchAll(/>([^<>]+)</g)]
    .map(match => match[1].trim())
    .filter(Boolean);
}

const sourceText = visibleText(source);
const dictionaries = {};

for (const localePath of localePaths) {
  const locale = localePath.split('/')[0];
  // The first localization commit contains the original locale copy. Read
  // that immutable snapshot so repeated rebuilds never translate translations.
  const translated = execFileSync('git', ['show', `bf309397:${localePath}`], { encoding: 'utf8' });
  const translatedText = visibleText(translated);
  if (translatedText.length !== sourceText.length) {
    throw new Error(`${localePath}: expected ${sourceText.length} text nodes, found ${translatedText.length}`);
  }

  const replacements = new Map();
  sourceText.forEach((english, index) => {
    const localized = translatedText[index];
    if (english !== localized && !replacements.has(english)) replacements.set(english, localized);
  });
  dictionaries[locale] = Object.fromEntries(replacements);

  const output = source
    .replace('<html lang="en" dir="ltr">', `<html lang="${locale}" dir="ltr">`)
    .split('https://kiwi-os.com/en/').join(`https://kiwi-os.com/${locale}/`)
    .replace(`hrefLang="en" href="https://kiwi-os.com/${locale}/"`, 'hrefLang="en" href="https://kiwi-os.com/en/"')
    .replace(`\\"hrefLang\\":\\"en\\",\\"href\\":\\"https://kiwi-os.com/${locale}/\\"`, `\\"hrefLang\\":\\"en\\",\\"href\\":\\"https://kiwi-os.com/en/\\"`)
    .replace('</body>', `<script src="${assetUrl('assets/landing-runtime-translations.js')}" defer></script></body>`);
  fs.writeFileSync(localePath, ogHead(output, locale));
}

// Spanish copy is agent-edited; native-speaker review is pending.
const esDictionary = JSON.parse(fs.readFileSync('content/landing-es.json', 'utf8'));
dictionaries.es = esDictionary;
const decode = value => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, '\u00a0').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const lookup = value => esDictionary[decode(value).replace(/\u00a0/g, ' ').trim()];
const escape = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Clone only the landing's client components. Translate their exact string
// literals too: static HTML alone disagrees with React on its first render.
// Content-addressed URLs keep these locale-specific exports cache-safe.
const clientPaths = ['/_next/static/chunks/216g4fzfwrgwn.js', '/_next/static/chunks/2c2tj5hx4r2-w.js'];
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
  if (clientPath.includes('2c2tj5hx4r2-w')) localized = localized.replace('\"group\"===t.type?\"fr\"===e?\" \":\",\":t.value', '\"group\"===t.type?\" \":t.value');
  if (clientPath.includes('2c2tj5hx4r2-w')) localized = localized.replace(/\{k:"([PGL])",v:(\d+),cls:/g, (_, key, amount) => `{k:${JSON.stringify(esDictionary['nutrition.' + key])},v:${amount},cls:`);
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(localized).digest('hex').slice(0,16);
  const outputPath = `/es/chunks/${clientPath.split('/').pop().replace('.js', '')}-${hash}.js`;
  scriptPaths.set(clientPath, outputPath);
  fs.writeFileSync(outputPath.slice(1), localized);
}

for (const name of fs.readdirSync('es/chunks')) {
  if (/^(?:216g4fzfwrgwn|2c2tj5hx4r2-w)-[0-9a-f]{16}\.js$/.test(name) && ![...scriptPaths.values()].includes('/es/chunks/' + name)) fs.unlinkSync('es/chunks/' + name);
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
fs.writeFileSync('es/index.html', ogHead(esOutput, 'es'));

const runtime = `(() => {
  const dictionaries = ${JSON.stringify(dictionaries)};
  const dictionary = dictionaries[document.documentElement.lang.split('-')[0]];
  if (!dictionary) return;
  let observer;
  const observerOptions = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'alt', 'placeholder', 'title'] };
  const translate = () => {
    observer?.disconnect();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('script, style')) continue;
      const text = node.nodeValue.trim();
      const translation = dictionary[text.replace(/\\u00a0/g, ' ')];
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
