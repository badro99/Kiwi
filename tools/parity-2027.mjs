#!/usr/bin/env node
// Design 2027 parity: the 2027 skin must change how the till LOOKS, never what
// it DOES (owner, 2026-10-27). Each flow below is played twice, by real taps,
// once on the shipped design and once on 2027, and what the flow leaves behind
// is compared: kitchen tickets, tables, table orders, the takeaway basket and
// the shift journal (sales, refunds, cash movements). Any difference, or a step
// 2027 cannot perform (control missing or covered), is a parity failure.
//
//   node tools/parity-2027.mjs                 every flow, tablet and phone
//   node tools/parity-2027.mjs --only dine     flows whose name contains "dine"
//   node tools/parity-2027.mjs --vp tablet
//
// Writes .kiwi/parity-2027/<run>/report.json and a screenshot per failure.
import fs from 'node:fs';
import path from 'node:path';
import { harness, demoPage, sleep, root } from './surface-matrix-lib.mjs';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const ONLY = arg('--only');
const VPS = (arg('--vp') || 'tablet,phone').split(',');

/* ── Taps: find a visible control by selector or text (shadow DOM included)
   and press it with a real mouse click at its centre. ───────────────────── */
async function tap(page, how, timeout = 4000) {
  const alts = Array.isArray(how) ? how : [how];
  const t0 = Date.now();
  let found = null;
  while (Date.now() - t0 < timeout && !found) {
    for (const h of alts) {
      const r = await page.evaluate((how) => {
        const all = []; (function walk(n) { for (const el of n.querySelectorAll('*')) { all.push(el); if (el.shadowRoot) walk(el.shadowRoot); } })(document);
        const up = (e) => e.parentElement || (e.parentNode && e.parentNode.host) || null;
        const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; for (let e = el; e; e = up(e)) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false; } return true; };
        let c;
        if (how.sel) c = all.filter((e) => e.matches(how.sel));
        else {
          const re = new RegExp(how.text, 'i');
          c = all.filter((e) => e.matches('button,[role=button],[role=tab],[role=menuitem],a,.menu-item,[data-item],[data-line]') && re.test(((e.innerText || e.textContent || '').trim() || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()));
          // The innermost match: a label inside a card should not win over the card's own button.
          c = c.filter((e) => !c.some((o) => o !== e && e.contains(o)));
        }
        c = c.filter(vis);
        if (!c.length) return null;
        const el = c[how.index || 0] || c[0];
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const r = el.getBoundingClientRect(); const x = how.edge === 'end' ? r.right - 24 : r.left + r.width / 2, y = r.top + r.height / 2;
        let hit = document.elementFromPoint(x, y); while (hit && hit.shadowRoot) { const i = hit.shadowRoot.elementFromPoint(x, y); if (!i || i === hit) break; hit = i; }
        let ok = false; for (let e = hit; e; e = up(e)) if (e === el) { ok = true; break; }
        for (let e = el; !ok && e; e = up(e)) if (e === hit) ok = true;
        const d = (e) => e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : '') : 'nothing';
        return { x, y, ok, el: d(el), hit: d(hit), label: (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40) };
      }, h);
      if (r) { found = r; break; }
    }
    if (!found) await sleep(200);
  }
  if (!found) return { ok: false, why: 'missing: ' + alts.map((h) => h.sel || h.text).join(' or ') };
  if (!found.ok) return { ok: false, why: `covered: ${found.label || found.el} is under ${found.hit}` };
  await page.mouse.click(found.x, found.y);
  await sleep(500);
  return { ok: true, label: found.label };
}

/* ── What a flow leaves behind, with ids and clocks taken out ────────────── */
const outcome = (page, journalFrom) => page.evaluate((journalFrom) => {
  const T = typeof tables !== 'undefined' ? tables : {};
  const line = (l) => ({ name: l.name, qty: l.qty, price: l.price, sent: !!l.sent });
  let shift = null; try { shift = JSON.parse(localStorage.getItem('kiwi-caisse-shift') || 'null'); } catch (_) {}
  const journal = shift && Array.isArray(shift.journal) ? shift.journal.slice(journalFrom) : [];
  return {
    tables: Object.fromEntries(Object.entries(T).map(([k, t]) => [k, t ? { status: t.status, covers: t.covers || 0, discount: t.discount || null } : null])),
    tableOrders: typeof tableOrders !== 'undefined' ? Object.fromEntries(Object.entries(tableOrders).filter(([, v]) => v && v.length).map(([k, v]) => [k, v.map(line)])) : {},
    cart: typeof cart !== 'undefined' ? cart.map(line) : [],
    kitchen: typeof kdsOrders !== 'undefined' ? kdsOrders.map((o) => ({ table: o.table || o.tableId || '', mode: o.mode || '', status: o.status, lines: (o.items || o.lines || []).map((l) => (l.qty || 1) + '× ' + l.name).sort() }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : [],
    journal: journal.map((j) => ({ label: j.label, amount: j.amount, method: j.method, kind: j.kind || j.type || '', tip: j.tip || 0 })),
  };
}, journalFrom);
const journalLen = (page) => page.evaluate(() => { try { const s = JSON.parse(localStorage.getItem('kiwi-caisse-shift') || 'null'); return s && s.journal ? s.journal.length : 0; } catch (_) { return 0; } });

function diff(a, b, at = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => diff(a[k], b[k], at ? at + '.' + k : k));
  }
  return [`${at}: shipped ${JSON.stringify(a)} · 2027 ${JSON.stringify(b)}`];
}

