// Requested offers are operator metadata, never paid entitlements.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fixture} from './server-money-fixture.mjs';
import {onRequestPost as signup} from '../functions/auth/signup.js';
import {onRequestGet as clients} from '../functions/api/admin/clients.js';
import {onRequestGet as config, onRequestPost as syncConfig} from '../functions/api/config.js';
import {makeSession, SESS_COOKIE, operatorToken, operatorIdToken} from '../functions/auth/_lib.js';
const root = new URL('..', import.meta.url).pathname;
const middleware = fs.readFileSync('functions/_middleware.js', 'utf8');
const admin = fs.readFileSync('kiwi-admin.html', 'utf8');
const payload = middleware.match(/post\('\/auth\/signup', (\{[^\n]+\}),/)[1];
for (const [plan, period] of [['pro','annual'], ['unknown','monthly'], ['ultimate','invalid'], ['plus','monthly'], ['basic','monthly'], ['ultra','monthly']]) {
  const f = await fixture(root);
  try {
    const query = new URLSearchParams({plan, period});
    const body = vm.runInNewContext('(' + payload + ')', {
      requested: query,
      val: key => ({'su-name':'Fixture', 'su-biz':'Requested Shop', 'su-email':'requested@example.test', 'su-pass':crypto.randomUUID()})[key],
    });
    const jobs = [];
    const response = await signup({env:f.env, request:new Request('https://kiwi.test/auth/signup', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
    }), waitUntil:p=>jobs.push(p)});
    await Promise.all(jobs);
    assert.equal(response.status, 200);
    const account = f.sql.prepare("SELECT id FROM accounts WHERE email='requested@example.test'").get();
    const doc = f.sql.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='signup-plan'").get(account.id);
    if (plan === 'unknown') assert.equal(doc, undefined);
    else assert.deepEqual(JSON.parse(doc?.data || '{}'), {plan, period:period==='invalid'?null:period});
    const cookie = `${SESS_COOKIE}=${await makeSession(account.id, f.env.AUTH_SECRET)}`;
    const synced = await syncConfig({env:f.env,request:new Request('https://kiwi.test/api/config',{method:'POST', headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({merchant:'requested-shop',fresh:true})})});
    assert.equal(synced.status, 200);
    assert.equal(f.sql.prepare("SELECT plan FROM merchant_config WHERE merchant='requested-shop'").get().plan || 'basic','basic');
    const cfg = await config({env:f.env,request:new Request('https://kiwi.test/api/config?merchant=requested-shop',{headers:{Cookie:cookie}})});
    assert.equal(cfg.status, 200);
    assert.equal((await cfg.json()).plan, 'basic');
    const roster = await clients({env:f.env,request:new Request('https://kiwi.test/api/admin/clients',{headers:{Cookie:'kiwi_op=' + await operatorToken(f.env.AUTH_SECRET) + '; kiwi_op_id=' + await operatorIdToken(f.env.AUTH_SECRET,'money-operator')}})});
    assert.equal(roster.status, 200);
    const row = (await roster.json()).clients.find(c=>c.owner==='requested@example.test');
    assert.ok(row);
    assert.equal(row.requested_plan, plan==='unknown'?undefined:plan);
    if (plan!=='unknown') {
      // Execute the actual operator plan cell, including its language-layer calls.
      const cell = admin.split('\n').find(line=>line.includes("h('td', null, c.requested_plan"));
      assert.ok(cell, 'operator renders requested plan');
      const h=(tag,props,...children)=>children.flat().filter(x=>x!=null).join('');
      const rendered=vm.runInNewContext(cell.trim().replace(/,$/,''), {h,c:row});
      assert.ok(rendered.includes(plan));
      assert.ok(rendered.includes('Offre demandée'));
      assert.ok(rendered.includes('À confirmer'));
      if(period==='annual') assert.ok(rendered.includes('Annuel'));
    }
  } finally { f.close(); }
}
for (const locale of ['fr','en','ar','de','it','nl','es']) {
  const html=fs.readFileSync(`${locale}/index.html`,'utf8');
  const copy=JSON.parse(fs.readFileSync('content/landing-pricing.json','utf8'))[locale];
  for(const tier of copy.tiers) assert.ok(html.includes(`/dashboard.html?plan=${tier.signupPlan}&amp;period=monthly`));
}
const chunk=fs.readFileSync('_next/static/chunks/' + fs.readdirSync('_next/static/chunks').find(name=>/^2c2tj5hx4r2-w-[0-9a-f]{8}\.js$/.test(name)),'utf8');
const href=chunk.match(/href:(tier.signupPlan\?[^,]+),target/)[1];
for(const annual of [false,true]) assert.equal(vm.runInNewContext(href,{tier:{signupPlan:'pro'},annual}),`/dashboard.html?plan=pro&period=${annual?'annual':'monthly'}`);
assert.ok(middleware.includes("setMode('signup');\n  var MSG"));
console.log('✓ signup requested offers: URL payload, persistence, allowlist, basic entitlement, operator display, seven locales and billing toggle');
