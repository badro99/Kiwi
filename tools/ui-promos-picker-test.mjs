import assert from 'node:assert/strict';
import fs from 'node:fs';
import { run, html, elements, esc } from './ui-runtime-harness.mjs';
if (!process.argv.includes('--icons-only')) {
const composer={draft:{scope:{ids:[]}}};
let painted='',redraws=0;
const q={value:'Coat'};let buttons=[];
const hits={get innerHTML(){return painted;},set innerHTML(v){painted=v;buttons=elements(html(v),'button').map(el=>({dataset:{pick:el.getAttribute('data-pick')}}));},querySelectorAll:()=>buttons};
const cancel={};const el={querySelector:sel=>({'#bpd-q':q,'#bpd-hits':hits,'[data-bpd-cancel]':cancel}[sel] || null),querySelectorAll:()=>[]};
const products=Object.fromEntries(Array.from({length:19},(_,i)=>['p'+i,{id:'p'+i,name:'Coat '+i,price:12.5}]));
const ctx={products,byEan:{barcode:'p18'}};
run('assets/boutique-promos-dashboard.js',['wire'],{composer,items:c=>Object.values(c.products),esc,money:String,tr:k=>k}).wire(el,ctx,()=>redraws++);
q.oninput();assert.equal(buttons.length,19,'every similarly named result is reachable');
buttons[18].onclick();assert.equal(composer.draft.scope.ids[0],'p18');assert.equal(redraws,1);
q.value='barcode';q.oninput();assert.equal(buttons.length,1);assert.equal(buttons[0].dataset.pick,'p18');
q.value='';q.oninput();assert.equal(painted,'');
}
// Run the real icon owner over all names used by starters, scope controls and actions.
let replacements=[];
const names=['printer','play','pause','pencil','trash-2','archive-restore','arrow-up-right','plus','scan-barcode','receipt-text','inbox','refresh-cw','search','x','shirt','store','layout-grid','calendar-clock','package-minus','calendar-days','arrow-right','alert-triangle','info','check-circle-2','check'];
const document={querySelectorAll:()=>names.map(name=>({getAttribute:()=>name,replaceWith:img=>replacements.push(img)})),createElement:()=>({style:{},setAttribute(){}})};
let legacyCalls=0;const iconContext={document,window:{lucide:{createIcons(){legacyCalls++;}}}};
try { iconContext.ICONS=run('assets/boutique-promos-dashboard.js',['ICONS'],{}).ICONS; } catch (error) { if (error.message !== 'Missing live declaration: ICONS') throw error; }
run('assets/boutique-promos-dashboard.js',['icons'],iconContext).icons();
assert.equal(legacyCalls,0,'the renderer never calls the second icon system');
assert.equal(replacements.length,names.length);
for(const img of replacements) {assert.equal(img.className,'bpd-material-icon');assert.equal(img.style.mask,img.style.webkitMask);const path=img.style.mask.slice(4,img.style.mask.indexOf(')'));assert.ok(path.startsWith('assets/icons/material/'));assert.ok(fs.existsSync(path));}
console.log('✓ promos: all 19 matches selectable, exact barcode preserved, real icon owner uses vendored Material assets');
