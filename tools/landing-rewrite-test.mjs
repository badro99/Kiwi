// The landing generator's structural rewrites fail loudly on a drifted page
// instead of silently shipping it unchanged (tools/landing-rewrite.mjs).
import assert from 'node:assert/strict';
import { rewrite } from './landing-rewrite.mjs';

let n = 0;
const ok = (fn, label) => { fn(); n++; console.log('  ✓ ' + label); };

ok(() => assert.equal(rewrite('<html lang="en" dir="ltr"><body>', '<html lang="en" dir="ltr">', '<html lang="de" dir="ltr">', 'lang'),
  '<html lang="de" dir="ltr"><body>'), 'a present pattern is rewritten');
ok(() => assert.equal(rewrite('<html lang="de" dir="ltr">', '<html lang="en" dir="ltr">', '<html lang="de" dir="ltr">', 'lang'),
  '<html lang="de" dir="ltr">'), 'a rewrite already in place is left alone (the generator runs over its own output)');
ok(() => assert.throws(() => rewrite('<html lang="en">', 'href:r.DEMO_HREF+(x)', 'href:tier.signupPlan', 'pricing CTA href'),
  /pricing CTA href.*changed shape/), 'a drifted page stops the build and names the pattern');
ok(() => assert.equal(rewrite('a</body>', '</body>', '<script></script></body>', 'body'), 'a<script></script></body>'),
  'only the first occurrence is rewritten, like String.replace');

console.log(`landing-rewrite-test: ${n} controls passed`);
