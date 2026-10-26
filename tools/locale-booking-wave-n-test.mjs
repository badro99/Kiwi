import { bookingTestSource } from './booking-test-source.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const locale = readFileSync(new URL('../assets/i18n.js', import.meta.url), 'utf8');
const booking = bookingTestSource();
function localeSession(mode) {
  const copy = { dataset: { i18n: 'dash.profile.open' }, innerHTML: 'Mon profil' };
  const attrs = { dataset: { i18nAttr: 'title:dash.profile.open' }, title: 'Mon profil', getAttribute(k) { return this[k]; }, setAttribute(k,v) { this[k]=v; } };
  const root = { classList: { contains: () => true }, setAttribute(k,v) { this[k]=v; }, getAttribute() { return null; } };
  const control = { textContent: 'EN', dataset: {}, style: {}, classList: { toggle() {} }, setAttribute() {}, hasAttribute: () => false, addEventListener(k,fn) { this[k]=fn; } };
  const document = { documentElement: root, readyState: 'complete', querySelectorAll(s) {
    return s === '[data-i18n]' ? [copy] : s === '[data-i18n-attr]' ? [attrs] : s === '.lang' ? [{ querySelectorAll: () => [control] }] : s === '.lang span' ? [control] : [];
  } };
  let denied = !String(mode).startsWith('later-');
  const refusal = String(mode).replace('later-','');
  const stored = { kiwiLang: 'fr' };
  const localStorage = { getItem(k) { if (denied && refusal==='read') throw new DOMException('Denied','SecurityError'); return stored[k] || null; }, setItem(k,v) { if (denied && mode && refusal!=='read') throw new DOMException('Denied',refusal==='quota'?'QuotaExceededError':'SecurityError'); stored[k]=v; } };
  const window = { KiwiNativeLocale: { set(v) { this.lang=v; } }, dispatchEvent(e) { this.event=e; } };
  vm.runInContext(locale,vm.createContext({ document, window, localStorage, location: { protocol: 'https:' }, CustomEvent: class { constructor(type,init) { this.type=type;this.detail=init.detail; } } }));
  denied = true;
  return { root, copy, attrs, window, control, api: window.KiwiI18n };
}
for (const mode of ['read','write','quota','later-write','later-quota',null]) test(`pairing/onboarding/i18n: repaint survives ${mode || 'normal'} storage`, () => {
  const s=localeSession(mode); s.api.setLang('ar');
  assert.equal(s.root.lang,'ar'); assert.equal(s.root.dir,'rtl');
  assert.equal(s.copy.innerHTML,s.api.T.ar['dash.profile.open']); assert.equal(s.attrs.title,s.copy.innerHTML);
  assert.equal(s.api.getLang(),'ar'); assert.equal(s.window.KiwiNativeLocale.lang,'ar'); assert.equal(s.window.event.detail.lang,'ar');
  s.api.setTheme('dark'); assert.equal(s.api.getTheme(),'dark'); assert.equal(s.root['data-theme'],'dark');
  s.control.click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(s.api.getLang(),'en'); assert.equal(s.window.KiwiNumber.locale(),'en-GB');
  s.api.setLang('fr'); assert.equal(s.copy.innerHTML,'Mon profil');
});
// Run actual declarations without starting page boot or network requests.
function declaration(start, end) { const a=booking.indexOf(start); return booking.slice(a, end ? booking.indexOf(end,a) : booking.indexOf('\n',a)); }
test('booking#0: dates include the configured window and its final day', () => {
  for (const days of [1,30,60,365,undefined]) {
    const c=vm.createContext({ state: { config: { settings: { windowDays: days } },date:'' }, venueToday:()=> '2026-10-26', esc:String, fmt:()=>'', plusDays:(v,n)=>new Date(Date.parse(v+'T12:00:00Z')+n*86400000).toISOString().slice(0,10) });
    vm.runInContext(declaration('function dateButtons()'),c);
    const html=c.dateButtons(), count=days||60;
    assert.equal((html.match(/data-date=/g)||[]).length,count+1);
    assert.ok(html.includes(c.plusDays('2026-10-26',count)));
    assert.ok(!html.includes(c.plusDays('2026-10-26',count+1)));
  }
});
test('booking#1: clipboard failure reveals feedback and a selectable link', async () => {
  for (const mode of ['reject','absent','throw','success','legacy-success']) {
    const b={ dataset: { href:'https://kiwi.test/booking?manage=test-link' }, parentNode: { appendChild(i) { this.input=i; } } };
    const input={ setAttribute(k,v) { this[k]=v; }, focus() { this.focused=true; },select() { this.selected=true; }, remove() {}  };
    const c=vm.createContext({ app: { querySelector:s=>s==='[data-copy-manage]'?b:null }, document: { createElement:()=>input, body: { appendChild() {} }, execCommand:()=>mode==='legacy-success' }, navigator: { clipboard:['absent','legacy-success'].includes(mode)?null:{ writeText() { if(mode==='throw')throw Error('denied');return mode==='success'?Promise.resolve():Promise.reject(Error('denied')); } } }, mt:k=>k });
    vm.runInContext(declaration('function wireManageBlock()', '\n  var M='),c);
    c.wireManageBlock(); b.onclick(); await Promise.resolve();
    if(['success','legacy-success'].includes(mode)) { assert.equal(b.textContent,'copied'); continue; }
    assert.equal(b.textContent,'copyFailed'); assert.equal(input.value,b.dataset.href);
    assert.ok(input.readOnly && input.focused && input.selected); assert.equal(input['aria-label'],'open');
  }
});
test('booking#2: localized step names and exactly one current step', () => {
  const dictionaries=booking.slice(booking.indexOf('var C='),booking.indexOf('  function t('));
  for(const lang of ['fr','en','ar'])for(const hotel of [false,true])for(const step of [1,2,3]) {
    const app={ contains:()=>false,querySelector:()=>null };
    const c=vm.createContext({ app,state:{lang,step,config:{kind:hotel?'hotel':'service'}},document:{activeElement:null,documentElement:{}},esc:String,wireGlobal() {} });
    vm.runInContext(dictionaries+"\nfunction t(k){return C[state.lang][k]}function ht(k){return H[state.lang][k]}\n"+declaration('function isHotel()'),c);
    c.layout(''); const html=app.innerHTML;
    assert.ok(html.includes('class="bk-steps" role="list"'));
    assert.equal((html.match(/role="listitem"/g)||[]).length,3);
    assert.equal((html.match(/aria-current="step"/g)||[]).length,1);
    const label=hotel?c.ht(['search','rooms','details'][step-1]):c.t(['choose','time','details'][step-1]);
    assert.ok(html.includes(`aria-label="${label}" aria-current="step"`));
  }
});
