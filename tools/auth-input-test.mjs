#!/usr/bin/env node
/* Kiwi · unauthenticated auth input bounds.
 *
 * PBKDF2 is deliberately expensive. These checks ensure an anonymous caller
 * cannot make it process a multi-megabyte password, or push oversized identity
 * fields into D1, before the request is rejected.
 */

import { PASSWORD_MAX, hashPassword, verifyPassword } from '../functions/auth/_lib.js';
import { onRequestPost as signup } from '../functions/auth/signup.js';
import { onRequestPost as login } from '../functions/auth/login.js';
import { onRequestPost as reset } from '../functions/auth/reset.js';

let passed = 0;
const failures = [];
function ok(label, condition) {
  if (condition) { passed++; console.log('  ✓ ' + label); }
  else failures.push(label);
}

const neverDB = {
  prepare(sql) { throw new Error('oversized input reached DB: ' + sql); },
};
const env = { DB: neverDB, AUTH_SECRET: 'test-secret' };
const huge = 'x'.repeat(PASSWORD_MAX + 1);
const post = (path, body) => new Request('https://kiwi.test' + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

let threw = false;
try { await hashPassword(huge); } catch (e) { threw = e instanceof RangeError; }
ok('hashPassword refuses oversized input before PBKDF2', threw);
ok('verifyPassword refuses oversized input before PBKDF2',
  await verifyPassword(huge, '00', '00') === false);

const signupHuge = await signup({
  env,
  request: post('/auth/signup', { email: 'a@example.test', name: 'A', password: huge }),
  waitUntil() {},
});
ok('signup rejects an oversized password before D1', signupHuge.status === 400);

const signupEmail = await signup({
  env,
  request: post('/auth/signup', { email: 'a'.repeat(245) + '@example.test', name: 'A', password: '12345678' }),
  waitUntil() {},
});
ok('signup rejects an oversized email before D1', signupEmail.status === 400);

const loginHuge = await login({
  env,
  request: post('/auth/login', { email: 'a@example.test', password: huge }),
});
ok('login returns generic bad credentials without reaching D1', loginHuge.status === 401);

const resetHuge = await reset({
  env,
  request: post('/auth/reset', { token: 'anything', password: huge }),
});
ok('password reset rejects oversized input before token lookup', resetHuge.status === 400);

if (failures.length) {
  failures.forEach((label) => console.error('  ✗ ' + label));
  process.exit(1);
}
console.log(`\n✓ ${passed} auth input checks green`);
