#!/usr/bin/env node
// The assistant's "sens proche" fallback (assets/agent-data.js, nearSnap): when
// no rule recognises a question, it answers as the nearest known question
// would, from assets/agent/near.json. Built in-house on 27 Nov 2026 (word and
// letter-trigram TF-IDF, five-neighbour vote, slots that must agree), after
// measuring it on 690 + 556 questions the router had never seen: right answers
// went 574 → 600 on the bench and 409 → 415 on the wide set, with no loss on
// the 1 807 bench phrasings, the 43 look-alike traps or the 1 065 wide lines.
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
  ['Produit moins vendu ?', 'je veux voir le produit le moins vendu'],
  ['Client plus depensier ?', 'quel client dépense le plus'],
  ['Liquide en caisse ?', 'combien de cash dans la caisse'],
  ['Unites vendues ajd ?', "On a vendu combien d'unites ajd stp ?"],
  ['Ma liste de clientele contient combien de personnes', 'ma liste clients contient combien de personnes'],
  ['Qui ne passe plus au cafe parmi ma clientele', 'qui parmi mes clients ne revient plus'],
  ['Count the cash in the till now', 'How much cash is in the drawer now?'],
  ['Take me to transactions.', 'Go to transactions'],
  ['ch7al mn wa7ed kaykhdem 3andi f total', 'ch7al men wa7ed kheddam 3andi f total'],
  ['fach kanseddou lma7al lyoum?', 'fach kanseddo lyouma'],
  ['3adad l9ta3 li tb3at lyoum ch7al', 'ch7al b3na dial l9ta3 lyoum b l3adad?'],
  ['chkoun kan kayji lma7al w ma b9ach kayji', 'chkon li kan kayjina w ma b9ach rje3 l resto'],
  ['كم مادة مدرجة في الكتالوج؟', 'كم عدد عناصر كتالوج المحل'],
  ['اعرض العملاء الذين لم يزوروا متجري منذ مدة', 'من هم الزبائن الذين توقفوا عن المجيء'],
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
differs('Produit moins vendu en 2025 ?', 'je veux voir le produit le moins vendu');          // an amount or a year
differs('Client plus depensier Karim ?', 'quel client dépense le plus');                     // a name
differs('supprime le produit moins vendu', 'je veux voir le produit le moins vendu');        // an edit command
differs('le resto chez ali a fait combien', 'le panier moyen au resto il est a combien');     // another shop
differs('Produit plus vendu ?', 'je veux voir le produit le moins vendu');                   // most, not least
differs('fach kanft7ou lma7al lyoum?', 'fach kanseddo lyouma');                             // open, not close
differs('Liquide en caisse hier ?', 'combien de cash dans la caisse');                       // another day

// Nothing close: the model or "not understood" keeps it, and the snap does not loop.
for (const q of ['qwerty asdf zxcv', 'ما رأيك في الطقس غدا', 'raconte moi une blague']) {
  assert.ok(/^(llm|unclear|outside) /.test(ask(snap, lang(q), q, true)), `« ${q} » was snapped`); n++;
}
console.log(`✓ agent near: ${n} checks, ${index.items.length} known questions, v=${rev}`);
