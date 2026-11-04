import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = f => fs.readFileSync(f, 'utf8');
const load = async f => import('data:text/javascript;base64,' + Buffer.from(read(f)).toString('base64'));
const { createBookingView } = await load('assets/booking-view.js');
const { createBookingService } = await load('assets/booking-service.js');
for (const [lang, expected] of [['fr','45 min'],['en','45 min'],['ar','45 دقيقة']]) {
  const state = { lang, config:{ services:[{ id:'test',name:'Service',duration:45,price:0 }] } };
  const owner = { getState:() => state };
  const view = createBookingView({ owner });
  let html;
  const service = createBookingService({ owner, app:{ querySelector:() => null, querySelectorAll:() => [] }, t:view.t, esc:view.esc, money:() => '', layout:s => { html=s; }, head:() => '' });
  service.services(); assert.ok(html.includes(expected), lang + ' service choice duration');
  state.service = state.config.services[0]; assert.ok(service.contextChip().includes(expected), lang + ' selected duration');
}
const promos = read('assets/boutique-promos-dashboard.js');
const T = { fr:{}, en:{}, ar:{} };
vm.runInNewContext(read('assets/i18n.js').split('\n').filter(l => l.includes('Object.assign(T.') && l.includes('promos.copy')).join('\n'), { T });
const keys = [...promos.matchAll(/\btr\("([^"]+)"/g)].map(m => m[1]);
assert.ok(keys.length > 100, 'the promotions page reads its words through tr(): ' + keys.length + ' keys');
for (const lang of ['fr','en','ar']) for (const key of keys) assert.ok(T[lang][key], lang + ' ' + key);
console.log('✓ presentation: localized booking durations, every promotions key in FR/EN/AR');
