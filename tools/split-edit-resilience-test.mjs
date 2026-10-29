// Exercise edited-file branches in a disposable tree, never the working assets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-split-proof-'));
try {
  const files = new Set(['kiwi-caisse.html','kiwi-sw.js','assets/pos-dispatch.js','tools/asset-stamps.json',
    ...['pos-maison-split-test.mjs','pos-boutique-split-test.mjs','caisse-app-split-test.mjs','pos-retail-module-url-check.mjs','split-live-checks.mjs','pos-retail-test-source.cjs','caisse-test-source.cjs','js-declarations.cjs'].map(f=>'tools/'+f)]);
  for (const name of ['pos-maison','pos-boutique','caisse-app']) {
    const dir = 'tools/fixtures/'+name;
    files.add(dir+'/split.json'); files.add(dir+'/original.js.gz');
    const map = JSON.parse(fs.readFileSync(path.join(root,dir,'split.json'),'utf8'));
    for (const file of Object.keys(map.splitFiles)) files.add(file);
  }
  // The restaurant core gained two preludes after its frozen split (22 October 2026).
  for (const file of require('./caisse-test-source.cjs').FILES) files.add(file);
  files.add('tools/fixtures/caisse-app/split-2.json');
  files.add('tools/fixtures/caisse-app/workflows.json');
  files.add('tools/fixtures/caisse-app/before-workflows.js.gz');
  files.add('assets/caisse/workflows-loader.js');
  // Les modules découpés peuvent importer un voisin partagé (import '../refund-split.js?v=N') : on le copie aussi.
  // Et les voisins de ces voisins (boutique-sizes.js importe ses deux modules de répartition) : jusqu'à ce que rien n'entre.
  for (let seen = 0; seen !== files.size;) {
    seen = files.size;
    for (const file of [...files].filter(f=>f.endsWith('.js'))) {
      for (const m of fs.readFileSync(path.join(root,file),'utf8').matchAll(/(?:from|import)\s+'(\.\.?\/[^'?]+\.js)(?:\?v=[0-9]+)?'/g))
        files.add(path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1])));
    }
  }
  for (const file of files) {
    const target = path.join(temp,file); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.copyFileSync(path.join(root,file),target);
  }
  for (const file of ['assets/pos-maison.js','assets/pos-maison/sales.js','assets/pos-boutique/checkout.js','assets/caisse-app.js','assets/caisse-accounting.js']) {
    const target=path.join(temp,file), source=fs.readFileSync(target,'utf8');
    const candidates=[...source.matchAll(/^\s*(?:async )?function \w+\(/gm)];
    assert.ok(candidates.length,file);
    const start=candidates.reduce((a,b)=>Math.abs(a.index-source.length/2)<Math.abs(b.index-source.length/2)?a:b).index;
    fs.writeFileSync(target,source.slice(0,start)+'\n// Edited after the split.\n'+source.slice(start));
  }
  for (const name of ['pos-maison','pos-boutique','caisse-app']) {
    const result=spawnSync(process.execPath,['tools/'+name+'-split-test.mjs'],{cwd:temp,encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.stdout+result.stderr);
    assert.match(result.stdout,/split proven at split time; files edited since, proof archived/);
  }
  const result=spawnSync(process.execPath,['-e',`
    const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
    const retail=require('./tools/pos-retail-test-source.cjs');
    for(const name of ['maison','boutique']){
      const map=require('./tools/fixtures/pos-'+name+'/split.json');
      const bodies=map.chunks.map(c=>fs.readFileSync(c.file,'utf8').replace(/^(?:import .*;\\n)+/,'').replace(/\\nexport \\{[^\\n]+\\};\\n$/,''));
      const actual=retail(fs.readFileSync('assets/pos-'+name+'.js','utf8'));
      assert.equal(actual,map.prefix+bodies.join('\\n')+map.suffix);new vm.Script(actual);
    }
    const caisse=require('./tools/caisse-test-source.cjs');
    const actual=caisse(fs.readFileSync('kiwi-caisse.html','utf8'));
    // Edited since every split: the edits are replayed in the frozen originals, the
    // result still parses, and both edits (core and accounting prelude) survive.
    const order=caisse.originalOrder();
    assert.ok(actual.includes('<script>'+order+'</script>'));new vm.Script(order);
    assert.equal(order.split('// Edited after the split.').length-1,2);
    assert.ok(caisse.declarations('payTipAmount').includes('function payTipAmount('));
  `],{cwd:temp,encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,result.stdout+result.stderr);
  console.log('PASS edited splits: archived proofs, live VM/URL/precache/stamp/registration checks, load-order adapters and named extraction');
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
