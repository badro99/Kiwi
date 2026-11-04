import assert from 'node:assert/strict';
import vm from 'node:vm';
import { read, html, elements } from './ui-runtime-harness.mjs';
for (const lang of ['fr','en','ar']) {
  let closed = 0, records = [], messages = [], modals = [], release;
  const feedbackOnly = process.argv.includes('--feedback-only');
  const values = { 'eco-item':'linen', 'eco-qty':'2', 'eco-cost':feedbackOnly ? '12.50' : '12,50' };
  const window = {
    Kiwi: { handlers:{}, modal: m => { modals.push(m); return { close:() => closed++ }; }, toast:(s,o) => messages.push({s,...o}), activePage:'', appPage(){}  },
    KiwiI18n:{getLang:() => lang},
    KiwiInventory:{snapshot:() => [], sync:() => new Promise(resolve => { release=resolve; })},
    KiwiProcurement:{receiveDirect:row => { records.push(row); return {ok:true}; }}
  };
  const document = {querySelector:()=>null,addEventListener(){},getElementById:id => ({value:values[id] || ''})};
  vm.runInNewContext(read('assets/hotel-economat.js'), {window,document,setTimeout(){}});
  const H=window.Kiwi.handlers;
  H['eco-receive']();
  const field=elements(html(modals.at(-1).body),'input').find(el => el.getAttribute('id')==='eco-cost');
  if (!feedbackOnly && !process.argv.includes('--parse-only')) assert.equal(field.getAttribute('type'),'text','decimal comma survives entry');
  let pending=H['eco-receive-save']();
  assert.equal(records.length,1); assert.equal(records[0].lines[0].unitCost,12.5);
  assert.equal(messages.length,0,'no success before sync settles'); assert.equal(closed,0,'receipt sheet stays open while sync is pending');
  await H['eco-receive-save'](); assert.equal(records.length,1,'pending save cannot duplicate receipt');
  release(true); await pending;
  assert.equal(messages.at(-1).type,'success'); assert.equal(closed,1);
  values['eco-cost']='0,01'; pending=H['eco-receive-save'](); release(false); await pending;
  assert.equal(records.at(-1).lines[0].unitCost,0.01);
  assert.equal(messages.at(-1).type,'warning','sync false means locally recorded, unconfirmed');
  assert.ok(messages.at(-1).s.includes({fr:'Réception enregistrée',en:'Receipt recorded',ar:'تم تسجيل الاستلام'}[lang]));
  window.KiwiInventory.sync=async()=>{throw Error('offline');};
  values['eco-cost']='0'; await H['eco-receive-save'](); assert.equal(messages.at(-1).type,'warning');
  for(const bad of ['12,345','12.345','-1','12x','1e3','9007199254740992']) {
    const count=records.length;values['eco-cost']=bad;await H['eco-receive-save']();assert.equal(records.length,count,bad+' rejected without recording');
  }
}
console.log('✓ direct receipts: comma/centime/zero, invalid precision, sync ordering, false/rejection, duplicate guard, FR/EN/AR');
