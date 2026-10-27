#!/usr/bin/env node
/* print-relay-properties-test · the cloud print queue prints each ticket once.
 *
 * A tablet till deposits ESC/POS on /api/print/jobs; the counter's bridge polls,
 * prints, and acknowledges. Lost answers, lost acknowledgements, a printer that
 * goes down, a bridge that stops, two bridges, the clock moving: generated as
 * sequences against the real route on the SQLite D1 fixture. Only the bridge and
 * the printer are simulated. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fixture } from './server-money-fixture.mjs';
import * as auth from '../functions/auth/_lib.js';
import * as jobs from '../functions/api/print/jobs.js';

const ROOT = path.resolve(import.meta.dirname, '..');
let fc; try { fc = createRequire(path.join(ROOT, 'app/package.json'))('fast-check'); } catch { console.log('○ fast-check absent; print relay properties not executed'); process.exit(0); }
const RUNS = Number(process.env.KIWI_PROPERTY_RUNS) || 100, SEED = Number(process.env.KIWI_PROPERTY_SEED) || 20261022;
let passed = 0, failed = 0, known = 0;
async function strict(label, p) { if (process.env.KIWI_PROPERTY_ONLY && !new RegExp(process.env.KIWI_PROPERTY_ONLY).test(label)) return; const r = await fc.check(p, { numRuns: RUNS, seed: SEED }); if (r.failed) { failed++; console.error('✗ ' + label, fc.stringify(r.counterexample), r.errorInstance && r.errorInstance.message); } else { passed++; console.log('✓ ' + label); } }
async function knownIssue(id, label, p) { if (process.env.KIWI_PROPERTY_ONLY) return; const r = await fc.check(p, { numRuns: RUNS, seed: SEED }); if (!r.failed) { failed++; console.error('✗ promote ' + id + ' to strict'); } else if (r.errorInstance && r.errorInstance.message !== 'Property failed by returning false') { failed++; console.error('✗ ' + id + ' unexpected exception', r.errorInstance); } else { known++; console.log(`◦ ${id} ${label}; shrunk ${fc.stringify(r.counterexample)}`); } }

const NativeDate = Date; let clock = NativeDate.now();
class Clock extends NativeDate { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return clock; } }
globalThis.Date = Clock;

const f = await fixture(ROOT), { sql, merchant, env } = f;
const till = auth.TILL_COOKIE + '=' + await auth.tillToken(env.AUTH_SECRET, merchant);
const otherTill = auth.TILL_COOKIE + '=' + await auth.tillToken(env.AUTH_SECRET, 'server-other-shop');
const BRIDGES = ['a', 'b', 'x'].map((k, i) => ({ key: k, id: 'pb_' + String(i + 1).repeat(16), token: 'kpb_' + String(i + 1).repeat(64), merchant: k === 'x' ? 'server-other-shop' : merchant }));

async function deposit(k, cookie = till, bridgeId) {
  const res = await jobs.onRequestPost({ env, request: new Request('https://kiwi.test/api/print/jobs?merchant=' + merchant, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, target: { ip: '192.168.1.50', port: 9100 }, dataB64: 'S2l3aSB0aWNrZXQ=', kind: k % 2 ? 'kitchen' : 'receipt', clientRef: 'ticket-' + String(k).padStart(4, '0'), ...(bridgeId ? { bridgeId } : {}) }) }) });
  return { status: res.status, body: await res.json() };
}
async function poll(b) {
  const res = await jobs.onRequestGet({ env, request: new Request('https://kiwi.test/api/print/jobs', { headers: { Authorization: 'Bearer ' + b.token } }) });
  return res.json();
}
async function ack(b, id, outcome, error) {
  const res = await jobs.onRequestPost({ env, request: new Request('https://kiwi.test/api/print/jobs', { method: 'POST', headers: { Authorization: 'Bearer ' + b.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ack', id, ok: outcome === 'printed', outcome, error }) }) });
  return res.json();
}
async function requeue(id) {
  const res = await jobs.onRequestPost({ env, request: new Request('https://kiwi.test/api/print/jobs?merchant=' + merchant, { method: 'POST', headers: { Cookie: till, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, action: 'requeue-uncertain', id }) }) });
  return res.json();
}
const rows = () => sql.prepare('SELECT id, status, bridge_id, merchant FROM print_jobs').all();
function reset() {
  clock = NativeDate.now();
  sql.exec('DELETE FROM print_jobs; DELETE FROM print_bridges');
  for (const b of BRIDGES) sql.prepare('INSERT INTO print_bridges (id, merchant, name, platform, version, token_hash, created_ts, last_seen_ts) VALUES (?,?,?,?,?,?,?,?)').run(b.id, b.merchant, b.key, 'android', '1.4.4', createHash('sha256').update(b.token).digest('hex'), clock, clock);
}

/* One store, its bridges and printers, driven by generated steps. */
function world(bridgeKeys) {
  const sim = { printed: new Map(), requeued: new Set(), held: new Map(bridgeKeys.map((k) => [k, []])), printerUp: new Map(bridgeKeys.map((k) => [k, true])), alive: new Map(bridgeKeys.map((k) => [k, true])), refs: new Set() };
  const bridge = (k) => BRIDGES.find((b) => b.key === k);
  sim.step = async (s) => {
    if (s.t === 'deposit') {
      for (let i = 0; i < (s.dup ? 2 : 1); i++) {
        const r = await deposit(s.k);
        if (r.status === 200) sim.refs.add(s.k); else assert.equal(r.body.error, 'relay-offline', JSON.stringify(r.body));
      }
    } else if (s.t === 'poll') {
      if (!sim.alive.get(s.b)) return;
      const r = await poll(bridge(s.b));
      assert.ok(r.ok, JSON.stringify(r));
      if (s.lose) return;                                   // the answer never reached the bridge
      for (const j of r.jobs) {
        for (const [k, list] of sim.held) assert.ok(k === s.b || !list.some((h) => h.id === j.id), 'one ticket in two bridges');
        const up = sim.printerUp.get(s.b);
        if (up) sim.printed.set(j.id, (sim.printed.get(j.id) || 0) + 1);
        sim.held.get(s.b).push({ id: j.id, outcome: up ? 'printed' : 'failed' });
      }
    } else if (s.t === 'ack') {
      const list = sim.held.get(s.b); if (!list.length || !sim.alive.get(s.b)) return;
      const h = list.shift();
      if (!s.lose) await ack(bridge(s.b), h.id, h.outcome, h.outcome === 'failed' ? 'EHOSTUNREACH' : undefined);
    } else if (s.t === 'tick') clock += s.ms;
    else if (s.t === 'printer') sim.printerUp.set(s.b, !sim.printerUp.get(s.b));
    else if (s.t === 'stop') { sim.alive.set(s.b, false); sim.held.set(s.b, []); }
    else if (s.t === 'requeue') {
      const row = rows().find((r) => r.status === 'uncertain');
      if (row) { const r = await requeue(row.id); if (r.requeued) sim.requeued.add(row.id); }
    }
  };
  sim.check = () => {
    const all = rows().filter((r) => r.merchant === merchant);
    assert.equal(all.length, sim.refs.size, 'one queue row per ticket, whatever the retries');
    for (const r of all) {
      const n = sim.printed.get(r.id) || 0;
      if (!sim.requeued.has(r.id)) assert.ok(n <= 1, 'ticket printed ' + n + ' times');
      if (r.status === 'done') assert.ok(n >= 1, 'done without paper');
      assert.ok(['queued', 'claimed', 'done', 'failed', 'expired', 'uncertain'].includes(r.status));
    }
  };
  return sim;
}
const stepsFor = (keys) => fc.array(fc.oneof(
  { weight: 3, arbitrary: fc.record({ t: fc.constant('deposit'), k: fc.integer({ min: 0, max: 5 }), dup: fc.boolean() }) },
  { weight: 4, arbitrary: fc.record({ t: fc.constant('poll'), b: fc.constantFrom(...keys), lose: fc.boolean() }) },
  { weight: 4, arbitrary: fc.record({ t: fc.constant('ack'), b: fc.constantFrom(...keys), lose: fc.boolean() }) },
  { weight: 3, arbitrary: fc.record({ t: fc.constant('tick'), ms: fc.integer({ min: 200, max: 40000 }) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('printer'), b: fc.constantFrom(...keys) }) },
  { weight: 1, arbitrary: fc.record({ t: fc.constant('requeue') }) },
), { minLength: 1, maxLength: 40 });

