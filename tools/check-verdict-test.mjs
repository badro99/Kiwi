import assert from 'node:assert/strict';
import verdict from './check-verdict.cjs';
for (const property of [false, true]) for (const browser of [false, true]) for (const accept of [false, true]) for (const failures of [0, 2]) {
  const env = { KIWI_ALLOW_PROPERTY_SKIP: property ? '1' : '0', KIWI_ALLOW_BROWSER_SKIP: browser ? '1' : '0', KIWI_ACCEPT_INCOMPLETE: accept ? '1' : '0' };
  const r = verdict({ env, failures });
  assert.equal(r.code, failures ? 1 : (property || browser) && !accept ? 2 : 0);
  assert.equal(r.line.includes('INCOMPLETE'), property || browser);
  if (property) assert.match(r.line, /properties\/accessibility/);
  if (browser) assert.match(r.line, /browser/);
  if (property || browser) assert.doesNotMatch(r.line, /all checks passed/);
}
console.log('✓ full verdict: every override / acceptance / failure combination');
