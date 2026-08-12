import assert from 'node:assert/strict';
import fs from 'node:fs';

const layout = fs.readFileSync(new URL('../assets/design-vexel-layout.js', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');

assert.match(
  layout,
  /var pct = Math\.round\(\(empty \? 0 : share\) \* 100\) \+ ' %';/,
  'every channel ring keeps its percentage unit, including an empty 0 % ring'
);
assert.doesNotMatch(
  layout,
  /var pct = empty \? ['"]—['"] :/,
  'channel rings never replace a percentage with a dash'
);
assert.match(
  layout,
  /\(hasAmounts \? copy\.share : copy\.unavailable\)/,
  'the subtitle still distinguishes measured shares from unavailable breakdowns'
);
assert.match(dashboard, /assets\/design-vexel-layout\.js\?v=2073/);

console.log('channel-percentage-test: 4 controls passed');
