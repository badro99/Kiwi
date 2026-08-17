import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as verifyPinPost } from '../functions/api/pin/verify.js';
import { onRequestPost as cancelPost } from '../functions/api/sale/cancel.js';
import { tillToken, makeSession, sessionCookie, hashPassword } from '../functions/auth/_lib.js';

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
    status TEXT NOT NULL DEFAULT 'active'
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
  INSERT INTO accounts (id, email, business, salt, hash, created_ts, status)
  VALUES ('acc-1', 'owner@cafe-atlas.ma', 'Café Atlas', ?, ?, ?, 'active')
`).run(accCreds.salt, accCreds.hash, now);

// 2. Staff PIN fixtures
sqlite.prepare(`
  INSERT INTO staff_pins (id, merchant, pin, name, role, created_ts)
  VALUES
    ('pin-1', 'cafe-atlas', '1234', 'Karim B.', 'Manager', ?),
    ('pin-2', 'cafe-atlas', '5678', 'Samira L.', 'Caissier', ?),
    ('pin-3', 'other-shop', '9999', 'Other Staff', 'Caissier', ?)
`).run(now, now, now);

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

if (failures.length) {
  console.error(`\n❌ ${failures.length} controls failed.`);
  process.exit(1);
} else {
  console.log('\n✓ All pin hardening and verification controls passed.');
}
