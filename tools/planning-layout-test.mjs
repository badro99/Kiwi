import assert from 'node:assert/strict';
import fs from 'node:fs';

const team = fs.readFileSync(new URL('../assets/team.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/planning-ui.css', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../kiwi-sw.js', import.meta.url), 'utf8');

for (const group of ['is-build', 'is-template', 'is-publish']) {
  assert.match(team, new RegExp(`kt-plan-action-group ${group}`), `${group} action group exists`);
}
for (const action of ['optimize', 'template-save', 'template-apply', 'coverage', 'open', 'requests', 'publish']) {
  assert.equal((team.match(new RegExp(`data-action="kt-plan-${action}"`, 'g')) || []).length, 1, `${action} stays wired exactly once`);
}
assert.match(css, /\.kt-planning-command\{[^}]*container-type:inline-size/, 'toolbar reacts to its actual content width');
assert.match(css, /@container\(max-width:1420px\)/, 'wide dashboard shell gets a two-row command layout');
assert.match(css, /@media\(max-width:680px\)[\s\S]*\.kt-plan-action-group[^}]*grid-template-columns:1fr 1fr/, 'phone actions form a readable two-column grid');
assert.match(css, /@media\(max-width:420px\)[^{]*\{[^}]*kt-plan-intelligence/, 'narrow phone breakpoint exists');
assert.match(dashboard, /assets\/planning-ui\.css\?v=6/);
assert.match(dashboard, /assets\/team\.js\?v=265/);
assert.match(sw, /assets\/planning-ui\.css\?v=6/);
assert.match(sw, /assets\/team\.js\?v=265/);

console.log('planning-layout-test: 17 controls passed');
