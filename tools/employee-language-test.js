#!/usr/bin/env node
const serveurTestSource = require('./serveur-test-source.cjs');
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const page = serveurTestSource(fs.readFileSync(path.join(root, 'kiwi-serveur.html'), 'utf8'));
// Le dictionnaire et ses motifs vivent dans assets/serveur-lang.js.
const lang = fs.readFileSync(path.join(root, 'assets', 'serveur-lang.js'), 'utf8');
let checks = 0;

function ok(condition, message) {
  checks++;
  if (!condition) throw new Error('Employee language: ' + message);
}

// Copy bans complement execution: dynamically generated strings must also
// remain free of the retired dialect, including unreachable copy.
ok(!/(?:الدارجة|ديالك|دابا|السيمانة|كاع|خاوية|المينيو|كارط|كاش|البوز|كاتسير|شحال|الماكلة|غيبانو|نتا|نتي)/.test(page + lang), 'Darija wording cannot return');
ok(!/\b(?:Slm|mesa|Ltn|Tlt|Lrb|Lkh|Ljm|Sbt|Lhd)\b/.test(page), 'Latin Darija and Spanish labels cannot return');

// Execute the shipped translation owner and its registered live observer.
// This DOM port models text/attribute mutations; the browser companion checks
// native MutationObserver delivery and keyboard activation.
{
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(root, 'assets/serveur-app.js'), 'utf8');
  const code = source.slice(source.indexOf('    const EMPLOYEE_LANGUAGE_KEY'), source.indexOf('    /* ---------- Calendar'));
  const listeners = {}, storage = new Map(); let observe;
  function element(tag = 'LABEL') {
    const attrs = new Map();
    return { nodeType: 1, tagName: tag, texts: [], children: [], dataset: {},
      querySelectorAll() { return this.children; },
      hasAttribute: a => attrs.has(a), getAttribute: a => attrs.get(a), setAttribute: (a, v) => attrs.set(a, v),
      classList: { toggle() {}, contains() { return false; } }, addEventListener() {} };
  }
  const body = element('BODY');
  const document = { body, documentElement: {}, addEventListener: (name, fn) => { listeners[name] = fn; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    createTreeWalker(root) { const nodes = [...root.texts, ...root.children.flatMap(e => e.texts)]; let i = 0; return { nextNode: () => nodes[i++] }; } };
  const c = vm.createContext({ document, localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_NODE: 9 }, NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: function (fn) { observe = fn; this.observe = () => {}; },
    svMerchant: () => 'synthetic-language', navigator: {},
    $: () => null, $$: () => [], renderSchedule() {}, renderHours() {}, renderProfil() {}, updateShiftMeta() {}, currentTab: 'profil' });
  c.window = c;
  vm.runInContext(lang + '\n' + code, c);
  listeners.DOMContentLoaded();
  const rankStart = page.indexOf('function kgRankName(');
  const rankEnd = page.indexOf('function kgRankIdxFor(', rankStart);
  vm.runInContext(page.slice(rankStart, rankEnd), c);
  c.kgNum = String;
  const label = element(), input = element('INPUT');
  const node = { nodeType: 3, parentElement: label, nodeValue: ' Montant reçu ' }; label.texts.push(node);
  for (const a of ['placeholder', 'aria-label', 'title']) input.setAttribute(a, 'Montant reçu');
  label.children.push(input); body.children.push(label);
  for (const [locale, expected] of [['en', 'Amount received'], ['ar', 'المبلغ المستلم'], ['fr', 'Montant reçu']]) {
    c.setEmployeeLanguage(locale);
    const rank = c.kgRankName({ name: 'Apprenti' });
    ok(rank === ({ fr: 'Apprenti', en: 'Apprentice', ar: 'متدرّب' })[locale], locale + ': rank is generated in context');
    const challenge = c.kgChallengeText({ metric: 'tables', target: 3, text: 'Réglez 3 tables' });
    ok(challenge === ({ fr: 'Réglez 3 tables', en: 'Settle 3 tables during this shift', ar: 'سدّد 3 طاولات خلال هذه الوردية' })[locale], locale + ': challenge is generated in context');
    // A fresh asynchronous render writes French after the language switch.
    node.nodeValue = ' Montant reçu ';
    observe([{ type: 'characterData', target: node, addedNodes: [] }]);
    observe([{ type: 'childList', addedNodes: [label] }]);
    ok(node.nodeValue === ` ${expected} `, locale + ': injected text translates with whitespace preserved');
    for (const a of ['placeholder', 'aria-label', 'title']) {
      input.setAttribute(a, 'Montant reçu');
      observe([{ type: 'attributes', target: input, addedNodes: [] }]);
      ok(input.getAttribute(a) === expected, locale + ': injected ' + a + ' translates');
    }
    ok(document.documentElement.dir === (locale === 'ar' ? 'rtl' : 'ltr'), locale + ': rendered reading direction');
    ok(storage.get('kiwi-employee-language:synthetic-language') === locale, locale + ': venue preference persists');
  }
}

console.log(`✓ employee language gate green (${checks} checks: persistence, injected text, accessible attributes, locale)`);
