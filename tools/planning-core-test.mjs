import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../assets/planning-core.js", import.meta.url), "utf8");
const context = vm.createContext({ console, structuredClone, Date, Math, JSON, Set, Map });
vm.runInContext(source, context, { filename: "planning-core.js" });
const P = context.KiwiPlanningCore;
const members = [{ id: "a", name: "Amira", startDate: "2026-01-01" }, { id: "b", name: "Bilal" }];
const days = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15", "2026-08-16"];
const shifts = { a: { "2026-08-10": { start: "09:00", end: "17:00" } }, b: { "2026-08-11": { start: "18:00", end: "02:00" } } };

assert.equal(P.status(P.blank(), shifts, days).state, "draft");
assert.equal(P.publish(P.blank(), {}, days, members).issues[0].code, "empty-schedule");
const published = P.publish(P.blank(), shifts, days, members, "2026-08-01T10:00:00Z");
assert.equal(published.ok, true);
assert.equal(published.planning.publishingEnabled, true);
assert.equal(P.status(published.planning, shifts, days).state, "published");
const changed = structuredClone(shifts);
changed.a["2026-08-10"].end = "18:00";
assert.equal(P.status(published.planning, changed, days).state, "changed");
assert.equal(P.employeeSchedule({ planning: published.planning, shifts: changed }, "a")["2026-08-10"].end, "17:00");

const leave = P.blank();
leave.requests.push({ id: "r1", memberId: "a", type: "leave", startDate: "2026-08-10", endDate: "2026-08-10", status: "approved" });
assert.equal(P.validate({ members, shifts, planning: leave, days })[0].code, "approved-leave");
assert.equal(P.publish(leave, shifts, days, members).ok, false);

const unavailable = P.blank();
unavailable.availability.a = { weekdays: { "1": { available: false } } };
assert.equal(P.validate({ members, shifts, planning: unavailable, days })[0].code, "unavailable");
unavailable.availability.a.weekdays["1"] = { available: true, start: "10:00", end: "16:00" };
assert.equal(P.validate({ members, shifts, planning: unavailable, days })[0].code, "outside-availability");

const contracted = [{ id: "a", name: "Amira", startDate: "2026-08-11" }];
assert.equal(P.validate({ members: contracted, shifts: { a: shifts.a }, planning: P.blank(), days })[0].code, "outside-contract");

const overlapping = { b: { "2026-08-11": { start: "18:00", end: "02:00" }, "2026-08-12": { start: "01:00", end: "08:00" } } };
assert.equal(P.validate({ members, shifts: overlapping, planning: P.blank(), days }).some((item) => item.code === "overlap"), true);

const template = P.templateFromWeek("Soir", members, shifts, days);
const nextDays = days.map((day) => new Date(Date.parse(day + "T12:00:00Z") + 7 * 86400000).toISOString().slice(0, 10));
const applied = P.applyTemplate(template, nextDays, {}, members);
assert.equal(applied.a["2026-08-17"].start, "09:00");
assert.equal(applied.b["2026-08-18"].end, "02:00");

const merged = P.merge({ requests: [{ id: "x", memberId: "a", status: "pending", updatedAt: "2026-01-01" }] }, { requests: [{ id: "x", memberId: "a", status: "approved", updatedAt: "2026-02-01" }] }, members);
assert.equal(merged.requests[0].status, "approved");
const mergedWeeks = P.merge({ publishedShifts:{ a:{ "2026-08-10":{ start:"09:00", end:"17:00" } } } }, { publishedShifts:{ a:{ "2026-08-17":{ start:"10:00", end:"18:00" } } } }, members);
assert.equal(Object.keys(mergedWeeks.publishedShifts.a).length, 2);

const covered = P.blank();
covered.coverageRules.push({ id:'cov-1', label:'Ouverture', role:'', weekdays:[1], start:'10:00', end:'16:00', minimum:1 });
let coverage = P.coverageSummary({ planning:covered, members, days, shifts });
assert.equal(coverage[0].gap, 0);
covered.coverageRules[0].minimum = 2;
coverage = P.coverageSummary({ planning:covered, members, days, shifts });
assert.equal(coverage[0].gap, 1);
assert.equal(P.validate({ planning:covered, members, days, shifts }).some((issue)=>issue.code === 'coverage-gap' && issue.severity === 'blocker'), true);
const overnightCoverage = P.blank();
overnightCoverage.coverageRules.push({ id:'cov-night', weekdays:[3], start:'00:30', end:'01:30', minimum:1 });
assert.equal(P.coverageSummary({ planning:overnightCoverage, members, days, shifts })[0].gap, 0);

