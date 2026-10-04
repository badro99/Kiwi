// Actual OrderPro NFC renderer localization. VM proof only; no real network/UI/hardware actions.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(process.env.KIWI_PANEL_SOURCE || path.join(ROOT, 'assets/orderpro-panel.js'), 'utf8');
let passed = 0, failed = 0;
function check(value, label) { if (value) passed++; else { failed++; console.error(`✗ ${label}`); } }
const EXPECT = {
  fr: { heading: 'Ce que voient vos clients', publish: 'Publier maintenant', checking: 'Vérification…', copy: 'Copier le lien', write: 'Écrire le tag', more: 'Afficher plus de tables', counter: 'Tag comptoir · à emporter', boutique: 'Tag boutique', table: 'Table 1', intro: 'Un seul lien par tag.', fallback: 'Pour écrire un tag', direct: 'Ce téléphone peut écrire les tags directement.', lock: 'Verrouillez le tag après écriture', offline: 'État inconnu (hors ligne ?)', empty: 'Rien de publié · vos clients voient une page vide.', drawer: 'Order Pro · tags NFC', subtitle: 'Commande depuis le téléphone du client', item: 'article', items: 'articles', product: 'produit', products: 'produits', online: 'en ligne' },
  en: { heading: 'What your customers see', publish: 'Publish now', checking: 'Checking…', copy: 'Copy link', write: 'Write tag', more: 'Show more tables', counter: 'Counter tag · takeaway', boutique: 'Shop tag', table: 'Table 1', intro: 'One link per tag.', fallback: 'To write a tag', direct: 'This phone can write tags directly.', lock: 'Lock the tag after writing', offline: 'Status unknown (offline?)', empty: 'Nothing published · your customers see an empty page.', drawer: 'Order Pro · NFC tags', subtitle: 'Ordering from the customer’s phone', item: 'item', items: 'items', product: 'product', products: 'products', online: 'online' },
  ar: { heading: 'ما يراه عملاؤك', publish: 'انشر الآن', checking: 'جارٍ التحقق…', copy: 'نسخ الرابط', write: 'كتابة الوسم', more: 'عرض المزيد من الطاولات', counter: 'وسم المنضدة · طلبات خارجية', boutique: 'وسم المتجر', table: 'الطاولة 1', intro: 'رابط واحد لكل وسم.', fallback: 'لكتابة وسم', direct: 'يمكن لهذا الهاتف كتابة الوسوم مباشرة.', lock: 'اقفل الوسم بعد الكتابة', offline: 'الحالة غير معروفة (غير متصل؟)', empty: 'لم يُنشر شيء · يرى عملاؤك صفحة فارغة.', drawer: 'Order Pro · وسوم NFC', subtitle: 'الطلب من هاتف العميل', item: 'عنصر', items: 'عنصر', product: 'منتج', products: 'منتج', online: 'منشور' },
};
const frenchOnly = ['Ce que voient vos clients', 'Publier maintenant', 'Un seul lien par tag.', 'Pour écrire un tag', 'Verrouillez le tag après écriture', 'Copier le lien', 'Afficher plus de tables'];
const merchantName = 'Café & <original> $& {count}';
const slug = 'fixture-café-&-original';
const sourceData = { cats: [{ id: 'c', name: 'Plats signature' }], items: [{ id: 'p', name: 'Poulet citron', desc: 'Recette originale', price: 79 }], stations: [{ id: 's', name: 'Station chef' }] };
const sourceSnapshot = JSON.stringify(sourceData);
function world(locale, vertical, supported, localeSource = 'dashboard') {
  const state = { locale, calls: [], writes: 0, nfcWrites: 0, clipboardWrites: 0, drawer: null, response: null, offline: false };
  const makeNode = () => ({ innerHTML: '', textContent: '', listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
  const pub = makeNode(), message = makeNode();
  const el = makeNode();
  el.querySelector = selector => selector === '[data-opp-pub-state]' ? pub : selector === '[data-opp-msg]' ? message : null;
  const document = { readyState: 'complete', documentElement: { get lang() { return state.locale; } }, getElementById: () => null, createElement: () => makeNode(), head: { appendChild() {} }, addEventListener() {} };
  const window = {
    KiwiI18n: localeSource === 'dashboard' ? { getLang: () => state.locale } : null,
    KiwiMenuI18n: localeSource === 'menu' ? { lang: () => state.locale, t() { throw new Error('merchant data translation forbidden'); } } : null,
    KiwiConfig: { features: { orderpro: true } },
    KiwiOrderPro: { merchant: () => slug, type: () => vertical, publishNow() { state.writes++; return Promise.resolve({ ok: true }); } },
    KiwiMenuStore: { data: () => sourceData },
    KiwiVenue: { getCurrentVenueData: () => ({ id: 'fixture-venue', name: merchantName, type: vertical }) },
    Kiwi: { handlers: {}, drawer(spec) { state.drawer = spec; el.innerHTML = spec.body; return { el }; } },
  };
  if (supported) window.NDEFReader = class { constructor() { state.nfcWrites++; } write() { state.nfcWrites++; throw new Error('no NFC action allowed'); } };
  const context = vm.createContext({ window, document, location: { origin: 'https://fixture.invalid' }, navigator: { clipboard: { writeText() { state.clipboardWrites++; throw new Error('no clipboard action allowed'); } } }, localStorage: { getItem: key => key === 'kiwiLang' && localeSource === 'storage' ? state.locale : null }, fetch(url, init) { state.calls.push({ url, method: init?.method || 'GET' }); if (init?.method && init.method !== 'GET') { state.writes++; throw new Error('no API mutations allowed'); } if (state.offline) return Promise.reject(new Error('offline fixture')); return Promise.resolve({ ok: true, json: () => Promise.resolve(state.response) }); }, setTimeout() { throw new Error('no publication action/timer allowed'); }, Promise, console });
  window.window = window;
  // Browser classic scripts resolve window-owned modules as globals too.
  Object.assign(context, window);
  vm.runInContext(source, context, { filename: 'actual-orderpro-panel.js' });
  return { state, el, pub, message, api: window.KiwiOrderProPanel };
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
for (const locale of ['fr', 'en', 'ar']) for (const vertical of ['restaurant', 'boutique']) for (const supported of [false, true]) {
  const label = `${locale}/${vertical}/NDEF-${supported}`, expected = EXPECT[locale], w = world(locale, vertical, supported);
  w.state.response = { name: merchantName, [vertical === 'boutique' ? 'shop' : 'menu']: { [vertical === 'boutique' ? 'products' : 'items']: Array(12).fill({ id: 'fixture' }) } };
  check(w.api.mount(w.el) === true, `${label}: public mount succeeds`);
  const html = w.el.innerHTML;
  for (const key of ['heading', 'publish', 'checking', 'copy', 'intro', 'lock']) check(html.includes(expected[key]), `${label}: translated ${key}`);
  check(html.includes(expected[supported ? 'direct' : 'fallback']), `${label}: honest supported/unsupported instructions`);
  check(html.includes('NTAG213') === supported && html.includes('<b>NFC Tools</b>') === !supported, `${label}: capability-dependent brand/hardware instructions preserved`);
  check(html.includes('data-opp-write=') === supported, `${label}: actual NFC action remains capability gated`);
  if (supported) check(html.includes(expected.write), `${label}: write action translated without invoking it`);
  check(html.includes(expected[vertical === 'boutique' ? 'boutique' : 'counter']), `${label}: generated tag row label translated`);
  if (vertical === 'restaurant') { check(html.includes(expected.table) && html.includes(expected.more), `${label}: generated table label and more action translated`); check((html.match(/data-opp-copy=/g) || []).length === 13, `${label}: counter + original twelve tables retained`); }
  else check((html.match(/data-opp-copy=/g) || []).length === 1 && !html.includes('data-opp-more'), `${label}: boutique has only its existing browse link`);
  const links = w.api.links(), base = `https://fixture.invalid/order?s=${encodeURIComponent(slug)}`;
  check(links.base === base && links.takeout === `${base}&m=takeout` && links.table(7) === `${base}&t=7`, `${label}: exact original merchant-scoped URLs`);
  check(html.includes(`https://fixture.invalid/order?s=${encodeURIComponent(slug)}`), `${label}: links use original merchant slug not translations`);
  if (vertical === 'restaurant') check(html.includes(`${base}&amp;t=12`) && html.includes(`${base}&amp;m=takeout`) && !html.includes(`${base}&t=12`), `${label}: scoped query separators HTML-escaped without changing identifiers`);
  if (locale !== 'fr') check(frenchOnly.every(text => !html.includes(text)), `${label}: no known French-only NFC interface copy`);
  await settle();
  check(w.pub.textContent === `12 ${expected[vertical === 'boutique' ? 'products' : 'items']} ${expected.online} · ${merchantName}`, `${label}: exact actual GET published count status translated`);
  check(w.pub.textContent.endsWith(merchantName), `${label}: fetched business name preserved literally, including HTML/placeholder characters`);
  w.state.response[vertical === 'boutique' ? 'shop' : 'menu'][vertical === 'boutique' ? 'products' : 'items'] = [{ id: 'fixture' }];
  w.api.mount(w.el); await settle();
  check(w.pub.textContent === `1 ${expected[vertical === 'boutique' ? 'product' : 'item']} ${expected.online} · ${merchantName}`, `${label}: exact singular published count and unit translated`);
  w.state.response = { name: merchantName, menu: { items: [] } }; w.api.mount(w.el); await settle();
  check(w.pub.textContent === expected.empty, `${label}: empty publication status translated honestly`);
  w.state.offline = true; w.api.mount(w.el); await settle();
  check(w.pub.textContent === expected.offline, `${label}: actual rejected GET status translated`);
  w.api.open(); await settle();
  check(w.state.drawer?.title === expected.drawer && w.state.drawer?.subtitle === expected.subtitle, `${label}: actual direct drawer title/subtitle translated`);
  check(w.state.calls.every(call => call.url === `/api/menu?merchant=${encodeURIComponent(slug)}` && call.method === 'GET'), `${label}: only original scoped public-menu GET path`);
  check(w.state.writes === 0 && w.state.nfcWrites === 0 && w.state.clipboardWrites === 0, `${label}: renderer never publishes/writes NFC/copies`);
  check(JSON.stringify(sourceData) === sourceSnapshot, `${label}: canonical merchant item/category/station/data/price untouched`);
}
for (const localeSource of ['dashboard', 'menu', 'storage']) {
  const w = world('fr', 'restaurant', false, localeSource);
  w.state.response = { name: merchantName, menu: { items: [{ id: 'fixture' }] } };
  w.api.mount(w.el); await settle();
  w.state.locale = 'ar'; w.api.mount(w.el); await settle();
  check(w.el.innerHTML.includes(EXPECT.ar.heading) && w.pub.textContent.includes(EXPECT.ar.online), `${localeSource}: current locale honored on workspace remount and async status`);
  w.state.locale = 'en'; w.api.open(); await settle();
  check(w.el.innerHTML.includes(EXPECT.en.heading) && w.state.drawer?.title === EXPECT.en.drawer, `${localeSource}: current locale honored on normal drawer reopen`);
}
console.log(`orderpro-panel-locale: ${passed} passed, ${failed} failed (VM renderer only; no browser/native claim)`);
process.exitCode = failed ? 1 : 0;
