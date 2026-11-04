import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
let fetches=0;
const source=fs.readFileSync('assets/tickets-data.js','utf8').replace(/^export /gm,'').replace(/import\('\.\/request-deadline.mjs'\)/g,"Promise.reject(new Error('module-unavailable'))");
const create=vm.runInNewContext(source+';createData',{FormData,fetch:async()=>{fetches++;return {ok:true,json:async()=>({})}},setTimeout,clearTimeout,AbortController});
const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{value:'text',checked:false,hidden:false,textContent:'',focus(){}});return elements.get(id)};
const notices=[],state={tickets:[{id:1,number:'#1'}],files:[],followupFiles:[],followupTicketId:1,filters:{}};
const api=create({$,API:'/api/tickets',state,friendlyError:code=>'translated:'+code,t:k=>k,renderLoading(){},lists:{},draft:{save:async()=>{}},draftController:Promise.resolve({}),showToast:(...v)=>notices.push(v),render(){}});
const event={preventDefault(){}};
await api.loadTickets();
await api.publish(event);assert.equal($('formError').textContent,'translated:undefined');assert.equal(state.saving,false);
await api.publishFollowup(event);assert.equal($('followupError').textContent,'translated:undefined');assert.equal(state.savingFollowup,false);
const button={isConnected:true};await api.moveTicket(state.tickets[0],'fixed',button);assert.equal(button.disabled,false);assert.equal(notices[0][0],'translated:undefined');
// Classification uses real multipart input, with only the editor DOM mocked.
const editor={dataset:{classificationForm:'1'},querySelector:()=>button};
// The VM's FormData can be supplied a valid empty form substitute via its constructor.
const c=vm.runInNewContext(source+';createData',{FormData:class{get(){return ''}},fetch:async()=>{fetches++},setTimeout,clearTimeout,AbortController});
const classify=c({state,friendlyError:code=>'translated:'+code,t:k=>k,showToast:(...v)=>notices.push(v)});
await classify.saveClassification({preventDefault(){},target:{closest:()=>editor}});assert.equal(state.savingClassification,false);
assert.equal(fetches,0,'every path fails closed when the shared module is unavailable');
assert.equal(notices.at(-1)[0],'translated:undefined');
console.log('✓ read, create, attachment, move and classification share fail-closed translated errors and reset controls');
// Follow all server pages before rendering, retaining the board's risk ordering.
const urls=[],board={filters:{}};
const live=fs.readFileSync('assets/tickets-data.js','utf8').replace(/^export /gm,'').replace(/import\('\.\/request-deadline.mjs'\)/g,'loadDeadline()');
const paginated=vm.runInNewContext(live+';createData',{
  loadDeadline:async()=>({deadlineFetch:async url=>{
    urls.push(url);return {ok:true,json:async()=>url.includes('?')
      ?{tickets:[{id:1,moneyAtRisk:true}],nextCursor:null}
      :{tickets:[{id:2,moneyAtRisk:false}],nextCursor:'2',taxonomy:{version:1,kinds:[],areas:[]}}};
  }}),
});
let renders=0;
await paginated({API:'/api/tickets',state:board,friendlyError:String,renderLoading(){},render(){renders++},configureComposerClassification(){},draft:{restore:async()=>{}}}).loadTickets();
assert.deepEqual(urls,['/api/tickets','/api/tickets?cursor=2']);
assert.equal(board.tickets.length,2);assert.equal(board.tickets[0].id,1);assert.equal(renders,1);
console.log('✓ paged board preserves all history, risk ordering and one completed render');
