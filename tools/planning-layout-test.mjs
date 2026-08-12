import assert from 'node:assert/strict';
import fs from 'node:fs';

const team = fs.readFileSync(new URL('../assets/team.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/planning-ui.css', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../kiwi-sw.js', import.meta.url), 'utf8');
const merchantConfig = fs.readFileSync(new URL('../assets/merchant-config.js', import.meta.url), 'utf8');
const i18n = fs.readFileSync(new URL('../assets/i18n.js', import.meta.url), 'utf8');
const pages = fs.readFileSync(new URL('../assets/pages.js', import.meta.url), 'utf8');
const pagesPro = fs.readFileSync(new URL('../assets/pages-pro.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../kiwi-admin.html', import.meta.url), 'utf8');
const pitch = fs.readFileSync(new URL('../pitch.html', import.meta.url), 'utf8');

for (const action of ['fair', 'optimize', 'template-save', 'template-apply', 'coverage', 'open', 'publish']) {
  assert.equal((team.match(new RegExp(`data-action="kt-plan-${action}"`, 'g')) || []).length, 1, `${action} stays wired exactly once`);
}
assert.match(team, /pending\.length\+opportunityClaims \? `<button[^`]*kt-plan-requests/, 'requests action only appears when work exists');
assert.match(team, /<details class="kt-plan-tools">/, 'secondary controls live in a collapsed, labelled tools area');
assert.match(team, /data-action="kt-plan-clear"[\s\S]*data-action="kt-plan-apply"/, 'period maintenance remains available but is demoted');
assert.match(team, /KiwiHours\.periodsOn|KH\.periodsOn/, 'fair scheduler reads shared venue opening hours');
assert.match(team, /KiwiMoroccoCalendar/, 'planning reads the shared Morocco holiday calendar');
assert.match(team, /kt-calendar-bridge/, 'planning exposes opening hours and special days in one compact bridge');
assert.match(team, /data-action="kt-period-nav" data-arg="prev"/, 'every planning period exposes previous navigation');
assert.match(team, /data-action="kt-period-nav" data-arg="next"/, 'every planning period exposes next navigation');
assert.match(team, /handlers\['kt-period-nav'\]/, 'period navigation changes the actual planning range');
assert.match(team, /periodOffsets\[kind\] = 0/, 'switching view returns to the current week, fortnight or month');
assert.match(team, /rememberPeriodLock\(root, kind, buildPeriod\(kind\)\)[\s\S]{0,260}restorePeriodLock\(root, kind, period\)/, 'moving between periods preserves each period lock independently');
assert.match(css, /\.kt-period-nav\{[^}]*display:flex/, 'period navigation is a compact, visible control');
assert.match(team, /suggestedShifts=Math\.max\(1,Math\.min\(2,suggested\)\)/, 'fair scheduling never starts with more shifts than available people');
assert.match(team, /coverageSummary\?\.\(\{planning,shifts,days:period\.days,members,periodsByDay:hoursConfigured\?periodsByDay:null\}\)/, 'coverage intelligence ignores closed hours and days');
assert.match(team, /'public-holiday'/, 'public-holiday shifts raise a compensation review warning');
/* Le sondage d'équipe tourne toutes les secondes et render() commence par
 * closeShiftPop() : sans ce garde-fou, l'éditeur de service se referme sous les
 * doigts du gérant dès qu'un employé est pointé (pointedHours est un temps
 * écoulé, donc la signature du serveur change toute seule). */
assert.doesNotMatch(team, /liveTeamSignature = signature;\s*if \(pageActive\) render\(\);/, 'the live poll never repaints straight from the network callback');
assert.match(team, /function teamIsBeingEdited\(\)[\s\S]{0,200}if \(shiftPop\) return true;/, 'an open shift editor counts as editing');
assert.match(team, /function applyLiveTeam\(\)\s*\{\s*if \(teamIsBeingEdited\(\)\) \{ liveTeamPendingRender = true; return; \}/, 'a live update lands only once the merchant has stopped typing');
assert.match(team, /if \(liveTeamPendingRender\) applyLiveTeam\(\);/, 'the deferred repaint is flushed when the editor closes');
assert.match(team, /if \(touched\) persistTeams\(\);/, 'unchanged pointed hours do not write to localStorage every second');
assert.match(css, /\.kt-planning-command\{[^}]*container-type:inline-size/, 'toolbar reacts to its actual content width');
assert.match(css, /@container\(max-width:1050px\)/, 'advanced tools respond to the card width');
assert.match(css, /@media\(max-width:680px\)[\s\S]*\.kt-plan-primary-row[^}]*flex-direction:column/, 'phone primary actions stack cleanly');
assert.match(css, /@media\(max-width:420px\)[^{]*\{[^}]*kt-plan-intelligence/, 'narrow phone breakpoint exists');
/* Ce contrôle porte sur la cohérence, pas sur un numéro. Épingler `?v=8`
 * faisait échouer le test à chaque incrément légitime — c'est-à-dire à
 * chaque fois qu'on livrait le fichier qu'il est censé protéger. Le vrai
 * défaut à attraper, c'est un tampon avancé dans dashboard.html mais oublié
 * dans le précache du service worker : le navigateur télécharge alors la
 * nouvelle version pendant que le SW ressert l'ancienne. */
['assets/morocco-holidays.js', 'assets/planning-ui.css', 'assets/planning-core.js', 'assets/team.js', 'assets/merchant-config.js'].forEach((asset) => {
  const stamp = new RegExp(`${asset.replace(/[./]/g, '\\$&')}\\?v=(\\d+)`);
  const inDashboard = dashboard.match(stamp);
  const inSw = sw.match(stamp);
  assert.ok(inDashboard, `${asset} est chargé avec un tampon de version dans dashboard.html`);
  assert.ok(inSw, `${asset} est précaché avec un tampon de version dans kiwi-sw.js`);
  assert.equal(inSw[1], inDashboard[1], `${asset} : le précache du service worker suit le tampon du dashboard`);
});
assert.doesNotMatch(dashboard, /body\.role-manager \.sidebar a\[data-nav="payroll"\]/, 'manager keeps the planning doorway');
assert.match(dashboard, /body\.role-staff \.sidebar a\[data-nav="payroll"\]/, 'staff still cannot enter planning or payroll');
assert.match(team, /return role === 'staff' \? 'none' : role === 'manager' \|\| !payrollEnabled \? 'planning' : 'full'/, 'role access separates planning from payroll');
assert.match(team, /renderPlanningPane\(T, venue, venueType, members, \{ showCosts: false \}\)/, 'manager planning omits labour cost at the renderer');
assert.match(team, /if \(access === 'none'\)[\s\S]{0,220}return;/, 'staff access is blocked in the owned handler');
assert.match(merchantConfig, /key !== 'reservations' && key !== 'payroll'/, 'legacy payroll-off config cannot remove core planning');
assert.match(team, /payrollEnabled = window\.KiwiConfig\?\.features\?\.payroll !== false/, 'payroll flag controls financial rendering instead');
assert.match(dashboard, /data-i18n="dash\.sidebar\.payroll">Planning<\/span>/, 'the shared sidebar calls the feature Planning');
assert.match(i18n, /'dash\.sidebar\.payroll': 'Planning'/, 'the English sidebar translation says Planning');
assert.match(i18n, /'dash\.sidebar\.payroll': 'التخطيط'/, 'the Arabic sidebar translation says Planning');
assert.equal((team.match(/payTitle: 'Planning'/g) || []).length, 2, 'owner page titles say Planning in French and English');
assert.match(team, /payTitle: 'التخطيط'/, 'the owner page title says Planning in Arabic');
assert.match(team, /\? \{ title: 'Planning', sub: 'shifts, availability and coverage' \}/, 'manager page title says Planning');
assert.match(pages, /payrollTitle: "Planning"/, 'the fallback page title says Planning');
assert.match(pagesPro, /payroll:\s+\{ t: 'Planning'/, 'the starter card says Planning');
assert.match(admin, /key:'payroll',\s+label:'Planning'/, 'the admin module list says Planning');
assert.match(pitch, />PLANNING<\/div>/, 'the commercial pitch says Planning');

console.log('planning-layout-test: 53 controls passed');
