import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import split from './split-functions.cjs';
const file = 'assets/simple-food-cost/network.js';
for (const name of ['loadHistory', 'loadSnapshot', 'action'].filter(name => !process.env.NET_SCOPE || process.env.NET_SCOPE === name)) {
  for (const change of ['merchant', 'sheet', 'draft', 'edit']) for (const rejects of [false, true]) {
    let resolve, reject, writes = 0;
    const S = { merchant: 'a', openId: 'one', draft: { name: 'A' } };
    const c = vm.createContext({ S, merchant: () => S.merchant, online: () => true, paint() {}, tr: x => x,
      replaceSheet() { writes++; }, api: () => new Promise((yes, no) => { resolve = yes; reject = no; }) });
    vm.runInContext(split.declaration(fs.readFileSync(file, 'utf8'), name), c);
    const p = c[name](name === 'action' ? { action: 'archive', id: 'one' } : 1);
    if (change === 'merchant') S.merchant = 'b';
    if (change === 'sheet') S.openId = 'two';
    if (change === 'draft') S.draft = { name: 'B' };
    if (change === 'edit') S.draft.name = 'edited';
    S.history = ['new']; S.snapshot = { new: true }; S.message = 'new'; S.conflict = null;
    if (rejects) reject(Error('offline'));
    else resolve({ status: 200, data: { sheet: { id: 'one' }, history: ['old'], snapshot: { old: true } } });
    await p;
    assert.deepEqual(S.history, ['new'], name + ' preserves new history');
    assert.deepEqual(S.snapshot, { new: true }); assert.equal(S.message, 'new'); assert.equal(writes, 0);
  }
  let writes = 0;
  const S = {merchant:'a',openId:'one',draft:{name:'A'}};
  const c = vm.createContext({S,merchant:()=>S.merchant,online:()=>true,paint(){},tr:x=>x,replaceSheet(){writes++;},
    api:async()=>({status:200,data:{sheet:{id:'one'},history:['ok'],snapshot:{ok:true}}})});
  vm.runInContext(split.declaration(fs.readFileSync(file,'utf8'),name),c);
  await c[name](1);
  assert.equal(name==='action'?writes:name==='loadHistory'?S.history[0]:S.snapshot.ok,name==='action'?1:name==='loadHistory'?'ok':true);
}
console.log('✓ food-cost history, snapshot and actions discard changed scopes, including rejected requests; current results still apply');
