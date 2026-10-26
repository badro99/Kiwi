#!/usr/bin/env node
// Real MCP protocol -> fresh Chromium -> visible sidebar click -> hotel modal
// -> rendered assertion -> proof artifact. No production account or API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { validateUiProof } = require('./tickets-mcp/ui-proof.js');
let count = 0;
function ok(value, label) { assert.ok(value, label); count++; console.log('  ✓ ' + label); }
function browserAvailable() {
  const bins = [process.env.KIWI_CHROMIUM_BIN, process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'];
  return bins.some(x => x && fs.existsSync(x));
}
if (!browserAvailable()) {
  if (process.env.CI) throw new Error('Chromium required for UI QA gate in CI.');
  console.log('  ○ skip: Chromium unavailable; no browser proof executed');
  process.exit(0);
}

const child = spawn(process.execPath, [path.join(ROOT, 'tools/kiwi-ui-qa-mcp/server.js')], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
let input = '', stderr = '', nextId = 1;
const waiting = new Map();
child.stdout.setEncoding('utf8');
child.stdout.on('data', chunk => {
  input += chunk;
  let pos;
  while ((pos = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, pos).trim(); input = input.slice(pos + 1);
    if (!line) continue;
    const result = JSON.parse(line);
    const pending = waiting.get(result.id);
    if (pending) { waiting.delete(result.id); pending.resolve(result); }
  }
});
child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-3000); });
child.once('exit', code => {
  for (const pending of waiting.values()) pending.reject(new Error(`MCP exited ${code}: ${stderr}`));
  waiting.clear();
});
function rpc(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`${method} timeout: ${stderr}`)); }, 90000);
    waiting.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: e => { clearTimeout(timer); reject(e); } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
async function call(name, args = {}) {
  const r = await rpc('tools/call', { name, arguments: args });
  return r.result;
}
function body(r) { return r.content?.find(x => x.type === 'text')?.text || ''; }
function refFor(screen, label) {
  const line = screen.split('\n').find(x => /^q\d+ (?:a|button)/.test(x) && x.endsWith(' ' + label));
  assert.ok(line, `visible control ${label} not in screen:\n${screen}`);
  return line.match(/^q\d+/)[0];
}
function menuItemRef(screen, label) {
  const line = screen.split('\n').find(x => /^q\d+ div\/menuitem /.test(x) && x.endsWith(' ' + label));
  assert.ok(line, `menu item ${label} not in screen:\n${screen}`);
  return line.match(/^q\d+/)[0];
}
function actionRef(screen, action) {
  const line = screen.split('\n').find(x => /^q\d+ /.test(x) && x.includes(` [${action}] `));
  assert.ok(line, `control [${action}] not in screen:\n${screen}`);
  return line.match(/^q\d+/)[0];
}
/* A click's own snapshot can land before a drawer's or menu's entrance frame
   on a busy machine: rescan, as an agent would, until the control shows. */
async function screenWith(result, wanted) {
  let screen = body(result);
  for (let i = 0; i < 10 && !wanted(screen); i++) {
    await new Promise(r => setTimeout(r, 200));
    screen = body(await call('ui_snapshot'));
  }
  return screen;
}
function inputRef(screen, label, index = 0) {
  const lines = screen.split('\n').filter(x => /^q\d+ input/.test(x) && x.includes(' ' + label));
  assert.ok(lines[index], `visible input ${label} #${index + 1} missing`);
  return lines[index].match(/^q\d+/)[0];
}

