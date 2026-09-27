/* Owner-selected percentages shared by dashboard and the three tills.
 * An empty local document means "not configured", never a silent overwrite of
 * a newer owner policy fetched from /api/store. The server remains authoritative
 * on concurrent edits: unioning arrays would resurrect a removed discount. */
(() => {
  'use strict';
  if (window.KiwiDiscountPolicy || !window.KiwiStore) return;
  const DEFAULT = Object.freeze([5, 10, 15, 20]);
  const clean = values => Array.isArray(values)
    ? [...new Set(values.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 100))].sort((a,b) => a-b).slice(0, 8)
    : [];
  const store = window.KiwiStore.define('discountpolicy', {
    blank: () => ({ percentages: [] }), cloud: true,
    isEmpty: data => !clean(data?.percentages).length,
    merge: (_local, server) => server,
  });
  const venue = id => id || window.KiwiStore.currentVenue?.() || null;
  function percentages(id, fallback = DEFAULT) {
    const values = clean(store.get(venue(id))?.percentages);
    return values.length ? values : [...fallback];
  }
  function allowed(value, id) { return percentages(id).includes(Number(value)); }
  function configured(id) { return clean(store.get(venue(id))?.percentages).length > 0; }
  async function save(values, id) {
    const next = clean(values);
    if (!next.length) throw new Error('discount-policy-empty');
    const target = venue(id);
    if (!target) throw new Error('discount-policy-no-merchant');
    const cloud = store.cloud();
    if (!cloud || !window.KiwiEnv?.isReal?.()) {
      store.set({ percentages: next }, target);
      return { ok: true, localOnly: true, percentages: next };
    }
    // A fresh browser has no server revision yet. set()+flush() at that point
    // answers "unread", then the pending pull can replace the owner's choice.
    // Read first, keep the deliberate snapshot, and send an explicit save.
    if (target !== window.KiwiStore.currentVenue?.()) throw new Error('discount-policy-wrong-merchant');
    await cloud.pull(true);
    store.set({ percentages: next }, target);
    const result = await cloud.save({ percentages: next });
    return { ...result, percentages: next };
  }
  /* A till screen stays open all day, so reading the owner's copy only at
   * load (or on a tab switch) left removed percentages on offer for hours.
   * Re-read it when a discount is about to be chosen and once a minute while
   * the screen is visible. Subscribers re-render the chips when it changes. */
  let lastRefresh = 0;
  function refresh(force) {
    const cloud = store.cloud();
    if (!cloud || !window.KiwiEnv?.isReal?.()) return Promise.resolve(false);
    if (!force && Date.now() - lastRefresh < 15000) return Promise.resolve(false);
    lastRefresh = Date.now();
    return cloud.pull(false).catch(() => false);
  }
  if (typeof setInterval === 'function' && typeof document !== 'undefined') {
    setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60000);
  }
  window.KiwiDiscountPolicy = { percentages, allowed, configured, save, refresh, subscribe: store.subscribe, defaults: [...DEFAULT] };
})();
