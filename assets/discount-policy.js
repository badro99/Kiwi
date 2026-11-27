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
  /* Named discounts (Jon's Burgers, 26 Nov 2026): « Étudiant · 10 % ». When the
   * owner names at least one, the tills offer exactly these and nothing typed:
   * no free percentage, no free amount. Their percentages are also written to
   * `percentages`, so a till that predates presets still allows only them. */
  const cleanPresets = values => {
    const out = [], seen = new Set();
    (Array.isArray(values) ? values : []).forEach((p) => {
      const name = String((p && p.name) || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      const pct = Number(p && p.pct);
      const key = name.toLowerCase();
      if (!name || !Number.isInteger(pct) || pct < 1 || pct > 100 || seen.has(key)) return;
      seen.add(key); out.push({ name, pct });
    });
    return out.slice(0, 12);
  };
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
  function presets(id) { return cleanPresets(store.get(venue(id))?.presets); }
  /* `presetList` undefined keeps the named discounts already saved (the
   * percentage editor), an array replaces them ([] removes them all). */
  async function save(values, id, presetList) {
    const target = venue(id);
    if (!target) throw new Error('discount-policy-no-merchant');
    const cloud = store.cloud();
    const real = !!(cloud && window.KiwiEnv?.isReal?.());
    if (real && target !== window.KiwiStore.currentVenue?.()) throw new Error('discount-policy-wrong-merchant');
    // A fresh browser has no server revision yet. set()+flush() at that point
    // answers "unread", then the pending pull can replace the owner's choice.
    // Read first, keep the deliberate snapshot, and send an explicit save.
    if (real) await cloud.pull(true);
    const named = presetList === undefined ? presets(target) : cleanPresets(presetList);
    const next = named.length ? clean(named.map(p => p.pct)) : clean(values);
    if (!next.length) throw new Error('discount-policy-empty');
    if (named.length && new Set(named.map(p => p.pct)).size > 8) throw new Error('discount-policy-too-many-rates');
    const doc = named.length ? { percentages: next, presets: named } : { percentages: next };
    store.set(doc, target);
    if (!real) return { ok: true, localOnly: true, percentages: next, presets: named };
    const result = await cloud.save(doc);
    return { ...result, percentages: next, presets: named };
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
  window.KiwiDiscountPolicy = { percentages, presets, allowed, configured, save, refresh, subscribe: store.subscribe, defaults: [...DEFAULT], cleanPresets };

  /* ── Counter flow (Jon's Burgers, 26 Nov 2026) ────────────────────────────
   * Three switches a restaurant owner sets in Paramètres and every till reads:
   *   direct       · a new order shows « En préparation » on the kitchen screen
   *                  at once, nobody has to tap it to start;
   *   payToKitchen · at the counter, paying sends the order: no separate
   *                  « Envoyer en cuisine » before « Encaisser »;
   *   typeAtPay    · « Sur place » or « À emporter » is asked when the order is
   *                  paid, and printed on the kitchen ticket.
   * All off by default: a restaurant that sends first and is paid later keeps
   * exactly the till it has. Owner writes, the paired till only reads.
   *   pagers       · how many bipeurs a mall restaurant hands out (1..20),
   *                  read only when God mode's mallRestaurant is on. */
  const FLOW_KEYS = ['direct', 'payToKitchen', 'typeAtPay'];
  const flowStore = window.KiwiStore.define('counterflow', {
    blank: () => ({}), cloud: true,
    isEmpty: data => !data || (!FLOW_KEYS.some(k => typeof data[k] === 'boolean') && !Number.isInteger(data.pagers)),
    merge: (_local, server) => server,
  });
  function flow(id) {
    const d = flowStore.get(venue(id)) || {};
    const out = { direct: d.direct === true, payToKitchen: d.payToKitchen === true, typeAtPay: d.typeAtPay === true };
    if (Number.isInteger(d.pagers) && d.pagers >= 1 && d.pagers <= 20) out.pagers = d.pagers;
    return out;
  }
  async function saveFlow(patch, id) {
    const target = venue(id);
    if (!target) throw new Error('counter-flow-no-merchant');
    const cloud = flowStore.cloud();
    const real = !!(cloud && window.KiwiEnv?.isReal?.());
    if (real && target !== window.KiwiStore.currentVenue?.()) throw new Error('counter-flow-wrong-merchant');
    if (real) await cloud.pull(true);
    const next = flow(target);
    FLOW_KEYS.forEach((k) => { if (patch && typeof patch[k] === 'boolean') next[k] = patch[k]; });
    if (patch && Number.isInteger(patch.pagers) && patch.pagers >= 1 && patch.pagers <= 20) next.pagers = patch.pagers;
    flowStore.set(next, target);
    if (!real) return { ok: true, localOnly: true, flow: next };
    return { ...(await cloud.save(next)), flow: next };
  }
  let flowLast = 0;
  function refreshFlow(force) {
    const cloud = flowStore.cloud();
    if (!cloud || !window.KiwiEnv?.isReal?.()) return Promise.resolve(false);
    if (!force && Date.now() - flowLast < 15000) return Promise.resolve(false);
    flowLast = Date.now();
    return cloud.pull(false).catch(() => false);
  }
  if (typeof setInterval === 'function' && typeof document !== 'undefined') {
    setInterval(() => { if (document.visibilityState === 'visible') refreshFlow(); }, 60000);
  }
  window.KiwiCounterFlow = { get: flow, save: saveFlow, refresh: refreshFlow, subscribe: flowStore.subscribe, keys: FLOW_KEYS.slice() };
  window.KiwiDiscountPolicy.counterFlow = flow; // the dashboard's settings row reads it here
})();
