import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const sourcePath = 'en/index.html';
const localePaths = ['de/index.html', 'it/index.html', 'nl/index.html'];
const source = fs.readFileSync(sourcePath, 'utf8');

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
  // The first localization commit contains the complete reviewed copy. Read
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
    .replace('</body>', '<script src="/assets/landing-runtime-translations.js" defer></script></body>');
  fs.writeFileSync(localePath, output);
}

const runtime = `(() => {
  const dictionaries = ${JSON.stringify(dictionaries)};
  const locale = document.documentElement.lang.split('-')[0];
  const dictionary = dictionaries[locale];
  if (!dictionary) return;
  let translating = false;
  const translate = () => {
    if (translating) return;
    translating = true;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('script, style')) continue;
      const value = node.nodeValue;
      const trimmed = value.trim();
      if (dictionary[trimmed]) node.nodeValue = value.replace(trimmed, dictionary[trimmed]);
    }
    const title = document.title.trim();
    if (dictionary[title]) document.title = dictionary[title];
    translating = false;
  };
  const start = () => {
    translate();
    new MutationObserver(translate).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
`;
fs.writeFileSync('assets/landing-runtime-translations.js', runtime);
