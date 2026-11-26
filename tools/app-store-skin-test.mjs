// L'app native et le design 2027 par commerce (owner, 2026-11-18).
// Sur le web, functions/_middleware.js pose <html data-store-skin="2027"> quand le
// commerce a features.skin2027 ; l'app sert ses pages depuis le bundle, sans ce
// middleware, et ne recevait donc jamais la marque. assets/api-base.js (premier
// script de chaque page du bundle, jamais chargé sur le web) retient l'interrupteur
// du commerce à chaque `kiwi-config` et repose la même marque en tête de page.
// Tenu ici : seule l'app écrit et lit, seules la caisse, la cuisine et l'équipe
// bougent (le tableau de bord reste tel quel, owner 2026-10-27), le changement
// s'applique au démarrage par un seul rechargement, plus tard au prochain lancement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../assets/api-base.js', import.meta.url), 'utf8');
const KEY = 'kiwiAppStoreSkin2027';
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ✓ ' + name); };

function boot({ native = true, path = '/kiwi-caisse.html', stored = null, uptime = 2000, reloaded = false } = {}) {
  const store = new Map(stored == null ? [] : [[KEY, stored]]);
  const session = new Map(reloaded ? [[KEY + ':reloaded', '1']] : []);
  const listeners = {};
  const attrs = {};
  let reloads = 0;
  const storage = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) });
  const document = {
    documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k] ?? null, removeAttribute: (k) => { delete attrs[k]; } },
    querySelectorAll: () => [],
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const window = {
    document,
    localStorage: storage(store),
    sessionStorage: storage(session),
    location: { pathname: path, reload: () => { reloads++; } },
    performance: { now: () => uptime },
  };
  if (native) window.Capacitor = { isNativePlatform: () => true };
  vm.runInNewContext(SRC, { window, document, URL, Request });
  const config = (features) => (listeners['kiwi-config'] || []).forEach((fn) => fn({ detail: { features, loaded: true } }));
  return { attrs, store, session, config, reloads: () => reloads, listeners };
}

ok('un appareil de l’app ouvre la caisse dans le design 2027, par défaut (owner 2026-11-26)', () => {
  for (const path of ['/kiwi-caisse.html', '/kiwi-cuisine.html', '/kiwi-serveur.html', '/kiwi-caisse']) {
    assert.equal(boot({ path }).attrs['data-store-skin'], '2027', path);
    assert.equal(boot({ stored: '1', path }).attrs['data-store-skin'], '2027', path + ' (ancien « 1 »)');
  }
});

ok('un commerce coupé dans kiwi-admin (skin2027: false) garde l’ancien design', () => {
  assert.equal(boot({ stored: '0' }).attrs['data-store-skin'], undefined);
});

ok('le tableau de bord de l’app ne bouge pas', () => {
  assert.equal(boot({ path: '/dashboard.html' }).attrs['data-store-skin'], undefined);
  assert.equal(boot({ path: '/index.html' }).attrs['data-store-skin'], undefined);
});

ok('sur le web, rien n’est lu ni écrit : le serveur reste seul juge', () => {
  const h = boot({ native: false, stored: '0' });
  assert.equal(h.attrs['data-store-skin'], undefined);
  h.config({ skin2027: true });
  assert.equal(h.reloads(), 0);
  assert.equal(h.store.get(KEY), '0', 'storage untouched on the web');
  assert.equal((h.listeners['kiwi-config'] || []).length, 0);
});

ok('l’interrupteur coupé arrive au démarrage : retenu, la page se recharge une fois dans l’ancien design', () => {
  const h = boot();
  assert.equal(h.attrs['data-store-skin'], '2027');
  h.config({ skin2027: false });
  assert.equal(h.store.get(KEY), '0');
  assert.equal(h.reloads(), 1);
  h.config({ skin2027: false });
  assert.equal(h.reloads(), 1, 'the same answer again does not reload');
});

ok('un commerce sans réglage, ou rallumé, revient au design 2027', () => {
  const h = boot({ stored: '0' });
  h.config({});
  assert.equal(h.store.has(KEY), false);
  assert.equal(h.reloads(), 1);
  const g = boot({ stored: '0' });
  g.config({ skin2027: true });
  assert.equal(g.store.has(KEY), false);
  const f = boot();
  f.config({ skin2027: true });
  assert.equal(f.reloads(), 0, 'already 2027: no reload');
  assert.equal(f.store.has(KEY), false);
});

ok('en plein service, le changement attend le prochain lancement au lieu de recharger sous le doigt', () => {
  const h = boot({ uptime: 60000 });
  h.config({ skin2027: false });
  assert.equal(h.store.get(KEY), '0', 'remembered for next launch');
  assert.equal(h.reloads(), 0);
});

ok('jamais deux rechargements dans la même session, même si la réponse change encore', () => {
  const h = boot({ reloaded: true });
  h.config({ skin2027: false });
  assert.equal(h.store.get(KEY), '0');
  assert.equal(h.reloads(), 0);
});

ok('une réponse sans features (hors ligne, serveur neutre) ne touche à rien', () => {
  const h = boot({ stored: '0' });
  for (const l of h.listeners['kiwi-config']) l({ detail: { loaded: true } });
  for (const l of h.listeners['kiwi-config']) l({});
  assert.equal(h.store.get(KEY), '0');
  assert.equal(h.reloads(), 0);
});

console.log(`app-store-skin: ${n} checks ok`);
