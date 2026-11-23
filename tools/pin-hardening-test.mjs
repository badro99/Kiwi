import { missingMigratedTables } from './fixtures/migrated-tables.cjs';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onRequestPost as verifyPinPost } from '../functions/api/pin/verify.js';
import { onRequestPost as cancelPost } from '../functions/api/sale/cancel.js';
import { tillToken, makeSession, sessionCookie, hashPassword } from '../functions/auth/_lib.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
function check(desc, cond) {
  if (cond) {
    console.log('  ✓ ' + desc);
  } else {
    console.log('  ✗ ' + desc);
    failures.push(desc);
  }
}

// In-memory SQLite simulating D1 database
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    business TEXT,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    created_ts INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    session_epoch INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE staff_pins (
    id TEXT PRIMARY KEY,
    merchant TEXT NOT NULL,
    pin TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL,
    created_ts INTEGER NOT NULL
  );

  CREATE TABLE pair_attempts (
    ip TEXT PRIMARY KEY,
    fails INTEGER NOT NULL DEFAULT 0,
    first_ts INTEGER NOT NULL,
    blocked_until INTEGER
  );

  CREATE TABLE sales (
    id TEXT PRIMARY KEY,
    merchant TEXT NOT NULL,
    amount INTEGER NOT NULL,
    amount_cents INTEGER,
    method TEXT NOT NULL,
    label TEXT,
    ref TEXT,
    ts INTEGER NOT NULL,
    lines TEXT,
    channel TEXT,
    void_ts INTEGER,
    void_reason TEXT,
    void_note TEXT,
    void_actor TEXT,
    void_actor_id TEXT
  );

  CREATE TABLE sale_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    merchant TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT NOT NULL,
    note TEXT NOT NULL,
    actor TEXT NOT NULL,
    actor_id TEXT,
    amount INTEGER NOT NULL,
    amount_cents INTEGER,
    method TEXT NOT NULL,
    ref TEXT,
    sale_ts INTEGER NOT NULL,
    impact TEXT,
    ts INTEGER NOT NULL
  );
`);

// Seed test fixtures
const AUTH_SECRET = 'pin-test-secret-32-chars-long!!';
const now = Date.now();

// 1. Account fixture
const accCreds = await hashPassword('OwnerPassword123');
sqlite.prepare(`
  INSERT INTO accounts (id, email, business, salt, hash, created_ts, status, session_epoch)
  VALUES ('acc-1', 'owner@cafe-atlas.ma', 'Café Atlas', ?, ?, ?, 'active', 0)
`).run(accCreds.salt, accCreds.hash, now);

// 2. Staff PIN fixtures
sqlite.prepare(`
  INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts)
  VALUES
    ('pin-1', 'cafe-atlas', '1234', 'Karim B.', 'Manager', ?),
    ('pin-2', 'cafe-atlas', '5678', 'Samira L.', 'Caissier', ?),
    ('pin-3', 'other-shop', '9999', 'Other Staff', 'Caissier', ?)
`).run(now, now, now);

// 2b. Store registry — one account, two établissements. C'est la forme que la
//     porte du dashboard doit savoir traverser : le code du patron n'est déposé
//     qu'une fois, sous la boutique qui existait ce jour-là.
sqlite.exec(`
  CREATE TABLE merchant_config (
    merchant TEXT PRIMARY KEY,
    features TEXT,
    plan TEXT,
    type TEXT,
    account_id TEXT,
    name TEXT,
    status TEXT,
    updated_ts INTEGER,
    till_epoch INTEGER NOT NULL DEFAULT 0
  );
`);
  missingMigratedTables(sqlite);
sqlite.prepare(`
  INSERT INTO merchant_config (merchant, features, account_id, name, updated_ts)
  VALUES ('cafe-atlas', '{}', 'acc-1', 'Café Atlas', ?),
         ('atlas-medina', '{}', 'acc-1', 'Atlas Médina', ?),
         ('other-shop', '{}', 'acc-2', 'Other Shop', ?)
