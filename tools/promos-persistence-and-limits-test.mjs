#!/usr/bin/env node
/* Promotions boutique : la copie locale et sa provenance (la carte des
 * modifications qui nourrit l'avertissement « modification écrasée ») répondent
 * d'un seul résultat de durabilité ; promotions de la carte : ce qui serait
 * réduit en silence par taille est refusé avec le nom des règles. Exécute le
 * vrai assets/promos.js, le vrai assets/menu-promos.js et la vraie route menu. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

/* 1. promos.js : une provenance qui ne s'écrit pas n'est plus annoncée comme conservée. */
const data = new Map(); let refuseEdits = false; const events = [];
const localStorage = { getItem: k => (data.has(k) ? data.get(k) : null),
  setItem(k, v) { if (refuseEdits && k.endsWith(':edits')) throw new Error('quota'); data.set(k, String(v)); }, removeItem: k => data.delete(k) };
class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
const window = { localStorage, dispatchEvent: e => events.push(e), CustomEvent };
const ctx = vm.createContext({ window, localStorage, CustomEvent, console, Set, Map, Math, Date, JSON, Number, Object, Array, String, Intl, Promise });
vm.runInContext('globalThis.window = window;', ctx);
for (const f of ['assets/kit/haptics.js', 'assets/promo-rules.js', 'assets/promos.js']) vm.runInContext(read(f), ctx, { filename: f });
const P = window.KiwiPromos;
P.use('venue-edits');
const promo = id => ({ id, name: 'Soldes ' + id, kind: 'percent', value: 10, scope: 'tout' });
P.save(promo('p1'));
assert.equal(P.durable(), true, 'tout s\'écrit : durable');
refuseEdits = true;
P.save(promo('p2'));
assert.equal(P.lastCommit().local, false, 'la provenance refusée rend le résultat local non durable');
assert.equal(P.durable(), false);
assert.ok(events.some(e => e.type === 'kiwi:local-save' && e.detail.durable === false), 'l\'échec est visible (événement kiwi:local-save)');
assert.ok(P.get('p2'), 'la promotion reste en mémoire : la caisse continue de l\'appliquer');
refuseEdits = false;
P.save(promo('p3'));
assert.equal(P.durable(), true, 'dès que le stockage reprend, la durabilité revient');
assert.ok(JSON.parse(data.get('kiwi:bqPromos:v1:venue-edits:edits')).some(([id]) => id === 'p2'), 'la provenance manquée est réécrite avec la reprise');

/* 2. menu : rien n'est réduit en silence par la taille. */
const { promoOverflow, sanitizeMenu } = await import('../functions/api/menu.js');
const rule = (i, extra) => ({ id: 'r' + i, name: 'Règle ' + i, kind: 'percent', value: 10, all: true, ...extra });
assert.equal(promoOverflow({ promos: Array.from({ length: 40 }, (_, i) => rule(i)) }), null, '40 promotions : accepté');
const over = promoOverflow({ promos: Array.from({ length: 43 }, (_, i) => rule(i)) });
assert.equal(over.error, 'promos-too-large');
assert.equal(JSON.stringify(over.omitted.map(o => o.id)), '["r40","r41","r42"]', 'les règles omises sont nommées');
assert.equal(over.omitted[0].reason, 'promo-limit');
const wide = promoOverflow({ promos: [rule(1, { all: false, items: Array.from({ length: 401 }, (_, i) => 'i' + i) })] });
assert.equal(wide.omitted[0].reason, 'items-limit');
assert.equal(wide.omitted[0].name, 'Règle 1');
assert.equal(sanitizeMenu({ cats: [], items: [], promos: Array.from({ length: 43 }, (_, i) => rule(i)) }).promos.length, 40, 'la lecture des anciennes lignes garde son plafond');
console.log('✓ promos-persistence-and-limits-test');
