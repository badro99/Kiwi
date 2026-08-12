(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KiwiPlanningCore = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const DAY_MS = 86400000;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function blank() {
    return {
      schema: 2,
      publishingEnabled: false,
      availability: {},
      requests: [],
      templates: [],
      coverageRules: [],
      openShifts: [],
      swapRequests: [],
      notices: [],
      settings: { minRestHours: 10, maxDailyHours: 12, maxWeeklyHours: 48 },
      publishedShifts: {},
      publications: {}
    };
  }

  function isoDay(value) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const text = String(value || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
  }

  function dayNumber(iso) {
    const date = new Date(iso + "T12:00:00Z");
    return Number.isNaN(date.getTime()) ? -1 : date.getUTCDay();
  }

  function minutes(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }

  function shiftInterval(day, shift) {
    if (!shift || shift.off) return null;
    const startMin = minutes(shift.start);
    const endMin = minutes(shift.end);
    if (startMin == null || endMin == null || startMin === endMin) return null;
    const base = Date.parse(day + "T00:00:00Z");
    return {
      start: base + startMin * 60000,
      end: base + endMin * 60000 + (endMin <= startMin ? DAY_MS : 0)
    };
  }

  function offsetDay(day, amount) {
    const value = Date.parse(String(day || "") + "T12:00:00Z");
    return Number.isNaN(value) ? "" : new Date(value + amount * DAY_MS).toISOString().slice(0, 10);
  }

  function memberIds(members) {
    return new Set((members || []).map((member) => String(member.id || "")).filter(Boolean));
  }

  function normalize(raw, members) {
    const out = Object.assign(blank(), clone(raw || {}));
    const alive = members && members.length ? memberIds(members) : null;
    out.schema = 2;
    out.publishingEnabled = Boolean(out.publishingEnabled);
    out.availability = out.availability && typeof out.availability === "object" ? out.availability : {};
    out.requests = Array.isArray(out.requests) ? out.requests : [];
    out.templates = Array.isArray(out.templates) ? out.templates : [];
    out.coverageRules = Array.isArray(out.coverageRules) ? out.coverageRules : [];
    out.openShifts = Array.isArray(out.openShifts) ? out.openShifts : [];
    out.swapRequests = Array.isArray(out.swapRequests) ? out.swapRequests : [];
    out.notices = Array.isArray(out.notices) ? out.notices.slice(-200) : [];
    out.settings = Object.assign({ minRestHours: 10, maxDailyHours: 12, maxWeeklyHours: 48 }, out.settings || {});
    out.publishedShifts = out.publishedShifts && typeof out.publishedShifts === "object" ? out.publishedShifts : {};
    out.publications = out.publications && typeof out.publications === "object" ? out.publications : {};
    if (alive) {
      Object.keys(out.availability).forEach((id) => { if (!alive.has(String(id))) delete out.availability[id]; });
      Object.keys(out.publishedShifts).forEach((id) => { if (!alive.has(String(id))) delete out.publishedShifts[id]; });
      out.requests = out.requests.filter((request) => alive.has(String(request.memberId || "")));
      out.openShifts = out.openShifts.filter((shift) => !shift.memberId || alive.has(String(shift.memberId)));
      out.swapRequests = out.swapRequests.filter((request) => alive.has(String(request.memberId || "")) && (!request.claimantId || alive.has(String(request.claimantId))));
      out.notices = out.notices.filter((notice) => !notice.memberId || alive.has(String(notice.memberId)));
    }
    return out;
  }

  function latestById(a, b) {
    const map = new Map();
    [...(a || []), ...(b || [])].forEach((item) => {
      if (!item || !item.id) return;
      const prior = map.get(item.id);
      if (!prior || String(item.updatedAt || item.createdAt || "") >= String(prior.updatedAt || prior.createdAt || "")) {
        map.set(item.id, clone(item));
      }
    });
    return Array.from(map.values());
  }

  function merge(mine, theirs, members) {
    mine = normalize(mine, members);
    theirs = normalize(theirs, members);
    const out = normalize(theirs, members);
    out.publishingEnabled = mine.publishingEnabled || theirs.publishingEnabled;
    out.availability = Object.assign({}, theirs.availability, mine.availability);
    out.requests = latestById(theirs.requests, mine.requests);
    out.templates = latestById(theirs.templates, mine.templates);
    out.coverageRules = latestById(theirs.coverageRules, mine.coverageRules);
    out.openShifts = latestById(theirs.openShifts, mine.openShifts);
    out.swapRequests = latestById(theirs.swapRequests, mine.swapRequests);
    out.notices = latestById(theirs.notices, mine.notices).slice(-200);
    out.settings = Object.assign({}, theirs.settings || {}, mine.settings || {});
    out.publishedShifts = clone(theirs.publishedShifts || {});
    Object.keys(mine.publishedShifts || {}).forEach((memberId) => {
      out.publishedShifts[memberId] = Object.assign({}, out.publishedShifts[memberId] || {}, mine.publishedShifts[memberId] || {});
    });
    out.publications = Object.assign({}, theirs.publications, mine.publications);
    return normalize(out, members);
  }

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce((out, key) => {
        out[key] = stable(value[key]);
        return out;
      }, {});
    }
    return value;
  }

  function hash(value) {
    const text = JSON.stringify(stable(value));
    let result = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      result ^= text.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function periodDays(days) {
    return [...new Set((days || []).map(isoDay).filter(Boolean))].sort();
  }

  function periodKey(days) {
    const clean = periodDays(days);
    return clean.length ? clean[0] + ".." + clean[clean.length - 1] : "";
  }

  function periodShifts(shifts, days) {
    const allowed = new Set(periodDays(days));
    const out = {};
    Object.keys(shifts || {}).sort().forEach((memberId) => {
      const selected = {};
      Object.keys(shifts[memberId] || {}).sort().forEach((day) => {
        if (allowed.has(day)) selected[day] = clone(shifts[memberId][day]);
      });
      if (Object.keys(selected).length) out[memberId] = selected;
    });
    return out;
  }

  function status(planning, shifts, days) {
    planning = normalize(planning);
    const key = periodKey(days);
    const publication = planning.publications[key];
    if (!publication) return { state: "draft", key, revision: 0 };
    const currentHash = hash(periodShifts(shifts, days));
    return {
      state: currentHash === publication.hash ? "published" : "changed",
      key,
      revision: Number(publication.revision || 1),
      publishedAt: publication.publishedAt || ""
    };
  }

  function approvedLeave(planning, memberId, day) {
    return planning.requests.find((request) => request.memberId === memberId && request.type === "leave" && request.status === "approved" && day >= request.startDate && day <= request.endDate);
  }

  function roleKey(value) {
    return String(value || "").trim().toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function memberRole(member) {
    return roleKey(member && (member.function || member.department || member.role));
  }

  function shiftHours(day, shift) {
    const interval = shiftInterval(day, shift);
    return interval ? (interval.end - interval.start) / 3600000 : 0;
  }

  function clockFromMinutes(value) {
    value = ((Math.round(value) % 1440) + 1440) % 1440;
    return String(Math.floor(value / 60)).padStart(2, "0") + ":" + String(value % 60).padStart(2, "0");
  }

  function weekKey(day) {
    const stamp = Date.parse(String(day || "") + "T12:00:00Z");
    if (Number.isNaN(stamp)) return "";
    const date = new Date(stamp);
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    return new Date(stamp - mondayOffset * DAY_MS).toISOString().slice(0, 10);
  }

  /* Split the venue's real opening periods into a requested number of shifts.
   * A lunch closure is never turned into paid time: every generated shift
   * remains inside one recorded opening period. */
  function openingSlots(periods, count) {
    const spans = (Array.isArray(periods) ? periods : []).map((period) => {
      const start = minutes(period && period.from);
      let end = minutes(period && period.to);
      if (start == null || end == null || start === end) return null;
      if (end <= start) end += 1440;
      return { start, end, duration:end - start };
    }).filter(Boolean);
    count = Math.max(1, Math.floor(Number(count) || 1));
    if (!spans.length) return { slots:[], error:"closed" };
    if (count < spans.length) return { slots:[], error:"shifts-below-periods", minimum:spans.length };
    const allocations = spans.map(() => 1);
    for (let left = count - spans.length; left > 0; left -= 1) {
      let best = 0;
      for (let index = 1; index < spans.length; index += 1) {
        if (spans[index].duration / allocations[index] > spans[best].duration / allocations[best]) best = index;
      }
      allocations[best] += 1;
    }
    const slots = [];
    spans.forEach((span, spanIndex) => {
      const parts = allocations[spanIndex];
      for (let index = 0; index < parts; index += 1) {
        const rawStart = span.start + span.duration * index / parts;
        const rawEnd = span.start + span.duration * (index + 1) / parts;
        const start = index ? Math.round(rawStart / 5) * 5 : span.start;
        const end = index === parts - 1 ? span.end : Math.round(rawEnd / 5) * 5;
        if (end > start) slots.push({ start:clockFromMinutes(start), end:clockFromMinutes(end), minutes:end - start });
      }
    });
    return { slots, error:"" };
  }

  function coverageSummary(input) {
    const members = input.members || [];
    const shifts = input.shifts || {};
    const planning = normalize(input.planning, members);
    const days = periodDays(input.days);
    const byId = new Map(members.map((member) => [String(member.id || ""), member]));
    const rows = [];
    (planning.coverageRules || []).forEach((rule) => {
      if (!rule || rule.active === false) return;
      const weekdays = Array.isArray(rule.weekdays) ? rule.weekdays.map(Number) : [];
      const required = Math.max(1, Math.min(99, Math.floor(Number(rule.minimum) || 1)));
      const ruleRole = roleKey(rule.role);
      days.forEach((day) => {
        if (weekdays.length && !weekdays.includes(dayNumber(day))) return;
        const interval = shiftInterval(day, { start: rule.start, end: rule.end });
        if (!interval) return;
        const events = [{ at: interval.start, delta: 0 }, { at: interval.end, delta: 0 }];
        Object.keys(shifts).forEach((memberId) => {
          const member = byId.get(String(memberId));
          if (!member || (ruleRole && ruleRole !== "*" && memberRole(member) !== ruleRole)) return;
          [offsetDay(day, -1), day].forEach((shiftDay) => {
            const assigned = shiftInterval(shiftDay, shifts[memberId] && shifts[memberId][shiftDay]);
            if (!assigned) return;
            const start = Math.max(interval.start, assigned.start);
            const end = Math.min(interval.end, assigned.end);
            if (end <= start) return;
            events.push({ at: start, delta: 1 }, { at: end, delta: -1 });
          });
        });
        events.sort((a, b) => a.at - b.at || b.delta - a.delta);
        let count = 0;
        let minimum = Infinity;
        for (let index = 0; index < events.length - 1; index += 1) {
          count += events[index].delta;
          if (events[index + 1].at > events[index].at) minimum = Math.min(minimum, count);
        }
        if (!Number.isFinite(minimum)) minimum = 0;
        rows.push({ ruleId: String(rule.id || ""), label: String(rule.label || rule.role || "Équipe"), role: String(rule.role || ""), day, start: String(rule.start || ""), end: String(rule.end || ""), required, scheduled: minimum, gap: Math.max(0, required - minimum) });
      });
    });
    return rows;
  }

  function validate(input) {
    const members = input.members || [];
    const shifts = input.shifts || {};
    const planning = normalize(input.planning, members);
    const days = periodDays(input.days);
    const issues = [];
    let decided = 0;
    const byId = new Map(members.map((member) => [String(member.id), member]));
    const settings = planning.settings || {};
    const maxDaily = Math.max(0, Number(settings.maxDailyHours) || 0);
    const maxWeekly = Math.max(0, Number(settings.maxWeeklyHours) || 0);
    const minRest = Math.max(0, Number(settings.minRestHours) || 0);

    Object.keys(shifts).forEach((memberId) => {
      const member = byId.get(String(memberId));
      Object.keys(shifts[memberId] || {}).sort().forEach((day) => {
        if (days.length && !days.includes(day)) return;
        const shift = shifts[memberId][day];
        if (shift && typeof shift === "object") decided += 1;
        const interval = shiftInterval(day, shift);
        if (!interval) return;
        const base = { severity: "blocker", memberId, memberName: member && member.name || memberId, day };
        if (!member) {
          issues.push(Object.assign({}, base, { code: "unknown-member" }));
          return;
        }
        if ((member.startDate && day < isoDay(member.startDate)) || (member.endDate && day > isoDay(member.endDate))) {
          issues.push(Object.assign({}, base, { code: "outside-contract" }));
        }
        if (approvedLeave(planning, memberId, day)) {
          issues.push(Object.assign({}, base, { code: "approved-leave" }));
        }
        if (maxDaily && shiftHours(day, shift) > maxDaily) {
          issues.push(Object.assign({}, base, { severity: "warning", code: "long-shift", hours: shiftHours(day, shift) }));
        }
        const weekly = planning.availability[memberId] && planning.availability[memberId].weekdays;
        const available = weekly && weekly[String(dayNumber(day))];
        if (available) {
          if (available.available === false) {
            issues.push(Object.assign({}, base, { code: "unavailable" }));
          } else {
            const allowedStart = minutes(available.start);
            const allowedEnd = minutes(available.end);
            const actualStart = minutes(shift.start);
            const actualEnd = minutes(shift.end);
            if (allowedStart != null && allowedEnd != null && actualStart != null && actualEnd != null) {
              const allowedEndAdjusted = allowedEnd <= allowedStart ? allowedEnd + 1440 : allowedEnd;
              const actualEndAdjusted = actualEnd <= actualStart ? actualEnd + 1440 : actualEnd;
              if (actualStart < allowedStart || actualEndAdjusted > allowedEndAdjusted) {
                issues.push(Object.assign({}, base, { code: "outside-availability" }));
              }
            }
          }
        }
      });

      const intervals = Object.keys(shifts[memberId] || {}).map((day) => {
        const interval = shiftInterval(day, shifts[memberId][day]);
        return interval && { day, interval };
      }).filter(Boolean).sort((a, b) => a.interval.start - b.interval.start);
      const periodHours = intervals.reduce((sum, item) => (!days.length || days.includes(item.day)) ? sum + (item.interval.end - item.interval.start) / 3600000 : sum, 0);
      if (maxWeekly && periodHours > maxWeekly) {
        issues.push({ severity: "warning", code: "weekly-hours", memberId, memberName: member && (member.name || [member.firstName, member.lastName].filter(Boolean).join(" ")) || memberId, day: days[0] || "", hours: periodHours, limit: maxWeekly });
      }
      for (let index = 1; index < intervals.length; index += 1) {
        if (intervals[index].interval.start < intervals[index - 1].interval.end) {
          const day = intervals[index].day;
          if (!days.length || days.includes(day) || days.includes(intervals[index - 1].day)) {
            issues.push({ severity: "blocker", code: "overlap", memberId, memberName: member && member.name || memberId, day, otherDay: intervals[index - 1].day });
          }
        }
        const restHours = (intervals[index].interval.start - intervals[index - 1].interval.end) / 3600000;
        if (minRest && restHours >= 0 && restHours < minRest) {
          const day = intervals[index].day;
          if (!days.length || days.includes(day) || days.includes(intervals[index - 1].day)) {
            issues.push({ severity: "warning", code: "short-rest", memberId, memberName: member && (member.name || [member.firstName, member.lastName].filter(Boolean).join(" ")) || memberId, day, hours: restHours, limit: minRest });
          }
        }
      }
    });
    coverageSummary({ planning, shifts, days, members }).filter((row) => row.gap > 0).forEach((row) => {
      issues.push({ severity: "blocker", code: "coverage-gap", day: row.day, role: row.role, label: row.label, required: row.required, scheduled: row.scheduled, gap: row.gap });
    });
    (planning.openShifts || []).filter((shift) => shift && shift.status === "open" && (!days.length || days.includes(shift.day))).forEach((shift) => {
      issues.push({ severity: "warning", code: "open-shift", day: shift.day, role: shift.role || "", shiftId: shift.id });
    });
    if (members.length && decided === 0) issues.unshift({ severity:"blocker", code:"empty-schedule", memberId:"", memberName:"", day:days[0] || "" });
    return issues;
  }

  function templateFromWeek(name, members, shifts, days) {
    const cleanDays = periodDays(days).slice(0, 7);
    const template = { id: "tpl-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7), name: String(name || "Semaine type").trim().slice(0, 80), days: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const alive = memberIds(members || []);
    Object.keys(shifts || {}).forEach((memberId) => {
      if (alive.size && !alive.has(String(memberId))) return;
      cleanDays.forEach((day) => {
        const shift = shifts[memberId] && shifts[memberId][day];
        if (!shift) return;
        if (!template.days[memberId]) template.days[memberId] = {};
        template.days[memberId][String(dayNumber(day))] = clone(shift);
      });
    });
    return template;
  }

  function applyTemplate(template, targetDays, shifts, members) {
    const out = clone(shifts || {});
    const alive = memberIds(members || []);
    periodDays(targetDays).forEach((day) => {
      Object.keys(template && template.days || {}).forEach((memberId) => {
        if (alive.size && !alive.has(String(memberId))) return;
        const shift = template.days[memberId][String(dayNumber(day))];
        if (!shift) return;
        if (!out[memberId]) out[memberId] = {};
        out[memberId][day] = clone(shift);
      });
    });
    return out;
  }

  function addNotice(planning, notice) {
    const clean = normalize(planning);
    const item = Object.assign({ id: "notice-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7), createdAt: new Date().toISOString(), readAt: "" }, clone(notice || {}));
    clean.notices = latestById(clean.notices, [item]).slice(-200);
    return clean;
  }

  function createOpenShift(planning, data, now) {
    const clean = normalize(planning);
    const day = isoDay(data && data.day);
    const interval = shiftInterval(day, data || {});
    const at = now || new Date().toISOString();
    if (!day || !interval) return { ok: false, error: "open-shift-invalid", planning: clean };
    if (day < isoDay(at)) return { ok: false, error: "open-shift-past", planning: clean };
    const item = {
      id: "open-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7),
      day, start: String(data.start), end: String(data.end), role: String(data.role || "").trim().slice(0, 80),
      note: String(data.note || "").trim().slice(0, 160), status: "open", claimantId: "", memberId: "",
      createdAt: at, updatedAt: at
    };
    clean.openShifts.push(item);
    return { ok: true, planning: clean, item };
  }

  function claimOpenShift(planning, shiftId, memberId, now) {
    const clean = normalize(planning);
    const item = clean.openShifts.find((shift) => shift.id === shiftId);
    if (!item || item.status !== "open" || !memberId) return { ok: false, error: "open-shift-unavailable", planning: clean };
    item.status = "claimed"; item.claimantId = String(memberId); item.updatedAt = now || new Date().toISOString();
    return { ok: true, planning: clean, item };
  }

  function requestSwap(planning, memberId, day, now) {
    const clean = normalize(planning);
    day = isoDay(day);
    const at = now || new Date().toISOString();
    const source = clean.publishedShifts && clean.publishedShifts[memberId] && clean.publishedShifts[memberId][day];
    if (!memberId || !day || !shiftInterval(day, source)) return { ok: false, error: "swap-shift-invalid", planning: clean };
    if (day < isoDay(at)) return { ok: false, error: "swap-shift-past", planning: clean };
    if (clean.swapRequests.some((request) => request.memberId === memberId && request.day === day && ["open", "claimed"].includes(request.status))) return { ok: false, error: "swap-already-open", planning: clean };
    const item = { id: "swap-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7), memberId:String(memberId), day, shift:clone(source), status:"open", claimantId:"", offeredDay:"", createdAt:at, updatedAt:at };
    clean.swapRequests.push(item);
    return { ok:true, planning:clean, item };
  }

  function claimSwap(planning, requestId, claimantId, offeredDay, now) {
    const clean = normalize(planning);
    offeredDay = isoDay(offeredDay);
    const at = now || new Date().toISOString();
    const item = clean.swapRequests.find((request) => request.id === requestId);
    const offered = clean.publishedShifts && clean.publishedShifts[claimantId] && clean.publishedShifts[claimantId][offeredDay];
    if (!item || item.status !== "open" || item.memberId === claimantId || !offeredDay || !shiftInterval(offeredDay, offered)) return { ok:false, error:"swap-offer-invalid", planning:clean };
    if (item.day < isoDay(at) || offeredDay < isoDay(at)) return { ok:false, error:"swap-shift-past", planning:clean };
    item.status = "claimed"; item.claimantId = String(claimantId); item.offeredDay = offeredDay; item.offeredShift = clone(offered); item.updatedAt = at;
    return { ok:true, planning:clean, item };
  }

  function decideOpenShift(planning, shifts, shiftId, decision, members, now) {
    const clean = normalize(planning, members);
    const out = clone(shifts || {});
    const item = clean.openShifts.find((shift) => shift.id === shiftId);
    if (!item || item.status !== "claimed") return { ok:false, error:"open-shift-not-claimed", planning:clean, shifts:out };
    const at = now || new Date().toISOString();
    if (decision !== "approved") {
      item.status = "open"; item.claimantId = ""; item.updatedAt = at;
      return { ok:true, planning:clean, shifts:out, item };
    }
    const memberId = String(item.claimantId || "");
    if (!memberId || (out[memberId] && shiftInterval(item.day, out[memberId][item.day]))) return { ok:false, error:"open-shift-conflict", planning:clean, shifts:out };
    if (!out[memberId]) out[memberId] = {};
    out[memberId][item.day] = { start:item.start, end:item.end };
    item.status = "assigned"; item.memberId = memberId; item.updatedAt = at;
    const noticed = addNotice(clean, { memberId, type:"open-shift-approved", day:item.day, start:item.start, end:item.end, createdAt:at });
    return { ok:true, planning:noticed, shifts:out, item };
  }

  function decideSwap(planning, shifts, requestId, decision, members, now) {
    const clean = normalize(planning, members);
    const out = clone(shifts || {});
    const item = clean.swapRequests.find((request) => request.id === requestId);
    if (!item || item.status !== "claimed") return { ok:false, error:"swap-not-claimed", planning:clean, shifts:out };
    const at = now || new Date().toISOString();
    if (decision !== "approved") { item.status = "rejected"; item.updatedAt = at; return { ok:true, planning:clean, shifts:out, item }; }
    const owner = String(item.memberId || ""), claimant = String(item.claimantId || "");
    const ownerShift = clean.publishedShifts[owner] && clean.publishedShifts[owner][item.day];
    const claimantShift = clean.publishedShifts[claimant] && clean.publishedShifts[claimant][item.offeredDay];
    const draftOwner = out[owner] && out[owner][item.day];
    const draftClaimant = out[claimant] && out[claimant][item.offeredDay];
    if (!shiftInterval(item.day, ownerShift) || !shiftInterval(item.offeredDay, claimantShift)
      || hash(ownerShift) !== hash(item.shift) || hash(claimantShift) !== hash(item.offeredShift)
      || hash(draftOwner) !== hash(ownerShift) || hash(draftClaimant) !== hash(claimantShift)) {
      return { ok:false, error:"swap-source-changed", planning:clean, shifts:out };
    }
    if (!out[owner]) out[owner] = {}; if (!out[claimant]) out[claimant] = {};
    if (item.day === item.offeredDay) {
      out[claimant][item.day] = clone(ownerShift);
      out[owner][item.day] = clone(claimantShift);
    } else {
      delete out[owner][item.day]; delete out[claimant][item.offeredDay];
      out[claimant][item.day] = clone(ownerShift);
      out[owner][item.offeredDay] = clone(claimantShift);
    }
    item.status = "approved"; item.updatedAt = at;
    let noticed = addNotice(clean, { memberId:owner, type:"swap-approved", day:item.day, otherDay:item.offeredDay, createdAt:at });
    noticed = addNotice(noticed, { memberId:claimant, type:"swap-approved", day:item.offeredDay, otherDay:item.day, createdAt:at });
    return { ok:true, planning:noticed, shifts:out, item };
  }

  function publish(planning, shifts, days, members, now) {
    const clean = normalize(planning, members);
    const issues = validate({ planning: clean, shifts, days, members });
    const blockers = issues.filter((issue) => issue.severity === "blocker");
    if (blockers.length) return { ok: false, planning: clean, issues };
    const key = periodKey(days);
    const selected = periodShifts(shifts, days);
    const allowed = new Set(periodDays(days));
    Object.keys(clean.publishedShifts).forEach((memberId) => {
      Object.keys(clean.publishedShifts[memberId] || {}).forEach((day) => {
        if (allowed.has(day)) delete clean.publishedShifts[memberId][day];
      });
    });
    Object.keys(selected).forEach((memberId) => {
      if (!clean.publishedShifts[memberId]) clean.publishedShifts[memberId] = {};
      Object.assign(clean.publishedShifts[memberId], selected[memberId]);
    });
    const prior = clean.publications[key];
    clean.publishingEnabled = true;
    clean.publications[key] = {
      revision: Number(prior && prior.revision || 0) + 1,
      start: periodDays(days)[0] || "",
      end: periodDays(days).slice(-1)[0] || "",
      publishedAt: now || new Date().toISOString(),
      hash: hash(selected)
    };
    Object.keys(selected).forEach((memberId) => {
      const notice = { id:`schedule-${key}-${clean.publications[key].revision}-${memberId}`, memberId, type:"schedule-published", periodKey:key, revision:clean.publications[key].revision, createdAt:clean.publications[key].publishedAt, readAt:"" };
      clean.notices = latestById(clean.notices, [notice]).slice(-200);
    });
    return { ok: true, planning: clean, issues: [] };
  }

  function employeeSchedule(teamDoc, memberId) {
    const planning = normalize(teamDoc && teamDoc.planning);
    const source = planning.publishingEnabled ? planning.publishedShifts : teamDoc && teamDoc.shifts || {};
    return clone(source && source[memberId] || {});
  }

  /* Fair draft builder. The merchant supplies only a daily headcount and a
   * number of shifts; opening times come from KiwiHours and eligibility comes
   * from the same availability, leave, contract and rest rules as Publish.
   * The result is a proposal: callers must show it and explicitly apply it. */
  function fairSchedule(input) {
    input = input || {};
    const members = (Array.isArray(input.members) ? input.members : []).filter((member) => member && String(member.id || ""));
    const planning = normalize(input.planning, members);
    const days = periodDays(input.days);
    const dailyPeople = Math.max(1, Math.floor(Number(input.dailyPeople) || 1));
    const shiftsPerDay = Math.max(1, Math.floor(Number(input.shiftsPerDay) || 1));
    const periodsByDay = input.periodsByDay && typeof input.periodsByDay === "object" ? input.periodsByDay : {};
    const seed = String(input.seed || periodKey(days) || "kiwi");
    const shifts = clone(input.shifts || {});
    const assignments = [];
    const unresolved = [];
    const closedDays = [];
    const settings = planning.settings || {};
    const maxWeekly = Math.max(0, Number(settings.maxWeeklyHours) || 0);
    const maxDaily = Math.max(0, Number(settings.maxDailyHours) || 0);

    members.forEach((member) => {
      const id = String(member.id);
      if (!shifts[id]) shifts[id] = {};
      days.forEach((day) => { delete shifts[id][day]; });
    });

    const hoursFor = (memberId, week) => Object.keys(shifts[memberId] || {}).reduce((sum, day) => {
      return weekKey(day) === week ? sum + shiftHours(day, shifts[memberId][day]) : sum;
    }, 0);
    const selectedDays = new Set(days);
    const totalFor = (memberId) => Object.keys(shifts[memberId] || {}).reduce((sum, day) => selectedDays.has(day) ? sum + shiftHours(day, shifts[memberId][day]) : sum, 0);
    const availableFor = (member, day, slot) => {
      const id = String(member.id);
      if ((member.startDate && day < isoDay(member.startDate)) || (member.endDate && day > isoDay(member.endDate))) return false;
      if (approvedLeave(planning, id, day)) return false;
      const rule = planning.availability[id] && planning.availability[id].weekdays && planning.availability[id].weekdays[String(dayNumber(day))];
      if (rule && rule.available === false) return false;
      if (rule) {
        const rs = minutes(rule.start), re0 = minutes(rule.end), ss = minutes(slot.start), se0 = minutes(slot.end);
        if ([rs,re0,ss,se0].every((value) => value != null)) {
          const re = re0 <= rs ? re0 + 1440 : re0;
          const se = se0 <= ss ? se0 + 1440 : se0;
          if (ss < rs || se > re) return false;
        }
      }
      if (maxDaily && slot.minutes / 60 > maxDaily + 0.001) return false;
      if (maxWeekly && hoursFor(id, weekKey(day)) + slot.minutes / 60 > maxWeekly + 0.001) return false;
      return true;
    };
    const tie = (memberId, day, slotIndex) => parseInt(hash(seed + "|" + memberId + "|" + day + "|" + slotIndex), 36) || 0;

    days.forEach((day) => {
      const built = openingSlots(periodsByDay[day], shiftsPerDay);
      if (built.error === "closed") { closedDays.push(day); return; }
      if (built.error) {
        unresolved.push({ day, code:built.error, minimum:built.minimum || 1, needed:dailyPeople });
        return;
      }
      if (dailyPeople < built.slots.length) {
        unresolved.push({ day, code:"people-below-shifts", minimum:built.slots.length, needed:dailyPeople });
        return;
      }
      const used = new Set();
      const base = Math.floor(dailyPeople / built.slots.length);
      const extra = dailyPeople % built.slots.length;
      built.slots.forEach((slot, slotIndex) => {
        const required = base + (slotIndex < extra ? 1 : 0);
        let assigned = 0;
        while (assigned < required) {
          const pool = members.filter((member) => !used.has(String(member.id)) && availableFor(member, day, slot))
            .map((member) => ({ member, total:totalFor(String(member.id)), weekly:hoursFor(String(member.id), weekKey(day)), tie:tie(String(member.id), day, slotIndex) }))
            .sort((a, b) => a.total - b.total || a.weekly - b.weekly || a.tie - b.tie || String(a.member.id).localeCompare(String(b.member.id)));
          let chosen = null;
          for (const candidate of pool) {
            const id = String(candidate.member.id);
            const trial = clone(shifts);
            trial[id][day] = { start:slot.start, end:slot.end, generated:true, generator:"fair" };
            const unsafe = validate({ planning, shifts:trial, days, members }).some((issue) => issue.memberId === id && issue.day === day && (issue.severity === "blocker" || issue.code === "short-rest"));
            if (!unsafe) { chosen = candidate.member; break; }
          }
          if (!chosen) break;
          const id = String(chosen.id);
          shifts[id][day] = { start:slot.start, end:slot.end, generated:true, generator:"fair" };
          used.add(id);
          assignments.push({ day, memberId:id, start:slot.start, end:slot.end, slot:slotIndex + 1 });
          assigned += 1;
        }
        if (assigned < required) unresolved.push({ day, code:"staff-shortage", shift:slotIndex + 1, start:slot.start, end:slot.end, required, assigned, needed:required - assigned });
      });
    });

    const hoursByMember = members.map((member) => ({ memberId:String(member.id), hours:totalFor(String(member.id)) }))
      .sort((a, b) => a.hours - b.hours || a.memberId.localeCompare(b.memberId));
    const issues = validate({ planning, shifts, days, members });
    return {
      ok: assignments.length > 0 && unresolved.length === 0 && !issues.some((issue) => issue.severity === "blocker"),
      shifts, assignments, unresolved, closedDays, hoursByMember,
      dailyPeople, shiftsPerDay, issues
    };
  }

  /* OR-Tools-inspired deterministic scheduler. It does not pretend to solve an
   * impossible roster: it fills only genuine coverage gaps, respects approved
   * leave, availability, rest and weekly limits through the same validator used
   * by Publish, and returns unresolved gaps explicitly. Existing shifts are
   * immutable unless replace=true is requested. */
  function optimize(input) {
    input = input || {};
    const members = Array.isArray(input.members) ? input.members : [];
    const planning = normalize(input.planning, members);
    const days = periodDays(input.days);
    let shifts = clone(input.shifts || {});
    const replace = !!input.replace;
    const candidates = [];
    const role = (value) => roleKey(value);
    const availabilityAllows = (memberId, day, start, end) => {
      if (approvedLeave(planning, memberId, day)) return false;
      const av = planning.availability && planning.availability[memberId];
      const rule = av && av.weekdays && av.weekdays[String(dayNumber(day))];
      if (!rule) return true;
      if (rule.available === false) return false;
      const rs = minutes(rule.start), re = minutes(rule.end), ss = minutes(start), se = minutes(end);
      if ([rs,re,ss,se].some((x) => x == null)) return true;
      const rend = re <= rs ? re + 1440 : re, send = se <= ss ? se + 1440 : se;
      return ss >= rs && send <= rend;
    };
    const totalHours = (memberId, draft) => days.reduce((sum, day) => sum + shiftHours(day, draft[memberId] && draft[memberId][day]), 0);
    const desired = Math.max(0, Number(planning.settings && planning.settings.maxWeeklyHours) || 48);
    const rules = (planning.coverageRules || []).filter((rule) => rule && rule.active !== false);
    rules.forEach((rule) => {
      const weekdays = Array.isArray(rule.weekdays) ? rule.weekdays.map(Number) : [];
      days.forEach((day) => {
        if (weekdays.length && !weekdays.includes(dayNumber(day))) return;
        const required = Math.max(1, Math.min(99, Math.floor(Number(rule.minimum) || 1)));
        let assigned = members.filter((member) => {
          const shift = shifts[member.id] && shifts[member.id][day];
          if (!shiftInterval(day, shift)) return false;
          if (rule.role && role(rule.role) !== role(member.function || member.department || member.role)) return false;
          const a = shiftInterval(day, shift), b = shiftInterval(day, { start:rule.start, end:rule.end });
          return a && b && a.start <= b.start && a.end >= b.end;
        }).length;
        while (assigned < required) {
          const pool = members.filter((member) => {
            const id = String(member.id || ''); if (!id) return false;
            if (rule.role && role(rule.role) !== role(member.function || member.department || member.role)) return false;
            if (!replace && shiftInterval(day, shifts[id] && shifts[id][day])) return false;
            if (!availabilityAllows(id, day, rule.start, rule.end)) return false;
            const hours = shiftHours(day, { start:rule.start, end:rule.end });
            return totalHours(id, shifts) + hours <= desired;
          }).map((member) => ({ member, hours:totalHours(String(member.id), shifts) }))
            .sort((a,b) => a.hours - b.hours || String(a.member.id).localeCompare(String(b.member.id)));
          let chosen = null;
          for (const candidate of pool) {
            const trial = clone(shifts); const id = String(candidate.member.id);
            if (!trial[id]) trial[id] = {}; trial[id][day] = { start:rule.start, end:rule.end, generated:true };
            const blocked = validate({ planning, shifts:trial, days, members }).some((issue) => issue.severity === 'blocker' && issue.memberId === id);
            if (!blocked) { chosen = candidate.member; shifts = trial; break; }
          }
          if (!chosen) { candidates.push({ ruleId:rule.id, day, required, assigned, unresolved:true }); break; }
          assigned++; candidates.push({ ruleId:rule.id, day, memberId:String(chosen.id), start:rule.start, end:rule.end, unresolved:false });
        }
      });
    });
    const issues = validate({ planning, shifts, days, members });
    return { ok: !issues.some((issue) => issue.severity === 'blocker'), shifts, assignments:candidates.filter((x) => !x.unresolved), unresolved:candidates.filter((x) => x.unresolved), issues };
  }

  return { blank, normalize, merge, validate, coverageSummary, optimize, fairSchedule, openingSlots, periodKey, periodShifts, status, templateFromWeek, applyTemplate, createOpenShift, claimOpenShift, requestSwap, claimSwap, decideOpenShift, decideSwap, addNotice, publish, employeeSchedule, hash, minutes, isoDay };
});
