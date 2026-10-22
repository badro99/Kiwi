#!/usr/bin/env node
/* Le tableau des tickets parle français (par défaut), anglais et arabe.
 *
 *  1. Parité : chaque clé du dictionnaire de assets/tickets.js existe en FR, EN
 *     et AR, avec les mêmes variables {x}, sans tiret long ; seules les formes
 *     de pluriel arabes (.two/.few/.many) peuvent manquer ailleurs.
 *  2. Taxonomie : chaque type, zone et sous-type de l'API a son libellé arabe.
 *  3. tickets.html : tout texte visible et tout attribut lisible (aria-label,
 *     placeholder, alt) passe par data-i18n / data-i18n-attr, avec une clé connue.
 *  4. Rendu réel : tickets.js tourne dans un DOM minimal, sur un tableau qui
 *     touche chaque branche (problème, test avec suivi, terminé, filtres,
 *     erreurs, toasts). En français, aucune des anciennes phrases anglaises ne
 *     sort ; en arabe, la page passe en rtl et aucun mot latin ne sort hormis
 *     les sigles et la marque.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { TICKET_TAXONOMY } from '../functions/api/tickets/_taxonomy.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'tickets.html'), 'utf8');
const client = readFileSync(resolve(root, 'assets/tickets.js'), 'utf8');

let passed = 0;
const failed = [];
function check(label, condition, detail) {
  if (condition) { passed++; console.log('  ✓ ' + label); }
  else failed.push(label + (detail ? ' · ' + detail : ''));
}

/* ── DOM minimal ─────────────────────────────────────────────────────────── */
class Node_ {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this._text = '';
    this.listeners = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.checked = false;
    const self = this;
    this.classList = {
      set: new Set(),
      add(...names) { names.forEach((n) => this.set.add(n)); },
      remove(...names) { names.forEach((n) => this.set.delete(n)); },
      toggle(name, force) { const on = force === undefined ? !this.set.has(name) : Boolean(force); if (on) this.set.add(name); else this.set.delete(name); return on; },
      contains(name) { return this.set.has(name); },
    };
    void self;
  }
  get className() { return [...this.classList.set].join(' '); }
  set className(value) { this.classList.set = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get textContent() { return this.tagName === '#TEXT' ? this._text : this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(value) { this.children = []; this._text = String(value); }
  set innerHTML(value) { this.children = []; this._text = ''; this.rawHTML = String(value); }
  get innerHTML() { return this.rawHTML || ''; }
  insertAdjacentHTML(_where, value) { this.rawHTML = String(value) + (this.rawHTML || ''); }
  append(...nodes) {
    nodes.forEach((node) => {
      if (node == null) return;
      const child = typeof node === 'string' ? textNode(node) : node;
      child.parentNode = this;
      this.children.push(child);
    });
  }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.rawHTML = ''; this.append(...nodes); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); }
  get isConnected() { return true; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = String(value);
  }
  getAttribute(name) {
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase());
      return this.dataset[key] != null ? this.dataset[key] : null;
    }
    return this.attributes[name] != null ? this.attributes[name] : null;
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  fire(type, event) { return Promise.all((this.listeners[type] || []).map((fn) => fn(event))); }
  matches(selector) {
    return selector.split(',').some((part) => {
      const s = part.trim();
      if (s === '*') return true;
      if (s.startsWith('.')) return this.classList.contains(s.slice(1));
      const attr = s.match(/^\[([\w-]+)\]$/);
      if (attr) return this.getAttribute(attr[1]) != null;
      return this.tagName === s.toUpperCase();
    });
  }
  *walk() { for (const child of this.children) { yield child; yield* child.walk(); } }
  querySelectorAll(selector) { return [...this.walk()].filter((n) => n.tagName !== '#TEXT' && n.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { let n = this; while (n) { if (n.tagName !== '#TEXT' && n.matches(selector)) return n; n = n.parentNode; } return null; }
  focus() {} select() {} setSelectionRange() {} showModal() { this.open = true; } close() { this.open = false; } reset() {}
}
function textNode(text) { const n = new Node_('#text'); n._text = String(text); return n; }

function boot({ lang, fetchImpl }) {
  const byId = new Map();
  const extra = new Map();
  const htmlEl = new Node_('html');
  const document = {
    documentElement: htmlEl,
    title: '',
    hidden: false,
    getElementById(id) { if (!byId.has(id)) { const el = new Node_('div'); el.id = id; byId.set(id, el); } return byId.get(id); },
    createElement: (tag) => new Node_(tag),
    createTextNode: textNode,
    querySelector(selector) {
      if (!extra.has(selector)) extra.set(selector, new Node_('div'));
      return extra.get(selector);
    },
    querySelectorAll(selector) { return this.allNodes().filter((n) => n.tagName !== '#TEXT' && n.matches(selector)); },
    allNodes() { return [...byId.values(), ...extra.values()].flatMap((el) => [el, ...el.walk()]); },
    addEventListener() {},
    execCommand: () => true,
    body: new Node_('body'),
  };
  const storage = new Map([['kiwiLang', lang]]);
  const window = {
    location: { search: '' },
    localStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) },
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout() {},
    setInterval: () => 1,
    isSecureContext: true,
    crypto: globalThis.crypto,
  };
  const navigator = { language: 'en-US', languages: ['en-US'], clipboard: { writeText: async () => {} } };
  const context = vm.createContext({
    window, document, navigator, fetch: fetchImpl, FormData, URLSearchParams, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    Intl, Date, Math, Number, String, Object, Array, JSON, Promise, Error, Set, Map, Boolean, crypto: globalThis.crypto, console,
  });
  window.document = document;
  vm.runInContext(client, context, { filename: 'assets/tickets.js' });
  return { window, document, byId: (id) => document.getElementById(id) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 6; i++) await tick(); }

