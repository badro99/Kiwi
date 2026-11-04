import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import split from './split-functions.cjs';
const support = fs.readFileSync('assets/serveur/payment-support.js', 'utf8');
const payments = fs.readFileSync('assets/serveur/payments.js', 'utf8');
const elements = new Map();
const context = vm.createContext({ window: { addEventListener() {} }, setInterval() {}, setTimeout() {},
  $: s => { if (!elements.has(s)) elements.set(s, { style: {} }); return elements.get(s); },
  fmtMADcents: n => n.toFixed(2), effectiveTipPct: () => 7,
  splitState: { totalCents: 0, numParts: 2 } });
vm.runInContext(support + '\n' + split.declaration(payments, 'updateSplitSummary'), context);
let seed = 142;
for (let i = 0; i < 10000; i++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const cents = 1 + seed % 9999999, n = 2 + i % 11;
  const parts = context.serveurPaymentSupport().equal(cents, n, 7);
  assert.equal(parts.reduce((s, p) => s + p.amountCents, 0), cents);
  assert.equal(parts.reduce((s, p) => s + p.tipCents, 0), Math.round(cents * 7 / 100 + 1e-9));
  assert.equal(parts[n - 1].amountCents, cents - Math.floor(cents / n) * (n - 1));
  Object.assign(context.splitState, { totalCents: cents, numParts: n });
  context.updateSplitSummary();
  const label = [...new Set(parts.map(p => ((p.amountCents + p.tipCents) / 100).toFixed(2)))].join(' / ');
  assert.equal(elements.get('#split-per-person').textContent, label);
}
assert.match(split.declaration(payments, 'launchSplitFlow'), /serveurPaymentSupport\(\).equal\(cents, n, pct\)/);
console.log('✓ serveur split cents: 10000 exact bills, tips, remainder and displayed charges');

const langContext = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync('assets/serveur-lang.js', 'utf8'), langContext);
for (const lang of ['en', 'ar']) {
  const { translations, patterns } = langContext.window.KiwiServeurLang;
  for (const text of ['Part 2 · T7', 'Approchez la carte', 'Part égale · pourboire inclus', 'Conv 2', 'Conv. 2', 'Convive 2', "Convive 2 n'a encore rien · tapez un article ci-dessus", 'Articles de Convive 2', '+ pourboire 7%', 'Retirer', 'Pour qui?']) {
    const pattern = patterns.find(([re]) => re.test(text));
    const translated = translations[lang][text] || (pattern && text.replace(pattern[0], pattern[lang === 'en' ? 1 : 2]));
    assert.ok(translated && translated !== text, lang + ': ' + text);
  }
}
console.log('✓ split and charge labels translated in EN and AR');
