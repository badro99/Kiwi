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

console.log("planning-core-test: 44 controls passed");
