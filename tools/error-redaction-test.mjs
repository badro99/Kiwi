import { onRequestPost as postError } from '../functions/api/error.js';
import { DatabaseSync } from 'node:sqlite';

let failures = 0;
function check(label, condition, extra) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

function makeD1Adapter(db) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              const stmt = db.prepare(sql);
              return stmt.get(...params);
            },
            async all() {
              const stmt = db.prepare(sql);
              const rows = stmt.all(...params);
              return { results: rows };
            },
            async run() {
              const stmt = db.prepare(sql);
              const info = stmt.run(...params);
              return { success: true, meta: { changes: info.changes } };
            }
          };
        }
      };
    }
  };
}

async function run() {
  console.log('\n■ Client Errors Server-Side Redaction & Retention (tools/error-redaction-test.mjs)');

  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS pair_attempts (
      ip TEXT PRIMARY KEY,
      fails INTEGER NOT NULL DEFAULT 0,
      first_ts INTEGER NOT NULL,
      blocked_until INTEGER
    );
    CREATE TABLE IF NOT EXISTS client_errors (
      id            TEXT PRIMARY KEY,
      merchant      TEXT NOT NULL DEFAULT '',
      message       TEXT NOT NULL,
      file          TEXT NOT NULL DEFAULT '',
      line          INTEGER NOT NULL DEFAULT 0,
      col           INTEGER NOT NULL DEFAULT 0,
      stack         TEXT NOT NULL DEFAULT '',
      url           TEXT NOT NULL DEFAULT '',
      version       TEXT NOT NULL DEFAULT '',
      user_agent    TEXT NOT NULL DEFAULT '',
      count         INTEGER NOT NULL DEFAULT 1,
      first_seen_ts INTEGER NOT NULL,
      last_seen_ts  INTEGER NOT NULL
    );
  `);

  const d1 = makeD1Adapter(sqlite);
  const env = { DB: d1 };

  // 1. URL Query and PIN Redaction
  const req1 = new Request('https://kiwi-os.com/api/error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant: 'test-cafe',
      message: 'Uncaught error in payment',
      file: 'assets/app.js?v=1234',
      url: '/caisse.html?code=1234&token=secret#section',
      userAgent: 'Mozilla/5.0 (iPhone; PIN 654321; CPU OS 17)',
    }),
  });

  const res1 = await postError({ request: req1, env });
  const data1 = await res1.json();
  check('Post error returns 200 ok', res1.status === 200 && data1.ok === true);

  const row1 = sqlite.prepare('SELECT url, file, user_agent FROM client_errors WHERE merchant = ?').get('test-cafe');
  check('URL strips query params and fragments before storing', row1 && row1.url === '/caisse.html');
  check('File strips query params before storing', row1 && row1.file === 'assets/app.js');
  check('User agent redacts 6-digit PIN', row1 && row1.user_agent.includes('[PIN_REDACTED]') && !row1.user_agent.includes('654321'));

  // 2. Retention Pruning — Seed 500 rows for merchant 'busy-venue'
  const insertStmt = sqlite.prepare(`
    INSERT INTO client_errors (id, merchant, message, file, line, col, stack, url, version, user_agent, count, first_seen_ts, last_seen_ts)
    VALUES (?, ?, ?, ?, 0, 0, '', '', '', '', 1, ?, ?)
  `);

  const baseTs = Date.now() - 1000000;
  for (let i = 1; i <= 500; i++) {
    insertStmt.run(`err-old-${i}`, 'busy-venue', `Error message ${i}`, `file-${i}.js`, baseTs + i, baseTs + i);
  }

  // Also seed 1 stale row (>90 days old)
  const ninetyOneDaysAgo = Date.now() - (91 * 86400000);
  insertStmt.run('err-stale-1', 'other-venue', 'Stale error', 'file.js', ninetyOneDaysAgo, ninetyOneDaysAgo);

  const countBefore = sqlite.prepare('SELECT COUNT(*) AS total FROM client_errors WHERE merchant = ?').get('busy-venue').total;
  check('500 baseline rows seeded for busy-venue', countBefore === 500);

  // 3. Post 501st error for busy-venue
  const req2 = new Request('https://kiwi-os.com/api/error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      merchant: 'busy-venue',
      message: '501st unique error',
      file: 'assets/latest.js',
    }),
  });

  await postError({ request: req2, env });

  const countAfter = sqlite.prepare('SELECT COUNT(*) AS total FROM client_errors WHERE merchant = ?').get('busy-venue').total;
  check('501st row insertion prunes oldest, maintaining cap of 500', countAfter === 500);

  const oldestRow = sqlite.prepare('SELECT id FROM client_errors WHERE id = ?').get('err-old-1');
  check('Oldest row (err-old-1) was pruned', oldestRow == null);

  const staleRow = sqlite.prepare('SELECT id FROM client_errors WHERE id = ?').get('err-stale-1');
  check('Stale row older than 90 days was pruned', staleRow == null);

  if (failures > 0) {
    console.error(`\n✗ ${failures} failure(s) in error redaction & retention tests.`);
    process.exit(1);
  }
  console.log('\n✓ All error redaction & retention checks passed.\n');
}

run();
