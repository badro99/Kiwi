import assert from 'node:assert/strict';
import fs from 'node:fs';

const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const tokens = fs.readFileSync(new URL('../assets/tokens.css', import.meta.url), 'utf8');
const vexel = fs.readFileSync(new URL('../assets/design-vexel.css', import.meta.url), 'utf8');

const badge = dashboard.match(/\.dmt-ico\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
const glyph = dashboard.match(/\.dmt-ico svg\s*\{[^}]*\}/)?.[0] || '';

assert.match(badge, /background:\s*var\(--inverse-surface\)/, 'analytics badge uses a theme-stable surface');
assert.match(badge, /color:\s*var\(--inverse-ink\)/, 'analytics badge uses theme-stable contrasting ink');
assert.match(badge, /border:\s*1px solid var\(--inverse-line\)/, 'analytics badge keeps a visible boundary');
assert.doesNotMatch(badge, /var\(--(?:atlas|riad|mint)\)/, 'badge contrast cannot collapse when Vexel remaps brand tokens');
assert.match(glyph, /stroke:\s*currentColor/, 'line icon explicitly inherits the contrasting ink');
assert.match(glyph, /opacity:\s*1/, 'line icon cannot inherit a faded presentation');

assert.match(tokens, /--inverse-surface:\s*#053B2C/, 'light theme supplies a deep inverse surface');
assert.match(tokens, /--inverse-ink:\s*#F7F5F0/, 'light theme supplies light inverse ink');
assert.match(vexel, /--inverse-surface:\s*rgba\(255, 255, 255, 0\.08\)/, 'dark Vexel theme supplies an elevated inverse surface');
assert.match(vexel, /--inverse-ink:\s*#ffffff/, 'dark Vexel theme supplies visible inverse ink');

console.log('dashboard-analytics-toggle-test: 10 controls passed');
