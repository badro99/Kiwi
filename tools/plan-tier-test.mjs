#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Vérification des plafonds d'établissements par offre (Plan Tier Gate)
 *
 *   node tools/plan-tier-test.mjs
 *
 * Règles :
 *   1. Kiwi Basic (199 MAD)  → 1 établissement max à la création
 *   2. Kiwi Pro (399 MAD)    → 1 établissement max à la création (même que Basic)
 *   3. Kiwi Ultra (1 499 MAD)→ Illimité
 *   4. Kiwi Ultimate         → Illimité
 *   5. NULL / non renseigné  → Illimité (propriété de sécurité permissive pour l'existant)
 *   6. Opérations d'exécution (ventes, clôtures, caisse) → JAMAIS bloquées
 * ═══════════════════════════════════════════════════════════════════════════ */

import { makeSession, sessionCookie } from '../functions/auth/_lib.js';
import { onRequestPost as postConfig } from '../functions/api/config.js';

const SECRET = 'test-secret-for-plan-tier-tests-32b';
let pass = 0;
const fails = [];

function assert(name, condition, extra) {
  if (condition) {
    pass++;
  } else {
    fails.push(`${name}${extra ? ` — ${extra}` : ''}`);
  }
}

function makeMockDB() {
  const state = {
    accounts: {},
    merchant_config: [],
    staff_pins: [],
    store_docs: []
  };

  const db = {
    _state: state,
    async batch(stmts) {
      for (const s of stmts) {
        if (s && s.run) await s.run();
      }
      return stmts.map(() => ({ success: true }));
    },
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      let binds = [];
      const stmt = {
        bind(...args) {
          binds = args;
          return stmt;
        },
        async run() {
          if (q.startsWith('INSERT INTO merchant_config') || q.startsWith('UPDATE merchant_config')) {
            const merchant = binds[0];
            let existing = state.merchant_config.find(m => m.merchant === merchant);
            if (!existing) {
              existing = {
                merchant,
                features: binds[1],
                plan: null,
                type: null,
                account_id: binds[2] || null,
                name: binds[3] || null,
                status: binds[4] || null
              };
              state.merchant_config.push(existing);
            } else {
              if (binds[2]) existing.account_id = binds[2];
              if (binds[3]) existing.name = binds[3];
              if (binds[4]) existing.status = binds[4];
            }
            return { success: true };
          }
          return { success: true };
        },
        async first() {
          if (q.startsWith('SELECT business, created_ts FROM accounts WHERE id = ?') || q.startsWith('SELECT business, email FROM accounts WHERE id = ?')) {
            return state.accounts[binds[0]] || null;
          }
          if (q.startsWith('SELECT account_id FROM merchant_config WHERE merchant = ?')) {
            const r = state.merchant_config.find(m => m.merchant === binds[0]);
            return r ? { account_id: r.account_id } : null;
          }
          if (q.startsWith('SELECT COUNT(*) AS n FROM merchant_config WHERE account_id = ?')) {
            const count = state.merchant_config.filter(m => m.account_id === binds[0]).length;
            return { n: count };
          }
          if (q.startsWith('SELECT 1 AS configured FROM store_docs')) {
            return null;
          }
          return null;
        },
        async all() {
          if (q.startsWith('SELECT plan FROM merchant_config WHERE account_id = ? AND (status IS NULL OR status != \'suspended\')')) {
            const rows = state.merchant_config
              .filter(m => m.account_id === binds[0] && m.status !== 'suspended')
              .map(m => ({ plan: m.plan }));
            return { results: rows };
          }
          if (q.startsWith('SELECT pin, name, role FROM staff_pins')) {
            return { results: [] };
          }
          return { results: [] };
        }
      };
      return stmt;
    }
  };

  return db;
}

