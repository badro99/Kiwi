#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * LA CAISSE D'UN VRAI CAFÉ QUI S'OUVRAIT SUR LA CARTE DE DÉMO
 *
 * kiwi-caisse.html fige « démo ou réel » au montage (IS_DEMO), exprès : un
 * appairage en plein service ne doit pas réécrire une carte à moitié servie.
 * Mais « Ouvrir la caisse sur cet appareil » appaire PENDANT l'amorçage
 * (assets/caisse-pairing.js, ?pair=1), donc après ce calcul. Résultat mesuré
 * le 2026-10-10 sur un café neuf : 35 plats de démo à des prix inventés,
 * encaissables, et un onglet titré « Démo commerçant ».
 *
 * Réparation : la page publie son drapeau (__kiwiCaisseBootedAsDemo) et la
 * passation, si elle vient d'appairer une caisse montée en démo, remet la
 * passation en place et recharge UNE fois. Ce fichier tient le contrat et
 * exécute la vraie fonction avec des bouchons.
 *
 *   node tools/caisse-handoff-demo-reload-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pairing = readFileSync(path.join(ROOT, 'assets/caisse-pairing.js'), 'utf8');
const caisse = readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

ok('the till publishes the frozen flag right where it freezes it', () => {
  assert.ok(/const IS_DEMO = !storeIsReal\(\);\s*[\s\S]{0,600}window\.__kiwiCaisseBootedAsDemo = IS_DEMO;/.test(caisse),
    'window.__kiwiCaisseBootedAsDemo must be set from IS_DEMO');
});

ok('a real till is not titled "Démo commerçant"', () => {
  assert.ok(/if \(!IS_DEMO\) \{[\s\S]{0,200}document\.title = 'Kiwi Caisse'/.test(caisse),
    'the real store renames the tab');
});

ok('both hand-off branches reload into the real till after pairing', () => {
  const branches = pairing.match(/applyPairing\('', h2?\)\.venue;\s*\n\s*if \(reloadAsPaired\(h2?\)\) return;/g) || [];
  assert.equal(branches.length, 2, 'wantsPair() and the late hand-off both call reloadAsPaired');
});

/* Run the real reloadAsPaired with stubs. */
function harness({ bootedAsDemo, paired, guard = null }) {
  const m = pairing.match(/var HANDOFF_RELOAD = [^\n]+\n\s*function reloadAsPaired\(h\) \{[\s\S]*?\n {2}\}/);
  assert.ok(m, 'reloadAsPaired found');
  const store = new Map(), session = new Map();
  if (guard) session.set('kiwiHandoffReload', guard);
  let reloads = 0;
  const ctx = {
    window: { __kiwiCaisseBootedAsDemo: bootedAsDemo },
    sessionStorage: { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, String(v)) },
    location: { reload: () => { reloads++; } },
    isPaired: () => paired,
    set: (k, v) => store.set(k, v),
    HANDOFF: 'kiwiPairHandoff',
    Date, JSON, Object,
  };
  vm.createContext(ctx);
  vm.runInContext(m[0] + '\nthis.reloadAsPaired = reloadAsPaired;', ctx);
  const h = { merchant: 'cafe-local-test', name: 'Café', ts: 1 };
  const result = ctx.reloadAsPaired(h);
  return { result, reloads, handoff: store.get('kiwiPairHandoff'), guard: session.get('kiwiHandoffReload') };
}

ok('booted as demo + now paired → hand-off restored, one reload', () => {
  const r = harness({ bootedAsDemo: true, paired: true });
  assert.equal(r.result, true);
  assert.equal(r.reloads, 1);
  const h = JSON.parse(r.handoff);
  assert.equal(h.merchant, 'cafe-local-test');
  assert.ok(h.ts > 1, 'fresh timestamp so the second boot does not treat it as stale');
  assert.equal(r.guard, '1');
});

ok('booted as a real store → no reload (pairing mid-service must not reload)', () => {
  const r = harness({ bootedAsDemo: false, paired: true });
  assert.equal(r.result, false);
  assert.equal(r.reloads, 0);
});

ok('pairing did not stick → no reload loop', () => {
  const r = harness({ bootedAsDemo: true, paired: false });
  assert.equal(r.reloads, 0);
});

ok('already reloaded once this session → never again', () => {
  const r = harness({ bootedAsDemo: true, paired: true, guard: '1' });
  assert.equal(r.reloads, 0);
});

ok('the guard is cleared once a boot comes up real', () => {
  assert.ok(/if \(window\.__kiwiCaisseBootedAsDemo === false\) \{\s*try \{ sessionStorage\.removeItem\(HANDOFF_RELOAD\); \}/.test(pairing));
});

console.log(`\ncaisse-handoff-demo-reload: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
