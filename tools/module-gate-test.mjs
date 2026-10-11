#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * MODULES COUPLÉS PAR L'OPÉRATEUR · LA PORTE TIENT
 *
 * assets/merchant-config.js promet : « un module coupé ne s'ouvre plus, d'où
 * qu'on frappe » (⌘K, carte de l'accueil, Kiwi AI : tout passe par
 * `Kiwi.handlers[nom]`). La garde n'enveloppait pourtant la valeur qu'UNE fois,
 * à l'arrivée de la config. conformite.js et operations-ui.js réécrivent
 * `nav-conformite` / `nav-terminaux` après, et leur version n'était pas gardée :
 * mesuré dans le navigateur, module coupé, les deux pages s'ouvraient.
 *
 * Ce fichier exécute le VRAI merchant-config.js dans un `vm` et rejoue l'ordre
 * qui a trahi la garde : config reçue d'abord, handler réécrit ensuite.
 *
 *   node tools/module-gate-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(path.join(ROOT, 'assets/merchant-config.js'), 'utf8');

let passed = 0, failed = 0;
async function ok(label, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/* Un « navigateur » juste assez grand pour que le fichier tourne : la config
   répond, les handlers existent déjà (pages-pro.js les a posés), et rien
   d'autre n'est branché. */
function boot(features) {
  const listeners = {};
  const calls = [];
  const H = {
    'nav-conformite': () => calls.push('pages-pro:conformite'),
    'nav-terminaux': () => calls.push('pages-pro:terminaux'),
    'nav-stock': () => calls.push('stock'),
  };
  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval, URLSearchParams, Promise,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    location: { search: '', pathname: '/dashboard.html' },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: {
      readyState: 'complete', body: { classList: { add() {}, remove() {} } },
      querySelectorAll: () => [], querySelector: () => null,
      addEventListener() {}, dispatchEvent() {},
    },
    fetch: async (url) => ({
      ok: true,
      json: async () => (/accountPins/.test(String(url)) ? { pins: [] } : { features, pins: [] }),
    }),
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  sandbox.Kiwi = { handlers: H };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return { sandbox, H, calls, fire: (type) => (listeners[type] || []).forEach((fn) => fn({})) };
}

await ok('un module coupé ferme son handler dès l\'arrivée de la config', async () => {
  const { H, calls } = boot({ conformite: false });
  await tick();
  H['nav-conformite']();
  assert.deepEqual(calls, [], 'le handler d\'origine ne doit pas s\'exécuter');
  H['nav-stock']();
  assert.deepEqual(calls, ['stock'], 'un module qui n\'est pas coupé reste ouvert');
});

await ok('un handler RÉÉCRIT après la config reste fermé (le bug mesuré : conformite.js, operations-ui.js)', async () => {
  const { H, calls } = boot({ conformite: false, terminaux: false });
  await tick();
  H['nav-conformite'] = () => calls.push('conformite.js');
  H['nav-terminaux'] = () => calls.push('operations-ui.js');
  H['nav-conformite']();
  H['nav-terminaux']();
  assert.deepEqual(calls, [], 'la version tardive ne doit pas s\'exécuter');
  assert.equal(H['nav-conformite'].__kiwiGate, 'conformite');
  assert.equal(H['nav-terminaux'].__kiwiGate, 'terminaux');
});

await ok('rallumer le module le rouvre aussitôt, sans rien restaurer', async () => {
  const { sandbox, H, calls } = boot({ conformite: false });
  await tick();
  H['nav-conformite'] = () => calls.push('conformite.js');
  H['nav-conformite']();
  assert.deepEqual(calls, []);
  sandbox.KiwiConfig.features = { conformite: true };
  H['nav-conformite']();
  assert.deepEqual(calls, ['conformite.js']);
});

await ok('une config jamais arrivée (hors ligne, hôte statique) ne ferme rien', async () => {
  const { sandbox, H, calls } = boot({});
  sandbox.fetch = async () => { throw new Error('offline'); };
  await tick();
  H['nav-conformite']();
  assert.deepEqual(calls, ['pages-pro:conformite']);
});

await ok('un handler enregistré APRÈS la config est gardé au chargement complet', async () => {
  const { H, calls, fire } = boot({ terminaux: false });
  await tick();
  delete H['nav-terminaux'];
  H['terminal-catalog'] = () => calls.push('catalogue matériel');
  fire('load');
  H['terminal-catalog']();
  assert.deepEqual(calls, [], 'la fiche matériel de démonstration ferme avec le module Terminaux');
});

await ok('les marqueurs __kiwi* du handler gardé survivent (production-action-guard ne se ré-enveloppe pas)', async () => {
  const { H } = boot({ conformite: false });
  await tick();
  const guarded = () => {}; guarded.__kiwiProductionHonesty = true;
  H['nav-conformite'] = guarded;
  assert.equal(H['nav-conformite'].__kiwiProductionHonesty, true);
  assert.equal(H['nav-conformite'], H['nav-conformite'], 'l\'identité de l\'enveloppe est stable entre deux lectures');
});

await ok('l\'alias de Terminaux ne vise plus un handler qui n\'a jamais existé', () => {
  assert.ok(!/['"]nav-terminals['"]/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')), 'nav-terminals n\'existe nulle part');
  assert.match(SRC, /terminaux:\s*\['terminal-catalog',\s*'add-terminal'\]/);
});

console.log(`\n${failed ? '✗' : '✓'} module-gate-test · ${passed} passés, ${failed} échoués`);
process.exit(failed ? 1 : 0);
