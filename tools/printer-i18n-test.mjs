import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Optional HTML path proves the same suite fails on the untouched HEAD.
const html = fs.readFileSync(process.argv[2] || 'printer.html', 'utf8');
const head = html.match(/<script id="printer-i18n">([\s\S]*?)<\/script>/)?.[1];
assert.ok(head, 'Printer FR/EN/AR dictionary and pre-paint bootstrap must exist');
assert.ok(html.indexOf(head) < html.indexOf('<style>'), 'Language is applied before styles and body');
function boot(query = '', stored = {}, browser = '', blocked = false) {
  const document = { documentElement: {} };
  const context = vm.createContext({ document, location: { search: query }, URLSearchParams,
    navigator: { language: browser }, localStorage: { getItem(key) {
      if (blocked) throw new Error('Storage unavailable');
      return stored[key];
    } },
  });
  vm.runInContext(head.replace('return { text: text };', 'return { text: text, copy: COPY };'), context);
  return { context, document, api: context.PrinterI18n };
}
const copy = boot().api.copy;
const plain = (value) => value.replace(/<[^>]+>/g, '').replace(/\{\w+\}/g, '').trim();
for (const lang of ['fr', 'en', 'ar']) {
  assert.deepEqual(Object.keys(copy[lang]).sort(), Object.keys(copy.fr).sort());
  for (const [key, value] of Object.entries(copy[lang])) {
    assert.ok(value.trim(), `${lang}: empty ${key}`);
    assert.ok(!/[\u2014\u0660-\u0669\u06f0-\u06f9]/u.test(value), `${lang}: copy rules ${key}`);
    assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(),
      (copy.fr[key].match(/\{\w+\}/g) || []).sort(), `${lang}: placeholders ${key}`);
    if (lang === 'fr') continue;
    assert.notEqual(value, copy.fr[key], `${lang}: untranslated ${key}`);
    for (const french of Object.values(copy.fr)) {
      // Distinctive phrases, excluding product names, code, and shared OS names.
      const phrases = plain(french).split(/[.?!:·…]| → /).map(s => s.trim())
        .filter(s => s.split(/\s+/).length >= 4);
      for (const phrase of phrases) assert.ok(!plain(value).includes(phrase), `${lang}: French phrase in ${key}: ${phrase}`);
    }
    assert.ok(!/Télécharger|ordinateur|imprimante|Réglages|Lancement|Démarrage|Revérifier|ci-dessous/i.test(plain(value)), `${lang}: French leftover ${key}`);
  }
}
for (const [query, storage, browser, expected, blocked] of [
  ['?lang=ar', { kiwiCaisseLang: 'en', kiwiLang: 'fr' }, 'en', 'ar'],
  ['?lang=en-GB', { kiwiCaisseLang: 'ar' }, 'fr', 'en'],
  ['?lang=invalid', { kiwiCaisseLang: 'ar-MA', kiwiLang: 'en' }, 'fr', 'ar'],
  ['', { kiwiCaisseLang: 'invalid', kiwiLang: 'en' }, 'ar', 'en'],
  ['', {}, 'ar-MA', 'ar'], ['', {}, 'en-US', 'en'], ['', {}, 'de', 'fr'],
  ['', { kiwiLang: 'ar' }, 'en', 'en', true],
  ['?lang=ar', {}, 'en', 'ar', true],
]) {
  const { document, api } = boot(query, storage, browser, blocked);
  assert.equal(document.documentElement.lang, expected);
  assert.equal(document.documentElement.dir, expected === 'ar' ? 'rtl' : 'ltr');
  assert.equal(document.title, copy[expected].title);
  assert.equal(api.text('download', { os: 'Linux' }), copy[expected].download.replace('{os}', 'Linux'));
}
// Exercise actual body translation, downloads, live status and retry in every language.
const bodyScript = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>'));
const blocks = [...html.matchAll(/<([\w]+)\b[^>]*data-printer-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)];
assert.ok(blocks.length >= 37, 'All instruction blocks and platform heading are translated');
for (const lang of ['fr', 'en', 'ar']) {
  const { context, document, api } = boot('?lang=' + lang);
  const nodes = new Map();
  function node() { return { innerHTML: '', textContent: '', classList: { add() {}, toggle() {} },
    setAttribute() {}, appendChild(child) { this.child = child; },
    addEventListener(type, callback) { this[type] = callback; } }; }
  const get = (id) => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  const elements = blocks.map(([, , key, content]) => ({ innerHTML: content, getAttribute: () => key }));
  Object.assign(document, { body: node(), getElementById: get, createElement: node,
    querySelector: s => get(s.slice(1)), querySelectorAll: s => s === '[data-printer-i18n]' ? elements : [] });
  Object.assign(context, { setTimeout: () => 0, clearTimeout() {}, setInterval() {},
    AbortController: class { signal = {}; abort() {} }, fetch: () => Promise.resolve({ ok: false }) });
  vm.runInContext(bodyScript.replace('function check(){', 'globalThis.testRender = render; function check(){'), context);
  for (let i = 0; i < elements.length; i++) {
    assert.ok(!/\{\d+\}/.test(elements[i].innerHTML), 'All protected fragments restored');
    const original = blocks[i][3].match(/<code\b[^>]*>[\s\S]*?<\/code>/g) || [];
    for (const code of original) assert.ok(elements[i].innerHTML.includes(code), 'Commands stay byte exact');
  }
  assert.equal(get('dl-primary').textContent, api.text('download', { os: 'Windows' }));
  context.testRender({ version: '1.4.0' });
  assert.equal(get('status-t').textContent, api.text('connected', { version: '1.4.0' }));
  context.testRender(null);
  assert.equal(get('status-t').textContent.trim(), api.text('idle'));
  assert.equal(get('status-t').child.textContent, api.text('recheck'));
  get('status-t').child.click();
  assert.equal(get('status-t').textContent, api.text('checking'));
  context.navigator.userAgent = 'Android';
  vm.runInContext(bodyScript, context);
  assert.equal(get('dl-primary').textContent, api.text('android'));
  assert.equal(get('dl-primary').href, '/downloads/kiwi-print-bridge.apk');
}
assert.ok(html.includes('padding-inline-start:20px') && html.includes('margin-inline-start:2px'));
assert.ok(html.includes('direction:ltr;unicode-bidi:isolate'), 'Code remains LTR in Arabic');
assert.ok(!/\b(?:aria-label|title|placeholder)="[^"]*[éèàê]/.test(html), 'No hard-coded French attributes');
console.log('✓ Printer FR/EN/AR keys, copy, precedence, blocked storage, pre-paint lang/dir, instructions, code, status and retry');