`).run(now, now, now);
sqlite.prepare(`
  INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts)
  VALUES ('pin-4', 'atlas-medina', '4321', 'Rachid O.', 'Proprietaire', ?)
`).run(now);

// 3. Sale fixture for cancel tests
sqlite.prepare(`
  INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines)
  VALUES ('sale-1', 'cafe-atlas', 100, 10000, 'cash', 'Table 1', '0001', ?, '[{"n":"Couscous","q":1,"t":100}]')
`).run(now);

// Wrap SQLite to match Cloudflare D1 interface
const env = {
  AUTH_SECRET,
  DB: {
    prepare(query) {
      const stmt = sqlite.prepare(query);
      return {
        bind(...params) {
          return {
            async first() {
              return stmt.get(...params);
            },
            async all() {
              return { results: stmt.all(...params) };
            },
            async run() {
              const res = stmt.run(...params);
              return {
                meta: { changes: res.changes, last_row_id: res.lastInsertRowid },
                changes: res.changes,
                success: true,
              };
            },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        try { sqlite.exec('ROLLBACK'); } catch (_) {}
        throw error;
      }
    },
  },
};

const tillCookieVal = await tillToken(AUTH_SECRET, 'cafe-atlas');
const ownerSessToken = await makeSession('acc-1', AUTH_SECRET);

console.log('\n1 · Server-Side PIN Verification (/api/pin/verify)');

{
  // Valid PIN from paired till
  const req = new Request('https://kiwi.test/api/pin/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `kiwi_till=${tillCookieVal}`,
      'CF-Connecting-IP': '10.0.0.1',
    },
    body: JSON.stringify({ merchant: 'cafe-atlas', pin: '1234' }),
  });
  const res = await verifyPinPost({ request: req, env });
  const data = await res.json();
  check('accepts valid staff PIN from paired till', res.status === 200 && data.ok === true);
  check('returns staff identity (id, name, role)', data.staff && data.staff.name === 'Karim B.' && data.staff.role === 'Manager');
  check('NEVER returns plaintext PIN in response payload', data.staff && data.staff.pin === undefined && data.pin === undefined);
}

{
  // Wrong PIN
  const req = new Request('https://kiwi.test/api/pin/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `kiwi_till=${tillCookieVal}`,
      'CF-Connecting-IP': '10.0.0.2',
    },
    body: JSON.stringify({ merchant: 'cafe-atlas', pin: '0000' }),
  });
  const res = await verifyPinPost({ request: req, env });
  check('rejects incorrect PIN with 401 bad-pin', res.status === 401);
}

{
  // Forbidden caller (no till cookie, no session)
  const req = new Request('https://kiwi.test/api/pin/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '10.0.0.3',
    },
    body: JSON.stringify({ merchant: 'cafe-atlas', pin: '1234' }),
  });
  const res = await verifyPinPost({ request: req, env });
  check('rejects unauthorized caller without till proof (403 forbidden-till)', res.status === 403);
}

{
  // Cross-tenant PIN attempt (PIN belonging to other-shop tested against cafe-atlas)
  const req = new Request('https://kiwi.test/api/pin/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `kiwi_till=${tillCookieVal}`,
      'CF-Connecting-IP': '10.0.0.4',
    },
    body: JSON.stringify({ merchant: 'cafe-atlas', pin: '9999' }),
  });
  const res = await verifyPinPost({ request: req, env });
  check('cross-tenant PIN is rejected with 401', res.status === 401);
}

{
  // Authenticated owner session can verify
  const req = new Request('https://kiwi.test/api/pin/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `kiwi_sess=${ownerSessToken}`,
      'CF-Connecting-IP': '10.0.0.5',
    },
    body: JSON.stringify({ merchant: 'cafe-atlas', pin: '5678' }),
  });
  const res = await verifyPinPost({ request: req, env });
  const data = await res.json();
  check('authenticated owner session can verify PIN', res.status === 200 && data.staff && data.staff.name === 'Samira L.');
}

{
  // Owner and manager PINs from any store of the account can unlock the caisse
  const req = new Request('https://kiwi.test/api/pin/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `kiwi_till=${tillCookieVal}`,
      'CF-Connecting-IP': '10.0.0.6',
    },
    body: JSON.stringify({ merchant: 'cafe-atlas', pin: '4321' }), // 4321 is Owner Rachid O. filed on atlas-medina
  });
  const res = await verifyPinPost({ request: req, env });
  const data = await res.json();
  check('owner PIN from another account store opens the caisse', res.status === 200 && data.ok === true && data.staff && data.staff.name === 'Rachid O.');
}

{
  /* Council rating 14: the account-wide fallback accepted any role that opens
   * a till, so a cashier of one store unlocked every sibling store's till.
   * Only owner and manager codes travel between stores. */
  sqlite.prepare("INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES ('pin-x-cash', 'atlas-medina', '8642', 'Nadia K.', 'Caissière', ?), ('pin-x-mgr', 'atlas-medina', '9753', 'Omar G.', 'Gérante', ?)").run(now, now);
  const tryPin = async (pin) => {
    const req = new Request('https://kiwi.test/api/pin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `kiwi_till=${tillCookieVal}`, 'CF-Connecting-IP': '10.0.0.6' },
      body: JSON.stringify({ merchant: 'cafe-atlas', pin }),
    });
    const res = await verifyPinPost({ request: req, env });
    return { status: res.status, data: await res.json() };
  };
  const cashier = await tryPin('8642');
  check('a sibling store cashier PIN does NOT open this store’s caisse', cashier.status === 401 && cashier.data.ok !== true && !cashier.data.staff);
  const manager = await tryPin('9753');
  check('a sibling store manager PIN still opens it', manager.status === 200 && manager.data.staff && manager.data.staff.name === 'Omar G.');
  sqlite.prepare("DELETE FROM staff_pins WHERE id IN ('pin-x-cash', 'pin-x-mgr')").run();
}

console.log('\n1b · Account-wide verification (the dashboard lock)');

/* Le tableau de bord embrasse tous les établissements du compte, alors que les
   codes sont rangés par boutique. Cette question-là recevait autrefois sa réponse
   en RECEVANT les codes (GET /api/config?accountPins=owners) et en comparant dans
   le navigateur. Elle se pose maintenant ici. */
const accountVerify = (body, headers = {}) => verifyPinPost({
  request: new Request('https://kiwi.test/api/pin/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.0.1', ...headers },
    body: JSON.stringify(body),
  }),
  env,
});

{
  const res = await accountVerify({ pin: '4321' }, { Cookie: sessionCookie(ownerSessToken) });
  const data = await res.json();
  check('owner session resolves a code filed under ANOTHER of its own stores',
    res.status === 200 && data.ok === true && data.staff && data.staff.name === 'Rachid O.');
  check('…and names which store it was found in', data.merchant === 'atlas-medina');
  check('…without echoing the code back',
    data.pin === undefined && data.staff.pin === undefined && !JSON.stringify(data).includes('4321'));
}

{
  const res = await accountVerify({ pin: '1234' }, { Cookie: sessionCookie(ownerSessToken) });
  const data = await res.json();
  check('…and still resolves a code in the account\u2019s original store',
    res.status === 200 && data.ok === true && data.staff.name === 'Karim B.');
}

{
  const res = await accountVerify({ pin: '9999' }, { Cookie: sessionCookie(ownerSessToken) });
  check('another account\u2019s code is refused (401), slug or no slug', res.status === 401);
}

{
  const res = await accountVerify({ pin: '4321' });
  check('no session at all \u2192 401, never a roster read', res.status === 401);
}

{
  const res = await accountVerify({ pin: '99' }, { Cookie: sessionCookie(ownerSessToken) });
  check('a malformed code is refused before any database read', res.status === 401);
}

/* « Ce compte a-t-il au moins un code ? » : c'est le SERVEUR qui le dit à la porte du
   dashboard (un compte sans aucun code doit pouvoir rejoindre son installation).
   Seul « aucun » est rapporté ; un compte configuré ne reçoit aucun champ. */
{
  const wrong = await accountVerify({ pin: '5555' }, { Cookie: sessionCookie(ownerSessToken) });
  const wrongData = await wrong.json();
  check('a configured account\u2019s refusal says nothing about configuration (door stays closed)',
    wrong.status === 401 && wrongData.error === 'bad-pin' && !('configured' in wrongData));

  const emptyCreds = await hashPassword('FreshPassword123');
  sqlite.prepare("INSERT INTO accounts (id, email, business, salt, hash, created_ts, status, session_epoch) VALUES ('acc-empty', 'new@fresh.ma', 'Fresh', ?, ?, ?, 'active', 0)")
    .run(emptyCreds.salt, emptyCreds.hash, Date.now());
  const freshSess = await makeSession('acc-empty', AUTH_SECRET);
  const fresh = await accountVerify({ pin: '5555' }, { Cookie: sessionCookie(freshSess) });
  const freshData = await fresh.json();
  check('an account with NO code at all is told so (configured:false) and still refused (401)',
    fresh.status === 401 && freshData.configured === false && freshData.error === 'bad-pin');
  check('…and the answer never carries a code or a roster', !JSON.stringify(freshData).match(/\d{4}/));

  sqlite.prepare("INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts) VALUES ('p-cashier-only', 'fresh', '2468', 'Sara', 'staff', ?)").run(Date.now());
  const withCashier = await accountVerify({ pin: '5555' }, { Cookie: sessionCookie(freshSess) });
  const withCashierData = await withCashier.json();
  check('a shop whose only codes are cashiers is configured: no allowance, door closed',
    withCashier.status === 401 && !('configured' in withCashierData));
  sqlite.prepare("DELETE FROM staff_pins WHERE id = 'p-cashier-only'").run();
  sqlite.prepare("DELETE FROM accounts WHERE id = 'acc-empty'").run();
}

console.log('\n2 · Attempt Rate-Limiting on Verification');

{
  sqlite.prepare('DELETE FROM pair_attempts').run();
  const testIp = '192.168.1.100';
  // Send 8 failed attempts
  for (let i = 0; i < 8; i++) {
    const req = new Request('https://kiwi.test/api/pin/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `kiwi_till=${tillCookieVal}`,
        'CF-Connecting-IP': testIp,
      },
      body: JSON.stringify({ merchant: 'cafe-atlas', pin: '0000' }),
    });
    const res = await verifyPinPost({ request: req, env });
    if (res.status !== 401) {
      check('fail attempt ' + (i + 1) + ' returns 401', false);
      break;
    }
  }

  // 9th attempt must receive 429
  const blockedReq = new Request('https://kiwi.test/api/pin/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `kiwi_till=${tillCookieVal}`,
      'CF-Connecting-IP': testIp,
    },
    body: JSON.stringify({ merchant: 'cafe-atlas', pin: '1234' }), // even with valid PIN
  });
  const blockedRes = await verifyPinPost({ request: blockedReq, env });
  const blockedData = await blockedRes.json();
  check('9th attempt is blocked with 429 too_many_attempts', blockedRes.status === 429 && blockedData.error === 'too_many_attempts');
  check('returns retry_after header or field', typeof blockedData.retry_after === 'number');

  // 1. Fabricated cookie rotation CANNOT bypass IP rate-limiting on unauthenticated scopes:
  const attackerIp = '203.0.113.42';
  for (let i = 0; i < 8; i++) {
    const fakeCookie = `kiwi_sess=fake-session-${i}-${Math.random().toString(36).slice(2)}; kiwi_till=fake-till-${i}`;
    const req = new Request('https://kiwi.test/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: fakeCookie,
        'CF-Connecting-IP': attackerIp,
      },
    });
    // Record fail under 'login' scope
    await (async () => {
      const { limitFail } = await import('../functions/auth/_lib.js');
      await limitFail(req, env, 'login');
    })();
  }

  // 9th attempt with yet another new fake cookie MUST be blocked by IP
  const { limitCheck } = await import('../functions/auth/_lib.js');
  const probeReq = new Request('https://kiwi.test/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `kiwi_sess=yet-another-fake-token-${Math.random()}`,
      'CF-Connecting-IP': attackerIp,
    },
  });
  const blockedLogin = await limitCheck(probeReq, env, 'login');
  check('rotating fabricated cookies CANNOT bypass IP rate-limiter on login', blockedLogin !== null && blockedLogin.status === 429);

  // 2. Manager on same shop IP is NOT locked out from voiding by till mistakes
  const sharedShopIp = '192.168.50.1';
  // Till makes 8 wrong attempts
  for (let i = 0; i < 8; i++) {
    const req = new Request('https://kiwi.test/api/pin/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `kiwi_till=${tillCookieVal}`,
        'CF-Connecting-IP': sharedShopIp,
      },
      body: JSON.stringify({ merchant: 'cafe-atlas', pin: '0000' }),
    });
    await verifyPinPost({ request: req, env });
  }

  // Till is throttled on 9th attempt
  const tillBlocked = await verifyPinPost({
    request: new Request('https://kiwi.test/api/pin/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `kiwi_till=${tillCookieVal}`,
        'CF-Connecting-IP': sharedShopIp,
      },
      body: JSON.stringify({ merchant: 'cafe-atlas', pin: '1234' }),
    }),
    env,
  });
  check('Till is throttled after 8 failed attempts', tillBlocked.status === 429);

  // Manager on same shop IP using authenticated session is NOT locked out from voiding
  const mgrCancel = await cancelPost({
    request: new Request('https://kiwi.test/api/sale/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `kiwi_sess=${ownerSessToken}`,
        'CF-Connecting-IP': sharedShopIp,
      },
      body: JSON.stringify({ merchant: 'cafe-atlas', id: 'sale-1', source: 'dashboard' }),
    }),
    env,
  });
  check('Manager on same shop IP can void sale without lockout', mgrCancel.status === 200);
  sqlite.prepare('UPDATE sales SET void_ts = NULL WHERE id = ?').run('sale-1');

  // Clear IP block for next tests
  sqlite.prepare('DELETE FROM pair_attempts').run();
}

/* r19 pairing#A0 / team#A0: one cashier's typos lock that device only, while a
 * guess spread over many devices still hits the shared store ceiling. */
{
  const { tillDeviceToken } = await import('../functions/auth/_lib.js');
  sqlite.prepare('DELETE FROM pair_attempts').run();
  const post = async (device, pin, ip) => verifyPinPost({
    request: new Request('https://kiwi.test/api/pin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `kiwi_till=${await tillDeviceToken(AUTH_SECRET, 'cafe-atlas', 0, device)}`, 'CF-Connecting-IP': ip },
      body: JSON.stringify({ merchant: 'cafe-atlas', pin }),
    }),
    env,
  });
  for (let i = 0; i < 8; i++) await post('term_cashier_one_x', '0000', '10.1.0.1');
  check('one device is blocked after 8 typos', (await post('term_cashier_one_x', '1234', '10.1.0.1')).status === 429);
  const other = await post('term_cashier_two_x', '1234', '10.1.0.2');
  check('another till of the same shop still verifies a valid code', other.status === 200);
  const otherTypo = await post('term_cashier_two_x', '0000', '10.1.0.2');
  check('and a wrong code there is a plain 401, not a lockout', otherTypo.status === 401);

  sqlite.prepare('DELETE FROM pair_attempts').run();
  let first429 = 0;
  for (let i = 1; i <= 40 && !first429; i++) {
    const r = await post('term_spread_' + String(i).padStart(4, '0') + 'x', '0000', '10.2.0.' + i);
    if (r.status === 429) first429 = i;
  }
  check('guessing spread over many devices is still stopped by the store ceiling (16)', first429 === 17);
  sqlite.prepare('DELETE FROM pair_attempts').run();
  for (const [dev, n, ip] of [['term_three_a_xx', 6, '10.3.0.1'], ['term_three_b_xx', 6, '10.3.0.2'], ['term_three_c_xx', 4, '10.3.0.3']]) {
    for (let i = 0; i < n; i++) await post(dev, '0000', ip);
  }
  check('failures spread over 3 devices (6+6+4) stop at 16 store-wide', (await post('term_three_d_xx', '1234', '10.3.0.4')).status === 429);
  sqlite.prepare('DELETE FROM pair_attempts').run();
  const legacy = (ip, pin) => verifyPinPost({ request: new Request('https://kiwi.test/api/pin/verify', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `kiwi_till=${tillCookieVal}`, 'CF-Connecting-IP': ip }, body: JSON.stringify({ merchant: 'cafe-atlas', pin }) }), env });
  for (let i = 0; i < 8; i++) await legacy('10.4.0.' + i, '0000');
  check('legacy cookies from 8 different IPs share one 8-try bucket', (await legacy('10.4.9.9', '1234')).status === 429);
  sqlite.prepare('DELETE FROM pair_attempts').run();
  const sess = (pin) => verifyPinPost({ request: new Request('https://kiwi.test/api/pin/verify', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie(ownerSessToken), 'CF-Connecting-IP': '10.5.0.1' }, body: JSON.stringify({ merchant: 'cafe-atlas', pin }) }), env });
  let last = 0; for (let i = 0; i < 8; i++) last = (await sess('0000')).status;
  check('session path keeps the 8-try ceiling', last === 401 && (await sess('1234')).status === 429);
  sqlite.prepare('DELETE FROM pair_attempts').run();
}

/* Pasta Corner, 23 Nov 2026 : huit fautes de serveurs fermaient la tablette
 * quinze minutes en plein service. Une faute de code ne coûte plus qu'une
 * pause courte qui monte (10, 20, 40, 60 s au plus), jamais un quart d'heure ;
 * les autres portes (connexion, opérateur) gardent leurs quinze minutes. */
{
  const { tillDeviceToken, limitFail } = await import('../functions/auth/_lib.js');
  sqlite.prepare('DELETE FROM pair_attempts').run();
  const post = async (pin) => verifyPinPost({
    request: new Request('https://kiwi.test/api/pin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `kiwi_till=${await tillDeviceToken(AUTH_SECRET, 'cafe-atlas', 0, 'term_busy_floor_x')}`, 'CF-Connecting-IP': '10.6.0.1' },
      body: JSON.stringify({ merchant: 'cafe-atlas', pin }),
    }),
    env,
  });
  const waitAfter = async () => { const r = await post('1234'); return r.status === 429 ? (await r.json()).retry_after : 0; };
  /* « Attendre » la pause sans dormir : on la fait expirer en base. */
  const expire = () => sqlite.prepare('UPDATE pair_attempts SET blocked_until = 1 WHERE blocked_until IS NOT NULL').run();
  for (let i = 0; i < 8; i++) await post('0000');
  const w1 = await waitAfter();
  check(`after 8 typos the till pauses seconds, not minutes (${w1} s)`, w1 > 0 && w1 <= 10);
  const seen = [];
  for (let i = 0; i < 5; i++) { expire(); await post('0000'); seen.push(await waitAfter()); }
  check(`each further typo raises the pause, capped at a minute (${seen.join(', ')} s)`,
    seen[0] <= 20 && seen[1] <= 40 && seen.every((w) => w > 0 && w <= 60) && seen[4] > 40);
  expire();
  check('once the pause is over the right code opens the till', (await post('1234')).status === 200);
  /* Rafales parallèles (revue sécurité, 23 Nov 2026) : l'essai est réservé
     avant la comparaison, une rafale ne passe plus entre vérifier et compter. */
  sqlite.prepare('DELETE FROM pair_attempts').run();
  const fresh = await Promise.all(Array.from({ length: 20 }, () => post('0000')));
  const compared = fresh.filter((r) => r.status === 401).length;
  check(`20 parallel wrong codes on a fresh till: only the free 8 are compared (${compared})`, compared === 8);
  expire();
  const burst = await Promise.all(Array.from({ length: 20 }, () => post('0000')));
  const through = burst.filter((r) => r.status === 401).length;
  check(`20 parallel codes when a pause ends: exactly one gets through (${through})`, through === 1);
  sqlite.prepare('DELETE FROM pair_attempts').run();
  for (let i = 0; i < 7; i++) await post('0000');
  check('a right code still opens the till mid-count', (await post('1234')).status === 200);
  await post('0000');
  check('…but never wipes the typos before it (7 wrong + 1 right + 1 wrong = paused)', (await post('1234')).status === 429);
  expire();
  check('…and the right code works again once that pause is over', (await post('1234')).status === 200);
  /* « No blocking » (owner, 23 Nov 2026) : même après des centaines de fautes,
     la caisse ne fait jamais plus qu'une pause d'une minute. */
  for (let i = 0; i < 40; i++) { expire(); await post('0000'); }
  const late = await waitAfter();
  check(`after 40 more typos the pause is still at most a minute (${late} s)`, late > 0 && late <= 60);
  sqlite.prepare('DELETE FROM pair_attempts').run();
  /* Le code du tableau de bord (compte entier, {pin} seul) suit la même règle. */
  const acct = (pin) => verifyPinPost({ request: new Request('https://kiwi.test/api/pin/verify', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie(ownerSessToken), 'CF-Connecting-IP': '10.6.0.5' }, body: JSON.stringify({ pin }) }), env });
  for (let i = 0; i < 8; i++) await acct('0000');
  const ar = await acct('0000');
  const aw = ar.status === 429 ? (await ar.json()).retry_after : 0;
  check(`the dashboard code pauses seconds too, never 15 minutes (${aw} s)`, aw > 0 && aw <= 10);
  sqlite.prepare('DELETE FROM pair_attempts').run();
  sqlite.prepare('DELETE FROM pair_attempts').run();
  const req = new Request('https://kiwi.test/auth/login', { method: 'POST', headers: { 'CF-Connecting-IP': '10.6.0.9' } });
  for (let i = 0; i < 8; i++) await limitFail(req, env, 'login');
  const row = sqlite.prepare("SELECT blocked_until FROM pair_attempts WHERE ip = 'login|10.6.0.9'").get();
  check('account sign-in keeps its 15-minute lockout', row && row.blocked_until - Date.now() > 14 * 60000);
  sqlite.prepare('DELETE FROM pair_attempts').run();
  /* Le département (6e9e96365, _dashboard-door.js) : Karim, « Manager · Caisse »
     sur sa fiche Équipe, garde la caisse mais n'ouvre plus le tableau de bord.
     Exécuté de bout en bout par la route, pas lu dans le source. */
  const { codeDocument: seal } = await import('../functions/auth/_staff-codes.js');
  sqlite.exec('CREATE TABLE IF NOT EXISTS store_docs (merchant TEXT NOT NULL, feature TEXT NOT NULL, data TEXT NOT NULL, rev INTEGER NOT NULL, updated_ts INTEGER NOT NULL, PRIMARY KEY (merchant, feature))');
  const team = await seal(env, 'cafe-atlas', 'team', { members: [{ id: 'k1', firstName: 'Karim', lastName: 'B.', function: 'Manager', department: 'Caisse', pinCode: '1234' }] }, true);
  sqlite.prepare("INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES ('cafe-atlas', 'team', ?, 1, ?)").run(JSON.stringify(team), Date.now());
  check('Manager · Caisse: the dashboard code is refused (verifyAccountPin checks the department)', (await acct('1234')).status === 401);
  check('…while the same code still opens the till (verifyStaffPin never reads the department)', (await post('1234')).status === 200);
  sqlite.prepare("DELETE FROM store_docs WHERE merchant = 'cafe-atlas' AND feature = 'team'").run();
  check('…and a sheet with no team document keeps the old rule (the code opens the dashboard)', (await acct('1234')).status === 200);
  sqlite.prepare('DELETE FROM pair_attempts').run();
}

console.log('\n3 · Shared Verifier on Sale Cancellation (/api/sale/cancel)');

{
  // Manager PIN (1234) voids sale
  const req = new Request('https://kiwi.test/api/sale/cancel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `kiwi_till=${tillCookieVal}`,
      'CF-Connecting-IP': '10.0.0.10',
    },
    body: JSON.stringify({ merchant: 'cafe-atlas', id: 'sale-1', pin: '1234', source: 'cashier' }),
  });
  const res = await cancelPost({ request: req, env });
  const data = await res.json();
  check('manager PIN successfully voids sale', res.status === 200 && data.ok === true);
  check('audit trail records manager actor', data.actor === 'Karim B.');

  const voided = sqlite.prepare('SELECT void_ts, void_actor FROM sales WHERE id = ?').get('sale-1');
  check('sale record updated with void_ts', voided && voided.void_ts != null);

  // Restore sale for next check
  sqlite.prepare('UPDATE sales SET void_ts = NULL WHERE id = ?').run('sale-1');
}

{
  // Non-manager PIN (5678, role = Caissier) rejected with 403
  const req = new Request('https://kiwi.test/api/sale/cancel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `kiwi_till=${tillCookieVal}`,
      'CF-Connecting-IP': '10.0.0.11',
    },
    body: JSON.stringify({ merchant: 'cafe-atlas', id: 'sale-1', pin: '5678', source: 'cashier' }),
  });
  const res = await cancelPost({ request: req, env });
  check('non-manager cashier PIN is rejected on cancel with 403 manager-required', res.status === 403);
}

{
  // Cancel path inherits rate limiter
  const cancelIp = '192.168.2.200';
  for (let i = 0; i < 8; i++) {
    const req = new Request('https://kiwi.test/api/sale/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `kiwi_till=${tillCookieVal}`,
        'CF-Connecting-IP': cancelIp,
      },
      body: JSON.stringify({ merchant: 'cafe-atlas', id: 'sale-1', pin: '0000', source: 'cashier' }),
    });
    await cancelPost({ request: req, env });
  }

  const blockedReq = new Request('https://kiwi.test/api/sale/cancel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `kiwi_till=${tillCookieVal}`,
      'CF-Connecting-IP': cancelIp,
    },
    body: JSON.stringify({ merchant: 'cafe-atlas', id: 'sale-1', pin: '1234', source: 'cashier' }),
  });
  const blockedRes = await cancelPost({ request: blockedReq, env });
  check('cancel endpoint inherits rate limiting and returns 429 when throttled', blockedRes.status === 429);
}

console.log('\n4 · Dashboard Offline Gate & Invariants');

{
  const dashSrc = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
  check('dashboard.html fails closed on offline when account is configured',
    dashSrc.includes("if (answer === null && (!demosOn() || isConfiguredAccount())) { rejectPin(navigator.onLine === false ? 'offline' : 'unreachable'); return; }"));
  check('dashboard.html defines isConfiguredAccount helper',
    dashSrc.includes('function isConfiguredAccount()'));
  check('dashboard.html displays dedicated offline message in rejectPin',
    dashSrc.includes("reason === 'offline'") && dashSrc.includes('Connexion requise pour vérifier le code · appareil hors ligne'));

  // Invariant: No shipped file writes kiwiPins
  const shippedFiles = [];
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.html') || (f.endsWith('.js') && !f.startsWith('tools'))) {
      shippedFiles.push(f);
    }
  }
  const assetsDir = path.join(ROOT, 'assets');
  if (fs.existsSync(assetsDir)) {
    for (const f of fs.readdirSync(assetsDir, { recursive: true })) {
      if (typeof f === 'string' && f.endsWith('.js')) {
        shippedFiles.push(path.join('assets', f));
      }
    }
  }

  let writesKiwiPins = false;
  let offendingFile = '';
  for (const rel of shippedFiles) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (/\bsetItem\(\s*['"]kiwiPins['"]/.test(code)) {
      writesKiwiPins = true;
      offendingFile = rel;
      break;
    }
  }
  check('no shipped file writes kiwiPins (via setItem)', !writesKiwiPins && offendingFile === '');
}

if (failures.length) {
  console.error(`\n❌ ${failures.length} controls failed.`);
  process.exit(1);
} else {
  console.log('\n✓ All pin hardening and verification controls passed.');
}