const long = P.blank(); long.settings.maxDailyHours = 7; long.settings.maxWeeklyHours = 7;
const longIssues = P.validate({ planning:long, members, days, shifts });
assert.equal(longIssues.some((issue)=>issue.code === 'long-shift' && issue.severity === 'warning'), true);
assert.equal(longIssues.some((issue)=>issue.code === 'weekly-hours'), true);
const shortRest = { a:{ '2026-08-10':{start:'14:00',end:'23:00'}, '2026-08-11':{start:'06:00',end:'12:00'} } };
assert.equal(P.validate({ planning:P.blank(), members, days, shifts:shortRest }).some((issue)=>issue.code === 'short-rest'), true);

const opened = P.createOpenShift(P.blank(), { day:'2026-08-13', start:'12:00', end:'20:00', role:'Serveur' }, '2026-08-01T10:00:00Z');
assert.equal(opened.ok, true);
assert.equal(opened.item.status, 'open');
const claimed = P.claimOpenShift(opened.planning, opened.item.id, 'b', '2026-08-01T11:00:00Z');
assert.equal(claimed.ok, true);
const assigned = P.decideOpenShift(claimed.planning, shifts, opened.item.id, 'approved', members, '2026-08-01T12:00:00Z');
assert.equal(assigned.ok, true);
assert.equal(assigned.shifts.b['2026-08-13'].end, '20:00');
assert.equal(assigned.planning.notices.at(-1).memberId, 'b');
assert.equal(P.createOpenShift(P.blank(), { day:'bad', start:'12:00', end:'20:00' }).ok, false);
assert.equal(P.createOpenShift(P.blank(), { day:'2026-07-31', start:'12:00', end:'20:00' }, '2026-08-01T10:00:00Z').error, 'open-shift-past');

const swapBase = P.publish(P.blank(), {
  a:{ '2026-08-10':{start:'09:00',end:'17:00'} },
  b:{ '2026-08-11':{start:'12:00',end:'20:00'} }
}, days, members, '2026-08-01T10:00:00Z').planning;
const swapOpen = P.requestSwap(swapBase, 'a', '2026-08-10', '2026-08-02T10:00:00Z');
assert.equal(swapOpen.ok, true);
assert.equal(P.requestSwap(swapOpen.planning, 'a', '2026-08-10', '2026-08-02T10:05:00Z').error, 'swap-already-open');
const swapClaim = P.claimSwap(swapOpen.planning, swapOpen.item.id, 'b', '2026-08-11', '2026-08-02T11:00:00Z');
assert.equal(swapClaim.ok, true);
const swapDone = P.decideSwap(swapClaim.planning, {
  a:{ '2026-08-10':{start:'09:00',end:'17:00'} }, b:{ '2026-08-11':{start:'12:00',end:'20:00'} }
}, swapOpen.item.id, 'approved', members, '2026-08-02T12:00:00Z');
assert.equal(swapDone.ok, true);
assert.equal(swapDone.shifts.b['2026-08-10'].start, '09:00');
assert.equal(swapDone.shifts.a['2026-08-11'].start, '12:00');
assert.equal(swapDone.planning.notices.filter((notice)=>notice.type === 'swap-approved').length, 2);
const changedDraft = P.decideSwap(swapClaim.planning, {
  a:{ '2026-08-10':{start:'10:00',end:'17:00'} }, b:{ '2026-08-11':{start:'12:00',end:'20:00'} }
}, swapOpen.item.id, 'approved', members, '2026-08-02T12:00:00Z');
assert.equal(changedDraft.error, 'swap-source-changed');
assert.equal(P.requestSwap(swapBase, 'a', '2026-08-10', '2026-08-11T10:00:00Z').error, 'swap-shift-past');
assert.equal(P.publish(P.blank(), shifts, days, members).planning.notices.some((notice)=>notice.type === 'schedule-published'), true);

