#!/usr/bin/env node
/* Browse, 25 nov. 2026 : le routage des imprimantes par poste ne vivait que dans
 * le localStorage de la caisse. assets/printer/station-backup.js en garde une
 * copie au serveur (document « printstations ») :
 *  1. une caisse dont la clé de routage a disparu reprend la copie du serveur ;
 *  2. une caisse dont le routage a été vidé exprès (clé présente) garde son choix ;
 *  3. chaque enregistrement non vide part au serveur, depuis la dernière révision ;
 *  4. une caisse qui a un routage et un serveur sans copie dépose le sien au démarrage ;
 *  5. la caisse charge le module sans nouvelle balise, il est précaché, et le
 *     serveur connaît la fonctionnalité. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const settle = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const SRC = read('assets/printer/station-backup.js');
const ROUTING = { profiles: [{ id: 'prof_k', name: 'Cuisine', type: 'ip', ip: '192.168.11.87', port: 9100 }], bindings: { cuisson: 'prof_k' } };

function till({ local, server }) {
  const store = new Map(local === undefined ? [] : [['kiwiStationPrinters:browse', JSON.stringify(local)]]);
  const doc = { data: server || null, rev: server ? 3 : 0 };
  const posts = [], toasts = [], listeners = {};
  let timer = null;
  const printer = {
    getStationConfig: () => JSON.parse(store.get('kiwiStationPrinters:browse') || '{"profiles":[],"bindings":{}}'),
    setStationConfig: (cfg) => {
      const data = { profiles: cfg.profiles, bindings: cfg.bindings, updatedAt: 1 };
      store.set('kiwiStationPrinters:browse', JSON.stringify(data));
      (listeners['kiwi:station-printers-config'] || []).forEach((fn) => fn({ detail: data }));
    },
  };
  const stack = { appendChild: (el) => toasts.push(el.textContent) };
  const window = {
    KiwiKitchenRelay: { merchant: () => 'browse' }, KiwiPrinter: printer,
    addEventListener: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); },
  };
  const fetch = async (url, init) => {
    if (init && init.method === 'POST') {
      const body = JSON.parse(init.body);
      posts.push(body);
      if (body.baseRev !== doc.rev) return { ok: false, json: async () => ({ error: 'stale', rev: doc.rev }) };
      doc.data = body.data; doc.rev += 1;
      return { ok: true, json: async () => ({ ok: true, rev: doc.rev }) };
    }
    assert.match(url, /feature=printstations&merchant=browse/);
    return { ok: true, json: async () => ({ data: doc.data, rev: doc.rev }) };
  };
  const ctx = {
    window, fetch, JSON, Array, Number, String, Promise,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
    document: { getElementById: (id) => (id === 'toast-stack' ? stack : null), createElement: () => ({ remove() {} }) },
    setTimeout: (fn) => { timer = fn; return 1; },
  };
  vm.runInNewContext(SRC, ctx);
  return { window, store, doc, posts, toasts, boot: () => timer && timer(), printer };
}

// 1. la clé a disparu : la copie du serveur revient, sans être renvoyée aussitôt
{
  const t = till({ local: undefined, server: ROUTING });
  t.boot(); await settle();
  assert.deepEqual(t.printer.getStationConfig().bindings, ROUTING.bindings, 'lost routing comes back from the server');
  assert.equal(t.posts.length, 0, 'a restore is not uploaded again');
  assert.equal(t.toasts.length, 1, 'the till says it restored the routing');
}
// 2. vidé exprès : rien n'est restauré
{
  const t = till({ local: { profiles: [], bindings: {}, updatedAt: 5 }, server: ROUTING });
  t.boot(); await settle();
  assert.equal(t.printer.getStationConfig().profiles.length, 0, 'a deliberately emptied routing stays empty');
  assert.equal(t.posts.length, 0);
}
// 3. un enregistrement part au serveur, depuis la dernière révision ; un vidage reste local
{
  const t = till({ local: ROUTING, server: ROUTING });
  t.boot(); await settle();
  const next = { profiles: ROUTING.profiles.concat([{ id: 'prof_b', name: 'Bar', type: 'ip', ip: '192.168.11.100', port: 9100 }]), bindings: { cuisson: 'prof_k', bar: 'prof_b' } };
  t.printer.setStationConfig(next); await settle();
  assert.equal(t.posts.length, 1);
  assert.equal(t.posts[0].baseRev, 3, 'written from the revision it read');
  assert.deepEqual(t.doc.data.bindings, next.bindings, 'the server copy follows the till');
  t.printer.setStationConfig({ profiles: [], bindings: {} }); await settle();
  assert.equal(t.posts.length, 1, 'an emptied routing is not pushed over the saved copy');
}
// 4. premier passage : la caisse dépose son routage quand le serveur n'a rien
{
  const t = till({ local: ROUTING, server: null });
  t.boot(); await settle();
  assert.equal(t.posts.length, 1, 'the first boot seeds the server copy');
  assert.deepEqual(t.doc.data.bindings, ROUTING.bindings);
}
// 5. câblage
{
  assert.match(read('assets/kitchen-print-queue.js'), /\/assets\/printer\/station-backup\.js\?v=\d+/, 'the till loads it without a new script tag');
  assert.match(read('kiwi-sw.js'), /'\/assets\/printer\/station-backup\.js\?v=\d+'/, 'precached for offline starts');
  assert.match(read('functions/api/store.js'), /printstations: \{ keys: \['profiles', 'bindings'\]/, 'the server knows the document');
}
console.log('✓ station-backup: lost routing restored from the server, a deliberate empty kept, saves uploaded from the last revision, first boot seeds the copy');
