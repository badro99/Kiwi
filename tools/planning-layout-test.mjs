import assert from 'node:assert/strict';
import fs from 'node:fs';

const team = fs.readFileSync(new URL('../assets/team.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/planning-ui.css', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../kiwi-sw.js', import.meta.url), 'utf8');

for (const action of ['fair', 'optimize', 'template-save', 'template-apply', 'coverage', 'open', 'publish']) {
  assert.equal((team.match(new RegExp(`data-action="kt-plan-${action}"`, 'g')) || []).length, 1, `${action} stays wired exactly once`);
}
assert.match(team, /pending\.length\+opportunityClaims \? `<button[^`]*kt-plan-requests/, 'requests action only appears when work exists');
assert.match(team, /<details class="kt-plan-tools">/, 'secondary controls live in a collapsed, labelled tools area');
assert.match(team, /data-action="kt-plan-clear"[\s\S]*data-action="kt-plan-apply"/, 'period maintenance remains available but is demoted');
assert.match(team, /KiwiHours\.periodsOn|KH\.periodsOn/, 'fair scheduler reads shared venue opening hours');
assert.match(css, /\.kt-planning-command\{[^}]*container-type:inline-size/, 'toolbar reacts to its actual content width');
assert.match(css, /@container\(max-width:1050px\)/, 'advanced tools respond to the card width');
assert.match(css, /@media\(max-width:680px\)[\s\S]*\.kt-plan-primary-row[^}]*flex-direction:column/, 'phone primary actions stack cleanly');
assert.match(css, /@media\(max-width:420px\)[^{]*\{[^}]*kt-plan-intelligence/, 'narrow phone breakpoint exists');
assert.match(dashboard, /assets\/planning-ui\.css\?v=7/);
assert.match(dashboard, /assets\/planning-core\.js\?v=5/);
assert.match(dashboard, /assets\/team\.js\?v=266/);
assert.match(sw, /assets\/planning-ui\.css\?v=7/);
assert.match(sw, /assets\/planning-core\.js\?v=5/);
assert.match(sw, /assets\/team\.js\?v=266/);

console.log('planning-layout-test: 21 controls passed');