const optimizedPlanning=P.blank();
optimizedPlanning.coverageRules.push({id:'lunch',role:'serveur',minimum:1,start:'12:00',end:'16:00',weekdays:[1],active:true});
const optimizedMembers=[{id:'s1',name:'Sara',function:'Serveur'},{id:'s2',name:'Yassine',function:'Serveur'}];
const optimized=P.optimize({planning:optimizedPlanning,shifts:{},days,members:optimizedMembers});
assert.equal(optimized.assignments.length,1);
assert.equal(optimized.unresolved.length,0);
assert.equal(optimized.shifts.s1['2026-08-10'].generated,true);
optimizedPlanning.requests.push({id:'leave',memberId:'s1',type:'leave',startDate:'2026-08-10',endDate:'2026-08-10',status:'approved'});
optimizedPlanning.availability.s2={weekdays:{'1':{available:false}}};
const impossible=P.optimize({planning:optimizedPlanning,shifts:{},days,members:optimizedMembers});
assert.equal(impossible.assignments.length,0);
assert.equal(impossible.unresolved.length,1);

const fairMembers=[
  {id:'f1',name:'Fatima'}, {id:'f2',name:'Omar'}, {id:'f3',name:'Nadia'}, {id:'f4',name:'Youssef'}
];
const fairPeriods=Object.fromEntries(days.map((day)=>[day,[{from:'09:00',to:'17:00'}]]));
const fair=P.fairSchedule({planning:P.blank(),shifts:{},days,members:fairMembers,dailyPeople:4,shiftsPerDay:2,periodsByDay:fairPeriods,seed:'test'});
assert.equal(fair.unresolved.length,0);
assert.equal(fair.assignments.length,28);
assert.equal(JSON.stringify(P.openingSlots([{from:'09:00',to:'17:00'}],2).slots.map((slot)=>[slot.start,slot.end])),JSON.stringify([['09:00','13:00'],['13:00','17:00']]));
assert.equal(Math.max(...fair.hoursByMember.map((row)=>row.hours))-Math.min(...fair.hoursByMember.map((row)=>row.hours))<=4,true);
assert.equal(P.fairSchedule({planning:P.blank(),shifts:{},days,members:fairMembers,dailyPeople:4,shiftsPerDay:2,periodsByDay:fairPeriods,seed:'test'}).shifts.f1['2026-08-10']?.start,fair.shifts.f1['2026-08-10']?.start);

const fairRules=P.blank();
fairRules.requests.push({id:'leave-f1',memberId:'f1',type:'leave',startDate:days[0],endDate:days[0],status:'approved'});
fairRules.availability.f2={weekdays:{'1':{available:false}}};
const constrained=P.fairSchedule({planning:fairRules,shifts:{},days:[days[0]],members:fairMembers,dailyPeople:2,shiftsPerDay:1,periodsByDay:{[days[0]]:[{from:'09:00',to:'17:00'}]}});
assert.equal(Boolean(constrained.shifts.f1[days[0]]),false);
assert.equal(Boolean(constrained.shifts.f2[days[0]]),false);
assert.equal(constrained.assignments.length,2);

const split=P.openingSlots([{from:'09:00',to:'13:00'},{from:'18:00',to:'22:00'}],2);
assert.equal(JSON.stringify(split.slots.map((slot)=>[slot.start,slot.end])),JSON.stringify([['09:00','13:00'],['18:00','22:00']]));
assert.equal(P.openingSlots([{from:'09:00',to:'13:00'},{from:'18:00',to:'22:00'}],1).error,'shifts-below-periods');
const shortage=P.fairSchedule({planning:P.blank(),shifts:{},days:[days[0]],members:fairMembers.slice(0,2),dailyPeople:4,shiftsPerDay:2,periodsByDay:{[days[0]]:[{from:'09:00',to:'17:00'}]}});
assert.equal(shortage.unresolved.some((row)=>row.code==='staff-shortage'),true);
assert.equal(P.fairSchedule({planning:P.blank(),shifts:{},days:[days[0]],members:fairMembers,dailyPeople:1,shiftsPerDay:2,periodsByDay:{[days[0]]:[{from:'09:00',to:'17:00'}]}}).unresolved[0].code,'people-below-shifts');
assert.equal(P.fairSchedule({planning:P.blank(),shifts:{},days:[days[0]],members:fairMembers,dailyPeople:2,shiftsPerDay:1,periodsByDay:{[days[0]]:[]}}).closedDays[0],days[0]);

console.log("planning-core-test: 61 controls passed");