console.log('print-relay-properties-test');
try {
  await strict('one bridge: lost answers, lost acknowledgements, a printer going down and the clock never print a ticket twice, never mark one printed without paper, and leave no ticket open once its life is over', fc.asyncProperty(stepsFor(['a']), async (steps) => {
    reset(); const sim = world(['a']);
    for (const s of steps) { await sim.step(s); sim.check(); }
    clock += 11 * 60 * 1000; sim.held.set('a', []); await poll(BRIDGES[0]);
    sim.check();
    assert.ok(rows().every((r) => !['queued', 'claimed'].includes(r.status)), 'a ticket stayed open past its life');
  }));

  await strict('two bridges of one store never receive the same ticket, and a ticket is never printed twice between them', fc.asyncProperty(stepsFor(['a', 'b']), async (steps) => {
    reset(); const sim = world(['a', 'b']);
    for (const s of steps) { if (s.t === 'printer') continue; await sim.step(s); sim.check(); }
  }));

  await strict('a bridge that stops mid-ticket leaves it uncertain (never reprinted on its own), and the till can send it again once', fc.asyncProperty(fc.integer({ min: 0, max: 5 }), async (k) => {
    reset();
    assert.equal((await deposit(k)).status, 200);
    const got = await poll(BRIDGES[0]); assert.equal(got.jobs.length, 1);
    clock += 31000; await poll(BRIDGES[0]);
    const row = rows()[0]; assert.equal(row.status, 'uncertain');
    assert.equal((await poll(BRIDGES[0])).jobs.length, 0, 'an uncertain ticket was handed out again');
    assert.ok((await requeue(row.id)).requeued);
    assert.equal((await requeue(row.id)).requeued, false, 'requeued twice');
    assert.equal((await poll(BRIDGES[0])).jobs.length, 1);
  }));

  await strict('a ticket failed by the printer is retried after its pause and printed once, until it expires', fc.asyncProperty(fc.integer({ min: 1, max: 6 }), async (fails) => {
    reset();
    assert.equal((await deposit(1)).status, 200);
    let printed = 0;
    for (let i = 0; i <= fails; i++) {
      const r = await poll(BRIDGES[0]);
      if (!r.jobs.length) { clock += 10001; i--; continue; }
      assert.equal(r.jobs.length, 1);
      if (i < fails) await ack(BRIDGES[0], r.jobs[0].id, 'failed', 'ECONNREFUSED');
      else { printed++; await ack(BRIDGES[0], r.jobs[0].id, 'printed'); }
      assert.equal((await poll(BRIDGES[0])).jobs.length, 0, 'retried before its pause');
      clock += 10001;
    }
    assert.equal(printed, 1); assert.equal(rows()[0].status, 'done');
  }));

  await strict('another store\'s till cannot read a ticket, and another store\'s bridge never receives or acknowledges one', fc.asyncProperty(fc.integer({ min: 0, max: 5 }), async (k) => {
    reset();
    const r = await deposit(k); assert.equal(r.status, 200);
    const read = await jobs.onRequestGet({ env, request: new Request('https://kiwi.test/api/print/jobs?merchant=server-other-shop&id=' + r.body.id, { headers: { Cookie: otherTill } }) });
    assert.notEqual(read.status, 200);
    assert.equal((await poll(BRIDGES[2])).jobs.length, 0);
    const a = await ack(BRIDGES[2], r.body.id, 'printed'); assert.equal(a.updated, false);
    assert.equal(rows()[0].status, 'queued');
  }));

  /* Un ticket sans pont visé va au premier pont qui le réclame ; si l'imprimante
   * de ce pont le refuse (échec définitif, ticket remis en file), il doit pouvoir
   * partir sur l'autre pont du commerce. Un ticket visé sur un pont précis
   * garde ce pont, et la visée n'est jamais rendue au pont dans la cible. */
  await strict('an untargeted ticket the first bridge\'s printer refused is taken by the store\'s other bridge', fc.asyncProperty(fc.constantFrom('EHOSTUNREACH', 'ECONNREFUSED', 'printer-timeout'), async (error) => {
    reset();
    assert.equal((await deposit(1)).status, 200);
    const got = await poll(BRIDGES[0]); assert.equal(got.jobs.length, 1);
    await ack(BRIDGES[0], got.jobs[0].id, 'failed', error);
    assert.equal((await poll(BRIDGES[1])).jobs.length, 0, 'taken before its pause');
    clock += 10001;
    const r = await poll(BRIDGES[1]); assert.equal(r.jobs.length, 1);
    assert.equal(r.jobs[0].id, got.jobs[0].id);
    assert.deepEqual(r.jobs[0].target, { ip: '192.168.1.50', port: 9100 });
    assert.equal((await ack(BRIDGES[0], got.jobs[0].id, 'failed', error)).updated, false, 'the old claimant closed the new attempt');
    assert.equal(rows()[0].bridge_id, BRIDGES[1].id);
    assert.equal((await ack(BRIDGES[1], r.jobs[0].id, 'printed')).updated, true);
  }));

  await strict('a ticket aimed at one bridge keeps that bridge after a printer failure, and the pin never reaches the bridge', fc.asyncProperty(fc.constantFrom('EHOSTUNREACH', 'ECONNREFUSED'), async (error) => {
    reset();
    assert.equal((await deposit(2, till, BRIDGES[0].id)).status, 200);
    assert.equal((await poll(BRIDGES[1])).jobs.length, 0, 'a ticket aimed at a is visible to b');
    const got = await poll(BRIDGES[0]); assert.equal(got.jobs.length, 1);
    assert.deepEqual(got.jobs[0].target, { ip: '192.168.1.50', port: 9100 });
    await ack(BRIDGES[0], got.jobs[0].id, 'failed', error);
    for (let i = 0; i < 3; i++) { clock += 10001; assert.equal((await poll(BRIDGES[1])).jobs.length, 0, 'an aimed ticket failed over'); }
    assert.equal(rows()[0].bridge_id, BRIDGES[0].id);
    assert.equal((await poll(BRIDGES[0])).jobs.length, 1);
  }));

  /* PR-1 · « imprimante non enregistrée sur ce pont » est définitif pour CE
   * pont, pas pour le commerce : un ticket non visé passe à l'autre pont en
   * ligne, le pont qui a refusé ne le reprend plus, la note `_refused` n'est
   * jamais rendue au pont, et quand plus aucun pont ne peut l'imprimer il
   * échoue (pas de boucle). Un ticket visé échoue tout de suite, comme avant. */
  await strict('PR-1 an untargeted ticket refused as « printer not saved on this bridge » reaches the store\'s other bridge, and fails once no bridge is left', fc.asyncProperty(fc.constantFrom('printer-target-not-saved', 'printer-target-not-local'), fc.boolean(), async (error, aimed) => {
    reset();
    assert.equal((await deposit(1, till, aimed ? BRIDGES[0].id : undefined)).status, 200);
    const got = await poll(BRIDGES[0]); assert.equal(got.jobs.length, 1);
    assert.equal((await ack(BRIDGES[0], got.jobs[0].id, 'failed', error)).updated, true);
    if (aimed) {
      assert.equal(rows()[0].status, 'failed');
      for (let i = 0; i < 3; i++) { clock += 10001; assert.equal((await poll(BRIDGES[1])).jobs.length, 0); }
      return;
    }
    assert.equal((await poll(BRIDGES[0])).jobs.length, 0, 'the refusing bridge took it back');
    const r = await poll(BRIDGES[1]); assert.equal(r.jobs.length, 1, 'the other bridge never saw it');
    assert.equal(r.jobs[0].id, got.jobs[0].id);
    assert.deepEqual(r.jobs[0].target, { ip: '192.168.1.50', port: 9100 });
    assert.equal((await ack(BRIDGES[0], got.jobs[0].id, 'failed', error)).updated, false, 'the old claimant closed the new attempt');
    assert.equal((await ack(BRIDGES[1], r.jobs[0].id, 'failed', error)).updated, true);
    assert.equal(rows()[0].status, 'failed', 'no bridge left: the ticket fails instead of looping');
    clock += 10001;
    assert.equal((await poll(BRIDGES[0])).jobs.length + (await poll(BRIDGES[1])).jobs.length, 0);
  }));

  await strict('PR-1 a ticket the other bridge prints after a « not saved » refusal is printed once', fc.asyncProperty(fc.integer({ min: 0, max: 5 }), async (k) => {
    reset();
    assert.equal((await deposit(k)).status, 200);
    const got = await poll(BRIDGES[0]);
    await ack(BRIDGES[0], got.jobs[0].id, 'failed', 'printer-target-not-saved');
    const r = await poll(BRIDGES[1]);
    assert.equal((await ack(BRIDGES[1], r.jobs[0].id, 'printed')).updated, true);
    assert.equal(rows()[0].status, 'done');
    clock += 10001;
    assert.equal((await poll(BRIDGES[0])).jobs.length + (await poll(BRIDGES[1])).jobs.length, 0);
  }));

  await strict('Q expired jobs remain visible 24h and two explicit reprints deposit one fresh job', fc.asyncProperty(fc.integer({min:0,max:20}), async k => {
    reset(); const original = (await deposit(k)).body.id;
    clock += 10 * 60000;
    assert.equal((await poll(BRIDGES[0])).jobs.length, 0);
    const listing = async (cookie = till) => { const r = await jobs.onRequestGet({env, request:new Request('https://kiwi.test/api/print/jobs?merchant='+merchant,{headers:{Cookie:cookie}})}); return {status:r.status,body:await r.json()}; };
    assert.equal((await listing()).body.jobs[0].id, original);
    const reprint = async () => { const r = await jobs.onRequestPost({env,request:new Request('https://kiwi.test/api/print/jobs?merchant='+merchant,{method:'POST',headers:{Cookie:till,'Content-Type':'application/json'},body:JSON.stringify({action:'reprint-expired',id:original})})}); assert.equal(r.status,200);return r.json(); };
    const copies = await Promise.all([reprint(),reprint()]);
    assert.equal(copies[0].id,copies[1].id); assert.notEqual(copies[0].id,original);
    assert.equal(rows().length,2);
    assert.ok(!(await listing()).body.jobs.some(j=>j.id===original), 'reopened panel offers source again');
    const replacement = (await poll(BRIDGES[0])).jobs[0];
    assert.equal(replacement.id, copies[0].id);
    assert.equal((await ack(BRIDGES[0], replacement.id, 'printed')).updated, true);
    assert.ok(!(await listing()).body.jobs.some(j=>j.id===original), 'printed recovery still offered');
    assert.equal((await reprint()).id, replacement.id);
    assert.equal((await poll(BRIDGES[0])).jobs.length, 0);
    assert.equal(rows().length, 2);
    assert.notEqual((await listing(otherTill)).status,200);
    clock += 24 * 3600000;
    assert.ok(!(await listing()).body.jobs.some(j=>j.id===original));
  }));

  /* Wave 11 · a ticket that ENDS failed or uncertain (a refused write, a lost
   * acknowledgement) is as unprinted as an expired one: the ruling lists it
   * for Reprint, with its state, instead of losing it silently. */
  const listingOf = async () => { const r = await jobs.onRequestGet({env, request:new Request('https://kiwi.test/api/print/jobs?merchant='+merchant,{headers:{Cookie:till}})}); return (await r.json()).jobs || []; };
  const reprintOf = async (id) => { const r = await jobs.onRequestPost({env,request:new Request('https://kiwi.test/api/print/jobs?merchant='+merchant,{method:'POST',headers:{Cookie:till,'Content-Type':'application/json'},body:JSON.stringify({action:'reprint-expired',id})})}); return {status:r.status, body:await r.json()}; };
  await strict('R jobs ending failed or uncertain are listed for Reprint with their state, and one Reprint deposits one fresh job', fc.asyncProperty(fc.integer({min:0,max:20}), fc.constantFrom('uncertain', 'failed-late', 'failed-permanent'), async (k, end) => {
    reset(); const original = (await deposit(k)).body.id;
    const claimed = (await poll(BRIDGES[0])).jobs[0];
    assert.equal(claimed.id, original);
    if (end === 'uncertain') assert.equal((await ack(BRIDGES[0], original, 'uncertain')).updated, true);
    else if (end === 'failed-permanent') {
      sql.prepare('UPDATE print_bridges SET last_seen_ts = ? WHERE id <> ?').run(clock - 46000, BRIDGES[0].id);
      assert.equal((await ack(BRIDGES[0], original, 'failed', 'printer-target-not-saved')).updated, true);
    }
    else { clock += 10 * 60000 + 1; assert.equal((await ack(BRIDGES[0], original, 'failed', 'printer-offline')).updated, true); }
    clock += 10 * 60000 + 1;
    await poll(BRIDGES[0]);
    const offered = (await listingOf()).find((j) => j.id === original);
    assert.ok(offered, end + ' ticket offered for Reprint');
    assert.equal(offered.status, end === 'uncertain' ? 'uncertain' : 'failed');
    const copy = await reprintOf(original);
    assert.equal(copy.status, 200, JSON.stringify(copy.body));
    assert.notEqual(copy.body.id, original);
    assert.equal((await reprintOf(original)).body.id, copy.body.id);
    assert.ok(!(await listingOf()).some((j) => j.id === original), 'recovered source no longer offered');
    assert.equal((await poll(BRIDGES[0])).jobs[0].id, copy.body.id);
  }));

  await strict('R a Reprint of the original still produces a fresh copy once the previous copy expired or failed', fc.asyncProperty(fc.integer({min:0,max:20}), fc.constantFrom('expired', 'failed'), async (k, end) => {
    reset(); const original = (await deposit(k)).body.id;
    clock += 10 * 60000 + 1;
    await poll(BRIDGES[0]);
    const first = await reprintOf(original);
    assert.equal(first.status, 200);
    assert.equal((await reprintOf(original)).body.id, first.body.id, 'a double tap within one attempt returns the same copy');
    if (end === 'expired') clock += 10 * 60000 + 1;
    else {
      assert.equal((await poll(BRIDGES[0])).jobs[0].id, first.body.id);
      sql.prepare('UPDATE print_bridges SET last_seen_ts = ? WHERE id <> ?').run(clock - 46000, BRIDGES[0].id);
      assert.equal((await ack(BRIDGES[0], first.body.id, 'failed', 'printer-target-not-saved')).updated, true);
    }
    sql.prepare('UPDATE print_bridges SET last_seen_ts = ?').run(clock);
    const second = await reprintOf(original);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.notEqual(second.body.id, first.body.id, 'the dead copy is not handed back');
    assert.notEqual(second.body.id, original);
    assert.equal((await reprintOf(original)).body.id, second.body.id, 'and the new attempt is idempotent too');
    const offered = (await listingOf()).map((j) => j.id);
    assert.ok(!offered.includes(original) && !offered.includes(first.body.id), 'only the live attempt is offered, not its superseded copy');
    assert.equal((await poll(BRIDGES[0])).jobs[0].id, second.body.id);
    assert.ok(!JSON.stringify((await poll(BRIDGES[0])).jobs).includes('_reprintOf'), 'lineage never reaches the bridge');
  }));

  await strict('R Reprint with no bridge online says relay-offline, deposits nothing and keeps the ticket offered', fc.asyncProperty(fc.integer({min:0,max:20}), async k => {
    reset(); const original = (await deposit(k)).body.id;
    clock += 10 * 60000 + 1;
    sql.prepare('UPDATE print_bridges SET last_seen_ts = ?').run(clock - 46000);
    const answer = await reprintOf(original);
    assert.equal(answer.status, 409);
    assert.equal(answer.body.error, 'relay-offline');
    assert.equal(rows().length, 1, 'no copy queued for a bridge that is not there');
    assert.ok((await listingOf()).some((j) => j.id === original), 'still offered');
    sql.prepare('UPDATE print_bridges SET last_seen_ts = ?').run(clock);
    assert.equal((await reprintOf(original)).status, 200);
  }));

  console.log(`${failed ? '✗' : '✓'} print-relay-properties-test · ${passed} held, ${known} known, ${failed} failed`);
} finally { f.close(); }
process.exit(failed ? 1 : 0);
