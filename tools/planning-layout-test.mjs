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
assert.match(team, /KiwiMoroccoCalendar/, 'planning reads the shared Morocco holiday calendar');
assert.match(team, /kt-calendar-bridge/, 'planning exposes opening hours and special days in one compact bridge');
assert.match(team, /suggestedShifts=Math\.max\(1,Math\.min\(2,suggested\)\)/, 'fair scheduling never starts with more shifts than available people');
assert.match(team, /coverageSummary\?\.\(\{planning,shifts,days:period\.days,members,periodsByDay:hoursConfigured\?periodsByDay:null\}\)/, 'coverage intelligence ignores closed hours and days');
assert.match(team, /'public-holiday'/, 'public-holiday shifts raise a compensation review warning');
assert.match(css, /\.kt-planning-command\{[^}]*container-type:inline-size/, 'toolbar reacts to its actual content width');
assert.match(css, /@container\(max-width:1050px\)/, 'advanced tools respond to the card width');
assert.match(css, /@media\(max-width:680px\)[\s\S]*\.kt-plan-primary-row[^}]*flex-direction:column/, 'phone primary actions stack cleanly');
assert.match(css, /@media\(max-width:420px\)[^{]*\{[^}]*kt-plan-intelligence/, 'narrow phone breakpoint exists');
assert.match(dashboard, /assets\/morocco-holidays\.js\?v=1/);
assert.match(dashboard, /assets\/planning-ui\.css\?v=8/);
assert.match(dashboard, /assets\/planning-core\.js\?v=6/);
assert.match(dashboard, /assets\/team\.js\?v=267/);
assert.match(sw, /assets\/morocco-holidays\.js\?v=1/);
assert.match(sw, /assets\/planning-ui\.css\?v=8/);
assert.match(sw, /assets\/planning-core\.js\?v=6/);
assert.match(sw, /assets\/team\.js\?v=267/);

console.log('planning-layout-test: 28 controls passed');