/* ── Flows. A step is {text|sel}, an array of alternatives, or {on, off}
   when the two designs name the control differently. ────────────────────── */
const S = (text) => ({ text });
const CASH = { off: [S('^Encaisser'), S('^Exact$'), S('^Confirmer$|^Valider')], on: [S('^Encaisser'), S('^Espèces$'), S('^Exact$'), S('^Valider en espèces')] };
const DINE_OPEN = [S('^Salle$'), { sel: '.cplan-tbl[data-table="T7"]' }, S('^2$'), S('^Ouvrir la table$')];
const FLOWS = [
  { name: 'dine-in · open a table, order two dishes, send to the kitchen',
    steps: [...DINE_OPEN, S('Harira'), S('Zaalouk'), S('^Envoyer')] },
  { name: 'dine-in · order, send, then pay cash',
    steps: [...DINE_OPEN, S('Harira'), S('^Envoyer'), { sel: '.cplan-tbl[data-table="T7"]', optional: true }, CASH] },
  { name: 'dine-in · order, send, add a dish, send again',
    steps: [...DINE_OPEN, S('Harira'), S('^Envoyer'), { sel: '.cplan-tbl[data-table="T7"]', optional: true },
      { off: [S('^Ajouter des articles')], on: [S('^Ajouter|^Plus d.articles')] }, S('Taktouka'), S('^Envoyer')] },
  { name: 'dine-in · send two dishes, then take one back (kitchen told)',
    steps: [...DINE_OPEN, S('Harira'), S('Zaalouk'), S('^Envoyer'), { sel: '.cplan-tbl[data-table="T7"]', optional: true },
      { off: [{ sel: '[data-table-void]' }], on: [{ sel: 'li[data-line]' }, S('^−$|^-$|Retirer|Moins|Annuler')] }] },
  { name: 'takeaway · two dishes, send to the kitchen before paying',
    steps: [S('^À emporter$'), S('Harira'), S('Zaalouk'), S('^Envoyer en cuisine|^Envoyer')] },
  { name: 'takeaway · one dish, pay cash',
    steps: [S('^À emporter$'), S('Harira'), CASH] },
  { name: 'takeaway · one dish, pay by card',
    steps: [S('^À emporter$'), S('Harira'), { off: [S('^Payer par carte'), { text: '^Confirmer|^Valider|^Payé', optional: true }], on: [S('^Encaisser'), S('^Carte'), S('^Valider|^Confirmer|^Payé')] }] },
  { name: 'takeaway · remove a dish before paying',
    steps: [S('^À emporter$'), S('Harira'), S('Zaalouk'), { off: [{ sel: '.menu-item .step-btn[data-step="dec"]' }], on: [{ sel: 'li[data-line]' }, S('^−$|^-$|Retirer|Moins')] }] },
  { name: 'takeaway · 10 % goodwill discount (asks for a manager code)',
    steps: [S('^À emporter$'), S('Harira'), S('Zaalouk'), { off: [S('^Réduction')], on: [S('^Remise')] }, S('^10 %$'), S('^Geste commercial$'),
      { off: [S('^Appliquer la remise')], on: [S('^Appliquer')] }] },
  { name: 'takeaway · split in two equal shares, pay share 1 cash',
    steps: [S('^À emporter$'), S('Harira'), S('Zaalouk'),
      { off: [S('^Partager'), S('^Lancer le split'), S('^Espèces$'), { text: '^Exact$', optional: true }, { text: '^Confirmer$|^Valider', optional: true }],
        on: [S('^Diviser'), S('^Encaisser la part 1'), S('^Espèces$'), S('^Exact$'), S('^Valider en espèces')] }] },
  { name: 'takeaway · send, then pay that order from the board',
    steps: [S('^À emporter$'), S('Harira'), S('^Envoyer'), S('^Encaisser · 35'), CASH] },
  { name: 'takeaway · 10 % tip, pay cash',
    steps: [S('^À emporter$'), S('Harira'), S('Zaalouk'),
      { off: [S('^Encaisser'), S('^10 %$'), S('^Exact$'), S('^Confirmer$|^Valider')], on: [S('^Encaisser'), S('^Pourboire'), S('^10 %'), S('^Espèces$'), S('^Exact$'), S('^Valider en espèces')] }] },
  { name: 'kitchen · start a ticket, then mark it ready',
    steps: [{ off: [S('^Écran cuisine')], on: [S('^Cuisine')] }, S('^Commencer|^Accepter'), S('^Prête?$|^Marquer prêt|^✓ Prête')] },
  { name: 'kitchen · open the kitchen view and start the first new ticket',
    steps: [{ off: [S('^Écran cuisine')], on: [S('^Cuisine')] }, S('^Commencer|^Accepter')] },
];