try {
  const init = await rpc('initialize', { protocolVersion: '2024-11-05' });
  ok(init.result?.serverInfo?.name === 'kiwi-ui-qa', 'MCP initializes');
  const list = await rpc('tools/list');
  const names = list.result.tools.map(x => x.name);
  ok(names.includes('start_hotel_fixture') && names.includes('start_tickets_fixture') && names.includes('start_retail_fixture') && names.includes('finish_ui_proof'), 'interactive and evidence tools registered');
  ok(!names.includes('evaluate') && !names.includes('open_url') && !names.includes('call_api'), 'no arbitrary browser bypass or production URL tool');
  const empty = await call('finish_ui_proof', { ticketId: 999001, expectedOutcome: 'Ordinary reservation opens from the sidebar' });
  ok(empty.isError, 'cannot claim proof before a real browser exists');
  const started = await call('start_hotel_fixture');
  if (started.isError) console.log('START ERROR:', body(started));
  ok(!started.isError && body(started).includes('Synthetic hotel dashboard ready'), 'real Chromium and synthetic dashboard started');
  ok(body(started).includes('Réception'), 'hotel sidebar renders as user sees it');
  const first = await call('finish_ui_proof', { ticketId: 999001, expectedOutcome: 'Ordinary reservation opens from the sidebar' });
  ok(first.isError, 'proof refuses code-only/no-click claim');
  const mobile = await call('ui_viewport', { width: 390, height: 844 });
  if (mobile.isError) console.log('MOBILE ERROR:', body(mobile));
  ok(!mobile.isError, 'mobile responsive viewport renders');
  const desktop = await call('ui_viewport', { width: 1365, height: 900 });
  ok(!desktop.isError, 'desktop viewport restores the workstation UI');
  const reception = await call('ui_click', { ref: refFor(body(desktop), 'Réception') });
  if (reception.isError || !body(reception).includes('hx-stay-new')) console.log('RECEPTION:', body(reception));
  ok(!reception.isError && body(reception).includes('Réception'), 'real sidebar click reaches reception');
  let bookingClick = await call('ui_click', { ref: refFor(body(reception), '+ Réservation') });
  /* Réception loads its day asynchronously ("Actualisation…"); on a loaded
     machine the snapshot can land before that render and the control is then
     replaced under its q-ref. The tool says so ("call ui_snapshot again"):
     do exactly that, once, as any agent would, and still require a real click. */
  if (bookingClick.isError && /ui_snapshot again/.test(body(bookingClick))) {
    const fresh = await call('ui_snapshot');
    bookingClick = await call('ui_click', { ref: refFor(body(fresh), '+ Réservation') });
  }
  if (bookingClick.isError) console.log('BOOKING CLICK:', body(bookingClick), '\n--- reception snapshot ---\n', body(reception));
  ok(!bookingClick.isError, 'reservation control accepts the real click');
  // Opening this editor is asynchronous. A click snapshot can precede its
  // entrance frame on a busy release Mac; wait for the actual rendered form,
  // not a fixed delay, and keep the title/content assertions below intact.
  const editor = await call('ui_assert', { selector: '[data-hx-stay-form]', condition: 'visible', timeoutMs: 5000, description: 'Reservation editor becomes visible after its real control is clicked' });
  ok(!editor.isError, 'reservation editor becomes visible within five seconds');
  const booking = await call('ui_snapshot');
  ok(!booking.isError && body(booking).includes('Ajouter une réservation'), 'real reservation control opens visible editor');
  const bad = await call('ui_assert', { selector: '[data-hx-stay-form] button[type=submit]', condition: 'text_contains', expected: 'Impossible', description: 'Impossible word should fail' });
  ok(bad.isError, 'negative rendered assertion fails');
  const assertion = await call('ui_assert', { selector: '[data-hx-stay-form] button[type=submit]', condition: 'text_contains', expected: 'Confirmer la réservation', description: 'Normal hotel booking visibly offers confirmation' });
  ok(!assertion.isError && body(assertion).startsWith('PASS:'), 'specific rendered-state assertion passes');
  const named = await call('ui_fill', { ref: inputRef(body(booking), 'Nom et prénom', 0), value: 'QA Normal Guest' });
  ok(!named.isError, 'booker name typed through rendered input');
  let lower = await call('ui_scroll', { direction: 'down', pixels: 500, selector: '[data-hx-stay-form]' });
  ok(!lower.isError, 'modal scrolled with real wheel gesture');
  for (let i = 0; i < 3 && !body(lower).includes('input Nom et prénom'); i++) lower = await call('ui_scroll', { direction: 'down', pixels: 500, selector: '[data-hx-stay-form]' });
  if (!body(lower).includes('input Nom et prénom')) console.log('LOWER:', body(lower));
  const traveler = await call('ui_fill', { ref: inputRef(body(lower), 'Nom et prénom', 0), value: 'QA Normal Guest' });
  ok(!traveler.isError, 'traveler name typed through rendered input');
  let submitScreen = traveler;
  for (let i = 0; i < 4 && !body(submitScreen).includes('Confirmer la réservation'); i++) submitScreen = await call('ui_scroll', { direction: 'down', pixels: 500, selector: '[data-hx-stay-form]' });
  const submitted = await call('ui_click', { ref: refFor(body(submitScreen), 'Confirmer la réservation') });
  ok(!submitted.isError, 'booking submitted with real click');
  const settled = await call('ui_assert', { selector: '[data-hx-stay-form]', condition: 'absent', description: 'Booking editor closes after a successful ordinary guest save', timeoutMs: 15000 });
  if (settled.isError) {
    console.log('SETTLED:', body(settled));
    console.log('ERROR:', body(await call('ui_assert', { selector: '[data-hx-stay-error]', condition: 'text_contains', expected: 'IMPOSSIBLE_SENTINEL', description: 'Inspect actual booking error after submit' })));
  }
  ok(!settled.isError, 'ordinary guest booking completes in the rendered UI');
  const current = await call('ui_snapshot');
  ok(body(current).includes('QA Normal Guest'), 'saved guest appears on the reception screen');
  const reloaded = await call('ui_reload');
  if (reloaded.isError) console.log('RELOAD ERROR:', body(reloaded));
  ok(!reloaded.isError, 'real page reload succeeds');
  const back = await call('ui_click', { ref: refFor(body(reloaded), 'Réception') });
  ok(!back.isError, 'reception still reachable after reload');
  const persisted = await call('ui_assert', { selector: 'body', condition: 'text_contains', expected: 'QA Normal Guest', description: 'Saved guest remains in reception after reloading the browser', timeoutMs: 15000 });
  if (persisted.isError) console.log('PERSISTENCE:', body(persisted), '\nSCREEN:', body(await call('ui_snapshot')));
  ok(!persisted.isError, 'booking persists and renders after reload');
  const proof = await call('finish_ui_proof', { ticketId: 999001, expectedOutcome: 'A normal guest can reach the reservation confirmation from reception' });
  const match = body(proof).match(/UI proof saved: ((?:\/|[A-Za-z]:[\\/])[^\n]+proof\.json)/);
  ok(!proof.isError && match && fs.existsSync(match[1]), 'screenshot and manifest saved without changing a ticket');
  const manifest = JSON.parse(fs.readFileSync(match[1], 'utf8'));
  ok(manifest.ticketId === 999001 && manifest.actions.some(x => x.kind === 'click') && manifest.assertions.length >= 3, 'manifest has successful UI assertions and actual actions');
  ok(fs.existsSync(manifest.screenshot) && fs.statSync(manifest.screenshot).size > 1000, 'real PNG proof exists');

  // Unit-check the tickets MCP handoff gate independently from its live API.
  const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-ui-proof-unit-'));
  const screenshot = path.join(copyDir, 'screen.png');
  fs.copyFileSync(manifest.screenshot, screenshot);
  const proofFile = path.join(copyDir, 'proof.json');
  const clean = { ...manifest, screenshot, gitDirty: false };
  fs.writeFileSync(proofFile, JSON.stringify(clean));
  ok(validateUiProof(proofFile, 999001).ticketId === 999001, 'ticket MCP accepts fresh matching clean-commit proof');
  fs.writeFileSync(proofFile, JSON.stringify({ ...clean, environment: 'synthetic-maison-caisse' }));
  ok(validateUiProof(proofFile, 999001).environment === 'synthetic-maison-caisse', 'ticket MCP accepts approved Maison caisse proof');
  fs.writeFileSync(proofFile, JSON.stringify({ ...clean, environment: 'synthetic-client-dashboard' }));
  ok(validateUiProof(proofFile, 999001).environment === 'synthetic-client-dashboard', 'ticket MCP accepts approved client dashboard proof');
  fs.writeFileSync(proofFile, JSON.stringify({ ...clean, environment: 'synthetic-restaurant-dashboard' }));
  ok(validateUiProof(proofFile, 999001).environment === 'synthetic-restaurant-dashboard', 'ticket MCP accepts approved restaurant dashboard proof');
  fs.writeFileSync(proofFile, JSON.stringify({ ...clean, environment: 'synthetic-employee-clock' }));
  ok(validateUiProof(proofFile, 999001).environment === 'synthetic-employee-clock', 'ticket MCP accepts approved employee clock proof');
  fs.writeFileSync(proofFile, JSON.stringify({ ...clean, environment: 'synthetic-dashboard-navigation' }));
  ok(validateUiProof(proofFile, 999001).environment === 'synthetic-dashboard-navigation', 'ticket MCP accepts approved dashboard navigation proof');
  fs.writeFileSync(proofFile, JSON.stringify(clean));
  assert.throws(() => validateUiProof(proofFile, 999002), /match/);
  count++; console.log('  ✓ ticket mismatch rejected');
  fs.writeFileSync(proofFile, JSON.stringify({ ...clean, gitDirty: true }));
  assert.throws(() => validateUiProof(proofFile, 999001), /clean worktree/);
  count++; console.log('  ✓ dirty development capture rejected for submission');
  const stale = { ...clean, finishedAt: new Date(Date.now() - 25 * 3600000).toISOString() };
  fs.writeFileSync(proofFile, JSON.stringify(stale));
  assert.throws(() => validateUiProof(proofFile, 999001), /24 hours/);
  count++; console.log('  ✓ stale UI proof rejected');

  /* Popover menus (interactive.js menu()) render div[role=menuitem], not
     buttons. Language QA goes through two of them: the profile menu's
     Paramètres, then Settings → app language → English. */
  // The hotel uses its own home layout. Its profile menu lives in the
  // scrollable sidebar, rather than Vexel's home-only topbar clone.
  async function profileMenuRef() {
    let screen = body(await call('ui_snapshot'));
    for (let i = 0; i < 4 && !screen.includes(' [profile-menu] '); i++) {
      screen = body(await call('ui_scroll', { direction: 'down', pixels: 700, selector: '.sidebar' }));
    }
    return actionRef(screen, 'profile-menu');
  }
  const profile = await call('ui_click', { ref: await profileMenuRef() });
  const profileScreen = await screenWith(profile, s => /^q\d+ div\/menuitem Paramètres$/m.test(s));
  ok(!profile.isError && /^q\d+ div\/menuitem Paramètres$/m.test(profileScreen), 'profile popover items get q-refs as menu items');
  const settings = await call('ui_click', { ref: menuItemRef(profileScreen, 'Paramètres') });
  ok(!settings.isError, 'Paramètres menu item accepts a real click');
  const settingsScreen = await screenWith(settings, s => s.includes(' [settings-lang] '));
  const languages = await call('ui_click', { ref: actionRef(settingsScreen, 'settings-lang') });
  const languageScreen = await screenWith(languages, s => /^q\d+ div\/menuitem English$/m.test(s));
  ok(!languages.isError && ['Français', 'English', 'العربية'].every(l => new RegExp(`^q\\d+ div/menuitem ${l}$`, 'm').test(languageScreen)),
    'language menu lists Français, English and العربية');
  const english = await call('ui_click', { ref: menuItemRef(languageScreen, 'English') });
  ok(!english.isError, 'English menu item accepts a real click');
  const switched = await call('ui_assert', { selector: 'html[lang="en"] a[data-nav="accueil"]', condition: 'text_contains', expected: 'Home', timeoutMs: 5000,
    description: 'Dashboard nav reads Home after English is picked in Settings' });
  if (switched.isError) console.log('ENGLISH:', body(switched), '\nSCREEN:', body(await call('ui_snapshot')));
  ok(!switched.isError, 'picking English from the menu switches the rendered dashboard');
  /* Paramètres is written by tr() when it renders, so it has to redraw itself:
     it used to stay French, under an English sidebar, until it was reopened. */
  const settingsEn = await call('ui_assert', { selector: '.dash-genpage h1', condition: 'text_contains', expected: 'Settings',
    description: 'Open Settings page redraws in English after picking English on it', timeoutMs: 5000 });
  if (settingsEn.isError) console.log('SETTINGS EN:', body(settingsEn));
  ok(!settingsEn.isError, 'open Settings page redraws in English without being reopened');
  const langRow = await call('ui_assert', { selector: '[data-action="settings-lang"]', condition: 'text_contains', expected: 'App language English',
    description: 'Settings language row is labelled in English and shows the new choice' });
  ok(!langRow.isError, 'language row reads App language · English');
  const currencyEn = await call('ui_assert', { selector: '[data-action="settings-currency"]', condition: 'text_contains', expected: 'MAD · Moroccan dirham',
    description: 'Display currency names the dirham in English, not Dirham marocain' });
  ok(!currencyEn.isError, 'display currency reads MAD · Moroccan dirham in English');
  /* The hotel block under the shared sidebar stayed French: its keys were in
     no dictionary, and Économat / Points de vente had none at all. */
  const frontDesk = await call('ui_assert', { selector: 'a[data-nav="reception"]', condition: 'text_contains', expected: 'Front desk',
    description: 'Hotel sidebar Réception reads Front desk after the live switch to English', timeoutMs: 5000 });
  if (frontDesk.isError) console.log('FRONT DESK:', body(frontDesk));
  ok(!frontDesk.isError, 'hotel sidebar Réception reads Front desk without a reload');
  const storeroom = await call('ui_assert', { selector: 'a[data-nav="economat"]', condition: 'text_contains', expected: 'Storeroom',
    description: 'Économat, which had no i18n key, reads Storeroom in English' });
  ok(!storeroom.isError, 'Économat reads Storeroom in English');
  const outlets = await call('ui_assert', { selector: 'a[data-nav="points-vente"]', condition: 'text_contains', expected: 'Outlets',
    description: 'Points de vente, which had no i18n key, reads Outlets in English' });
  ok(!outlets.isError, 'Points de vente reads Outlets in English');
  const langProof = await call('finish_ui_proof', { ticketId: 999104,
    expectedOutcome: 'Switching the app language to English in Settings translates Settings and the hotel sidebar section live' });
  ok(!langProof.isError && /UI proof saved: (?:\/|[A-Za-z]:[\\/])/.test(body(langProof)), 'language switch proof saved from the rendered hotel dashboard');

  const closed = await call('close_session');
  ok(!closed.isError, 'fixture and Chromium close cleanly');
  const unsupported = await call('start_hotel_fixture', { language: 'de' });
  ok(unsupported.isError, 'unsupported fixture language is refused');
  const arabic = await call('start_hotel_fixture', { language: 'ar' });
  if (arabic.isError) console.log('ARABIC START:', body(arabic));
  ok(!arabic.isError && body(arabic).includes('(language ar)'), 'hotel fixture boots with a seeded Arabic language');
  const rtl = await call('ui_assert', { selector: 'html[dir="rtl"] a[data-nav="accueil"]', condition: 'text_contains', expected: 'الرئيسية', timeoutMs: 5000,
    description: 'Seeded Arabic renders the dashboard right to left' });
  ok(!rtl.isError, 'seeded Arabic renders right to left before any click');
  const receptionAr = await call('ui_assert', { selector: 'a[data-nav="reception"]', condition: 'text_contains', expected: 'مكتب الاستقبال',
    description: 'Hotel sidebar Réception reads مكتب الاستقبال when the merchant works in Arabic', timeoutMs: 5000 });
  if (receptionAr.isError) console.log('RECEPTION AR:', body(receptionAr));
  ok(!receptionAr.isError, 'hotel sidebar Réception reads مكتب الاستقبال in Arabic');
  const storeroomAr = await call('ui_assert', { selector: 'a[data-nav="economat"]', condition: 'text_contains', expected: 'المخزن',
    description: 'Économat reads المخزن in Arabic' });
  ok(!storeroomAr.isError, 'Économat reads المخزن in Arabic');
  const profileAr = await call('ui_click', { ref: await profileMenuRef() });
  const profileArScreen = await screenWith(profileAr, s => /^q\d+ div\/menuitem الإعدادات$/m.test(s));
  const settingsAr = await call('ui_click', { ref: menuItemRef(profileArScreen, 'الإعدادات') });
  ok(!settingsAr.isError, 'الإعدادات opens from the Arabic profile menu');
  const currencyAr = await call('ui_assert', { selector: '[data-action="settings-currency"]', condition: 'text_contains', expected: 'الدرهم المغربي',
    description: 'Display currency names the dirham in Arabic', timeoutMs: 5000 });
  if (currencyAr.isError) console.log('CURRENCY AR:', body(currencyAr));
  ok(!currencyAr.isError, 'display currency reads الدرهم المغربي in Arabic');
  const arabicClosed = await call('close_session');
  ok(!arabicClosed.isError, 'Arabic fixture closes cleanly');
  const restaurant = await call('start_retail_fixture', { scenario: 'restaurant' });
  ok(!restaurant.isError && body(restaurant).includes('restaurant dashboard'), 'synthetic restaurant Z dashboard starts');
  const visibleZ = await call('ui_assert', { selector: '[data-hero-amount]', condition: 'text_contains', expected: '75,00',
    description: 'Closed restaurant Z net amount is visible on Accueil', timeoutMs: 15000 });
  if (visibleZ.isError) console.log('RESTAURANT Z:', body(visibleZ), '\nSCREEN:', body(await call('ui_snapshot')));
  ok(!visibleZ.isError, 'restaurant Z amount renders in browser');
  const restaurantScreen = body(await call('ui_snapshot'));
  const bellLine = restaurantScreen.split('\n').find(line => /^q\d+ button/.test(line) && line.includes('Notifications'));
  assert.ok(bellLine, `restaurant notifications button missing: ${restaurantScreen}`);
  const bell = await call('ui_click', { ref: bellLine.match(/^q\d+/)[0] });
  ok(!bell.isError, 'cash discrepancy reached through actual Notifications click');
  const gap = await call('ui_assert', { selector: '#fixture-drawer', condition: 'text_contains', expected: 'Différence: 5,00 MAD',
    description: 'Restaurant Z notification shows the five-dirham server gap' });
  ok(!gap.isError, 'restaurant Z gap is visible in rendered notification');
  const restaurantProof = await call('finish_ui_proof', { ticketId: 999096,
    expectedOutcome: 'Restaurant dashboard discloses the Z versus ledger gap after clicking Notifications' });
  const restaurantPath = body(restaurantProof).match(/UI proof saved: ((?:\/|[A-Za-z]:[\\/])[^\n]+proof\.json)/)?.[1];
  ok(!restaurantProof.isError && restaurantPath && JSON.parse(fs.readFileSync(restaurantPath, 'utf8')).merchant === 'restaurant-fixture',
    'restaurant proof names only the isolated synthetic merchant');
  const restaurantClosed = await call('close_session');
  ok(!restaurantClosed.isError, 'restaurant fixture closes without production access');
  const clock = await call('start_retail_fixture', { scenario: 'employee-clock' });
  ok(!clock.isError && body(clock).includes('employee store clock'), 'employee clock fixture starts');
  const phoneClock = await call('ui_viewport', { width: 390, height: 844 });
  ok(!phoneClock.isError, 'employee clock proof uses phone-width rendered UI');
  const beforeRollover = await call('ui_assert', { selector: '#kep-card .kep-metric b', condition: 'text_contains', expected: '1',
    description: 'Only the Auckland store-day shift remains before rollover', timeoutMs: 15000 });
  ok(!beforeRollover.isError, 'employee schedule follows store day before rollover');
  const advance = await call('ui_click', { ref: refFor(body(await call('ui_snapshot')), 'Avancer au lendemain (simulation)') });
  ok(!advance.isError, 'clock advance clicked through visible synthetic control');
  const afterRollover = await call('ui_assert', { selector: '#kep-card .kep-metric b', condition: 'text_contains', expected: '0',
    description: 'Employee planning drops yesterday after store midnight without reload', timeoutMs: 15000 });
  ok(!afterRollover.isError, 'employee schedule rolls forward without reload');
  const clockProof = await call('finish_ui_proof', { ticketId: 999092,
    expectedOutcome: 'Employee planning refreshes at merchant midnight while the page stays open' });
  const clockPath = body(clockProof).match(/UI proof saved: ((?:\/|[A-Za-z]:[\\/])[^\n]+proof\.json)/)?.[1];
  ok(!clockProof.isError && clockPath && JSON.parse(fs.readFileSync(clockPath, 'utf8')).environment === 'synthetic-employee-clock',
    'clock proof records the isolated fixture and rendered action');
  const clockClosed = await call('close_session');
  ok(!clockClosed.isError, 'employee clock fixture closes without production access');
  const navigation = await call('start_retail_fixture', { scenario: 'nav-stability' });
  ok(!navigation.isError && body(navigation).includes('dashboard navigation'), 'isolated real dashboard navigation fixture starts');
  const enter = await call('ui_click', { ref: refFor(body(navigation), 'Entrer dans la démo →') });
  ok(!enter.isError, 'enter restaurant dashboard through visible control');
  const commands = await call('ui_click', { ref: refFor(body(enter), 'Commandes') });
  ok(!commands.isError, 'open Commandes through sidebar');
  const home = await call('ui_click', { ref: refFor(body(commands), 'Accueil') });
  ok(!home.isError, 'return to Accueil before incoming order');
  const sale = await call('ui_click', { ref: refFor(body(home), 'Créer vente TEST KIWI (simulation)') });
  ok(!sale.isError, 'create synthetic order through visible control');
  const stable = await call('ui_assert', { selector: '#fixture-nav-state', condition: 'text_contains', expected: 'Accueil · TEST KIWI présent',
    description: 'Incoming sale does not move dashboard away from Accueil', timeoutMs: 15000 });
  ok(!stable.isError, 'incoming order remains on Accueil');
  const backToCommands = await call('ui_click', { ref: refFor(body(await call('ui_snapshot')), 'Commandes') });
  ok(!backToCommands.isError, 'cashier can still visit Commandes');
  const retained = await call('ui_assert', { selector: '[data-real-tx]', condition: 'text_contains', expected: 'TEST KIWI',
    description: 'New order remains visible in Commandes history', timeoutMs: 15000 });
  ok(!retained.isError, 'new order still appears after normal navigation');
  const navProof = await call('finish_ui_proof', { ticketId: 999098,
    expectedOutcome: 'Incoming order leaves Accueil selected and remains visible in Commandes' });
  const navPath = body(navProof).match(/UI proof saved: ((?:\/|[A-Za-z]:[\\/])[^\n]+proof\.json)/)?.[1];
  ok(!navProof.isError && navPath && JSON.parse(fs.readFileSync(navPath, 'utf8')).environment === 'synthetic-dashboard-navigation',
    'navigation proof records actual clicks against cleanly isolated dashboard');
  const navClosed = await call('close_session');
  ok(!navClosed.isError, 'navigation fixture closes without production access');
  console.log(`kiwi-ui-qa-mcp-test: ${count} controls passed`);
} finally {
  child.stdin.end();
  setTimeout(() => child.kill('SIGTERM'), 2000).unref();
}