const now = Date.now();
const FIXTURE = {
  taxonomy: TICKET_TAXONOMY,
  tickets: [
    { id: 3, number: '#0003', status: 'problem', body: '3', kind: 'bug', area: 'caisse', subkind: 'wrong-figures', moneyAtRisk: true,
      createdAt: now, images: [{ url: '/i/a.png' }], followups: [] },
    { id: 2, number: '#0002', status: 'testing', body: '2', kind: 'unsorted', area: null, subkind: null, moneyAtRisk: false,
      createdAt: now - 86400000, images: [], followups: [{ body: '22', createdAt: now, images: [{ url: '/i/b.png' }] }, { body: '23', createdAt: now - 9 * 86400000, images: [] }] },
    { id: 1, number: '#0001', status: 'done', body: '1', kind: 'question', area: 'sync', subkind: null, moneyAtRisk: false,
      createdAt: now - 3 * 86400000, expiresAt: now + 5 * 86400000, images: [], followups: [] },
    { id: 4, number: '#0004', status: 'done', body: '4', kind: 'feature', area: 'site', subkind: 'hardware', moneyAtRisk: false,
      createdAt: now - 3 * 86400000, expiresAt: now + 1 * 86400000 - 1000, images: [], followups: [] },
  ],
};
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

/* Exécute chaque branche qui écrit du texte : rendu, état vide, filtre,
   erreur de chargement, toasts, validations du formulaire. */
