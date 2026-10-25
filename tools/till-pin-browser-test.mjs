#!/usr/bin/env node
/* till-pin-browser-test · the till's code doors on the 2027 pad (stage 3a).
 *
 * kiwi-caisse.html, paired to a test store, /api/config and /api/pin/verify
 * answered by the test (no real merchant, no real code):
 *   · flag off: the shipped staff pad, and not one kit file is fetched;
 *   · flag on (kiwiSkin2027:till): the lock is <k-pin-pad> with the venue;
 *     a wrong code is refused politely, a waiter's code is refused by name,
 *     a cashier's opens the till and names them;
 *   · offline-verifier (§10.2, revision 16, M1; revision 17, M1; revision 19,
 *     P8): with the network cut, a code proven on this till unlocks and
 *     approves a till act; a waiter's proven code gets pin.not_till on the
 *     lock and pin.till.not_till on an approval; an unknown code gets
 *     pin.offline_unknown; a refund gets pin.manager.offline, keys disabled;
 *     every unlock and approval adds one log entry with verdict and provenAt;
 *   · the needs-connection state: offline when the pad opens for a live
 *     order's cancellation, no digit is taken, and `online` gives the keys
 *     back;
 *   · manager level: a cashier is refused for a discount, a manager approves;
 *   · the pairing pad (six digits): a refused code says pair.invalid; a code
 *     held past 8 s says pair.no_answer and is never sent again by itself,
 *     and typed again after a 422 says pair.maybe_used; the right code pairs
 *     and hands over to the staff lock; the store lock's pad names the store,
 *     carries its prompt and Back, and Back closes it.
 *
 *   node tools/till-pin-browser-test.mjs */
import assert from 'node:assert/strict';
import { kitBrowser, settle } from './kit-browser.mjs';
import { suite } from './browser-trace.mjs';

