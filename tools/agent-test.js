#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · assistant release gate.
 *
 *   node tools/agent-test.js
 *
 * The repo check used to validate that agent.js *parses*. Parsing is not the
 * property that matters: a file that compiles perfectly can still tell a
 * merchant their break-even is a number it made up. This runs the assistant
 * for real, in Node, against a DOM shim, and grades what it ANSWERS:
 *
 *   1. ROUTING     the shipped EVAL_SET, in fr / en / ar
 *   2. CONVERSATION multi-turn corrections keep their scenario
 *   3. GUARDS      the numeric guardrail's own unit tests
 *   4. ARITHMETIC  every money scenario recomputed from the profile — the
 *                  answer's stated figures must equal the arithmetic
 *   5. REDACTION   invented figures are removed from a model answer, not
 *                  merely annotated
 *   6. ISOLATION   a real merchant never sees a Café Atlas figure
 *   7. PERMISSION  a staff-tier reader never receives P&L, payroll or cash
 *
 * Zero dependencies. Exit 0 = green, 1 = at least one failure.
 * ─────────────────────────────────────────────────────────────────────────── */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AGENT = path.join(ROOT, 'assets', 'agent.js');
const DATA = path.join(ROOT, 'assets', 'agent-data.js');

/* ── DOM shim ─────────────────────────────────────────────────────────────
 * Enough of a browser for agent.js to define itself. It never opens the UI
 * here, so the shim only has to survive module top-level. */
function makeCtx(opts) {
  opts = opts || {};
  const noop = () => {};
  const el = () => ({
    dataset: {}, style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, querySelector: () => null,
    querySelectorAll: () => [], setAttribute: noop, getAttribute: () => null, textContent: '', innerHTML: '',
  });
  const document = {
    readyState: 'complete', documentElement: el(), head: el(), body: el(),
    createElement: () => el(), querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, getElementById: () => null,
  };
  const store = Object.assign({}, opts.store);
  const localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    key: (i) => Object.keys(store)[i] != null ? Object.keys(store)[i] : null,
  };
  Object.defineProperty(localStorage, 'length', { get: () => Object.keys(store).length });
  const window = {
    document, localStorage, addEventListener: noop, setTimeout: () => 0,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    KiwiI18n: { getLang: () => opts.lang || 'fr' },
  };
  if (opts.venue) window.KiwiVenue = opts.venue;
  if (opts.env) window.KiwiEnv = opts.env;
  if (opts.sales) window.KiwiSales = opts.sales;
  if (opts.role) window.__kiwiRole = opts.role;
  Object.keys(opts.globals || {}).forEach((k) => { window[k] = opts.globals[k]; });
  window.window = window;
  const ctx = {
    window, document, localStorage, console,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    navigator: { language: 'fr-FR', userAgent: 'node' },
    location: { href: 'https://kiwi-maroc.pages.dev/dashboard.html', search: '' },
    fetch: () => Promise.reject(new Error('no network in the gate')),
  };
  ctx.globalThis = ctx;
  return ctx;
}

const CORPUS = path.join(ROOT, 'tools', 'agent-corpus.js');

function load(opts) {
  const ctx = makeCtx(opts);
  vm.createContext(ctx);
  /* The full merchant corpus — 1 100 questions in fr / en / ar / darija. No
   * page loads it (it would cost a merchant a download for nothing), so the
   * gate is the only place it ever runs. runEval() picks it up off the window
   * automatically when it is there. */
  if (fs.existsSync(CORPUS)) vm.runInContext(fs.readFileSync(CORPUS, 'utf8'), ctx, { filename: 'agent-corpus.js' });
  vm.runInContext(fs.readFileSync(DATA, 'utf8'), ctx, { filename: 'agent-data.js' });
  vm.runInContext(fs.readFileSync(AGENT, 'utf8'), ctx, { filename: 'agent.js' });
  return ctx.window;
}

const strip = (s) => String(s == null ? '' : s)
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
function flatten(r) {
  if (r == null) return '[[LLM]]';
  const out = [];
  if (r.text) out.push(strip(r.text));
  (r.stats || []).forEach((s) => out.push(`${strip(s.l)}: ${strip(s.v)} (${strip(s.h)})`));
  if (r.verdict) out.push(strip(r.verdict.text));
  if (r.note) out.push(strip(r.note));
  return out.join('\n');
}
/* Every integer in a rendered answer, thousands separators folded away. NBSP
 * and narrow-NBSP are what toLocaleString('fr-FR') actually emits. */
function numbersIn(text) {
  return (String(text).match(/\d[\d    .]*\d|\d/g) || [])
    .map((s) => parseFloat(s.replace(/[    .]/g, '')))
    .filter((n) => isFinite(n));
}

