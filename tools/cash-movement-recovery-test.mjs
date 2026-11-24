#!/usr/bin/env node
/* Une sortie de caisse que le serveur connaît ne disparaît plus de la clôture.
 *
 * Vu en production le 24 nov. 2026 (Browse) : « Butane », sortie de 120 MAD à
 * 23:01, bien arrivée au serveur (cash_session_events). Première clôture à
 * 23:10, juste (écart 0). L'impression a planté, la caisse a redémarré sur un
 * service sauvegardé SANS ce mouvement, et la deuxième clôture (23:18) a
 * attendu 3 031 MAD au lieu de 2 911 : un écart de −120 « non enregistré »
 * qui n'existait pas. Les ventes, elles, se recousent depuis le serveur à la
 * clôture ; les mouvements de tiroir ne revenaient de nulle part.
 *
 * KiwiCashSessions.recoverMovements(sessionId, locaux) rend les mouvements de
 * CE service que le serveur (ou la file d'envoi locale) connaît et que la
 * caisse n'a plus ; la clôture les rajoute avant de calculer l'attendu. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { deadlineVmSource, deadlineVmContext } from './deadline-vm-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cashSource = fs.readFileSync(path.join(ROOT, 'assets/cash-sessions.js'), 'utf8');
let passed = 0;
const ok = (label, cond, detail) => { assert.ok(cond, label + (detail ? ' · ' + detail : '')); passed++; console.log('  ✓ ' + label); };
console.log('■ Mouvements de caisse rendus à la clôture (tools/cash-movement-recovery-test.mjs)');

const T0 = Date.UTC(2026, 10, 24, 23, 1, 57);
function fixture(serverRows, { fail = false } = {}) {
  const storage = new Map();
  const gets = [];
  const window = {
    KiwiEnv: { isReal: () => true },
    KiwiCloudDoc: { currentSlug: () => 'browse' },
    KiwiCaissePairing: { isPaired: () => true },
    addEventListener() {}, dispatchEvent() {},
  };
  const context = {
    window,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); },
      get length() { return storage.size; },
      key(i) { return [...storage.keys()][i]; },
    },
    document: { readyState: 'loading', addEventListener() {} },
    crypto, Date, Math, JSON, CustomEvent,
    setTimeout() {}, setInterval() {},
    fetch(url, options) {
      if (options && options.method === 'POST') return new Promise(() => {});   // l'envoi reste en file
      gets.push(String(url));
      if (fail) return Promise.reject(new Error('offline'));
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, ready: true, redacted: false, events: serverRows }) });
    },
  };
  vm.runInNewContext(deadlineVmSource(cashSource), deadlineVmContext(context), { filename: 'assets/cash-sessions.js' });
  return { api: window.KiwiCashSessions, gets };
}
const row = (over) => ({
  id: 'cash-x', merchant: 'browse', session_id: 'shift-1', terminal_id: 'term_a', event_type: 'movement',
  movement_kind: 'out', movement_amount_cents: 12000, movement_reason: 'Butane', actor_id: 'emp-1',
  opened_ts: T0 - 16 * 3600e3, occurred_ts: T0, ...over,
});
const local = (over) => ({ id: 'cm-' + T0, time: new Date(T0 + 3), type: 'out', amount: 120, reason: 'Butane', ...over });

ok('l\'API existe', (() => { const f = fixture([]); return typeof f.api.recoverMovements === 'function'; })());

/* 1 · le cas Browse : le serveur a la sortie, la caisse ne l'a plus */
let f = fixture([row({ event_type: 'open', movement_kind: null, movement_amount_cents: null, movement_reason: null, occurred_ts: T0 - 16 * 3600e3 }), row()]);
let back = await f.api.recoverMovements('shift-1', []);
ok('la sortie Butane revient', back.length === 1 && back[0].type === 'out' && back[0].amount === 120 && back[0].reason === 'Butane', JSON.stringify(back));
ok('à son heure, marquée comme reprise du serveur', back[0].time.getTime() === T0 && back[0].recovered === true && back[0].actorId === 'emp-1');
ok('la requête lit ce service et ce terminal', f.gets.length === 1 && /sessionId=shift-1/.test(f.gets[0]) && /terminalId=/.test(f.gets[0]) && /merchant=browse/.test(f.gets[0]), f.gets[0]);

/* 2 · déjà présente localement (quelques ms d'écart) : rien */
f = fixture([row()]);
back = await f.api.recoverMovements('shift-1', [local()]);
ok('une sortie déjà connue n\'est pas doublée', back.length === 0, JSON.stringify(back));

/* 3 · deux sorties identiques le même soir, la caisse n'en a gardé qu'une */
f = fixture([row({ id: 'a' }), row({ id: 'b', occurred_ts: T0 + 40 * 60e3 })]);
back = await f.api.recoverMovements('shift-1', [local()]);
ok('deux sorties de 120 : seule la manquante revient', back.length === 1 && back[0].time.getTime() === T0 + 40 * 60e3, JSON.stringify(back));

/* 4 · entrée et ouverture sans vente */
f = fixture([row({ movement_kind: 'in', movement_amount_cents: 5000, movement_reason: 'Appoint' }), row({ movement_kind: 'no-sale', movement_amount_cents: 0, movement_reason: 'Ouverture sans vente', occurred_ts: T0 + 1000 })]);
back = await f.api.recoverMovements('shift-1', []);
ok('une entrée revient en entrée, une ouverture sans vente à 0', back.length === 2 && back[0].type === 'in' && back[0].amount === 50 && back[1].type === 'out' && back[1].amount === 0, JSON.stringify(back));

/* 5 · un autre service n'est jamais mêlé */
f = fixture([row({ session_id: 'shift-0' })]);
back = await f.api.recoverMovements('shift-1', []);
ok('un mouvement d\'un autre service est ignoré', back.length === 0);

/* 6 · pas de réseau, mais le mouvement attend encore dans la file d'envoi */
f = fixture([], { fail: true });
f.api.emit({ id: 'cash-q', sessionId: 'shift-1', eventType: 'movement', movementKind: 'out', movementAmountCents: 3000, movementReason: 'Pain', actorId: 'emp-2', openedAt: T0 - 3600e3, occurredAt: T0 + 5000 });
back = await f.api.recoverMovements('shift-1', []);
ok('hors ligne : la sortie encore en file revient', back.length === 1 && back[0].amount === 30 && back[0].reason === 'Pain', JSON.stringify(back));
back = await f.api.recoverMovements('shift-1', [local({ time: new Date(T0 + 5004), amount: 30, reason: 'Pain' })]);
ok('…et pas deux fois', back.length === 0);

/* 7 · panne totale : une liste vide, jamais une exception */
f = fixture([], { fail: true });
back = await f.api.recoverMovements('shift-1', [local()]);
ok('panne réseau sans file : liste vide', Array.isArray(back) && back.length === 0);

/* 8 · la clôture s'en sert avant de calculer l'attendu */
const acc = fs.readFileSync(path.join(ROOT, 'assets/caisse-accounting.js'), 'utf8');
const steps = acc.slice(acc.indexOf('async function closeRegisterSteps'), acc.indexOf('report = buildDayReport(counted'));
ok('closeRegisterSteps rend les mouvements perdus avant de figer le rapport', /recoverLostCashMovements\(\)/.test(steps), steps.slice(0, 200));
const open = acc.slice(acc.indexOf('function openCloture'), acc.indexOf('function openCloture') + 900);
ok('la feuille de comptage les rend aussi en s\'ouvrant', /recoverLostCashMovements\(\)/.test(open));

console.log(`\n  ${passed} contrôles verts`);