async function runTests() {
  console.log('■ Plafonds d\'établissements par offre (Plan Tier Enforcement)');

  // 1. Basic Plan (199 MAD) - 1 venue limit
  {
    const db = makeMockDB();
    const aid = 'acc-basic-1';
    db._state.accounts[aid] = { business: 'Boutique Alpha', email: 'alpha@test.ma', created_ts: Date.now() };
    const sess = await makeSession(aid, SECRET);
    const headers = { Cookie: sessionCookie(sess).split(';')[0], 'content-type': 'application/json' };

    // Create 1st store -> Allowed
    const res1 = await postConfig({
      request: new Request('https://kiwi-os.com/api/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fresh: true, name: 'Boutique Alpha', merchant: 'boutique-alpha' })
      }),
      env: { DB: db, AUTH_SECRET: SECRET }
    });
    const d1 = await res1.json();
    assert('Basic 0 store -> 1st store created', res1.status === 200 && d1.ok === true);

    // Explicitly set plan to basic on store 1
    const s1 = db._state.merchant_config.find(m => m.merchant === 'boutique-alpha');
    if (s1) s1.plan = 'basic';

    // Create 2nd store -> Blocked with 403
    const res2 = await postConfig({
      request: new Request('https://kiwi-os.com/api/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fresh: true, name: 'Boutique Beta', merchant: 'boutique-beta' })
      }),
      env: { DB: db, AUTH_SECRET: SECRET }
    });
    const d2 = await res2.json();
    assert('Basic 1 store -> 2nd store blocked with 403', res2.status === 403 && d2.error === 'plan-limit-exceeded' && d2.tier === 'basic' && d2.max === 1);

    // Syncing existing store 1 -> Always Allowed
    const resSync = await postConfig({
      request: new Request('https://kiwi-os.com/api/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Boutique Alpha', merchant: 'boutique-alpha', pins: [] })
      }),
      env: { DB: db, AUTH_SECRET: SECRET }
    });
    assert('Basic syncing existing store 1 -> Allowed', resSync.status === 200);
  }

  // 2. Pro Plan (399 MAD) - 1 venue limit
  {
    const db = makeMockDB();
    const aid = 'acc-pro-1';
    db._state.accounts[aid] = { business: 'Cafe Pro', email: 'pro@test.ma', created_ts: Date.now() };
    const sess = await makeSession(aid, SECRET);
    const headers = { Cookie: sessionCookie(sess).split(';')[0], 'content-type': 'application/json' };

    // Create 1st store
    await postConfig({
      request: new Request('https://kiwi-os.com/api/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fresh: true, name: 'Cafe Pro', merchant: 'cafe-pro' })
      }),
      env: { DB: db, AUTH_SECRET: SECRET }
    });
    const s1 = db._state.merchant_config.find(m => m.merchant === 'cafe-pro');
    if (s1) s1.plan = 'pro';

    // Create 2nd store -> Blocked with 403
    const res2 = await postConfig({
      request: new Request('https://kiwi-os.com/api/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fresh: true, name: 'Cafe Pro Deux', merchant: 'cafe-pro-deux' })
      }),
      env: { DB: db, AUTH_SECRET: SECRET }
    });
    const d2 = await res2.json();
    assert('Pro 1 store -> 2nd store blocked with 403', res2.status === 403 && d2.error === 'plan-limit-exceeded' && d2.tier === 'pro' && d2.max === 1);
  }

  // 3. Ultra Plan (1 499 MAD) - Unlimited venues
  {
    const db = makeMockDB();
    const aid = 'acc-ultra-1';
    db._state.accounts[aid] = { business: 'Groupe Atlas', email: 'ultra@test.ma', created_ts: Date.now() };
    const sess = await makeSession(aid, SECRET);
    const headers = { Cookie: sessionCookie(sess).split(';')[0], 'content-type': 'application/json' };

    // Setup 3 existing stores on Ultra
    db._state.merchant_config.push(
      { merchant: 'atlas-casa', account_id: aid, plan: 'ultra', status: 'active' },
      { merchant: 'atlas-rabat', account_id: aid, plan: 'ultra', status: 'active' },
      { merchant: 'atlas-tanger', account_id: aid, plan: 'ultra', status: 'active' }
    );

    // Create 4th store -> Allowed
    const res4 = await postConfig({
      request: new Request('https://kiwi-os.com/api/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fresh: true, name: 'Atlas Marrakech', merchant: 'atlas-marrakech' })
      }),
      env: { DB: db, AUTH_SECRET: SECRET }
    });
    assert('Ultra with 3 stores -> 4th store allowed', res4.status === 200);
  }

  // 4. Ultimate Plan - Unlimited venues
  {
    const db = makeMockDB();
    const aid = 'acc-ultimate-1';
    db._state.accounts[aid] = { business: 'Holdings', email: 'ceo@holdings.ma', created_ts: Date.now() };
    const sess = await makeSession(aid, SECRET);
    const headers = { Cookie: sessionCookie(sess).split(';')[0], 'content-type': 'application/json' };

    db._state.merchant_config.push(
      { merchant: 'site-1', account_id: aid, plan: 'ultimate', status: 'active' },
      { merchant: 'site-2', account_id: aid, plan: 'ultimate', status: 'active' }
    );

    const res3 = await postConfig({
      request: new Request('https://kiwi-os.com/api/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fresh: true, name: 'Site 3', merchant: 'site-3' })
      }),
      env: { DB: db, AUTH_SECRET: SECRET }
    });
    assert('Ultimate with 2 stores -> 3rd store allowed', res3.status === 200);
  }

  // 5. CRITICAL SAFETY TEST: NULL / Unassigned Plan (Legacy Merchants)
  {
    const db = makeMockDB();
    const aid = 'acc-legacy-multi';
    db._state.accounts[aid] = { business: 'Client Historique', email: 'legacy@test.ma', created_ts: Date.now() };
    const sess = await makeSession(aid, SECRET);
    const headers = { Cookie: sessionCookie(sess).split(';')[0], 'content-type': 'application/json' };

    // 3 existing stores with NULL plan (identical to our real prod client)
    db._state.merchant_config.push(
      { merchant: 'legacy-store-1', account_id: aid, plan: null, status: 'active' },
      { merchant: 'legacy-store-2', account_id: aid, plan: '', status: 'active' },
      { merchant: 'legacy-store-3', account_id: aid, plan: null, status: 'active' }
    );

    // Create 4th store -> Must be PERMISSIVE and allowed
    const res4 = await postConfig({
      request: new Request('https://kiwi-os.com/api/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fresh: true, name: 'Legacy Store 4', merchant: 'legacy-store-4' })
      }),
      env: { DB: db, AUTH_SECRET: SECRET }
    });
    assert('SAFETY: Legacy NULL-plan account with 3 stores CAN create 4th store', res4.status === 200);
  }

  // 6. Suspended Store does not count against active venue limit
  {
    const db = makeMockDB();
    const aid = 'acc-suspended-test';
    db._state.accounts[aid] = { business: 'Test Suspended', email: 'susp@test.ma', created_ts: Date.now() };
    const sess = await makeSession(aid, SECRET);
    const headers = { Cookie: sessionCookie(sess).split(';')[0], 'content-type': 'application/json' };

    // Store 1 is suspended, plan is basic
    db._state.merchant_config.push(
      { merchant: 'old-store', account_id: aid, plan: 'basic', status: 'suspended' }
    );

    // Create new store -> Allowed because 0 active stores
    const res = await postConfig({
      request: new Request('https://kiwi-os.com/api/config', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fresh: true, name: 'New Store', merchant: 'new-store' })
      }),
      env: { DB: db, AUTH_SECRET: SECRET }
    });
    assert('Basic with 1 suspended store -> 1st active store creation allowed', res.status === 200);
  }

  // Report
  if (fails.length) {
    console.error(`\n✗ ${fails.length} failure(s) in plan tier enforcement:`);
    fails.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  } else {
    console.log(`  ✓ all ${pass} plan tier checks passed cleanly`);
  }
}

runTests().catch(err => {
  console.error('Test harness exception:', err);
  process.exit(1);
});