async function exercise(lang) {
  const fetchImpl = async (url, init) => {
    if (init && init.method === 'PATCH') return json({ ok: true });
    if (init && init.method === 'POST') return json({ number: '#0005', classificationStored: false }, 201);
    return json(FIXTURE);
  };
  const page = boot({ lang, fetchImpl });
  await settle();
  const strings = [];
  const collect = (label) => {
    strings.push([label + ' title', page.document.title]);
    for (const el of page.document.allNodes()) {
      ['aria-label', 'alt', 'placeholder', 'title'].forEach((a) => { if (el.attributes[a]) strings.push([label + ' @' + a, el.attributes[a]]); });
      if (el.alt) strings.push([label + ' alt', el.alt]);
      if (el._text && el._text.trim()) strings.push([label, el._text]);
    }
  };
  collect('board');
  const filters = page.document.querySelector('.ticket-filters');
  const areaFilter = page.byId('areaFilters').querySelectorAll('[data-filter-dimension]').find((b) => b.dataset.filterValue === 'tooling');
  await filters.fire('click', { target: areaFilter });
  collect('empty');
  await page.byId('resetFilters').fire('click', {});

  const board = page.byId('ticketBoard');
  const find = (action) => [...page.byId('ticketBoard').walk(), ...['listProblem', 'listTesting', 'listDone'].flatMap((id) => [...page.byId(id).walk()])]
    .find((n) => n.dataset && n.dataset.action === action);
  await board.fire('click', { target: find('copy-text') }); await settle();
  strings.push(['toast copy', page.byId('toast').textContent]);
  await board.fire('click', { target: find('fixed') }); await settle();
  strings.push(['toast fixed', page.byId('toast').textContent]);
  await board.fire('click', { target: find('tested') }); await settle();
  strings.push(['toast tested', page.byId('toast').textContent]);

  page.byId('ticketBody').value = '';
  await page.byId('ticketForm').fire('submit', { preventDefault() {} });
  strings.push(['form empty', page.byId('formError').textContent]);
  page.byId('ticketBody').value = 'texte';
  await page.byId('ticketForm').fire('submit', { preventDefault() {} }); await settle();
  strings.push(['toast published', page.byId('toast').textContent]);

  page.byId('ticketImages').files = [{ name: 'a.txt', type: 'text/plain', size: 1 }, { name: 'big.png', type: 'image/png', size: 11 * 1024 * 1024 }];
  await page.byId('ticketImages').fire('change', {});
  strings.push(['form files', page.byId('formError').textContent]);

  collect('after');
  return { page, strings };
}

