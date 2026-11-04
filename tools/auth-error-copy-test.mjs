/* Every error code the signup and login endpoints can return (their own codes
   and the shared rate limiter's) has a message in FR, EN and AR on the account
   page, so a merchant never gets the bare « Une erreur est survenue ». */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (f) => fs.readFileSync(f, 'utf8');
const codes = new Set();
for (const f of ['functions/auth/signup.js', 'functions/auth/login.js']) for (const m of read(f).matchAll(/error: '([a-z_-]+)'/g)) codes.add(m[1]);
const lib = read('functions/auth/_lib.js');
for (const code of ['too_many_attempts', 'rate-limit-unavailable']) { assert.ok(lib.includes(`error: '${code}'`), 'the limiter still answers ' + code); codes.add(code); }
const page = read('functions/_middleware.js');
const lines = [...page.matchAll(/^\s*errors: \{(.*)\}\s*$/gm)].map((m) => m[1]);
assert.equal(lines.length, 3, 'one error dictionary per language (fr, en, ar)');
let checks = 0;
for (const [i, line] of lines.entries()) for (const code of codes) {
  const key = /^[a-z_]+$/.test(code) ? new RegExp(`(^|[ ,{])(${code}|'${code}'):`) : new RegExp(`'${code}':`);
  assert.match(line, key, `${['fr', 'en', 'ar'][i]} has a message for ${code}`); checks++;
}
console.log(`✓ auth error copy: ${codes.size} codes × 3 languages (${checks} checks)`);