let failures = 0;
const fail = (msg) => { failures++; console.log('  ✗ ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);
const section = (t) => console.log('\n■ ' + t);
const t = (name, cond, detail) => cond ? ok(name) : fail(name + (detail ? ' — ' + detail : ''));

/* ── 1 · routing, in all three languages ─────────────────────────────────── */
section('Routing · shipped eval set × fr/en/ar');
for (const lang of ['fr', 'en', 'ar']) {
  const w = load({ lang });
  const r = w.KiwiAgentEval();
  if (r.fails && r.fails.length) {
    fail(`[${lang}] ${r.pass}/${r.total} — ` + r.fails.slice(0, 6).map((x) => `"${x.q}" ${x.got}≠${x.expected}`).join(' · '));
  } else ok(`[${lang}] ${r.pass}/${r.total} routes correct`);
}

/* ── 2 · multi-turn conversation + 3 · guardrail units ────────────────────── */
section('Conversation memory & numeric guardrail');
{
  const w = load({ lang: 'fr' });
  const c = w.KiwiAgentConvoTest();
  t(`multi-turn corrections ${c.pass}/${c.total}`, c.pass === c.total,
    (c.fails || []).map((x) => `"${x.q}" ${x.got}≠${x.expected}`).join(' · '));
  const g = w.KiwiGuardTest();
  t(`guardrail units ${g.pass}/${g.total}`, g.pass === g.total,
    (g.fails || []).map((x) => x.name).join(' · '));
}

/* ── 4 · arithmetic ────────────────────────────────────────────────────────
 * The scenarios are the product. A routing test proves the merchant reached
 * the break-even answer; only this proves the break-even answer is right.
 * Recomputed here from the same profile, independently of the code under
 * test — if someone edits a formula, this fails. */
section('Scenario arithmetic (recomputed independently)');
{
  const w = load({ lang: 'fr' });
  if (!w.KiwiAgentAsk) {
    fail('window.KiwiAgentAsk missing — agent.js must export the QA ask hook');
  } else {
    const B = w.KiwiAgentProfile();
    const ask = (q) => flatten(w.KiwiAgentAsk(q));
    const has = (text, n, tol) => numbersIn(text).some((v) => Math.abs(v - n) <= (tol == null ? 1 : tol));

    const be = B.totalOpex / B.contribRatio;
    t('break-even revenue = opex ÷ contribution ratio',
      has(ask('quel est mon seuil de rentabilité'), Math.round(be)),
      `expected ≈ ${Math.round(be)}`);
    t('break-even day figure = monthly ÷ days open',
      has(ask('quel est mon seuil de rentabilité'), Math.round(be / B.daysOpen)),
      `expected ≈ ${Math.round(be / B.daysOpen)}`);

    t('gross margin % restated exactly',
      has(ask('quelle est ma marge'), Math.round(B.grossMargin), 0.5),
      `expected ≈ ${B.grossMargin}`);

    /* A +5 % price rise at constant volume: the whole delta is margin, cost
     * of goods does not move. */
    const d5 = B.revenue * 0.05;
    t('+5 % price rise adds revenue×5 % to the bottom line',
      has(ask('si j’augmente mes prix de 5%'), Math.round(d5)),
      `expected ≈ ${Math.round(d5)}`);

    /* A hire is subtracted from net profit — the answer must show a monthly
     * cost at least as large as the salary asked for (charges on top). */
    const hire = ask('je veux embaucher un serveur à 4000 MAD');
    t('a 4 000 MAD hire costs at least 4 000 MAD/month',
      numbersIn(hire).some((v) => v >= 4000 && v < 20000), 'no loaded cost shown');

    const fc = ask('quelle est ma prévision de chiffre d’affaires');
    t('month-end projection = run rate × days in month',
      has(fc, Math.round(B.mtdRevenue / B.mtdDays * B.daysInMonth), 200),
      `expected ≈ ${Math.round(B.mtdRevenue / B.mtdDays * B.daysInMonth)}`);

    const rw = ask('combien de temps je tiens avec ma trésorerie');
    t('runway answer states the cash buffer', has(rw, B.cashBuffer, 500),
      `expected ≈ ${B.cashBuffer}`);
  }
}

/* ── 5 · redaction, not annotation ─────────────────────────────────────────
 * The old guard appended "verify in your dashboard" and left the invented
 * number on screen. A merchant who reads 999 000 MAD and a footnote keeps
 * the 999 000. The figure must be GONE. */
section('Invented figures are removed from model answers');
{
  const w = load({ lang: 'fr' });
  if (!w.KiwiAgentRedact) {
    fail('window.KiwiAgentRedact missing — the guard must expose its redactor');
  } else {
    const B = w.KiwiAgentProfile();
    const R = (s) => w.KiwiAgentRedact(s, 'fr');

    const inv = R('Vous avez gagné 999 000 MAD ce mois-ci.');
    t('an invented MAD figure does not survive', !/999[    .]?000/.test(inv.text), inv.text);
    t('the redaction is reported', inv.redacted > 0);

    const real = R(`Votre chiffre d'affaires est de ${B.revenue} MAD.`);
    t('a grounded figure survives untouched', real.redacted === 0, real.text);

    const rounded = R('Environ 842 000 MAD de chiffre d’affaires.');
    t('a rounded restatement survives', rounded.redacted === 0, rounded.text);

    const pct = R('Votre marge nette a bondi de 47 % le mois dernier.');
    t('an invented percentage does not survive', !/47/.test(pct.text), pct.text);

    const cnt = R('Vos 312 clients fidèles reviennent chaque semaine.');
    t('an invented count does not survive', !/312/.test(cnt.text), cnt.text);

    const small = R('Comptez 3 employés en salle le samedi.');
    t('a small operational number is left alone', small.redacted === 0, small.text);

    const hypo = R('Si vous augmentez vos prix de 7 %, la marge suit presque entièrement.');
    t('a hypothesis keeps its percentage', hypo.redacted === 0, hypo.text);

    /* Counts live in separate namespaces. Café Atlas has a dish that sold
     * exactly 312 units, and with one flat set that plate of food vouched for
     * "vos 312 clients fidèles" — a customer count Kiwi has never measured. */
    const staffLie = R('Vos 47 employés couvrent le service du samedi.');
    t('an invented headcount does not survive', staffLie.redacted === 1, staffLie.text);

    const orders = R(`Vous avez fait ${B.ordersPerMonth} ventes ce mois-ci.`);
    t('a real order count survives', orders.redacted === 0, orders.text);

    const fakeOrders = R('Vous avez fait 7 400 ventes ce mois-ci.');
    t('an invented order count does not survive', fakeOrders.redacted === 1, fakeOrders.text);
  }
}

/* ── 6 · demo isolation ────────────────────────────────────────────────────
 * A real merchant with two sales must never be told Café Atlas's numbers. */
section('Demo isolation (real merchant sees only their own figures)');
{
  const ATLAS_FIGURES = [842300, 261000, 581300, 393199, 188101, 465000, 5931];
  const w = load({
    lang: 'fr',
    env: { isReal: () => true },
    venue: { isCustom: () => true, getVenue: () => 'v1', getCurrentVenueData: () => ({ name: 'Cafe test', location: 'Casablanca' }) },
    sales: { list: () => [{ ts: Date.now(), amount: 450 }], totals: () => ({ revenue: 450, count: 1, basket: 450 }) },
  });
  const probes = [
    'quel est mon seuil de rentabilité', 'quelle est ma marge', 'combien je gagne',
    'quelles sont mes charges', 'combien de temps je tiens', 'mon chiffre d’affaires',
    'si j’augmente mes prix de 10%', 'je veux embaucher un serveur',
  ];
  let leaks = 0;
  for (const q of probes) {
    const text = flatten(w.KiwiAgentAsk(q));
    const nums = numbersIn(text);
    for (const bad of ATLAS_FIGURES) {
      if (nums.some((v) => Math.abs(v - bad) < 1)) { leaks++; fail(`"${q}" leaked the demo figure ${bad}`); }
    }
  }
  if (!leaks) ok(`${probes.length} money questions, no demo figure reached a real merchant`);
}

/* ── 6b · the simulator stays in the demo ──────────────────────────────────
 * assets/demoClock.js replays one day of Café Atlas. It used to answer for any
 * venue and any session — an unknown id fell through to TARGETS.cafeAtlas —
 * and its output travelled into the hero insight, the KPI band and the
 * assistant's system prompt as "activité en direct". Whole class of bug; it
 * gets a gate of its own. */
section('The demo clock does not run on a real session');
{
  const clockSrc = fs.readFileSync(path.join(ROOT, 'assets', 'demoClock.js'), 'utf8');
  const runClock = (env, venueId, isCustom) => {
    const ctx = makeCtx({ lang: 'fr' });
    ctx.window.KiwiEnv = env;
    ctx.window.KiwiVenue = { getVenue: () => venueId, isCustom: () => !!isCustom };
    ctx.requestAnimationFrame = () => 0;
    vm.createContext(ctx);
    vm.runInContext(clockSrc, ctx, { filename: 'demoClock.js' });
    return ctx.window.KiwiDemoClock;
  };
  const REAL = { isReal: () => true };
  const DEMO = { isReal: () => false };

  t('hosted / signed-in session gets no simulated state',
    runClock(REAL, 'cafeAtlas', false).getSimState() === null);
  t('a custom venue gets no simulated state',
    runClock(DEMO, 'v1mrz9', true).getSimState() === null);
  t('an unknown venue is not silently treated as Café Atlas',
    runClock(DEMO, 'v1mrz9', false).getSimState() === null);
  const demo = runClock(DEMO, 'cafeAtlas', false).getSimState();
  t('the local demo still gets its day', demo && demo.cumRevenue >= 0 && demo.venue === 'cafeAtlas');

  /* Same class of bug, second home. KiwiVenue.getMenuItems() answers for a
   * demo venue id with Café Atlas's carte, so a real session on a non-custom
   * venue got a perfectly computed insight about somebody else's restaurant.
   * Real arithmetic on the wrong menu is still the wrong answer. */
  const insightsSrc = fs.readFileSync(path.join(ROOT, 'assets', 'insights.js'), 'utf8');
  const MENU = [
    { name: 'Tajine', price: 75, cost: 26, unitsThisMonth: 412 },
    { name: 'Thé', price: 15, cost: 3, unitsThisMonth: 1890 },
    { name: 'Pastilla', price: 90, cost: 34, unitsThisMonth: 168 },
    { name: 'Salade', price: 35, cost: 9, unitsThisMonth: 96 },
  ];
  const runInsights = (env, isCustom) => {
    const ctx = makeCtx({ lang: 'fr' });
    ctx.window.KiwiEnv = env;
    ctx.window.KiwiVenue = { getMenuItems: () => MENU, isCustom: () => !!isCustom };
    vm.createContext(ctx);
    vm.runInContext(insightsSrc, ctx, { filename: 'insights.js' });
    return ctx.window.KiwiInsights;
  };
  t('a real session on a demo venue gets no insight at all',
    runInsights(REAL, false).compute().length === 0);
  t('a real session on its OWN venue still gets insights',
    runInsights(REAL, true).compute().length > 0);
  const demoIns = runInsights(DEMO, false).compute();
  t('the local demo keeps its insights', demoIns.length > 0);
  t('every insight declares measured or estimated',
    demoIns.every((i) => i.basis === 'measured' || i.basis === 'estimated'),
    JSON.stringify(demoIns.map((i) => i.id + ':' + i.basis)));
}

/* ── 7 · permissions ───────────────────────────────────────────────────────
 * The sidebar hides Marges, Dépenses and Paie from a staff badge. An
 * assistant that answers "quel est mon bénéfice net" for the same badge has
 * simply moved the leak to a text box. */
section('Role permissions (staff badge cannot read the P&L)');
{
  const w = load({ lang: 'fr', role: 'staff' });
  const MONEY = [
    'quel est mon bénéfice net', 'quelles sont mes charges', 'combien je paie de salaires',
    'quelle est ma trésorerie', 'quelle est ma marge nette', 'mon loyer représente combien',
    'combien je verse à la CNSS', 'quel est mon seuil de rentabilité',
    'combien vaut mon affaire', "quelle est ma masse salariale",
  ];
  let through = 0;
  for (const q of MONEY) {
    const r = w.KiwiAgentAsk(q);
    const text = flatten(r);
    // The refusal must not carry the figures it is refusing to show, and it
    // must BE a refusal — falling through to the model is not an answer.
    if (!r || !r.refused) { through++; fail(`staff asked "${q}" and was not refused (route answered instead)`); continue; }
    if (numbersIn(text).some((v) => v >= 10000)) { through++; fail(`staff asked "${q}" and got a five-figure amount back`); }
  }
  if (!through) ok(`${MONEY.length} P&L questions refused for a staff badge`);

  /* Over-refusing would make the assistant useless to the people on the till
   * all day. The shop floor keeps the shop floor. */
  const FLOOR = ['mon chiffre d’affaires', 'quel est mon produit le plus vendu', 'mon stock'];
  let blocked = 0;
  for (const q of FLOOR) {
    const r = w.KiwiAgentAsk(q);
    if (r && r.refused) { blocked++; fail(`staff was refused "${q}" — that is their own shop floor`); }
  }
  if (!blocked) ok(`${FLOOR.length} shop-floor questions still answered for a staff badge`);

  const wm = load({ lang: 'fr', role: 'manager' });
  const mgr = wm.KiwiAgentAsk('quelle est ma marge');
  t('a manager is refused the margins too (the sidebar hides them)', !!(mgr && mgr.refused));

  const wo = load({ lang: 'fr', role: 'owner' });
  const ownerText = flatten(wo.KiwiAgentAsk('quel est mon bénéfice net'));
  t('the owner still gets the answer', numbersIn(ownerText).some((v) => v > 10000), ownerText.slice(0, 80));
}

/* ── summary ──────────────────────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(60));
if (failures) { console.log(`✗ assistant gate: ${failures} failure(s)`); process.exit(1); }
console.log('✓ assistant gate: all green');