/* 1 · parité du dictionnaire */
const probe = boot({ lang: 'fr', fetchImpl: async () => json(FIXTURE) });
await settle();
const exposed = probe.window.KiwiTicketsCopy;
check('tickets.js exposes its FR/EN/AR dictionary', exposed && exposed.COPY && exposed.COPY.fr && exposed.COPY.en && exposed.COPY.ar);
if (exposed && exposed.COPY && exposed.COPY.fr) {
  const { COPY, TAXONOMY_AR } = exposed;
  const PLURAL_EXTRA = /\.(zero|two|few|many)$/;
  const base = (lang) => Object.keys(COPY[lang]).filter((k) => !PLURAL_EXTRA.test(k)).sort();
  const vars = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
  for (const lang of ['en', 'ar']) {
    const missing = base('fr').filter((k) => !(k in COPY[lang]));
    const extra = base(lang).filter((k) => !(k in COPY.fr));
    check(`every key exists in FR and ${lang.toUpperCase()}`, !missing.length && !extra.length, [...missing, ...extra].join(' '));
    /* Une forme de pluriel peut écrire le nombre en toutes lettres (« يوم واحد »). */
    const varDiff = base('fr').filter((k) => !/\.(one|other)$/.test(k) && k in COPY[lang] && vars(COPY.fr[k]) !== vars(COPY[lang][k]));
    check(`${lang.toUpperCase()} keeps the same {variables} as FR`, !varDiff.length, varDiff.join(' '));
  }
  const all = ['fr', 'en', 'ar'].flatMap((lang) => Object.entries(COPY[lang]).map(([k, v]) => [lang + ':' + k, v]));
  check('no empty value', all.every(([, v]) => typeof v === 'string' && v.trim()), all.filter(([, v]) => !String(v).trim()).map(([k]) => k).join(' '));
  check('no em dash in any language', all.every(([, v]) => !v.includes('—')), all.filter(([, v]) => v.includes('—')).map(([k]) => k).join(' '));
  const arLatin = Object.entries(COPY.ar).filter(([, v]) => /[A-Za-z]{3,}/.test(v.replace(/\{\w+\}/g, '').replace(/\b(Kiwi|JPEG|PNG|WebP|GIF)\b/g, '')));
  check('the Arabic dictionary is Arabic (only brand and file-type names in Latin)', !arLatin.length, arLatin.map(([k]) => k).join(' '));

  /* 2 · taxonomie */
  const ids = [
    ...TICKET_TAXONOMY.kinds.map((i) => i.id),
    ...TICKET_TAXONOMY.areas.map((i) => i.id),
    ...Object.values(TICKET_TAXONOMY.subkinds).flat().map((i) => i.id),
  ];
  const noAr = ids.filter((id) => !(TAXONOMY_AR && TAXONOMY_AR[id]) && !findLabelAr(id));
  check('every taxonomy type, area and sub-kind has an Arabic label', !noAr.length, noAr.join(' '));

  /* 3 · tickets.html */
  const body = html.slice(html.indexOf('<body'), html.indexOf('<script'));
  const htmlKeys = [...body.matchAll(/data-i18n="([\w.-]+)"/g)].map((m) => m[1])
    .concat([...body.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((m) => m[1].split(',').map((p) => p.split(':')[1].trim())));
  const unknown = htmlKeys.filter((k) => !(k in COPY.fr) || !(k in COPY.en) || !(k in COPY.ar));
  check('every key used in tickets.html exists in FR, EN and AR', htmlKeys.length > 30 && !unknown.length, unknown.join(' '));
  const bare = [];
  for (const m of body.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<([a-z0-9]+)((?:[^>"]|"[^"]*")*)>([^<]*)/g)) {
    const [, tag, attrs, text] = m;
    if (/\p{L}/u.test(text) && !/data-i18n="/.test(attrs)) bare.push(`<${tag}> ${text.trim()}`);
    for (const a of attrs.matchAll(/\s(aria-label|placeholder|alt|title)="([^"]*)"/g)) {
      if (!/\p{L}/u.test(a[2]) || (a[1] === 'alt' && a[2] === 'Kiwi')) continue;
      if (!new RegExp(`data-i18n-attr="[^"]*${a[1]}:`).test(attrs)) bare.push(`${a[1]}="${a[2]}"`);
    }
  }
  check('every visible text and readable attribute in tickets.html is translated', !bare.length, bare.join(' | '));
  check('tickets.html defaults to French', /<html lang="fr"/.test(html));
  check('the old English preview cards are gone from tickets.html', !html.includes('preview-card') && !html.includes('Add problem'));
}
function findLabelAr(id) {
  const all = [...TICKET_TAXONOMY.kinds, ...TICKET_TAXONOMY.areas, ...Object.values(TICKET_TAXONOMY.subkinds).flat()];
  return all.some((item) => item.id === id && item.label && item.label.ar);
}

/* 4 · rendu réel */
const OLD_ENGLISH = [
  'Fixed', 'Tested', 'Test failed', 'Copy text', 'Copy image', 'Classify', 'Money at risk', 'Save classification',
  'No area', 'No sub-kind', 'Sub-kind', 'Deletes', 'Today', 'Yesterday', 'Unsorted', 'All', 'move ticket', 'attachment',
  'No open problems', 'Nothing to test', 'Nothing completed', 'Could not', 'Try again', 'Write a short', 'published',
  'ready to test', 'completed', 'copied', 'Use JPEG', 'larger than', 'Something went wrong', 'Bug', 'Register', 'Sync',
  'Wrong figures', 'Public site', 'Hardware', 'Feature',
];
const englishIn = (s) => OLD_ENGLISH.filter((w) => new RegExp(`(^|[^A-Za-z])${w}([^A-Za-z]|$)`).test(s));

const fr = await exercise('fr');
const frLeaks = fr.strings.flatMap(([where, s]) => englishIn(s).map((w) => `${where}: "${s}" (${w})`));
check('French board renders cards, chips, actions and expiry', fr.strings.some(([, s]) => s === 'Corrigé')
  && fr.strings.some(([, s]) => s === 'Anomalie') && fr.strings.some(([, s]) => /^Supprimé dans 5 jours$/.test(s))
  && fr.strings.some(([, s]) => s === 'Supprimé dans 1 jour') && fr.strings.some(([, s]) => s === 'Aucun problème ouvert'),
  fr.strings.map(([, s]) => s).join(' | ').slice(0, 600));
check('French toasts and form errors are French', fr.strings.some(([w, s]) => w === 'form empty' && s.startsWith('Écrivez'))
  && fr.strings.some(([w, s]) => w === 'toast fixed' && s === '#0003 prêt à tester')
  && fr.strings.some(([w, s]) => w === 'toast published' && s.startsWith('#0005 publié.')));
check('no old English literal reaches the French board', !frLeaks.length, frLeaks.slice(0, 8).join(' ; '));
check('French sets lang=fr and dir=ltr', fr.page.document.documentElement.attributes.lang === 'fr' && fr.page.document.documentElement.attributes.dir === 'ltr');

/* L'état d'erreur de chargement, en français puis en arabe. */
async function loadError(lang) {
  const page = boot({ lang, fetchImpl: async () => json({ error: 'schema-not-ready' }, 503) });
  await settle();
  return page.byId('listProblem').textContent;
}
const frError = await loadError('fr');
check('the French load error is French', frError.includes('Impossible de charger les tickets') && frError.includes('Réessayer') && !englishIn(frError).length, frError);

const ar = await exercise('ar');
const ALLOWED_LATIN = /\b(Kiwi|JPEG|PNG|WebP|GIF)\b/g;
const arLeaks = ar.strings
  .filter(([, s]) => /[A-Za-z]{2,}/.test(s.replace(ALLOWED_LATIN, '').replace(/#\d+/g, '').replace(/\b[a-z]+\.(png|txt)\b/g, '')))
  .map(([where, s]) => `${where}: "${s}"`);
check('Arabic board sets lang=ar and dir=rtl', ar.page.document.documentElement.attributes.lang === 'ar' && ar.page.document.documentElement.attributes.dir === 'rtl');
check('Arabic board renders Arabic taxonomy chips', ar.strings.some(([, s]) => s === 'خلل') && ar.strings.some(([, s]) => s === 'الصندوق') && ar.strings.some(([, s]) => s === 'أرقام خاطئة'));
check('Arabic expiry uses Arabic plural forms', ar.strings.some(([, s]) => s === 'تُحذف بعد 5 أيام') && ar.strings.some(([, s]) => s === 'تُحذف بعد يوم واحد'));
check('no Latin word reaches the Arabic board except brand and file types', !arLeaks.length, arLeaks.slice(0, 8).join(' ; '));
const arError = await loadError('ar');
check('the Arabic load error is Arabic', arError.includes('تعذر تحميل التذاكر') && !/[A-Za-z]{3,}/.test(arError), arError);

const en = await exercise('en');
check('English still renders the English copy', en.strings.some(([, s]) => s === 'Fixed') && en.strings.some(([, s]) => s === 'Bug')
  && en.strings.some(([, s]) => s === 'Deletes in 5 days') && en.strings.some(([, s]) => s === 'Deletes in 1 day'));

/* Ordre de choix : ?lang= devant kiwiLang, kiwiLang devant le navigateur, le français à défaut. */
check('kiwiLang drives the board language', probe.window.KiwiTicketsCopy?.lang === 'fr' && ar.page.window.KiwiTicketsCopy?.lang === 'ar');
const fallback = boot({ lang: 'de', fetchImpl: async () => json(FIXTURE) });
check('an unknown kiwiLang falls back to the browser language', fallback.window.KiwiTicketsCopy?.lang === 'en');

if (failed.length) {
  failed.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`\n✓ ${passed} ticket board language checks green`);
