/* Node-only behavioural probes. All functions/expressions come from live assets;
 * doubles supply only collaborators and capture observable effects. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { declaration } = require('./js-declarations.cjs');
const caisse = require('./caisse-test-source.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function decl(file, name) {
  const source = read(file);
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(|(?:var|const|let)\\s+' + name + '\\s*=').exec(source);
  assert.ok(match, `${file}: ${name}`);
  return declaration(source.slice(match.index), name);
}
function load(file, name, doubles = {}) {
  return vm.runInNewContext(decl(file, name) + `\n;${name}`, doubles);
}
const classes = () => ({ add() {}, remove() {}, toggle() {} });
const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const probes = {
  'action-center-loop'() {
    let writes = 0, text = '', hidden = false, html = '';
    const badge = { get textContent() { return text; }, set textContent(v) { writes++; text = v; }, get hidden() { return hidden; }, set hidden(v) { writes++; hidden = v; } };
    const list = { get innerHTML() { return html; }, set innerHTML(v) { writes++; html = v; } };
    const state = { items: [{ status: 'pending' }, { status: 'approved' }] };
    const ctx = { refreshing: false, openRoots: [{ isConnected: true, querySelector: () => list }], state, listHtml: () => '<p>pending</p>', document: { querySelectorAll: () => [badge] }, window: {} };
    const refresh = load('assets/agent-action-center.js', 'refresh', ctx);
    refresh(); assert.equal(text, '1'); const first = writes;
    refresh(); assert.equal(writes, first, 'unchanged refresh must not mutate DOM');
    state.items = []; refresh(); assert.equal(text, '0'); assert.equal(hidden, true);
    ctx.refreshing = true; state.items = [{status:'pending'}]; refresh(); assert.equal(text, '0');
  },
  'agent-open-targets'() {
    const open = load('assets/agent-data.js', 'open1', { tr: L => L });
    const actions = open({ pClients: 'Clients', openBtn: s => 'Open ' + s }, 'pClients', 'clients-directory');
    assert.equal(actions.length, 1); assert.equal(actions[0].label, 'Open Clients');
    const called = []; const handlers = { 'clients-directory': () => called.push('book') };
    handlers[actions[0].handler](); assert.deepEqual(called, ['book']);
  },
  async 'agent-voice'() {
    let native = false;
    const Recognition = function () {};
    const window = { webkitSpeechRecognition: Recognition };
    const ctor = load('assets/agent-voice.js', 'speechCtor', { window, document: { documentElement: { classList: { contains: () => native } } } });
    assert.equal(ctor(), Recognition); native = true; assert.equal(ctor(), null);
    native = false; delete window.webkitSpeechRecognition; assert.equal(ctor(), null);
    // Run the shipped endpoint with local collaborators only, never an AI binding call.
    let who = null, quota = true; const calls = [];
    const context = { json:(body,status)=>({body,status}), tenantFor:async()=>who, quotaOk:async()=>quota,
      DAILY_CAPS:{transcribe:1}, atob, runWithPayloadFallback:async(_env,_model,payload)=>{calls.push(payload);return {result:{text:'  Bonjour  '}};} };
    const source = read('functions/api/ai/voice.js').replace(/^import .*;$/gm,'').replace(/\bexport /g,'');
    const post = vm.runInNewContext(source+'\nonRequestPost',context);
    let body = {audio:'YQ==',lang:'unsafe'}; const env = {};
    const request = {json:async()=>body};
    assert.equal((await post({request,env})).status,401); who = {merchant:'test'};
    assert.equal((await post({request,env})).status,503); env.AI = {};
    body.audio='!'; assert.equal((await post({request,env})).status,400); body.audio='YQ==';
    quota=false; assert.equal((await post({request,env})).status,429); assert.equal(calls.length,0);
    quota=true; const response=await post({request,env}); assert.equal(response.status,200); assert.equal(response.body.text,'Bonjour'); assert.equal(calls[0].language,undefined);
    body.lang='ar'; await post({request,env}); assert.equal(calls[1].language,'ar');

  },
  'app-audit-sweep'() {
    const events = [], roots = [{ dispatchEvent: e => events.push(e) }, { dispatchEvent: e => events.push(e) }];
    const done = load('assets/pos-sale.js', 'ticketDone', { document: { querySelectorAll: () => roots }, window: { dispatchEvent: e => events.push(e) }, CustomEvent: function(type, options) { this.type = type; Object.assign(this, options); } });
    done(12.5, 'cash'); assert.deepEqual(events.map(e => e.type), ['vx-ticket-done', 'vx-ticket-done', 'kiwi:sale-paid']);
    assert.equal(events[0].bubbles, false); assert.equal(Math.round(events[2].detail.total * 100), 1250); assert.equal(events[2].detail.method, 'cash');
  },
  'boutique-printer-settings'() {
    // Stop at the first DOM commit so later event wiring needs no browser.
    for (const file of ['assets/pos-boutique.js', 'assets/pos-maison.js']) {
      let html = ''; const committed = {};
      const target = { set innerHTML(value) { html = value; throw committed; }, get innerHTML() { return html; } };
      const mount = load(file, 'mount', { root: null, syncTillStaff(){}, ensureStockJournal(){}, topUpTicketLease(){}, window:{KiwiPlatform:{pairedVenue:()=>({name:'Test'})}}, IS_DEMO:false, pvReal:()=>true, camSupported:()=>false });
      try { mount(target); } catch (error) { if (error !== committed) throw error; }
      assert.ok(html, 'mount commits the printer settings surface');
      const buttons = [...target.innerHTML.matchAll(/<button\b[^>]*data-action="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)];
      const printer = buttons.filter(b => b[1] === 'printer-connect'); assert.equal(printer.length, 1);
      const called = []; const handlers = { 'printer-connect': () => called.push('settings') };
      handlers[printer[0][1]](); assert.deepEqual(called, ['settings']);
    }
  },
  'caisse-godmode-toggles'() {
    const ctx = { isFeatureOff: () => false, tables: {} };
    const has = vm.runInNewContext(caisse.declarations('hasTables') + '\nhasTables', ctx);
    assert.equal(has(), false); ctx.tables = { a: {}, b: {} }; assert.equal(has(), true);
    ctx.isFeatureOff = () => true; assert.equal(has(), false);
    const window = { KiwiConfig: { features: {} } };
    const visible = load('assets/pos-boutique/inventory.js', 'inventoryValueVisible', { window });
    for (const value of [undefined, true, 'false', 0, false]) { window.KiwiConfig.features.caisseInventoryValue = value; assert.equal(visible(), value !== false); }
  },
  'caisse-link-success'() {
    const panel = load('assets/caisse-link.js', 'panelBody', { esc, dt: k => k });
    const html = panel({ name: '<Merchant>' });
    assert.ok(html.includes('&lt;Merchant>')); assert.ok(!html.includes('<Merchant>'));
    assert.ok(html.includes('role="status" aria-live="polite"')); assert.ok(html.includes('kcl-route'));
    assert.ok(html.includes('till</span>') && html.includes('dashboard</span>'));
  },
  'critical-flow'() {
    const S = {}; const parse = load('assets/onboarding.js', 'parsedDailyGoal', { S });
    for (const [input, expected] of [['', 0], ['12,50', 12.5], ['12.345', null], ['-1', null], ['Infinity', null], ['1000000001', null]]) {
      S.dailyGoal = input; assert.equal(parse(), expected, `daily goal ${input}`);
    }
  },
  'dashboard-kds-nav'() {
    const source = require('./core-test-source.cjs').readFileSync(path.join(root, 'assets/venues.js'), 'utf8');
    const start = source.indexOf('function renderVerticalSection(');
    const code = declaration(source.slice(start), 'renderVerticalSection');
    const wrap = { innerHTML: '', classList: classes() };
    const ctx = { relabelOrdersNav() {}, document: { querySelector: s => s === '[data-vertical-section]' ? wrap : null }, window: {}, currentVenue: 'test', typeOverride: null, venues: {}, SUBTYPE_PROFILES: {}, VERTICAL_SECTIONS: {}, DASHBOARD_HIDDEN_NAV: new Set(['kds']), navTag: s => s };
    // Use the real navigation declaration, including the hidden-target set.
    ctx.DASHBOARD_HIDDEN_NAV = vm.runInNewContext(decl('assets/venues/data.js', 'DASHBOARD_HIDDEN_NAV') + '\nDASHBOARD_HIDDEN_NAV');
    ctx.safeVenueData = () => ({ type: 'resto' }); ctx.venues.test = { type: 'resto' }; ctx.VERTICAL_SECTIONS.resto = { header: 'Menu', items: [{nav:'kds',label:'Kitchen'}, {nav:'orders',label:'Orders'}] };
    const render = vm.runInNewContext(code + '\nrenderVerticalSection', ctx);
    render({ skipFade: true }); assert.ok(!wrap.innerHTML.includes('data-nav="kds"')); assert.ok(wrap.innerHTML.includes('data-nav="orders"'));
  },
  'dashboard-truth'() {
    let real = true;
    const card = { innerHTML: 'demo', hidden: false, classList: classes() };
    const state = { getLang: () => 'fr', ownData: () => real, HEALTH_EMPTY: {fr:{title:'No score'}}, emptyBlockBody: () => '', effRange: () => 'today', vData: () => null };
    const render = load('assets/daterange/renderers.js', 'renderHealth', { __state: state, document: { querySelector: () => card } });
    render(); assert.equal(card.hidden, true); real = false; render(); assert.equal(card.hidden, false); assert.equal(card.innerHTML, 'demo');
    let config = {model:'points',auto:true};
    const on = load('assets/clients-store.js', 'loyaltyOn', { isDemoBook: () => false, SEED_VENUES: {}, fidelityStore: {get: () => config} });
    assert.equal(on('live'), false); config.auto = false; assert.equal(on('live'), true); config = {}; assert.equal(on('live'), false);
  },
  'dashboard-unoffered-actions'() {
    const calls = [];
    const handlers = { 'payment-link': () => { throw Error('unoffered payment'); }, settings: () => calls.push('settings'), 'new-sale': () => calls.push('sale') };
    const entries = load('assets/interactive.js', 'kpActionEntries', { handlers })({settings:'Settings',newSale:'Sale'});
    assert.equal(entries.length, 2); entries.forEach(e => e.run()); assert.deepEqual(calls, ['sale', 'settings']);
  },
  'menu-option-group-editor'() {
    const choice = load('assets/restaurant-menu-workspace.js', 'choiceRow', { esc, ui: k => k, itSvg: () => '' });
    const blank = choice(null); assert.ok(blank.includes('data-choice-price value=""')); assert.ok(blank.includes('aria-label="ogSupplement"'));
    const priced = choice({ id:'one', name:'<Milk>', price:1.25 }); assert.ok(priced.includes('value="1.25"')); assert.ok(priced.includes('&lt;Milk>')); assert.ok(!priced.includes('value="<Milk>"'));
    // Invoke the real save handler, including refusal before any store write.
    const source = read('assets/restaurant-menu-workspace.js');
    const start = source.indexOf("$('[data-save]',m.el).onclick=()=>{", source.indexOf('function openGroup('));
    const end = source.indexOf('\n    setTimeout(',start);
    let focused=0, writes=0; const errors={};
    const nameEl={value:'',focus(){focused++;}};
    const row={dataset:{id:'choice'},name:{value:'Milk',setAttribute(){},removeAttribute(){},focus(){focused++;}},price:{value:'1.25'},emoji:{dataset:{value:''}}};
    const ctx={m:{el:{},close(){}},nameEl,wrap:{},$: (selector,r)=> selector==='[data-save]'?button:selector==='[data-choice-name]'?row.name:selector==='[data-choice-price]'?row.price:row.emoji,
      $$:()=>[row],setErr:(k,v)=>errors[k]=v,ui:k=>k,picked:()=> 'one',g:{id:'group',choices:[]},S:()=>({updateOptChoice(_id,_choice,patch){assert.equal(patch.el,undefined);assert.equal(Math.round(patch.price*100),125);writes++;},updateOptGroup(){writes++;},addOptChoice(_id,_name,price){assert.equal(Math.round(price*100),125);writes++;}}),render(){}};
    const button={}; vm.runInNewContext(source.slice(start,end),ctx);
    button.onclick(); assert.equal(writes,0); assert.equal(focused,1); assert.equal(errors.name,'ogNameRequired');
    nameEl.value='Extras'; row.name.value=''; button.onclick(); assert.equal(writes,0); assert.equal(errors.choices,'ogChoiceUnnamed');
    row.name.value='Milk'; button.onclick(); assert.equal(writes,2);

  },
  'menu-ordering-surfaces'() {
    const group = {id:'milk',required:true,choices:[{id:'oat'}]};
    const ctx = { carteState: { opts: [group] } };
    const groups = vm.runInNewContext(caisse.declarations('itemOptGroups') + '\nitemOptGroups', ctx);
    assert.equal(groups({opts:['missing','milk']}).length, 1); assert.equal(groups({opts:['milk']})[0], group); assert.equal(groups({}).length, 0);
  },
  'restaurant-item-editor'() {
    // Real nested save callback, isolated from media/picker setup.
    const source = read('assets/restaurant-menu-workspace.js');
    const start = source.indexOf('const saveItem=(onSuccess)=>');
    const code = declaration(source.slice(start), 'saveItem');
    let focused = 0, writes = 0; const attrs = {};
    const nameInput = { value:'  ', setAttribute: (k,v) => attrs[k] = v, focus: () => focused++ }, nameErr = {hidden:true};
    const fields = { '[data-price]': {value:'12.50'}, '[data-cat]': {value:'drinks'}, '[data-desc]': {value:''}, '[data-avail]': {checked:false}, '[data-standalone]': {checked:true} };
    const saved = [];
    const save = vm.runInNewContext(code + '\nsaveItem', { nameInput, nameErr, isFormulaCb: {checked:false}, formulaSlots:[], $: k => fields[k], $$: () => [], m:{el:{},close(){}}, x:null, photo:'', video:'', S: () => ({addItem: p => { writes++; saved.push(p); }}), render(){}, toast(){}, ui:k=>k });
    save(); assert.equal(writes, 0); assert.equal(focused, 1); assert.equal(nameErr.hidden, false); assert.equal(attrs['aria-invalid'], 'true');
    nameInput.value = ' Tea '; save(); assert.equal(writes, 1); assert.equal(saved[0].name, 'Tea'); assert.equal(saved[0].avail, false); assert.equal(Math.round(saved[0].price*100),1250);
  },
  'scan-view'() {
    let native = true, real = true, camera = false;
    const panel = {}, input = {focus(){}};
    const render = load('assets/pos-boutique/sales.js', 'renderScan', { $: s => s.startsWith('[data-bq-panel') ? panel : s === '#bq-ean' ? input : null, root:{}, document: { documentElement: {classList:{contains:()=>native}} }, pvReal:()=>real, camSupported:()=>camera, lookupCardHtml:()=>'', crossCardHtml:()=>'', state:{scanLog:[]}, icons(){}, setTimeout(){} });
    render(); assert.ok(panel.innerHTML.includes('Caméra indisponible dans l’application')); assert.ok(!panel.innerHTML.includes('Ce navigateur'));
    native=false; render(); assert.ok(panel.innerHTML.includes('Ce navigateur')); camera=true; render(); assert.ok(panel.innerHTML.includes('id="bq-scan-cam"'));
    real=false; render(); assert.ok(panel.innerHTML.includes('id="bq-scan-mock"'));
  },
  'shared-day-selector'() {
    const changes = [], buttons = [0,1,2].map(n => ({dataset:{drDayOffset:String(n)},addEventListener(_e,fn){this.click=fn;}}));
    const custom = { addEventListener(_e,fn){this.click=fn;} }, control = {querySelector:()=>null};
    const host = { querySelector:s=>s === '.dr-control'?control:custom, querySelectorAll:()=>buttons };
    let picker;
    const mount = load('assets/daterange/renderers.js', 'mountDaySelector', {window:{KiwiDayReport:{today:()=> '2026-10-26',shiftDay:(_day,n)=>'2026-10-'+(26+n)}}, __state:{isoToDate:s=>s?new Date(s+'T12:00:00'):null,getLang:()=> 'en',dpEsc:esc},requestAnimationFrame:fn=>fn(),openCustomPicker:o=>picker=o});
    mount(host,{value:'2026-10-25',offsets:[0,1,2],onChange:d=>changes.push(d)});
    assert.ok(host.innerHTML.includes('dr-pill on" data-dr-day-offset="1"')); buttons[2].click(); assert.deepEqual(changes,['2026-10-24']);
    custom.click(); assert.equal(picker.mode,'day'); assert.equal(picker.maxDay,'2026-10-26'); picker.onApply('2026-10-20'); assert.equal(changes[1],'2026-10-20');
  },
  'team-member-editor'() {
    const attrs = {}, err = {hidden:true}, toggles = [];
    const input = {setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k],closest:()=>({classList:{toggle:(k,v)=>toggles.push(v)}})};
    const root = {querySelector:s=>s.startsWith('[name=')?input:err};
    const error = load('assets/team/profile-ui.js','edError');
    error(root,'email','Required'); assert.equal(attrs['aria-invalid'],'true'); assert.equal(err.textContent,'Required'); assert.equal(err.hidden,false);
    error(root,'email',''); assert.equal(attrs['aria-invalid'],undefined); assert.equal(err.textContent,''); assert.equal(err.hidden,true); assert.deepEqual(toggles,[true,false]);
  },
};
exports.run = name => { assert.ok(probes[name], name); const result = probes[name](); const done = () => console.log('✓ runtime · ' + name); if (result?.then) return result.then(done); done(); };