/* Phone openers, shared by both designs: the menu drawer and the bill bar. */
const OPENERS = [{ sel: '.kw-hamburger' }, { sel: '#rp-peek' }];
/* The shipped menu drawer stays open after a choice: a person taps the dimmed
   side to close it. */
const CLOSERS = [{ sel: 'body.nav-open .kw-scrim', edge: 'end' }, { sel: 'body.ticket-open #rp-peek' }];
/* Close whatever a phone has open (drawer, bill sheet), the way a person would. */
async function closeAll(page) {
  for (const cl of CLOSERS) await tap(page, cl, 300);
}

/* ── Run ──────────────────────────────────────────────────────────────────── */
const RUN = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.join(root, '.kiwi/parity-2027', RUN);
fs.mkdirSync(OUT, { recursive: true });
const h = await harness('parity-2027');

async function play(flow, on, vp) {
  const { ctx, page } = await demoPage(h, 'fr', vp, { 'kiwiSkin2027:till': on ? '1' : '0' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).split('\n')[0].slice(0, 160)));
  page.on('dialog', (d) => d.dismiss());
  try {
    await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof doOpenService === 'function', { timeout: 30000 });
    await page.evaluate(() => doOpenService());
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
    await sleep(1000);
    const j0 = await journalLen(page);
    const log = [];
    let failed = null;
    const flat = flow.steps.flatMap((s) => (s.on || s.off ? (on ? s.on : s.off) : [s]));
    for (const s of flat) {
      let r = await tap(page, s);
      /* On a phone, controls live behind the menu button or the bill bar. Try
         each opener (as a person would), and close it again if it did not help. */
      if (!r.ok && vp === 'phone' && !s.optional) {
        for (const cl of CLOSERS) {
          if (r.ok) break;
          if ((await tap(page, cl, 300)).ok) { r = await tap(page, s, 2000); if (r.ok) log.push('ok (closed ' + cl.sel + ')'); }
        }
      }
      if (!r.ok && vp === 'phone' && !s.optional) {
        for (const op of OPENERS) {
          const o = await tap(page, op, 600);
          if (!o.ok) continue;
          r = await tap(page, s, 2000);
          if (r.ok) { log.push('ok (opened ' + op.sel + ')'); break; }
          await closeAll(page);
        }
      }
      log.push((r.ok ? 'ok ' : 'FAIL ') + (s.sel || s.text || JSON.stringify(s)) + (r.label ? ' → ' + r.label : '') + (r.why ? ' · ' + r.why : ''));
      if (!r.ok && !s.optional) { failed = r.why; break; }
    }
    await sleep(800);
    const shot = `${flow.name.replace(/\W+/g, '-').slice(0, 50)}-${vp}-${on ? 'on' : 'off'}.jpg`;
    await page.screenshot({ path: path.join(OUT, shot), type: 'jpeg', quality: 55 });
    return { failed, log, errors, outcome: await outcome(page, j0), shot };
  } finally { await ctx.close().catch(() => {}); }
}

const results = [];
const flows = FLOWS.filter((f) => !ONLY || f.name.includes(ONLY));
for (const vp of VPS) for (const flow of flows) {
  const [off, on] = await Promise.all([play(flow, false, vp), play(flow, true, vp)]);
  const problems = [];
  if (off.failed) problems.push('shipped design could not finish (harness path to check): ' + off.failed);
  if (on.failed) problems.push('2027 could not finish: ' + on.failed);
  if (!off.failed && !on.failed) problems.push(...diff(off.outcome, on.outcome));
  for (const e of on.errors) if (!off.errors.includes(e)) problems.push('2027 page error: ' + e);
  const ok = !problems.length;
  results.push({ flow: flow.name, vp, ok, problems, off: { log: off.log, shot: off.shot }, on: { log: on.log, shot: on.shot } });
  console.log(`${ok ? '✓' : '✗'} ${vp} · ${flow.name}`);
  for (const p of problems.slice(0, 8)) console.log('    ' + p);
}
await h.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 1));
const bad = results.filter((r) => !r.ok).length;
console.log(`parity-2027: ${results.length - bad}/${results.length} flows match → ${path.relative(root, OUT)}`);
process.exit(bad ? 1 : 0);
