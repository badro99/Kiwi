import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const read = p => fs.readFileSync(p, 'utf8');
function world(surface = 'till', lang = 'en', initialData = []) {
  const listeners = {}, events = [], notices = [], data = new Map(initialData);
  const window = { addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(e) { events.push(e); for (const fn of listeners[e.type] || []) fn(e); } };
  const document = { body: { appendChild(n) { notices.push(n); } },
    head: { appendChild(n) { vm.runInContext(read('assets/persistence-notices.js'), ctx); n.onload(); } },
    createElement: () => ({ setAttribute() {}, remove() {} }) };
  const ctx = vm.createContext({ window, document, console, localStorage: {
    getItem: k => data.get(k) || null, setItem: (k,v) => data.set(k,v)
  }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }, setInterval() {} });
  // Read the actual language dictionaries, using their own translation APIs.
  const tillSource = read('assets/caisse-lang.js');
  const en = {}, ar = {};
  const translations = tillSource.slice(tillSource.indexOf('  DICT.en["Une modification de promotion'), tillSource.indexOf("window.KiwiCaisseLang ="));
  vm.runInNewContext(translations, { DICT: { en, ar } });
  if (surface === 'till') window.KiwiCaisseLang = { tr: s => ({ en, ar }[lang] || {})[s] || s };
  else {
    const T = { fr: {}, en: {}, ar: {} }, src = read('assets/i18n.js');
    vm.runInNewContext(src.slice(src.indexOf('  Object.assign(T.fr, {"persist.'), src.indexOf('window.KiwiI18n =')), { T });
    window.KiwiI18n = { T, getLang: () => lang };
  }
  vm.runInContext(read('assets/pressing-ops.js'), ctx);
  vm.runInContext(read('assets/promo-rules.js') + '\n' + read('assets/promos.js'), ctx);
  return { ctx, window, data, notices, events };
}
for (const surface of ['till', 'dashboard']) for (const lang of ['fr', 'en', 'ar']) {
  const w = world(surface, lang), p = w.window.KiwiPromos;
  const local = p.save({ id: 'a', name: 'Local', value: 10 });
  const mine = JSON.parse(JSON.stringify(p.load()));
  const remote = { ...mine, promos: [{ ...local, name: 'Remote', updatedAt: local.updatedAt + 1 }] };
  const reopened = world(surface, lang, w.data);
  reopened.window.KiwiPromos.merge(reopened.window.KiwiPromos.load(), remote);
  assert.equal(reopened.notices.length, 1, 'offline edits are still detected after reopening');
  assert.equal(p.merge(mine, remote).promos[0].name, 'Remote');
  p.merge(mine, remote);
  assert.equal(w.notices.length, 1, 'losing edit warns exactly once');
  assert.match(w.notices[0].textContent, lang === 'en' ? /promotion edit/ : lang === 'ar' ? /تعديل العرض/ : /modification de promotion/);
  const winning = p.save({ id: 'a', name: 'Winner', value: 12 });
  p.merge(p.load(), remote);
  assert.equal(w.notices.length, 1, 'winning local edit never warns');
  const tomb = { promos: [], deleted: [{ id: 'a', at: winning.updatedAt + 1 }] };
  assert.equal(p.merge(p.load(), tomb).promos.length, 0);
  p.merge(p.load(), tomb);
  assert.equal(w.notices.length, 2, 'a tombstoned edit warns once');
  // A cached roster of promotions on a non-editing till is not a lost local edit.
  const fresh = world(surface, lang);
  fresh.window.KiwiPromos.merge(mine, remote);
  assert.equal(fresh.notices.length, 0);
  const acknowledged = world(surface, lang), ack = acknowledged.window.KiwiPromos;
  ack.save({ id: 'ack', name: 'Saved' });
  ack.merge(ack.load(), JSON.parse(JSON.stringify(ack.load())));
  const newer = { ...ack.load(), promos: ack.list().map(row => ({ ...row, updatedAt: row.updatedAt + 1 })) };
  ack.merge(ack.load(), newer);
  assert.equal(acknowledged.notices.length, 0, 'acknowledged edits are no longer pending local changes');
  // Refused snapshot and archive writes both retain working memory.
  const ops = w.window.KiwiPressingOps;
  w.ctx.localStorage.setItem = () => { throw Error('quota'); };
  assert.equal(ops.replace([{ id: 'o1', total: 12.34 }], {}, 'shop'), false);
  assert.equal(ops.read('shop')[0].total, 12.34);
  ops.replace([{ id: 'o2', total: 21.43 }], {}, 'shop');
  assert.equal(ops.read('shop')[0].id, 'o2');
  assert.equal(w.notices.length, 3, 'refused order writes warn once per session');
  assert.match(w.notices[2].textContent, lang === 'en' ? /Orders not saved/ : lang === 'ar' ? /الطلبات/ : /Commandes non enregistrées/);
  let cloud;
  w.window.KiwiPlatform = { pairedMerchant: () => 'shop' };
  w.window.KiwiCloudDoc = { attach: spec => { cloud = spec; return { bind() {} }; } };
  w.ctx.KiwiCloudDoc = w.window.KiwiCloudDoc;
  ops.bindCloud();
  cloud.write({ customers: [], orders: [{ id: 'o3', total: 45.67 }] });
  cloud.write({ customers: [], orders: [{ id: 'o4', total: 56.78 }] });
  assert.equal(ops.read()[0].id, 'o4');
  assert.equal(cloud.read().orders[0].id, 'o4');
  assert.equal(w.notices.length, 4, 'archive writes warn once per session');
  assert.match(w.notices[3].textContent, lang === 'en' ? /Archive not saved/ : lang === 'ar' ? /الأرشيف/ : /Archive non enregistrée/);
}
console.log('✓ persistence notices: FR/EN/AR on both surfaces, merge winner unchanged, one notice per lost edit, quota memory and session notices');
const stamps = createRequire(import.meta.url)('./stamps.js');
const noticeAsset = stamps.scan().get('assets/persistence-notices.js');
assert.ok(noticeAsset.sites.some(site => site.file === 'assets/pressing-ops.js' && site.kind === 'lazy'));
assert.ok(stamps.referenceFiles('assets/persistence-notices.js').includes('assets/pressing-ops.js'));
assert.equal(noticeAsset.stamps.size, 1, 'lazy notice and precache stamps agree');
