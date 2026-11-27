#!/usr/bin/env node
// The assistant's "sens proche" fallback (assets/agent-data.js, nearSnap): when
// no rule recognises a question, it answers as the nearest known question
// would, from assets/agent/near.json. Built in-house on 27 Nov 2026 (word and
// letter-trigram TF-IDF, five-neighbour vote, slots that must agree), after
// measuring it on 690 + 556 questions the router had never seen: right answers
// went 574 → 600 on the bench and 409 → 415 on the wide set, with no loss on
// the 1 807 bench phrasings, the 43 look-alike traps or the 1 065 wide lines.
//
// The same day, a thousand random questions from someone who had never seen
// the assistant showed the other side: out of its domain the snap was mostly
// wrong (« my butcher scale is not connecting » got today's cash). It now
// refuses a question carrying a word the index has never seen, and takes
// only a close neighbour (cosine ≥ 0.55): on those 1 100 questions it fires
// once, rightly, and on 14 934 unseen variants of known questions it answers
// 1 279, 97 % like the original.
//
// This suite holds three things:
//   1. questions from that unseen set that the rules miss and the snap answers
//      exactly like a known phrasing (each is checked to miss WITHOUT the index,
//      so a pass proves the snap did it);
//   2. the guards: an amount, a name, an edit command, another shop, a flipped
//      "most/least" or "open/close" never borrow a neighbour's answer;
//   3. assets/agent/near.json and its ?v= stamp match a fresh build.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildNear, EXCLUDED } from './build-agent-near.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'tools/agent-bench-test.mjs'), 'utf8');
const cut = src.slice(src.indexOf('const noon'), src.indexOf('/* What each answer must carry'));
const { load, flatten } = require(path.join(root, 'tools/agent-harness.cjs'));
process.chdir(root);
const world = new Function('load', cut + '; return world;')(load);

// 3. The index on disk is the one the bench and the wide set produce today.
const { json, rev } = buildNear();
assert.equal(fs.readFileSync(path.join(root, 'assets/agent/near.json'), 'utf8'), json, 'assets/agent/near.json is stale: node tools/build-agent-near.mjs');
assert.ok(fs.readFileSync(path.join(root, 'assets/agent-data.js'), 'utf8').includes(`near.json?v=${rev}'`), 'NEAR_URL stamp is stale: node tools/build-agent-near.mjs');
const index = JSON.parse(json);
for (const l of index.labels) assert.ok(!EXCLUDED.test(l), `excluded family ${l} in near.json`);
assert.ok(index.items.every(([q]) => !/\s[A-Z][a-z]{2,}/.test(q)), 'a named phrasing slipped into near.json');

const bare = {}, snap = {};
const ask = (ws, L, q, withIndex) => {
  const w = ws[L] || (ws[L] = world(L));
  if (withIndex && !w.__near) { w.KiwiAgentData.nearIndex(index); w.__near = true; }
  return w.KiwiAgentRoute(q) + ' | ' + flatten(w.KiwiAgentAsk(q, L)).replace(/\s+/g, ' ');
};
const lang = (q) => /[؀-ۿ]/.test(q) ? 'ar' : /\b(the|my|how|what|is|do|i|can|you|show|open|who|which|when|take|count)\b/i.test(q) ? 'en' : 'fr';

// 1. Unseen phrasing → the known phrasing whose answer it must give.
const SNAPS = [
  ['werini lbi3 had chhar stp', '3tini ventes had chhar'],
  ['total pour la journee ?', 'total encaisse pour la journee ?'],
  ['y a dans le tiroir caisse maintenant ?', 'Combien y a dans le tiroir caisse maintenant ?'],
  ['Show me my total', 'Show me my total sales'],
  ['does my shop close tonight', 'when does my shop close tonight'],
  ['How many did my shop record today?', 'How many sales did my shop record today?'],
  ['ch7al daba f caisse?', 'ch7al kayn daba f caisse?'],
  ['daba ch7al kayn mn lflous f cash', 'daba ch7al kayn mn lflous f caisse cash'],
  ['dyal nas kaykhdmo m3aya', 'chhal dyal nas kaykhdmo m3aya'],
  ['شنو أسوأ منتوج عندي', 'شنو أسوأ منتوج عندي فالبيع'],
  ['المستخدمين كاملين فالمحل عافاك', 'عدد المستخدمين كاملين فالمحل عافاك'],
  ['كم بلغت هذا الشهر؟', 'كم بلغت إيرادات هذا الشهر؟'],
];
let n = 0;
for (const [q, known] of SNAPS) {
  const L = lang(q);
  const before = ask(bare, L, q, false);
  assert.ok(/^(llm|unclear) /.test(before), `« ${q} » is already answered by the rules (${before.slice(0, 60)}): pick another unseen phrasing`);
  const got = ask(snap, L, q, true), want = ask(snap, L, known, true);
  assert.ok(!/^(llm|unclear) /.test(want), `known phrasing « ${known} » no longer routes`);
  assert.equal(got, want, `« ${q} » should answer like « ${known} »`);
  n++;
}

// 2. Guards: these must not take a neighbour's answer.
const differs = (q, notLike) => { const L = lang(q); assert.notEqual(ask(snap, L, q, true), ask(snap, L, notLike, true), `« ${q} » borrowed the answer of « ${notLike} »`); n++; };
differs('total pour la journee de 2025 ?', 'total encaisse pour la journee ?');              // an amount or a year
differs('Show me my total for Karim', 'Show me my total sales');                           // a name
differs('supprime le produit moins vendu', 'je veux voir le produit le moins vendu');        // an edit command
differs('le resto chez ali a fait combien', 'le panier moyen au resto il est a combien');     // another shop
differs('Produit plus vendu ?', 'je veux voir le produit le moins vendu');                   // most, not least
differs('fach kanft7ou lma7al lyoum?', 'fach kanseddo lyouma');                             // open, not close
differs('Liquide en caisse hier ?', 'combien de cash dans la caisse');                       // another day

// Nothing close: the model or "not understood" keeps it, and the snap does not loop.
// The last three snapped to today's cash, the closing time and the menu page
// before the unknown-word guard (27 Nov, random questions).
for (const q of ['qwerty asdf zxcv', 'ما رأيك في الطقس غدا', 'raconte moi une blague',
  'My butcher scale is not connecting to the till', 'ch7al dyal remises lyom?', 'Montre-moi les achats depuis lundi stp']) {
  assert.ok(/^(llm|unclear|outside) /.test(ask(snap, lang(q), q, true)), `« ${q} » was snapped`); n++;
}
console.log(`✓ agent near: ${n} checks, ${index.items.length} known questions, v=${rev}`);
