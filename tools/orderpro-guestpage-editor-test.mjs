#!/usr/bin/env node
import dashboardDependencies from './dashboard-dependencies.cjs';
// OrderPro · ce que le propriétaire règle de la page client
// (assets/orderpro-guestpage.js), confronté au serveur qui la nettoie
// (functions/api/order/_guest.js).
//
//   · chaque texte existe en français, en anglais et en arabe ;
//   · les villes proposées sont celles que le serveur sait calculer ;
//   · un pseudo masqué depuis le tableau de bord est reconnu par le serveur ;
//   · une réponse laissée vide tombe, et la bonne réponse suit sa place ;
//   · ce que le panneau envoie passe le nettoyage du serveur sans perte ;
//   · le panneau s'ouvre par un gestionnaire que la porte « orderpro » couvre.
// Run: node tools/orderpro-guestpage-editor-test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import mergedPart from './merged-source.cjs';
import { CITIES, nickKey, cleanGuestDoc } from '../functions/api/order/_guest.js';

// L'éditeur vit à la suite de orderpro-panel.js depuis le 22 octobre 2026 (tools/merged-source.cjs).
const src = mergedPart('assets/orderpro-panel.js', 'assets/orderpro-guestpage.js');
const gate = fs.readFileSync(new URL('../assets/merchant-config.js', import.meta.url), 'utf8');
const menu = fs.readFileSync(new URL('../assets/menu-catalog.js', import.meta.url), 'utf8');
const dash = dashboardDependencies(fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8'));
const sw = fs.readFileSync(new URL('../kiwi-sw.js', import.meta.url), 'utf8');

let passed = 0, failed = 0;
function ok(name, run) {
  try { run(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + e.message.split('\n')[0]); }
}

const handlers = {};
const ctx = vm.createContext({
  Math, Number, String, JSON, Set, Array, Object, Promise, Intl, Date, URL,
  localStorage: { getItem: () => 'fr', setItem() {} },
  location: { origin: 'https://kiwi.test' },
  document: { readyState: 'complete', getElementById: () => null, head: { appendChild() {} }, addEventListener() {} },
  Kiwi: { handlers },
});
ctx.window = ctx;
vm.runInContext(src, ctx, { filename: 'orderpro-guestpage.js' });
const x = ctx.KiwiGuestPageEditor._test;

console.log('OrderPro · la page client côté propriétaire');

ok('chaque texte existe en FR, EN et AR, sans tiret cadratin', () => {
  const fr = Object.keys(x.STR.fr);
  for (const l of ['en', 'ar']) {
    assert.deepEqual(fr.filter((k) => !(k in x.STR[l])), [], l + ' misses keys');
    assert.deepEqual(Object.keys(x.STR[l]).filter((k) => !(k in x.STR.fr)), [], l + ' has extra keys');
  }
  for (const l of ['fr', 'en', 'ar']) for (const [k, v] of Object.entries(x.STR[l])) {
    assert.ok(!String(v).includes('—'), `${l}.${k} has an em dash`);
    assert.ok(!/\((s|es)\)/.test(v), `${l}.${k} uses "(s)"`);
  }
  assert.ok(!src.includes('—') && !/font-style\s*:\s*italic/.test(src), 'no em dash or italic in the module');
});

ok('les villes proposées sont exactement celles du serveur', () => {
  const offered = [...src.matchAll(/\['([a-z]+)', '[^']+'\]/g)].map((m) => m[1]);
  assert.deepEqual([...offered].sort(), Object.keys(CITIES).sort());
});

ok('un pseudo masqué se reconnaît comme le serveur le reconnaît', () => {
  for (const n of ['Yasmine', 'ZOÉ', 'Ali 2', 'team_4', 'سارة', 'Éloïse-B']) assert.equal(x.nickKey(n), nickKey(n), n);
});

ok('une réponse vide tombe, la bonne réponse suit sa place, une question incomplète ne part pas', () => {
  const out = x.outgoing({ games: { on: true, quizzes: [
    { id: 'desserts', title: 'Nos desserts', questions: [
      { q: 'Le dessert du vendredi ?', choices: ['Seffa', '', 'Chebakia', ''], answer: 2 },
      { q: 'Sans réponse juste', choices: ['A', 'B', '', ''], answer: 3 },
      { q: '', choices: ['A', 'B'], answer: 0 },
      { q: 'Un seul choix', choices: ['A', '', '', ''], answer: 0 },
    ] },
    { id: 'vide', title: '', questions: [{ q: 'x', choices: ['a', 'b'], answer: 0 }] },
  ] } });
  assert.equal(out.games.quizzes.length, 1, 'an untitled quiz is dropped');
  assert.deepEqual(JSON.parse(JSON.stringify(out.games.quizzes[0].questions)), [{ q: 'Le dessert du vendredi ?', choices: ['Seffa', 'Chebakia'], answer: 1 }]);
});

ok('ce que le panneau envoie passe le nettoyage du serveur sans rien perdre', () => {
  const sent = JSON.parse(JSON.stringify(x.outgoing({
    wifi: { ssid: 'Cafe-Clients', password: 'menthe-26' }, review: { url: 'https://g.page/r/abc/review' },
    socials: { instagram: 'cafe.local', facebook: '', tiktok: 'cafelocal' },
    games: { on: true, builtin: false, hidden: ['Toto'], round: { id: 'r1', quizId: 'desserts', startTs: 1e12, endTs: 1e12 + 9e5 },
      quizzes: [{ id: 'desserts', title: 'Nos desserts', questions: [{ q: 'Q ?', choices: ['a', 'b', 'c', ''], answer: 2 }] }] },
    ramadan: { on: true, city: 'fes', offset: -4 },
  })));
  const clean = cleanGuestDoc(sent);
  assert.deepEqual(clean.wifi, sent.wifi);
  assert.equal(clean.review.url, sent.review.url);
  assert.deepEqual(clean.socials, sent.socials);
  assert.deepEqual(clean.games.quizzes, sent.games.quizzes);
  assert.deepEqual(clean.games.round, sent.games.round);
  assert.deepEqual(clean.games.hidden, ['toto']);
  assert.equal(clean.games.on, true);
  assert.equal(clean.games.builtin, false);
  assert.deepEqual(clean.ramadan, { on: true, city: 'fes', offset: -4 });
});

ok('le panneau s’ouvre par un gestionnaire couvert par la porte « orderpro », et il est chargé', () => {
  assert.equal(typeof handlers['orderpro-guestpage'], 'function');
  assert.match(gate, /orderpro:\s*\[[^\]]*'orderpro-guestpage'/, 'merchant-config gate names the handler');
  assert.match(menu, /data-action="orderpro-guestpage"/, 'the menu has a « Page client » tab');
  const tag = dash.match(/<script src="assets\/orderpro-panel\.js\?v=(\d+)"/);
  assert.ok(tag, 'dashboard.html loads the module');
  assert.ok(sw.includes("'/assets/orderpro-panel.js?v=" + tag[1] + "'"), 'kiwi-sw.js precaches the same stamp');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
