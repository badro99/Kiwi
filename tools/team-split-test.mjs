/* Byte-exact profile extraction, loading, API and live-state equivalence. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import teamSource from './team-test-source.cjs';
const read = file => fs.readFileSync(file, 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const original = gunzipSync(fs.readFileSync('tools/fixtures/team/original.js.gz')).toString();
const map = JSON.parse(read('tools/fixtures/team/split.json'));
const core = read('assets/team.js'), part = read('assets/team/profile-ui.js'), hours = read('assets/team-hours.js');
assert.equal(hash(original), map.sha256);
for (const segment of [...map.segments, ...map.moved]) {
  const body = original.slice(segment.start, segment.end);
  assert.equal(hash(body), segment.sha256, segment.name);
  assert.ok(part.includes(body), segment.name + ': entire section unchanged');
  assert.ok(!core.includes(body), segment.name + ': removed from core');
  assert.ok(teamSource().includes(body), segment.name + ': source tests inspect current bodies');
}
assert.ok(core.split('\n').length < 2200);
assert.doesNotMatch(part, /\bwith\s*\(|\bnew Proxy\b/);
assert.match(read('dashboard.html'), /assets\/team\.js\?v=\d+" defer fetchpriority="low"><\/script>\s*<script src="assets\/team\/profile-ui\.js\?v=\d+" defer fetchpriority="low"><\/script>\s*<script src="assets\/team-hours\.js/);
for (const src of [core, part, hours]) new vm.Script(src);
vm.runInNewContext(core + '\n' + part, { window: {} });
function realm(source, lang) {
  const modals = [], notices = [], events = [], nodes = new Map();
  const classList = { add() {}, remove() {}, contains() { return false; }, toggle() {} };
  const element = () => ({ innerHTML: '', textContent: '', style: {}, classList,
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, contains() { return false; } });
  const root = element();
  const venue = { type: 'boutique', name: 'Test', custom: false };
  const context = vm.createContext({ console, Intl, Date, Math: Object.assign(Object.create(Math), { random: () => 0.25 }),
    localStorage: { getItem() { return null; }, setItem() {} }, navigator: {},
    document: { readyState: 'loading', documentElement: { lang }, body: { classList },
      querySelector: sel => sel === '[data-equipe-root]' ? root : null,
      querySelectorAll: () => [], createElement: element, head: { appendChild() {} },
      addEventListener: (name, fn) => events.push(name) },
    setTimeout() { return 1; }, clearTimeout() {}, Event: class {},
    addEventListener() {}, dispatchEvent() {}, scrollTo() {},
    Kiwi: { handlers: {}, toast: (...args) => notices.push(args),
      modal: options => { const modal = { el: element(), close() {} }; modals.push(options); return modal; } },
    KiwiI18n: { getLang: () => lang }, KiwiVenue: { getCurrentVenueData: () => venue, isCustom: () => false },
  });
  context.window = context;
  vm.runInContext(source, context);
  return { context, root, modals, notices, events, venue };
}
for (const lang of ['fr', 'en', 'ar']) {
  const before = realm(original + '\n' + hours, lang);
  const after = realm(core + '\n' + part + '\n' + hours, lang);
  assert.ok(Object.isFrozen(after.context.Kiwi.__teamProfileCore));
  assert.deepEqual(Object.keys(after.context.KiwiTeam).sort(), Object.keys(before.context.KiwiTeam).sort());
  assert.deepEqual(Object.keys(after.context.Kiwi.handlers).sort(), Object.keys(before.context.Kiwi.handlers).sort());
  assert.deepEqual(after.events, before.events);
  for (const r of [before, after]) r.context.Kiwi.handlers['nav-equipe']();
  assert.equal(hash(after.root.innerHTML), hash(before.root.innerHTML), 'roster markup ' + lang);
  const id = after.context.__kiwiTeamV2.byVenue.boutique[0].id;
  for (const action of ['kt-add-member', 'kt-edit-member', 'kt-view-profile', 'kt-delete-member']) {
    before.context.Kiwi.handlers[action](null, id);
    after.context.Kiwi.handlers[action](null, id);
    assert.equal(hash(JSON.stringify(after.modals)), hash(JSON.stringify(before.modals)), action + ' ' + lang);
  }
  const observed = [];
  after.context.Kiwi.__teamProfileCore.onState((active, team) => observed.push([active, team]));
  after.context.__kiwiTeamDeactivate();
  assert.equal(observed.at(-1)[0], false, 'deactivation pushes live page state');
  after.context.Kiwi.handlers['nav-equipe']();
  assert.equal(observed.at(-1)[0], true, 'navigation pushes live page state');
  for (const r of [before, after]) {
    r.venue.custom = true;
    r.venue.id = 'scoped';
    r.venue.slug = 'split-test';
    r.context.KiwiVenue.isCustom = () => true;
    r.context.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({
      ok: true, merchant: 'split-test', members: [{ id: 'live-test', status: 'on-duty' }],
    }) });
    r.context.Kiwi.handlers['nav-equipe']();
  }
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(hash(after.root.innerHTML), hash(before.root.innerHTML), 'live roster markup ' + lang);
  assert.equal(observed.at(-1)[1].merchant, 'split-test', 'poll pushes replacement live roster');
  after.context.Kiwi.handlers['kt-delete-member'](null, 'absent');

}
console.log('✓ team split: byte-exact sections, load order, public API, FR/EN/AR roster and profile dialogs, live page state');
