#!/usr/bin/env node
/* Kiwi AI · merchant feature truth gate.
 * Verifies that product explanations follow the active vertical, that setup is
 * question-led, and that navigation uses the real merchant page handlers. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets', 'agent-features.js'), 'utf8');
let failures = 0;
let controls = 0;
function check(name, value, detail = '') {
  controls++;
  if (value) console.log('  ✓ ' + name);
  else { failures++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

const profiles = {
  pressing: { items: [
    ['pressing-orders', 'Dépôts & commandes'], ['pressing-workshop', 'Atelier & flux'],
    ['pressing-pickup', 'Retraits & rack'], ['pressing-services', 'Services & tarifs'],
    ['pressing-quality', 'Qualité & incidents'], ['pressing-delivery', 'Collecte & livraison'],
  ].map(([nav, fr]) => ({ nav, label: { fr, en: fr, ar: fr } })) },
  restaurant: { items: ['tables', 'menu', 'kds', 'reservations'].map((nav) => ({ nav, label: { fr: nav, en: nav, ar: nav } })) },
  boutique: { items: ['inventory'].map((nav) => ({ nav, label: { fr: nav, en: nav, ar: nav } })) },
  fleuriste: { items: [{ nav: 'florist-orders', label: { fr: 'Commandes florales', en: 'Floral orders', ar: 'طلبات الزهور' } }] },
};
const bases = { restaurant: 'restaurant', boutique: 'boutique', pressing: 'boutique', fleuriste: 'boutique' };
let active = 'pressing';
const opened = [];
const window = {
  KiwiI18n: { getLang: () => 'fr' },
  KiwiMe: {},
  KiwiTrades: {
    resolve: (x) => String(x || ''),
    base: (x) => bases[x] || 'boutique',
    label: (x) => ({ pressing: 'Pressing', boutique: 'Boutique', restaurant: 'Restaurant', fleuriste: 'Fleuriste' }[x] || x),
  },
  KiwiVenue: {
    getCurrentVenueData: () => ({ subtype: active, name: 'Audit ' + active }),
    getSubtypeProfile: (x) => profiles[x] || { items: [] },
  },
  KiwiTradeWorkspaces: {
    pages: [{ trade: 'fleuriste', nav: 'florist-orders', title: { fr: 'Commandes florales' }, subtitle: { fr: 'Bouquets, occasions, fraîcheur et créneaux de livraison.' } }],
    render: (nav) => { opened.push('workspace:' + nav); return true; },
  },
  KiwiPressingDashboard: { showPage: (nav) => { opened.push('pressing:' + nav); return true; } },
  Kiwi: { handlers: {} },
};
window.window = window;
const document = { querySelector: () => null };
const ctx = { window, document, console, Object };
vm.createContext(ctx);
vm.runInContext(SOURCE, ctx, { filename: 'agent-features.js' });
const G = window.KiwiFeatureGuide;

console.log('\n■ Merchant capability isolation');
let keys = G.features('pressing').map((x) => x.key);
check('pressing exposes deposits', keys.includes('pressing-orders'));
check('pressing exposes workshop flow', keys.includes('pressing-workshop'));
check('pressing exposes service pricing', keys.includes('pressing-services'));
check('pressing excludes retail EAN scanner', !keys.includes('scanner'), keys.join(', '));
check('pressing excludes restaurant floor plan', !keys.includes('tables'), keys.join(', '));

active = 'boutique'; G._test.reset();
keys = G.features().map((x) => x.key);
check('boutique exposes traceable inventory', keys.includes('inventory'));
check('boutique exposes continuous scanner', keys.includes('scanner'));
check('boutique excludes pressing workflow', !keys.includes('pressing-workshop'));
check('boutique inventory opens the real inventory page', G.features().find((x) => x.key === 'inventory').nav === 'inventory');

active = 'restaurant'; G._test.reset();
keys = G.features().map((x) => x.key);
check('restaurant exposes floor plan', keys.includes('tables'));
check('restaurant exposes production screen', keys.includes('kds'));
check('restaurant exposes menu routing', keys.includes('menu'));
check('restaurant excludes retail scanner', !keys.includes('scanner'));

console.log('\n■ Detailed explanations');
active = 'pressing'; G._test.reset();
let r = G.reply('Où puis-je modifier les noms et les prix des chemises ?', { lang: 'fr' });
check('pressing price question is deterministic', !!r);
check('pressing price question names Services et tarifs', /Services et tarifs/.test(r && r.text));
check('answer gives prerequisites', r && r.stats && r.stats.some((x) => /Mise en place/.test(x.l)));
check('answer opens a validated page', r && r.open && r.open[0] && /pressing-services/.test(r.open[0].handler));
window.Kiwi.handlers[r.open[0].handler]();
check('open action uses pressing dashboard navigation', opened.includes('pressing:pressing-services'), opened.join(', '));

r = G.reply('Quelles fonctions Kiwi ai-je ?', { lang: 'fr' });
check('feature inventory separates trade-specific tools', r.stats.some((x) => x.l === 'Conçu pour votre métier'));
check('feature inventory includes common tools', r.stats.some((x) => x.l === 'Commun à votre établissement'));

console.log('\n■ Question-led setup');
active = 'restaurant'; G._test.reset();
r = G.reply('Aide-moi à configurer mon établissement', { lang: 'fr' });
check('channel question offers channel answers, not yes/no', r.follow.includes('Sur place') && r.follow.includes('Livraison') && !r.follow.includes('Oui'), r.follow.join(', '));
active = 'pressing'; G._test.reset();
r = G.reply('Aide-moi à configurer mon établissement', { lang: 'fr' });
check('setup starts with question 1/3', /1\/3/.test(r.stats[0].l));
r = G.reply('Oui, nos tarifs sont prêts', { lang: 'fr' });
check('setup continues with question 2/3', /2\/3/.test(r.stats[0].l));
r = G.reply('Partiellement', { lang: 'fr' });
check('setup continues with question 3/3', /3\/3/.test(r.stats[0].l));
r = G.reply('Nous faisons aussi la livraison', { lang: 'fr' });
check('setup ends with an ordered implementation path', r.stats.length >= 3 && r.stats[0].l === '1');
check('setup never claims settings were saved', !/enregistr|activé|saved|activated/i.test(r.text));
check('setup exposes safe navigation buttons', r.open && r.open.length > 0);

G._test.reset();
r = G.reply('Aide-moi à configurer les services et tarifs', { lang: 'fr' });
check('named-feature setup starts a focused question flow', /grille actuelle/.test(r.stats[0].v));
r = G.reply('Oui, sur Excel', { lang: 'fr' });
r = G.reply('Les urgences et le détachage', { lang: 'fr' });
r = G.reply('Une chemise en nettoyage à sec', { lang: 'fr' });
check('named-feature setup returns to its validated owner page', /plan d’intégration/.test(r.text) && r.open.some((x) => /pressing-services/.test(x.handler)));

console.log('\n■ Workspace-derived vertical knowledge');
active = 'fleuriste'; G._test.reset();
const flower = G.features().find((x) => x.key === 'florist-orders');
check('unknown specialist page is learned from workspace registry', !!flower);
check('workspace description becomes product truth', /Bouquets/.test(flower && flower.summary && flower.summary.fr));
check('prompt context contains only active vertical detail', /Commandes florales/.test(G.promptContext('fleuriste', 'fr')) && !/Atelier et flux/.test(G.promptContext('fleuriste', 'fr')));

console.log('\n■ All shipped merchant types');
{
  const noop = () => {};
  const el = () => ({ classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, style: {}, dataset: {}, addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], setAttribute: noop, appendChild: noop, insertAdjacentHTML: noop, remove: noop, textContent: '', innerHTML: '' });
  const doc = { readyState: 'loading', documentElement: el(), body: el(), head: el(), querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: el, addEventListener: noop };
  const memory = {};
  const storage = { getItem: (k) => memory[k] || null, setItem: (k, v) => { memory[k] = String(v); }, removeItem: (k) => { delete memory[k]; } };
  const live = { document: doc, localStorage: storage, KiwiI18n: { getLang: () => 'fr' }, addEventListener: noop, dispatchEvent: noop, matchMedia: () => ({ matches: false, addEventListener: noop }), setTimeout: noop, clearTimeout: noop };
  live.window = live;
  const real = { window: live, document: doc, localStorage: storage, console, setTimeout: noop, clearTimeout: noop, requestAnimationFrame: noop, CustomEvent: function () {} };
  vm.createContext(real);
  for (const f of ['assets/trades.js', 'assets/venues.js', 'assets/agent-features.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), real, { filename: f });
  }
  const all = live.KiwiTrades.LIST.map((x) => x.id);
  check('canonical registry contains all 18 supported merchant types', all.length === 18, all.join(', '));
  for (const id of all) {
    const profile = live.KiwiVenue.getSubtypeProfile(id) || { items: [] };
    const merchantFeatures = live.KiwiFeatureGuide.features(id);
    const known = new Set(merchantFeatures.flatMap((x) => [x.key, x.nav]));
    const complete = (profile.items || []).every((x) => known.has(x.nav));
    const unique = new Set(merchantFeatures.map((x) => x.key)).size === merchantFeatures.length;
    check(`${id}: every vertical page is explainable`, merchantFeatures.length >= 8 && complete && unique,
      `features=${merchantFeatures.length}; missing=${(profile.items || []).filter((x) => !known.has(x.nav)).map((x) => x.nav).join(',')}`);
  }
}

console.log(`\n${controls - failures}/${controls} controls passed`);
process.exitCode = failures ? 1 : 0;
