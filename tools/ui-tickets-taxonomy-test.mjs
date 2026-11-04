import assert from 'node:assert/strict';
import { run, read } from './ui-runtime-harness.mjs';
const { TICKET_TAXONOMY } = await import('data:text/javascript,' + encodeURIComponent(read('functions/api/tickets/_taxonomy.js')));
const all=[...TICKET_TAXONOMY.kinds,...TICKET_TAXONOMY.areas,...Object.values(TICKET_TAXONOMY.subkinds).flat()];
for(const LANG of ['fr','en','ar']) {
 const {labelOf}=run('assets/tickets-board.js',['labelOf'],{LANG,TAXONOMY_AR:{}});
 for(const item of all) {assert.ok(item.label[LANG]);assert.equal(labelOf(item),item.label[LANG]);}
 const added={id:'future-category',label:{fr:'Nouveau',en:'New',ar:'جديد'}};
 assert.equal(labelOf(added),added.label[LANG],'new server labels need no client dictionary update');
}
console.log('✓ tickets: server taxonomy owns all FR/EN/AR labels, board renders new IDs without client Arabic entries');
