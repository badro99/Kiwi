// Test-only boot clock. Never import this from the application/runtime bundle.
export const DEMO_TIMEZONE = 'Africa/Casablanca';

export function demoClockFixture(day = new Date().toISOString().slice(0, 10)) {
  const midServiceMs = Date.parse(day + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(midServiceMs)
      || new Date(midServiceMs).toISOString().slice(0, 10) !== day) {
    throw new TypeError('Demo fixture requires a valid UTC calendar day');
  }
  return { day, timezone: DEMO_TIMEZONE, midServiceMs,
    // After the 05:00 cutoff, before 07:00 service in both GMT+0 and GMT+1.
    emptyDayMs: Date.parse(day + 'T05:30:00Z') };
}

// Self-contained so Puppeteer can serialize it before any page script runs.
// Freeze at boot, never jump an already-open page's idle-lock clock.
export function installDemoClock(epochMs) {
  if (!Number.isSafeInteger(epochMs) || !Number.isFinite(new Date(epochMs).getTime())) {
    throw new TypeError('Demo fixture requires a valid epoch');
  }
  const OriginalDate = globalThis.Date;
  const fixedNow = () => epochMs;
  globalThis.Date = new Proxy(OriginalDate, {
    apply() { return new OriginalDate(epochMs).toString(); },
    construct(target, args, newTarget) {
      return Reflect.construct(target, args.length ? args : [epochMs], newTarget);
    },
    get(target, key, receiver) {
      return key === 'now' ? fixedNow : Reflect.get(target, key, receiver);
    },
  });
}
