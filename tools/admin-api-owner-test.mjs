/* The operator console has one client owner of /api/admin (assets/admin-api.js).
 * 1. No console file calls fetch itself: every privileged call goes through
 *    KiwiAdminApi.request (red on the code before the owner existed, where six
 *    files each carried their own fetch helper).
 * 2. Each console page loads the owner before the scripts that use it.
 * 3. The owner only reaches /api/admin, keeps cookies same-origin, gives one
 *    error shape and announces every successful write. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(file, 'utf8');
const inline = (html) => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');

const consoleFiles = [
  'assets/admin-workspace.js', 'assets/admin-legacy.js', 'assets/admin-policy.js', 'assets/admin-support.js',
  'assets/admin-demo-requests.js', 'assets/admin-origin-devices.js', 'assets/admin-followups.js', 'assets/kiwi-health.js',
];
const pages = { 'kiwi-admin.html': ['assets/admin-workspace.js', 'assets/admin-support.js', 'assets/admin-demo-requests.js', 'assets/admin-origin-devices.js'],
  'kiwi-admin-followups.html': ['assets/admin-followups.js'], 'kiwi-health.html': ['assets/kiwi-health.js'] };

// 1. No fetch outside the owner, in the console scripts or the pages' inline code.
const offenders = [];
for (const file of consoleFiles) if (/\bfetch\s*\(/.test(read(file))) offenders.push(file);
for (const page of Object.keys(pages)) if (/\bfetch\s*\(/.test(inline(read(page)))) offenders.push(page + ' (inline)');
assert.deepEqual(offenders, [], 'une route privilégiée passe par KiwiAdminApi.request, jamais par un fetch local');
for (const file of consoleFiles.filter((f) => /\/api\/admin|KiwiAdminApi/.test(read(f)) && !/admin-policy|admin-legacy|admin-workspace/.test(f))) {
  assert.match(read(file), /KiwiAdminApi\.request\(/, file + ' appelle le propriétaire');
}
assert.match(inline(read('kiwi-admin.html')), /window\.KiwiAdminApi\.request\(path, opts\)/, 'le magasin de la console passe par le propriétaire');

// 2. The owner loads first, synchronously.
for (const [page, users] of Object.entries(pages)) {
  const html = read(page);
  const owner = html.search(/<script src="assets\/admin-api\.js\?v=\d+"><\/script>/);
  assert.ok(owner >= 0, page + ' charge assets/admin-api.js sans defer');
  for (const user of users) {
    const at = html.search(new RegExp('<script src="/?' + user.replace(/[.]/g, '\\.')));
    assert.ok(at > owner, page + ' : ' + user + ' après le propriétaire');
  }
}

// 3. Behaviour of the owner.
const calls = [];
let reply = { status: 200, body: { ok: true } };
const ctx = { window: {}, fetch: async (url, opts) => { calls.push({ url, opts }); const r = reply;
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => { if (r.body === undefined) throw new SyntaxError('x'); return r.body; } }; } };
vm.createContext(ctx);
vm.runInContext(read('assets/admin-api.js'), ctx);
const api = ctx.window.KiwiAdminApi;
assert.ok(Object.isFrozen(api), 'le propriétaire ne se remplace pas');
assert.equal(api.route('/clients'), '/api/admin/clients');
assert.equal(api.route('origin-devices'), '/api/admin/origin-devices');
assert.equal(api.route('/api/admin/support?merchant=a'), '/api/admin/support?merchant=a');
assert.equal(api.route('?x=1'), '/api/admin?x=1');
assert.throws(() => api.route('/../auth/login'), /admin-route/);
assert.equal(api.route('/api/sale'), '/api/admin/api/sale', 'une route hors console reste sous /api/admin');

const seen = [];
const stop = api.onWrite((w) => seen.push(w.method + ' ' + w.path));
await api.request('/clients');
assert.equal(calls.at(-1).url, '/api/admin/clients');
assert.equal(calls.at(-1).opts.credentials, 'same-origin');
assert.equal(calls.at(-1).opts.headers['Content-Type'], 'application/json');
assert.deepEqual(seen, [], 'une lecture ne compte pas comme écriture');
await api.request('/tasks', { method: 'POST', body: '{}' });
assert.deepEqual(seen, ['POST /api/admin/tasks'], 'une écriture réussie est annoncée');
await api.request('/x', { headers: { Accept: 'application/json' }, cache: 'no-store' });
assert.equal(calls.at(-1).opts.headers.Accept, 'application/json', 'les en-têtes de l’appelant sont gardés');
assert.equal(calls.at(-1).opts.cache, 'no-store');

reply = { status: 409, body: { error: 'version-conflict' } };
await assert.rejects(api.request('/tasks', { method: 'PATCH', body: '{}' }), (e) => e.message === 'version-conflict'
  && e.status === 409 && e.code === 'version-conflict' && e.body.error === 'version-conflict');
assert.deepEqual(seen, ['POST /api/admin/tasks'], 'une écriture refusée n’est pas annoncée');
reply = { status: 502, body: undefined };
await assert.rejects(api.request('/overview'), (e) => e.message === 'http-502' && e.status === 502 && e.code === undefined);
reply = { status: 200, body: undefined };
await assert.rejects(api.request('/overview'), /bad-json/);
stop();
reply = { status: 200, body: {} };
await api.request('/tasks', { method: 'DELETE' });
assert.equal(seen.length, 1, 'un écouteur retiré ne reçoit plus rien');

console.log('✓ admin-api-owner-test : un seul propriétaire client de /api/admin pour la console, le suivi et la santé ; aucune page ne fait son propre fetch');