console.log('till-pin-browser-test');
const kb = await kitBrowser('till-pin');
const S = suite('till-pin', { browser: kb.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* Test codes for a test store: never a real merchant's. */
const STAFF = {
  '1111': { id: 'c1', name: 'Salma Idrissi', role: 'caisse' },
  '2222': { id: 'w1', name: 'Youssef Alami', role: 'serveur' },
  '3333': { id: 'm1', name: 'Nadia Berrada', role: 'manager' },
};
const VENUE = { merchant: 'kiwi-test-till', name: 'Café Banc', slug: 'kiwi-test-till' };
const PAIR = '482913';   /* a test pairing code for the test store */

async function till(tr, { flag = true, lang = 'fr', configDelay = 0, record = false } = {}) {
  const ctx = await kb.browser.createBrowserContext();
  tr.defer(() => ctx.close());
  const page = tr.watch(await ctx.newPage());
  const net = { offline: false, verify: [], held: null, redeem: [], pairHold: false };
  await page.setViewport({ width: 1180, height: 820 });
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith('/api/') && !u.pathname.startsWith('/auth/')) return r.continue();
    if (net.offline) return r.abort('internetdisconnected');
    const json = (status, body) => r.respond({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname === '/api/config' && configDelay) { setTimeout(() => json(200, { pins: Object.values(STAFF).map((s) => ({ name: s.name, role: s.role })), pinGateConfigured: true, timezone: 'Africa/Casablanca' }), configDelay); return; }
    if (u.pathname === '/api/config') return json(200, { pins: Object.values(STAFF).map((s) => ({ name: s.name, role: s.role })), pinGateConfigured: true, timezone: 'Africa/Casablanca' });
    if (u.pathname === '/api/pin/verify') {
      const b = JSON.parse(r.postData() || '{}');
      net.verify.push(b);
      const who = STAFF[b.pin];
      if (!who) return json(401, { error: 'bad-pin' });
      if (b.action && b.action.kind === 'refund') return json(200, { ok: true, staff: who, ...(who.role === 'manager' ? { approval: 'proof-' + b.action.refundId } : {}) });
      return json(200, { ok: true, staff: who, actorProof: 'actor-' + who.id });
    }
    if (u.pathname === '/api/pair/redeem') {
      const b = JSON.parse(r.postData() || '{}');
      net.redeem.push(b.code);
      if (net.pairHold) return;                       /* held: never answered */
      if (b.code === PAIR) return json(200, { ok: true, merchant: VENUE.merchant, name: VENUE.name });
      return json(422, { error: 'invalid_or_expired' });
    }
    if (u.pathname === '/api/pair/recover') return json(200, { ok: true, merchant: VENUE.merchant });
    return json(503, { error: 'offline' });
  });
  await page.evaluateOnNewDocument((flag, venue, lang) => {
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
    try {
      localStorage.setItem('kiwiPaired', '1');
      localStorage.setItem('kiwiPairedVenue', JSON.stringify(venue));
      localStorage.setItem('kiwiLang', lang);
      if (flag) localStorage.setItem('kiwiSkin2027:till', '1'); else localStorage.removeItem('kiwiSkin2027:till');
    } catch (_) {}
  }, flag, VENUE, lang);
  /* Every painted frame of the load: is the body shown, what is on top at the
     centre and on the left edge, and is the demo pad up. */
  if (record) await page.evaluateOnNewDocument(() => {
    window.__frames = [];
    const top = (x, y) => { const e = document.elementFromPoint(x, y); if (!e) return '-'; if (e.closest('#cp-pin-screen')) return 'lock'; if (e.closest('#pin-screen')) return 'demo-pad'; if (e.closest('#cp-screen')) return 'pair'; return e === document.documentElement || e === document.body ? 'ground' : 'till:' + e.tagName.toLowerCase(); };
    const tick = () => {
      if (document.body) {
        const cs = getComputedStyle(document.body);
        const shown = cs.visibility !== 'hidden' && +cs.opacity > 0;
        const W = innerWidth, H = innerHeight;
        window.__frames.push({ t: Math.round(performance.now()), shown, at: [top(W / 2, H / 2), top(40, H / 2), top(W - 80, 120)] });
      }
      if (performance.now() < 6000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // coverage: surface=caisse-entry locale=fr viewport=desktop
  await page.goto(kb.base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => { const s = document.getElementById('cp-pin-screen'); return s && s.style.display !== 'none' && s.getBoundingClientRect().width > 0; }, { timeout: 20000 });
  await settle(page, 300);
  return { page, net };
}

async function press(page, hostSel, code) {
  for (const d of code) {
    const h = await page.evaluateHandle((s, x) => document.querySelector(s).shadowRoot.querySelector('[data-key="' + x + '"]'), hostSel, d);
    const b = await h.asElement().boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  }
}
const msg = (page, hostSel) => page.evaluate((s) => {
  const p = document.querySelector(s); if (!p) return null;
  const pol = p.shadowRoot.querySelector('.pol').textContent, ass = p.shadowRoot.querySelector('.ass').textContent;
  return { pol, ass };
}, hostSel);
const tt = (page, k, a) => page.evaluate((key, args) => String(KiwiStrings.t(key, args)).replace(/[⁦-⁩]/g, ''), k, a || {});
const LOCK = '#cp-pin-screen k-pin-pad';
const SHEET = 'k-sheet[data-till-pin] k-pin-pad';

await S.run('flag off: the shipped pad, no kit file fetched', async (tr) => {
  const { page } = await till(tr, { flag: false });
  const st = await page.evaluate(() => ({
    legacy: !!document.querySelector('#cp-pin-screen #cp-pin-pad'),
    kit: !!document.querySelector('#cp-pin-screen k-pin-pad'),
    fetched: performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /assets\/kit\/(pin|pin-flow|till-pin|core|strings|overlays|tokens-2027|kit\.css)/.test(n)),
    skin: document.documentElement.getAttribute('data-skin-2027'),
  }));
  check(st.legacy && !st.kit && !st.skin, 'the shipped staff pad shows, and the page is not marked 2027');
  check(st.fetched.length === 0, 'no kit file was fetched (' + st.fetched.length + ')');
});

/* 24 octobre : à chaque chargement, la caisse entière (carte, rail, addition)
 * se peignait ~360 ms avant que le pavé ne la couvre, le temps de demander la
 * liste des codes au serveur ; et sur un verrouillage, le pavé démo (« Bonjour,
 * Caissier », codes de démo) passait avant le 2027. Le serveur répond ici en
 * 900 ms : aucune image peinte ne doit montrer la caisse ni le pavé démo. */
await S.run('flag on: the lock is up from the first painted frame, the till never shows', async (tr) => {
  const { page } = await till(tr, { configDelay: 900, record: true });
  await settle(page, 1200);
  const frames = await page.evaluate(() => window.__frames);
  const shown = frames.filter((f) => f.shown);
  const leak = shown.filter((f) => f.at.some((a) => a.startsWith('till:') || a === 'demo-pad'));
  check(shown.length > 5, 'frames were recorded while the page showed (' + shown.length + ')');
  check(leak.length === 0, 'no painted frame shows the till or the demo pad' + (leak.length ? ': ' + JSON.stringify(leak.slice(0, 3)) : ''));
  check(shown[0].at.every((a) => a === 'lock'), 'the first painted frame is the lock (' + shown[0].at.join(', ') + ')');
  const mounts = await page.evaluate(() => document.querySelectorAll('#cp-pin-screen k-pin-pad').length);
  check(mounts === 1, 'one pad, not mounted twice when the roster answers');
});

/* 23 octobre : le bouton « Clients » flottait sur l'écran de code et ouvrait le
 * carnet (noms, téléphones, crédit) avant que quiconque ait tapé un code ; et,
 * en 2027, Tab sortait du pavé vers les 21 tables du plan derrière lui. */
const behindLock = (page) => page.evaluate(() => ({
  chip: !!document.getElementById('kcb-chip'),
  book: (() => { try { window.KiwiClientsBook.open(); } catch (_) {} const r = document.getElementById('kcb-root'); return !!(r && r.style.display !== 'none'); })(),
  reachable: [...document.querySelectorAll('button, a[href], input, [tabindex="0"]')].filter((el) => {
    if (el.closest('#cp-pin-screen, #cp-screen, #toast-stack') || el.closest('[inert]') || el.closest('[aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
  }).map((el) => (el.getAttribute('aria-label') || el.textContent || el.id).trim().slice(0, 30)),
}));
for (const flag of [false, true]) {
  await S.run(`flag ${flag ? 'on' : 'off'}: nothing behind the lock, the customer book shut`, async (tr) => {
    const { page } = await till(tr, { flag });
    await settle(page, 1500);                     /* the chip's own late checks (1.4 s) */
    const st = await behindLock(page);
    check(!st.chip, 'no Clients button over the lock');
    check(!st.book, 'the customer book does not open while locked');
    if (!flag) return;
    check(st.reachable.length === 0, 'nothing behind the lock is reachable (' + st.reachable.slice(0, 4).join(' · ') + ')');
    for (let i = 0; i < 16; i++) await page.keyboard.press('Tab');
    check(await page.evaluate(() => { const a = document.activeElement; return !!(a && a.closest('#cp-pin-screen')); }), 'Tab stays on the pad');
    await press(page, LOCK, '1111');
    await page.waitForFunction(() => document.getElementById('cp-pin-screen').style.display === 'none', { timeout: 5000 });
    await settle(page, 400);
    check(await page.evaluate(() => ![...document.body.children].some((el) => el.inert)), 'unlocked: the till is reachable again');
    await page.evaluate(() => { window.KiwiClientsBook.open(); });
    await settle(page, 300);
    check(await page.evaluate(() => { const r = document.getElementById('kcb-root'); return !!(r && r.style.display !== 'none'); }), 'unlocked: the customer book opens');
    await page.evaluate(() => { document.getElementById('cp-pin-screen').style.display = ''; });
    await settle(page, 600);
    const re = await behindLock(page);
    check(!re.book && !re.chip, 'locked again: the open book closes and stays shut');
  });
}

await S.run('flag on: the lock on the kit pad', async (tr) => {
  const { page, net } = await till(tr);
  const st = await page.evaluate(() => { const p = document.querySelector('#cp-pin-screen k-pin-pad'); return p && { identity: p.getAttribute('identity'), len: p.getAttribute('length'), legacy: !!document.querySelector('#cp-pin-pad') }; });
  check(st && st.identity === 'Café Banc' && st.len === '4' && !st.legacy, 'the lock is <k-pin-pad>, the venue as its identity line, four digits');
  await press(page, LOCK, '9999'); await settle(page, 900);
  let m = await msg(page, LOCK);
  check(m.pol === await tt(page, 'pin.wrong') && !m.ass, 'a wrong code: pin.wrong, politely');
  await press(page, LOCK, '2222'); await settle(page, 900);
  m = await msg(page, LOCK);
  check(m.pol === await tt(page, 'pin.not_till', { name: 'Youssef' }), 'a waiter is refused by name: ' + m.pol);
  check(await page.evaluate(() => !!document.querySelector('#cp-pin-screen k-pin-pad') && document.getElementById('cp-pin-screen').style.display !== 'none'), 'the till stays locked');
  await press(page, LOCK, '1111');
  await page.waitForFunction(() => document.getElementById('cp-pin-screen').style.display === 'none', { timeout: 5000 });
  const staff = await page.evaluate(() => window.KiwiStaff);
  check(staff && staff.name === 'Salma Idrissi', 'a cashier opens the till and the till knows who: ' + (staff && staff.name));
  check(net.verify.every((b) => b.merchant === VENUE.merchant && !('code' in b)), 'every check goes to /api/pin/verify for this store');
  const log = await page.evaluate(() => window.KiwiTillPin.log());
  check(log.length === 1 && log[0].level === 'lock' && log[0].verdict === 'online' && log[0].name === 'Salma Idrissi', 'the unlock is in the authorization log, verdict online');
});

await S.run('offline verifier: rows proven here decide, nothing else', async (tr) => {
  const { page, net } = await till(tr);
  /* Prove the waiter's and the cashier's codes online once (rows written). */
  await press(page, LOCK, '2222'); await settle(page, 900);
  await press(page, LOCK, '1111');
  await page.waitForFunction(() => document.getElementById('cp-pin-screen').style.display === 'none', { timeout: 5000 });
  /* Relock, then cut the network. */
  net.offline = true;
  await page.evaluate(() => window.__kiwiPinReset());
  await page.waitForFunction(() => { const s = document.getElementById('cp-pin-screen'); return s.style.display !== 'none' && s.querySelector('k-pin-pad'); }, { timeout: 8000 });
  await settle(page, 300);
  await press(page, LOCK, '4444'); await settle(page, 900);
  let m = await msg(page, LOCK);
  check(m.pol === await tt(page, 'pin.offline_unknown'), 'offline, an unknown code: pin.offline_unknown');
  await press(page, LOCK, '2222'); await settle(page, 900);
  m = await msg(page, LOCK);
  check(m.pol === await tt(page, 'pin.not_till', { name: 'Youssef' }), 'offline, a waiter proven online is refused by name');
  await press(page, LOCK, '1111');
  await page.waitForFunction(() => document.getElementById('cp-pin-screen').style.display === 'none', { timeout: 5000 });
  let log = await page.evaluate(() => window.KiwiTillPin.log());
  const last = log[log.length - 1];
  check(last.verdict === 'offline' && last.provenAt > Date.now() - 600000 && last.provenAt <= Date.now(), 'an offline unlock is logged with verdict offline and provenAt');

  /* A till act that completes offline: a row approves it. */
  await page.evaluate(() => { window.__ok = null; window.KiwiAuthAct({ kind: 'close_till', key: 'act.close_till' }); window.KiwiAuthorizeTillAction('Fermeture de caisse', (w) => { window.__ok = w; }); });
  await page.waitForSelector(SHEET);
  await settle(page, 500);
  await press(page, SHEET, '2222'); await settle(page, 900);
  m = await msg(page, SHEET);
  check(m.pol === await tt(page, 'pin.till.not_till'), 'offline, a waiter row cannot approve a till act: pin.till.not_till');
  await press(page, SHEET, '1111'); await settle(page, 600);
  const ok = await page.evaluate(() => window.__ok);
  check(ok && ok.verdict === 'offline' && ok.name === 'Salma Idrissi', 'offline, a cashier row approves closing the till');
  log = await page.evaluate(() => window.KiwiTillPin.log());
  check(log[log.length - 1].level === 'till' && log[log.length - 1].verdict === 'offline' && log[log.length - 1].provenAt, 'the till-level approval is logged with verdict and provenAt');

  /* A refund needs the server's proof: never a row. */
  await page.evaluate(() => { window.KiwiAuthAct({ kind: 'refund', key: 'act.refund', args: { amount: '45,00 MAD' } }); window.requireManager('Remboursement', () => { window.__refund = true; }, { kind: 'refund', refundId: 'r1', originalSaleId: 's1', amountCents: 4500 }); });
  await page.waitForSelector(SHEET); await settle(page, 500);
  await press(page, SHEET, '1111'); await settle(page, 900);
  m = await msg(page, SHEET);
  const keys = await page.evaluate((s) => [...document.querySelector(s).shadowRoot.querySelectorAll('[data-key]')].filter((k) => /\d/.test(k.dataset.key)).every((k) => k.getAttribute('aria-disabled') === 'true'), SHEET);
  check(m.ass === await tt(page, 'pin.manager.offline') && keys && !(await page.evaluate(() => window.__refund)), 'offline, a refund: pin.manager.offline, keys disabled, nothing approved');
});

await S.run('needs a connection: gated before any code', async (tr) => {
  const { page } = await till(tr);
  await press(page, LOCK, '1111');
  await page.waitForFunction(() => document.getElementById('cp-pin-screen').style.display === 'none', { timeout: 5000 });
  await page.setOfflineMode(true);
  await page.evaluate(() => { window.KiwiAuthAct({ kind: 'cancel_order', key: 'act.cancel_order', args: { order: '#42' } }); window.KiwiAuthorizeTillAction('Annuler la commande #42', () => { window.__cancel = true; }, { needsServer: true }); });
  await page.waitForSelector(SHEET); await settle(page, 500);
  const m = await msg(page, SHEET);
  const want = await tt(page, 'pin.till.needs_connection', { act: await tt(page, 'act.cancel_order', { order: '#42' }) });
  check(m.ass === want, 'offline when it opens: ' + m.ass);
  await press(page, SHEET, '1111'); await settle(page, 400);
  check(await page.evaluate((s) => document.querySelector(s).filled, SHEET) === 0 && !(await page.evaluate(() => window.__cancel)), 'no digit is taken and nothing is approved');
  await page.setOfflineMode(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await settle(page, 300);
  const back = await msg(page, SHEET);
  check(back.pol === await tt(page, 'pin.connection_back'), 'online: pin.connection_back, the keys are back');
  await press(page, SHEET, '1111'); await settle(page, 700);
  check(await page.evaluate(() => window.__cancel === true), 'the cashier then approves the cancellation');
});

await S.run('manager level: a discount needs a manager', async (tr) => {
  const { page } = await till(tr);
  await press(page, LOCK, '1111');
  await page.waitForFunction(() => document.getElementById('cp-pin-screen').style.display === 'none', { timeout: 5000 });
  const opened = [];
  await page.exposeFunction('__opened', (d) => opened.push(d));
  await page.evaluate(() => document.addEventListener('kiwi:approval-open', (e) => window.__opened(e.detail)));
  await page.evaluate(() => { window.KiwiAuthAct({ kind: 'discount', key: 'act.discount.pct', args: { pct: '10 %' } }); window.requireManager("Remise sur l'addition", (w) => { window.__disc = w; }); });
  await page.waitForSelector(SHEET); await settle(page, 500);
  const head = await page.evaluate(() => { const s = document.querySelector('k-sheet[data-till-pin]'); return { h: s.getAttribute('heading'), sub: s.querySelector('k-pin-pad').getAttribute('sub') }; });
  check(head.h === await tt(page, 'pin.manager.title') && head.sub === await tt(page, 'pin.manager.sub', { act: await tt(page, 'act.discount.pct', { pct: '10 %' }) }), 'the sheet says manager approval, and names the discount: ' + head.sub);
  check(opened.length === 1 && opened[0].level === 'manager' && opened[0].act === 'discount', 'kiwi:approval-open tells the level and the act');
  await press(page, SHEET, '1111'); await settle(page, 900);
  const m = await msg(page, SHEET);
  check(m.pol === await tt(page, 'pin.manager.not_manager') && !(await page.evaluate(() => window.__disc)), 'a cashier is not a manager: refused, keys stay');
  await press(page, SHEET, '3333'); await settle(page, 700);
  const who = await page.evaluate(() => window.__disc);
  check(who && who.name === 'Nadia Berrada' && await page.evaluate(() => window.KiwiCaissePairing.lastManager().name === 'Nadia Berrada'), 'a manager approves, and the till knows who (lastManager)');
});

await S.run('the pairing pad and the store lock on the kit pad', async (tr) => {
  const { page, net } = await till(tr);
  const PAD = '#cp-screen k-pin-pad';
  await page.evaluate(() => window.KiwiCaissePairing.repairWithCode());
  await page.waitForSelector(PAD); await settle(page, 300);
  const st = await page.evaluate((s) => { const p = document.querySelector(s); return { len: p.getAttribute('length'), h: p.getAttribute('heading'), sub: p.getAttribute('sub'), legacy: !!document.querySelector('#cp-pad') }; }, PAD);
  check(st.len === '6' && st.h === await tt(page, 'pair.title') && st.sub === await tt(page, 'pin.sub.pairing') && !st.legacy, 'six digits, pair.title, pin.sub.pairing, no shipped pad');
  await press(page, PAD, '000000'); await settle(page, 900);
  let m = await msg(page, PAD);
  check(m.pol === await tt(page, 'pair.invalid'), 'a refused code: pair.invalid, politely');

  net.pairHold = true;
  await press(page, PAD, '555555');
  await page.waitForFunction((s, w) => document.querySelector(s).shadowRoot.querySelector('.pol').textContent === w, { timeout: 12000 }, PAD, await tt(page, 'pair.no_answer'));
  check(true, 'held past 8 s: pair.no_answer');
  await settle(page, 1500);
  check(net.redeem.filter((c) => c === '555555').length === 1, 'and it was sent once, never again by itself');
  net.pairHold = false;
  await press(page, PAD, '555555'); await settle(page, 900);
  m = await msg(page, PAD);
  check(m.pol === await tt(page, 'pair.maybe_used'), 'typed again, a 422: pair.maybe_used');

  await press(page, PAD, PAIR);
  await page.waitForFunction(() => { const s = document.getElementById('cp-screen'); return !s || s.style.display === 'none'; }, { timeout: 8000 });
  check(true, 'the right code pairs and the pad closes');
  await page.waitForFunction(() => { const s = document.getElementById('cp-pin-screen'); return s && s.style.display !== 'none' && s.querySelector('k-pin-pad'); }, { timeout: 8000 });
  check(true, 'and hands over to the staff lock');

  await page.evaluate(() => window.KiwiCaissePairing.repairWithCode({ venue: { merchant: 'kiwi-test-other', name: 'Autre Banc' }, prompt: 'Réappairer à Autre Banc', foot: 'Code depuis son tableau de bord' }));
  await page.waitForFunction((s) => { const p = document.querySelector(s); return p && p.getAttribute('identity') === 'Autre Banc'; }, { timeout: 5000 }, PAD);
  const sl = await page.evaluate((s) => { const p = document.querySelector(s); const x = p.shadowRoot.querySelector('[data-extra]'); return { h: p.getAttribute('heading'), sub: p.getAttribute('sub'), back: x && x.textContent }; }, PAD);
  check(sl.h === 'Réappairer à Autre Banc' && sl.sub === 'Code depuis son tableau de bord' && sl.back === await tt(page, 'action.back'), 'the store lock\'s pad: the store, its prompt, its foot, and Back');
  await page.evaluate((s) => document.querySelector(s).shadowRoot.querySelector('[data-extra]').click(), PAD);
  await page.waitForFunction(() => document.getElementById('cp-screen').style.display === 'none', { timeout: 3000 });
  check(true, 'Back closes the pad');
});

await S.run('workflow loading preserves startup and defers inventory until first use', async (tr) => {
  const { page } = await till(tr);
  const inventoryLoads = () => page.evaluate(() => performance.getEntriesByType('resource').filter(e => /assets\/caisse\/inventory\.js/.test(e.name)).length);
  check(await page.evaluate(() => !performance.getEntriesByType('resource').some(e => /assets\/caisse\/orders\.js/.test(e.name))), 'order review declarations are absent from first paint');
  check(await inventoryLoads() === 0, 'inventory declarations are absent from first paint');
  check(await page.evaluate(() => typeof rollupLedger === 'function' && typeof recordSale === 'function' && typeof persistShift === 'function'), 'financial and recovery functions are synchronous at startup');
  await press(page, LOCK, Object.keys(STAFF)[0]);
  await page.waitForFunction(() => document.getElementById('cp-pin-screen').style.display === 'none', { timeout: 5000 });
  await page.evaluate(() => openOrderReviewModal());
  check(await page.evaluate(() => performance.getEntriesByType('resource').filter(e => /assets\/caisse\/orders\.js/.test(e.name)).length === 1), 'order review loads at its first entry');
  await page.evaluate(() => closeOrderReviewModal());
  await page.evaluate(() => Promise.all([openStock(), openStock()]));
  check(await page.evaluate(() => document.querySelector('#stock-screen').classList.contains('is-open')), 'first stock opening executes the shipped inventory workflow');
  check(await inventoryLoads() === 1, 'concurrent first openings share one inventory request');
  await page.evaluate(() => { closeStock(); openStock(); });
  check(await inventoryLoads() === 1, 'later openings reuse the loaded inventory');
});

await kb.close();
console.log(`✓ till-pin-browser-test · ${checks} checks`);
await S.finish();
