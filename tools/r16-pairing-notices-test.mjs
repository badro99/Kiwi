import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('assets/caisse-pairing/offline-codes.js', 'utf8');
const langSource = fs.readFileSync('assets/caisse-lang.js', 'utf8');
for (const lang of ['fr', 'en', 'ar']) {
  const memory = new Map(), notices = [];
  const ctx = { console, Date, TextEncoder, Uint8Array, localStorage: { getItem: k => memory.get(k), setItem: (k,v) => memory.set(k,v) },
    document: { readyState: 'loading', documentElement: { lang }, querySelectorAll: () => [], addEventListener() {} },
    activeVenue: () => ({ merchant: 'fixture' }), offlineBudget: { check() {} }, toast: s => notices.push(s) };
  ctx.window = ctx; ctx.addEventListener = () => {};
  vm.createContext(ctx);
  // Execute the surface's real translator, with its normal stored language.
  memory.set('kiwiCaisseLang', lang);
  vm.runInContext(langSource, ctx);
  ctx.crypto = { getRandomValues: a => a.fill(1), subtle: { importKey: async () => ({}), deriveBits: async () => new Uint8Array(32).buffer } };
  vm.runInContext(source, ctx);
  const key = ctx.offlinePinKey('fixture');
  const staff = id => ({ id, name: 'Fixture ' + id, role: 'cashier' });
  for (let i = 0; i < 12; i++) await ctx.rememberOfflinePin('fixture', String(i).padStart(4,'0'), staff('s'+i));
  assert.equal(notices.length, 0, lang + ': no false eviction notice');
  await ctx.rememberOfflinePin('fixture', '0012', staff('s12'));
  const rows = JSON.parse(memory.get(key));
  assert.equal(rows.length, 12); assert.equal(rows[0].staff.id, 's1');
  assert.equal(rows[0].expiresAt - rows[0].provenAt, 72*3600000);
  assert.equal(notices.length, 1, lang + ': eviction is visible');
  assert.ok(notices[0].includes('12'));
  const eviction = notices.pop();
  if (lang !== 'fr') assert.notEqual(eviction, 'Limite de 12 accès hors ligne atteinte. Le personnel le moins récemment enregistré devra se connecter pour déverrouiller.');
  const before = memory.get(key), who = staff('failure');
  ctx.crypto.subtle.deriveBits = async () => { throw Error('fixture failure'); };
  assert.equal(await ctx.rememberOfflinePin('fixture', '0013', who), who, 'online identity survives derivation failure');
  assert.equal(memory.get(key), before, 'failure does not write a verifier');
  assert.equal(notices.length, 1, lang + ': cache failure is visible');
  const failure = notices.pop();
  ctx.crypto = {};
  assert.equal(await ctx.rememberOfflinePin('fixture', '0013', who), who);
  assert.equal(notices.pop(), failure, 'missing WebCrypto explains the same consequence');
  if (lang !== 'fr') assert.notEqual(failure, 'Accès hors ligne non enregistré. Une connexion sera nécessaire au prochain déverrouillage.');
}
console.log('✓ pairing notices: FR/EN/AR eviction, derivation failure and absent crypto; 12 rows and 72 hours retained');
