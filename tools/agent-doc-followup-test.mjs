// agent-doc-followup-test · « add to expenses » tapé sous une facture lue par
// l'assistant (propriétaire, 23 nov. 2026, Pasta Corner) : c'est le bouton de la
// carte, pas une réponse générale sur les charges. assets/agent-doc-followup.js.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../assets/agent-doc-followup.js', import.meta.url), 'utf8');
const ctx = { console, document: { addEventListener() {} } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'agent-doc-followup.js' });
const { match } = ctx.KiwiDocFollowUp;
let n = 0;
const is = (q, want) => { assert.equal(match(q), want, JSON.stringify(q)); n++; };

for (const q of ['add to expenses', 'Ajoute aux dépenses', 'ajouter aux depenses', 'mets-la dans les dépenses',
  'enregistre en dépense', 'put it in expenses', 'أضف إلى المصاريف', 'زيدها للمصاريف', 'zidha f masarif', 'add it to expenses please']) is(q, 'expense-add');
for (const q of ['add to stock', 'ajoute au stock', 'mets les articles en stock', 'أضف السلع إلى المخزون', 'zid l stock']) is(q, 'stock-receive');
/* Une question, un chiffre, une phrase longue : l'assistant répond lui-même. */
for (const q of ['quelles sont mes dépenses ?', 'expenses this month', 'ajoute 300 MAD de loyer aux dépenses',
  'add to expenses the rent we paid last week to the landlord because he asked', '', 'bonjour', 'stock de mozzarella']) is(q, null);
console.log(`✓ agent-doc-followup · ${n} phrases`);
