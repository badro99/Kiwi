// A named twin is insufficient: a mutation of its exact target must make an
// observed assertion fail. Compile/import failures do not constitute a witness.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('./source-assertion-manifest.json',import.meta.url),'utf8'));
assert.ok(manifest.provenance?.['discount-policy-test.mjs']);
const proof=manifest.provenance['discount-policy-test.mjs'];
assert.equal(proof.target,'functions/api/sale.js');
const run=(mutant)=>spawnSync(process.execPath,[...(mutant?['--loader',new URL('./assertion-provenance-loader.mjs',import.meta.url).href]:[]),'tools/'+proof.suite],{
 encoding:'utf8',env:{...process.env,KIWI_PROVENANCE_TARGET:new URL('../'+proof.target,import.meta.url).href,KIWI_PROVENANCE_FROM:proof.from,KIWI_PROVENANCE_TO:proof.to},timeout:30000});
const green=run(false);assert.equal(green.status,0,green.stderr);
const red=run(true);assert.equal(red.status,1,red.stderr);assert.match(red.stderr,/AssertionError/);
assert.match(red.stderr,/discount-not-allowed/);
console.log('✓ assertion provenance: exact sale target executed, changed audit reason rejected by the observed API assertion');
