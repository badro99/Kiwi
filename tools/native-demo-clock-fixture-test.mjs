#!/usr/bin/env node
// Test clock semantics and the real read-only demo/report engines, no UI or I/O.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { demoClockFixture, installDemoClock, DEMO_TIMEZONE } from './native-demo-clock-fixture.mjs';
let checks=0;
function check(value,label) { assert.ok(value,label); checks++; console.log('  ✓ '+label); }
const fixture=demoClockFixture('2026-10-04');
const context=vm.createContext({epochMs:fixture.midServiceMs,performance,setTimeout,setInterval,clearTimeout,clearInterval});
vm.runInContext('globalThis.OriginalDate=Date; globalThis.originalTimers=[setTimeout,setInterval,clearTimeout,clearInterval]; globalThis.originalPerformance=performance',context);
vm.runInContext(`(${installDemoClock.toString()})(epochMs)`,context);
for (const [expression,label] of [
  ['Date.now()===epochMs && +new Date()===epochMs','Date.now and no-argument constructor agree'],
  ['Date()===new Date().toString() && Date(0)===Date()','callable Date preserves its argument-ignoring string form'],
  ['+new Date(0)===0 && +new Date("2001-02-03T04:05:06Z")===OriginalDate.parse("2001-02-03T04:05:06Z")','explicit epoch and string construction remain unchanged'],
  ['+new Date(2026,9,4,12,30)===+new OriginalDate(2026,9,4,12,30)','multi-argument local constructor remains unchanged'],
  ['Date.parse===OriginalDate.parse && Date.UTC===OriginalDate.UTC && Date.UTC(2026,9,4,12)===epochMs','parse and UTC remain the original methods'],
  ['Date.prototype===OriginalDate.prototype && new Date() instanceof Date && new Date() instanceof OriginalDate','prototype and instanceof remain native'],
  ['Date.now===Date.now && Date.name===OriginalDate.name && Date.length===OriginalDate.length','method identity and constructor metadata stay stable'],
  ['(()=>{class Child extends Date{}; const d=new Child(); return d instanceof Child && d instanceof Date && +d===epochMs})()','Date subclasses retain their prototype and coherent epoch'],
  ['Number.isNaN(+new Date(undefined)) && Number.isNaN(+new Date(NaN))','explicit invalid constructor arguments remain invalid'],
  ['originalTimers.every((f,i)=>f===[setTimeout,setInterval,clearTimeout,clearInterval][i]) && performance===originalPerformance','real timers and performance clock are not replaced'],
]) check(vm.runInContext(expression,context),label);
const timerStarted=performance.now();
await new Promise(resolve=>context.setTimeout(resolve,20));
check(performance.now()-timerStarted>=10 && vm.runInContext('Date.now()===epochMs',context),
  'real timer elapses while the isolated fixture Date stays fixed');
assert.throws(()=>demoClockFixture('2026-02-30'),/valid UTC/); checks++;
assert.throws(()=>demoClockFixture('not-a-day'),/valid UTC/); checks++;
assert.throws(()=>vm.runInContext(`(${installDemoClock.toString()})(NaN)`,context),/valid epoch/); checks++;

const reportSource=fs.readFileSync(new URL('../assets/day-report.js',import.meta.url),'utf8');
const demoSource=fs.readFileSync(new URL('../assets/demoClock.js',import.meta.url),'utf8');
for (const [day,fromISO] of [['2026-10-04','2026-10-04T04:00:00.000Z'],['2026-02-25','2026-02-25T05:00:00.000Z']]) {
  const clock=demoClockFixture(day);
  for (const state of ['midServiceMs','emptyDayMs']) {
    const sandbox=vm.createContext({epochMs:clock[state],location:{pathname:'/fixture',search:''},
      localStorage:{getItem:()=>null,setItem:()=>{throw new Error('fixture must not persist');}},
      document:{readyState:'loading',addEventListener(){}},
      KiwiConfig:{timezone:DEMO_TIMEZONE},addEventListener(){}});
    vm.runInContext('window=globalThis',sandbox);
    vm.runInContext(`(${installDemoClock.toString()})(epochMs)`,sandbox);
    vm.runInContext(reportSource,sandbox);
    vm.runInContext(demoSource,sandbox);
    const result=vm.runInContext(`(()=>{
      const dr=KiwiDayReport, today=dr.today(), bounds=dr.dayBounds(today), yesterday=dr.shiftDay(today,-1);
      const old=dr.dayBounds(yesterday), rows=KiwiDemoClock.getDaySales();
      const aligned=old.from+(Date.now()-bounds.from)/(bounds.to-bounds.from)*(old.to-old.from);
      return {today,timezone:dr.timezone(),from:new Date(bounds.from).toISOString(),to:bounds.to,
        cutoffDays:[dr.businessDay(bounds.from-1),dr.businessDay(bounds.from),dr.businessDay(bounds.to-1),dr.businessDay(bounds.to)],
        firstService:bounds.from+2*3600000, count:rows.length,
        previous:KiwiDemoClock.getDaySales(yesterday).filter(r=>r.ts<=aligned).length,
        methods:[...new Set(rows.map(r=>r.method))],
        valid:rows.every(r=>r.ts>=bounds.from && r.ts<bounds.to && r.ts<=Date.now()),
        stable:JSON.stringify(rows)===JSON.stringify(KiwiDemoClock.getDaySales()),
        sim:KiwiDemoClock.getSimState(),report:dr.build({day:today,sales:KiwiDemoClock.getSales(30)})};
    })()`,sandbox);
    const label=day+' '+state;
    check(result.today===day && result.timezone===DEMO_TIMEZONE,label+': explicit merchant business day');
    check(result.from===fromISO && result.to-Date.parse(fromISO)===86400000,label+': exact 05:00 boundary (GMT+1 or Ramadan GMT+0)');
    check(JSON.stringify(result.cutoffDays)===JSON.stringify([
      new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10),day,day,
      new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10)]),
      label+': one-millisecond cutoff edges group into the correct business day');
    check(result.valid && result.stable,label+': deterministic bounded nonfuture rows');
    check(result.report.net===result.sim.cumRevenue && result.report.txns===result.sim.cumTx && result.count===result.sim.cumTx,
      label+': report and demo totals agree');
    if (state==='midServiceMs') {
      check(clock[state]>result.firstService && result.count>0 && result.previous>0,label+': current and aligned prior service are both exercised');
      check(['cash','card','wallet'].every(method=>result.methods.includes(method)),label+': every original tender assertion remains exercised');
    } else {
      check(clock[state]<result.firstService && result.count===0 && result.previous===0,label+': early service is genuinely empty in both days');
      check(result.sim.cumRevenue===0 && result.sim.cumTx===0 && result.methods.length===0,label+': no fabricated money or tenders');
    }
  }
}
console.log(`native demo clock fixture: ${checks} checks passed`);
