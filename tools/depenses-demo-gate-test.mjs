#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Tests d'isolation de démonstration Dépenses (CLAUDE.md §6)
 *
 *   node tools/depenses-demo-gate-test.mjs
 *
 * Règle d'or :
 *   Gater Dépenses sur KiwiEnv.isReal(), JAMAIS sur isDemoAccount.
 *   Un commerçant avec un compte réel et un lieu non-personnalisé ne doit
 *   JAMAIS voir les cartes Café Atlas (Hamid Jelloul, Rachid Benhima, etc.).
 * ═══════════════════════════════════════════════════════════════════════════ */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

let pass = 0;
const fails = [];

function assert(name, condition, extra) {
  if (condition) {
    pass++;
  } else {
    fails.push(`${name}${extra ? ` — ${extra}` : ''}`);
  }
}

function runDepensesScenario({ isReal, isCustom, venue }) {
  const code = fs.readFileSync(path.join(ROOT, 'assets', 'depenses.js'), 'utf8');
  let renderedPage = null;

  const sandbox = {
    window: {
      Kiwi: {
        handlers: {},
        appPage: (id, config) => {
          renderedPage = { id, config };
          return { el: { querySelectorAll: () => [] } };
        },
        toast: () => {},
        modal: () => ({ el: {} }),
        confetti: () => {}
      },
      KiwiEnv: {
        isReal: () => isReal
      },
      KiwiVenue: {
        isCustom: () => isCustom,
        getVenue: () => venue,
        getCurrentVenueData: () => ({ name: 'Test Venue' }),
        subscribe: () => {}
      },
      KiwiI18n: {
        getLang: () => 'fr'
      },
      matchMedia: () => ({ matches: false }),
      requestAnimationFrame: (fn) => fn(),
      addEventListener: () => {},
      setTimeout: (fn) => fn()
    },
    document: {
      head: { appendChild: () => {} },
      createElement: () => ({ textContent: '', appendChild: () => {} }),
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => []
    },
    requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn) => fn(),
    console: {
      warn: () => {},
      log: () => {}
    }
  };
  sandbox.this = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  // Trigger nav-depenses
  sandbox.window.Kiwi.handlers['nav-depenses']();
  return renderedPage;
}

function main() {
  console.log('■ Dépenses Demo Isolation Gate Tests (CLAUDE.md §6)');

  // 1. Real Hosted Session (KiwiEnv.isReal = true) -> Starter view ONLY, no demo cards
  {
    const page = runDepensesScenario({ isReal: true, isCustom: false, venue: 'cafeAtlas' });
    const body = page?.config?.body || '';
    assert('Real session does not leak Hamid Jelloul', !body.includes('Hamid Jelloul'));
    assert('Real session does not leak Rachid Benhima', !body.includes('Rachid Benhima'));
    assert('Real session does not leak Métro Cash', !body.includes('Métro Cash'));
    assert('Real session displays starter title', body.includes('Vos dépenses, sous contrôle'));
  }

  // 2. Custom Venue on Real Session -> Starter view ONLY
  {
    const page = runDepensesScenario({ isReal: true, isCustom: true, venue: 'v_custom_1' });
    const body = page?.config?.body || '';
    assert('Custom venue displays starter', body.includes('Vos dépenses, sous contrôle'));
    assert('Custom venue does not leak demo cards', !body.includes('Fatima Khalki'));
  }

  // 3. Local Demo Session on Fusion (KiwiEnv.isReal = false, venue = fusion) -> Ultra portfolio demo
  {
    const page = runDepensesScenario({ isReal: false, isCustom: false, venue: 'fusion' });
    const body = page?.config?.body || '';
    assert('Fusion demo displays portfolio badge', body.includes('EXCLUSIF ULTRA'));
    assert('Fusion demo displays consolidated net', body.includes('NET CONSOLIDÉ'));
  }

  // 4. Local Demo Session on Café Atlas (KiwiEnv.isReal = false, venue = cafeAtlas) -> Single-site demo
  {
    const page = runDepensesScenario({ isReal: false, isCustom: false, venue: 'cafeAtlas' });
    const body = page?.config?.body || '';
    assert('Demo session shows Hamid Jelloul demo card', body.includes('Hamid Jelloul'));
    assert('Demo session shows Métro Cash', body.includes('Métro Cash') || body.includes('M&eacute;tro Cash'));
  }

  if (fails.length) {
    console.error(`\n✗ ${fails.length} failure(s) in depenses isolation tests:`);
    fails.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  } else {
    console.log(`  ✓ all ${pass} depenses demo isolation checks passed cleanly`);
  }
}

main();
