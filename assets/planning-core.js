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
      schema: 1,
      publishingEnabled: false,
      availability: {},
      requests: [],
      templates: [],
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

  function memberIds(members) {
    return new Set((members || []).map((member) => String(member.id || "")).filter(Boolean));
  }

  function normalize(raw, members) {
    const out = Object.assign(blank(), clone(raw || {}));
    const alive = members && members.length ? memberIds(members) : null;
    out.schema = 1;
    out.publishingEnabled = Boolean(out.publishingEnabled);
    out.availability = out.availability && typeof out.availability === "object" ? out.availability : {};
    out.requests = Array.isArray(out.requests) ? out.requests : [];
    out.templates = Array.isArray(out.templates) ? out.templates : [];
    out.publishedShifts = out.publishedShifts && typeof out.publishedShifts === "object" ? out.publishedShifts : {};
    out.publications = out.publications && typeof out.publications === "object" ? out.publications : {};
    if (alive) {
      Object.keys(out.availability).forEach((id) => { if (!alive.has(String(id))) delete out.availability[id]; });
      Object.keys(out.publishedShifts).forEach((id) => { if (!alive.has(String(id))) delete out.publishedShifts[id]; });
      out.requests = out.requests.filter((request) => alive.has(String(request.memberId || "")));
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

  function validate(input) {
    const members = input.members || [];
    const shifts = input.shifts || {};
    const planning = normalize(input.planning, members);
    const days = periodDays(input.days);
    const issues = [];
    let decided = 0;
    const byId = new Map(members.map((member) => [String(member.id), member]));

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
      for (let index = 1; index < intervals.length; index += 1) {
        if (intervals[index].interval.start < intervals[index - 1].interval.end) {
          const day = intervals[index].day;
          if (!days.length || days.includes(day) || days.includes(intervals[index - 1].day)) {
            issues.push({ severity: "blocker", code: "overlap", memberId, memberName: member && member.name || memberId, day, otherDay: intervals[index - 1].day });
          }
        }
      }
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
    return { ok: true, planning: clean, issues: [] };
  }

  function employeeSchedule(teamDoc, memberId) {
    const planning = normalize(teamDoc && teamDoc.planning);
    const source = planning.publishingEnabled ? planning.publishedShifts : teamDoc && teamDoc.shifts || {};
    return clone(source && source[memberId] || {});
  }

  return { blank, normalize, merge, validate, periodKey, periodShifts, status, templateFromWeek, applyTemplate, publish, employeeSchedule, hash, minutes, isoDay };
});
