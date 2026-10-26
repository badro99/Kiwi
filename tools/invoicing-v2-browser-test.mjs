import invoicingSourceHelper from './invoicing-test-source.cjs';
/* Facturation v2 · le client suit le contrat, au vrai clic, dans dashboard.html.
 *
 * Le serveur (functions/api/invoices.js) est tenu à part. Ici, un faux serveur
 * en mémoire rejoue le contrat (docs/…/kiwi-invoicing-contract) derrière
 * /api/invoices et le navigateur ne voit pas la différence. Ce que la suite tient :
 *
 *   · un compte réel liste, enregistre un brouillon (aucun numéro), émet (numéro
 *     attribué par le serveur, plus aucune modification possible), encaisse un
 *     paiement partiel (le solde et le statut suivent), crée un avoir partiel
 *     (« Avoir sur facture F-… du … »), convertit un devis en facture ;
 *   · l'ICE est validé à la saisie, une ligne exonérée réclame sa mention, les
 *     totaux se groupent par taux de TVA ;
 *   · les anciennes factures de l'appareil proposent un import unique, puis
 *     disparaissent du stockage local ;
 *   · hors ligne : la dernière liste reste affichée avec sa mention, et une
 *     écriture dit qu'elle a échoué, sans repli local pour un document émis ;
 *   · l'export CSV : point-virgule, virgule décimale, BOM, ICE en texte ;
 *   · la démonstration n'appelle jamais /api/invoices ;
 *   · l'arabe : composer et gabarit d'impression se lisent de droite à gauche. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const src = invoicingSourceHelper.invoicingTestSource(root);
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const eq = (got, want, msg) => { assert.deepEqual(got, want, `${msg}\n      reçu : ${JSON.stringify(got)}\n      voulu : ${JSON.stringify(want)}`); checks++; console.log('  ✓ ' + msg); };
const flat = (s) => String(s || '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
const YEAR = new Date().getFullYear();

/* ── le vrai serveur : mêmes appels, le handler de production ─────────────
 * Même interface que fakeServer() (handle, st.docs, st.calls, st.offline) pour
 * que les scénarios ne changent pas. st.docs relit la table invoice_docs. */
async function realServer() {
  const { DatabaseSync } = await import('node:sqlite');
  const SECRET = 'invoicing-real-server-secret-0123456789';
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
  const now = Date.now();
  db.prepare("INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-inv','o@inv.test','Facturation Test','s','h',?,'active')").run(now);
  const wrap = (q) => {
    const st = db.prepare(q);
    const bound = (p) => ({
      async first() { const row = st.get(...p); return row === undefined ? null : row; },
      async all() { return { results: st.all(...p) }; },
      async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
      __run() { return st.run(...p); },
    });
    return Object.assign(bound([]), { bind: (...p) => bound(p) });
  };
  const env = { AUTH_SECRET: SECRET, DB: {
    prepare: wrap,
    async batch(stmts) {
      db.exec('BEGIN');
      try { const out = []; for (const s of stmts) out.push(await s.run()); db.exec('COMMIT'); return out; }
      catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
    },
  } };
  const lib = await import(pathToFileURL(path.join(root, 'functions/auth/_lib.js')).href);
  const api = await import(pathToFileURL(path.join(root, 'functions/api/invoices.js')).href);
  const cookie = lib.sessionCookie(await lib.makeSession('acc-inv', SECRET)).split(';')[0];
  const known = new Set();
  const own = (m) => {
    if (!m || known.has(m)) return;
    known.add(m);
    db.prepare("INSERT OR IGNORE INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,'{}','restaurant','acc-inv',?,'active',0,?)").run(m, m, now);
  };
  const st = { calls: [], offline: false, get docs() { return db.prepare('SELECT * FROM invoice_docs').all(); } };
  return {
    st,
    async handle(method, u, body) {
      if (st.offline) return null;
      if (body) st.calls.push(body);
      own(String((body && body.merchant) || u.searchParams.get('merchant') || '').trim());
      const request = new Request('https://kiwi-os.com' + u.pathname + u.search, {
        method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.9.9' },
        body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
      });
      const res = method === 'GET' ? await api.onRequestGet({ request, env }) : await api.onRequestPost({ request, env });
      return { status: res.status, body: await res.json() };
    },
  };
}

/* ── le faux serveur : le contrat, en mémoire ─────────────────────────────── */
function fakeServer() {
  const st = { docs: [], payments: [], seq: { F: 0, AV: 0, D: 0 }, calls: [], offline: false };
  const PREFIX = { invoice: 'F', credit_note: 'AV', quote: 'D' };
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const err = (status, code) => ({ status, body: { error: code, message: code } });
  const totals = (lines) => {
    const g = new Map();
    for (const l of lines) {
      assert.ok(Number.isInteger(l.unitHT), 'le client envoie des centimes entiers (unitHT)');
      g.set(l.vatRate, (g.get(l.vatRate) || 0) + Math.round(l.qty * l.unitHT * (1 - (l.discountPct || 0) / 100)));
    }
    const byRate = [...g].sort((a, b) => b[0] - a[0]).map(([rate, baseCents]) => ({ rate, baseCents, vatCents: Math.round(baseCents * rate / 100) }));
    const htCents = byRate.reduce((s, r) => s + r.baseCents, 0), vatCents = byRate.reduce((s, r) => s + r.vatCents, 0);
    return { htCents, vatCents, ttcCents: htCents + vatCents, byRate };
  };
  const credited = (d) => st.docs.filter((x) => x.type === 'credit_note' && x.original_id === d.id && x.status === 'issued').reduce((s, x) => s + x.totals.ttcCents, 0);
  const paid = (d) => st.payments.filter((p) => p.doc_id === d.id).reduce((s, p) => s + p.amount_cents, 0);
  const derive = (d) => {
    if (d.type === 'credit_note') return { displayStatus: d.status, balanceCents: 0 };
    if (d.type === 'quote') return { displayStatus: d.status, balanceCents: 0 };
    if (d.status === 'draft') return { displayStatus: 'draft', balanceCents: 0 };
    const ttc = d.totals.ttcCents, cr = credited(d), balance = Math.max(0, ttc - paid(d) - cr);
    let ds = 'issued';
    if (cr >= ttc) ds = 'cancelled'; else if (balance <= 0) ds = 'paid'; else if (d.due_date < today()) ds = 'overdue'; else if (paid(d) > 0) ds = 'partial';
    return { displayStatus: ds, balanceCents: balance };
  };
  const row = (d) => ({ id: d.id, type: d.type, status: d.status, number: d.number, issueDate: d.issue_date, dueDate: d.due_date, validUntil: d.valid_until,
    customer: { name: d.customer.name, ice: d.customer.ice }, totals: { ttcCents: d.totals.ttcCents }, originalNumber: d.original_id ? st.docs.find((x) => x.id === d.original_id).number : undefined,
    legacyRef: d.legacy_ref || undefined, ...derive(d) });
  const mk = (type, p) => ({ id: 'inv_' + (st.docs.length + 1000), type, status: 'draft', number: null, seq: null, issue_date: today(), due_date: null, terms_days: 30, valid_until: null,
    customer: { name: '', address: '', ice: '', if: '', email: '', phone: '', clientId: '' }, seller: null, lines: [], totals: totals([]), payment_method: '', note: '', internal_note: '',
    exemption_mention: '', original_id: '', source_quote_id: '', reason: '', created_ts: Date.now(), updated_ts: Date.now(), issued_ts: null, sent_ts: null, legacy_ref: '', ...p });
  const apply = (d, b) => {
    if (b.customer) d.customer = { name: '', address: '', ice: '', if: '', email: '', phone: '', clientId: '', ...b.customer };
    if (b.lines) { d.lines = b.lines; d.totals = totals(d.lines); }
    if (b.issueDate) d.issue_date = b.issueDate;
    if (d.type === 'quote') d.valid_until = b.validUntil || d.valid_until || addDays(d.issue_date, 30);
    else if (b.dueDate) { d.due_date = b.dueDate; d.terms_days = null; }
    else if (b.termsDays != null) { d.terms_days = b.termsDays; d.due_date = addDays(d.issue_date, b.termsDays); }
    for (const [k, c] of [['paymentMethod', 'payment_method'], ['note', 'note'], ['exemptionMention', 'exemption_mention']]) if (b[k] !== undefined) d[c] = b[k];
  };
  const full = (d) => ({ ...d, original_number: d.original_id ? st.docs.find((x) => x.id === d.original_id).number : '' });
  function handle(method, url, body) {
    if (st.offline) return null;
    const q = url.searchParams;
    if (method === 'GET') {
      if (q.get('id')) {
        const d = st.docs.find((x) => x.id === q.get('id')); if (!d) return err(404, 'not-found');
        return { status: 200, body: { ok: true, doc: full(d), payments: st.payments.filter((p) => p.doc_id === d.id).map((p) => ({ id: p.id, amountCents: p.amount_cents, date: p.date, method: p.method, reference: p.reference })),
          creditNotes: st.docs.filter((x) => x.type === 'credit_note' && x.original_id === d.id && x.status === 'issued').map((x) => ({ id: x.id, number: x.number, ttcCents: x.totals.ttcCents, issueDate: x.issue_date })), ...derive(d) } };
      }
      return { status: 200, body: { ok: true, docs: st.docs.filter((d) => !q.get('type') || d.type === q.get('type')).slice().reverse().map(row) } };
    }
    st.calls.push(body);
    const a = body.action, d = body.id ? st.docs.find((x) => x.id === body.id) : null;
    if (body.id && !d && a !== 'save') return err(404, 'not-found');
    if (a === 'save') {
      let doc = d;
      if (!doc) { doc = mk(body.type); st.docs.push(doc); }
      else if (doc.status !== 'draft' && doc.type !== 'quote' && Object.keys(body).some((k) => !['merchant', 'action', 'id', 'type', 'internalNote'].includes(k))) return err(409, 'locked');
      if (body.internalNote !== undefined) doc.internal_note = body.internalNote;
      if (doc.status === 'draft' || doc.type === 'quote') apply(doc, body);
      return { status: 200, body: { ok: true, doc: full(doc) } };
    }
    if (a === 'issue') {
      if (d.status !== 'draft' && d.type !== 'quote') return { status: 200, body: { ok: true, doc: full(d) } };
      if (!d.customer.name) return err(400, 'invalid-customer');
      if (d.lines.some((l) => l.vatRate === 0) && !(d.exemption_mention || d.note)) return err(400, 'exempt-mention-required');
      if (!d.number) { st.seq[PREFIX[d.type]]++; d.seq = st.seq[PREFIX[d.type]]; d.number = `${PREFIX[d.type]}-${d.issue_date.slice(0, 4)}-${String(d.seq).padStart(4, '0')}`; d.issued_ts = Date.now(); }
      d.status = d.type === 'quote' ? 'sent' : 'issued';
      if (d.type !== 'quote') d.seller = { name: 'Atelier Test', legalName: 'Atelier Test SARL', ice: '001561191000066', if: '1234567', rc: '98765', patente: '4455', address: '12 rue des Tests', city: 'Casablanca' };
      return { status: 200, body: { ok: true, doc: full(d) } };
    }
    if (a === 'mark-sent') { d.sent_ts = Date.now(); return { status: 200, body: { ok: true, doc: full(d) } }; }
    if (a === 'payment') {
      if (d.status !== 'issued') return err(409, 'not-issued');
      if (body.amountCents > derive(d).balanceCents) return err(400, 'amount-exceeds-balance');
      st.payments.push({ id: 'pay_' + (st.payments.length + 1), doc_id: d.id, amount_cents: body.amountCents, date: body.date, method: body.method, reference: body.reference });
      return { status: 200, body: { ok: true, ...derive(d) } };
    }
    if (a === 'delete-payment') { const i = st.payments.findIndex((p) => p.id === body.paymentId); st.payments.splice(i, 1); return { status: 200, body: { ok: true, ...derive(d) } }; }
    if (a === 'credit-note') {
      if (d.status !== 'issued') return err(409, 'not-issued');
      const cn = mk('credit_note', { customer: d.customer, lines: d.lines, original_id: d.id, reason: body.reason, due_date: null, exemption_mention: d.exemption_mention });
      cn.totals = totals(cn.lines); st.docs.push(cn);
      return { status: 200, body: { ok: true, doc: full(cn) } };
    }
    if (a === 'quote-status') { d.status = body.status; return { status: 200, body: { ok: true, doc: full(d) } }; }
    if (a === 'convert-quote') {
      const inv = mk('invoice', { customer: d.customer, lines: d.lines, source_quote_id: d.id }); inv.totals = totals(inv.lines); inv.due_date = addDays(inv.issue_date, 30);
      st.docs.push(inv); d.status = 'invoiced'; return { status: 200, body: { ok: true, doc: full(inv) } };
    }
    if (a === 'duplicate') { const c = mk(d.type, { customer: d.customer, lines: d.lines }); c.totals = totals(c.lines); st.docs.push(c); return { status: 200, body: { ok: true, doc: full(c) } }; }
    if (a === 'delete-draft') { st.docs.splice(st.docs.indexOf(d), 1); return { status: 200, body: { ok: true } }; }
    if (a === 'import-legacy') {
      let imported = 0;
      for (const l of body.docs) {
        if (st.docs.some((x) => x.legacy_ref === '#' + l.id)) continue;
        const inv = mk('invoice', { legacy_ref: '#' + l.id, customer: { name: l.customer, address: '', ice: '', if: '', email: '', phone: l.contact || '', clientId: '' }, issue_date: l.issueDate, due_date: l.dueDate,
          lines: l.items.map((it) => ({ description: it.description, qty: it.qty, unitHT: Math.round(it.price * 100), discountPct: 0, vatRate: l.taxRate })) });
        inv.totals = totals(inv.lines); st.docs.push(inv); imported++;
      }
      return { status: 200, body: { ok: true, imported } };
    }
    return err(400, 'invalid-action');
  }
  return { st, handle };
}

/* ── serveur statique et navigateur ───────────────────────────────────────── */
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = suite('invoicing-v2', { browser });

/* Une page de tableau de bord. real : compte réel (le faux serveur répond) ; sinon démo. */
async function dashboard(tr, { lang = 'fr', real = false, fake = null, width = 1280, tz = null, at = null } = {}) {
  const ctx = await browser.createBrowserContext();
  tr.defer(() => ctx.close());
  const page = tr.watch(await ctx.newPage());
  /* tz + at : l'appareil dans un autre fuseau, à une heure fixée (l'horloge
     continue de tourner à partir de là). */
  if (tz) await page.emulateTimezone(tz);
  if (at != null) await page.evaluateOnNewDocument((target) => {
    const R = Date, delta = target - R.now();
    class Pinned extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + delta); } static now() { return R.now() + delta; } }
    window.Date = Pinned;
  }, at);
  const hits = [];
  await page.setViewport({ width, height: 960 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', async (r) => {
    const u = new URL(r.url());
    if (r.url().startsWith(base + '/api/')) {
      if (u.pathname === '/api/invoices') {
        hits.push(r.method() + ' ' + u.search);
        if (!real || !fake) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
        let body = null; try { body = r.postData() ? JSON.parse(r.postData()) : null; } catch (_) {}
        let out; try { out = await fake.handle(r.method(), u, body); } catch (e) { return r.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'server', message: String(e) }) }); }
        if (!out) return r.abort('connectionfailed');
        return r.respond({ status: out.status, contentType: 'application/json', body: JSON.stringify(out.body) });
      }
      return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    }
    if (r.url().startsWith(base) || r.url().startsWith('data:')) return r.continue();
    return r.abort();
  });
  await page.evaluateOnNewDocument((lang) => {
    try { if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
    try { localStorage.setItem('kiwiLang', lang); } catch (_) {}
  }, lang);
  tr.step('open the dashboard');
  // coverage: surface=dashboard locale=fr viewport=desktop
  // coverage: surface=dashboard locale=ar viewport=desktop
  // coverage: surface=dashboard locale=fr viewport=phone
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.readyState === 'complete' && window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers.invoicing, { timeout: 25000 });
  await sleep(1200);
  const explore = await page.$('.kob-root [data-explore]'); if (explore) { await explore.click(); await sleep(700); }
  const skip = await page.$('[data-kiwi-skip]'); if (skip) { await skip.click(); await sleep(500); }
  if (real) await page.evaluate(() => { window.KiwiEnv.isReal = () => true; });
  return { page, hits };
}
const openInvoicing = async (page) => {
  await page.evaluate(() => window.Kiwi.handlers.invoicing());
  await page.waitForSelector('.inv-overlay [data-inv-table] .inv-table, .inv-overlay [data-inv-table] .inv-empty', { visible: true, timeout: 8000 });
  await sleep(250);
};
const text = (page, sel) => page.$eval(sel, (n) => n.textContent).then(flat);
/* Le premier élément qui correspond peut être dans une vue cachée (le composer garde
 * son bouton Retour sous le détail) : on clique le premier VISIBLE. */
const SHOWN = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((n) => !n.closest('[hidden]') && n.getClientRects().length)`;
const click = async (page, sel) => {
  await page.waitForFunction(`!!(${SHOWN(sel)})`, { timeout: 6000 });
  const h = await page.evaluateHandle(`(${SHOWN(sel)})`);
  await h.asElement().click(); await sleep(120);
};
const setVal = (page, sel, value) => page.$eval(sel, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value);
const L = (n, f) => `[data-inv-lines] .inv-line-row:nth-child(${n}) [data-l="${f}"]`;
const toastText = (page) => page.$eval('.inv-toast', (n) => n.textContent).catch(() => '');
const waitDetail = (page) => page.waitForSelector('[data-inv-detail]:not([hidden]) .inv-preview', { visible: true, timeout: 8000 });
/* INV_SHOTS=<dossier> : des captures pour l'œil, jamais des assertions. */
const shot = async (page, name) => { if (process.env.INV_SHOTS) { await sleep(700); fs.mkdirSync(process.env.INV_SHOTS, { recursive: true }); await page.screenshot({ path: path.join(process.env.INV_SHOTS, name + '.png') }); } };
const waitSheet = (page) => page.waitForSelector('.inv-sheet', { visible: true, timeout: 5000 });

try {
  check(!/data-lucide/.test(src), 'le module ne contient plus un seul data-lucide');
  check(!/—/.test(src), 'aucun tiret cadratin dans le module');
  check(!/font-style\s*:\s*italic/.test(src + fs.readFileSync(path.join(root, 'assets/invoicing.css'), 'utf8')), 'aucun italique');

  /* INV_SERVER=real : le vrai functions/api/invoices.js sur une base SQLite au
   * schéma réel, derrière une vraie session propriétaire (realServer). */
  const fake = process.env.INV_SERVER === 'real' ? await realServer() : fakeServer();

  /* 1 · Compte réel : import, brouillon, émission, paiement, avoir, devis ─── */
  await S.run('compte réel · du brouillon à l’avoir', async (tr) => {
    const { page, hits } = await dashboard(tr, { real: true, fake });
    const venue = await page.evaluate(() => String(window.KiwiVenue?.getVenue?.() || 'demo').replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'demo');

    tr.step('legacy invoices on the device');
    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify([
      { id: 1042, customer: 'Riad Zayna', contact: '+212 661 44 08 22', issueDate: '2026-10-01', dueDate: '2026-10-08', terms: 7, taxRate: 20, status: 'sent', items: [{ description: 'Service traiteur', qty: 1, price: 8750 }], note: '' },
      { id: 1041, customer: 'Atelier Nomade', contact: 'finance@atelier-nomade.ma', issueDate: '2026-09-20', dueDate: '2026-10-05', terms: 15, taxRate: 10, status: 'sent', items: [{ description: 'Salle', qty: 2, price: 500 }], note: '' },
    ])), 'kiwi:invoices:v1:' + venue);
    await openInvoicing(page);
    check(hits.some((h) => h.startsWith('GET ')), 'un compte réel lit /api/invoices');
    let banner = await text(page, '[data-inv-legacy]');
    check(/2 factures enregistrées sur cet appareil/.test(banner) && /Importer/.test(banner), 'la bannière propose d’importer 2 factures locales : ' + banner);
    await click(page, '[data-inv-act="import-legacy"]');
    await page.waitForFunction(() => !document.querySelector('[data-inv-legacy]'), { timeout: 6000 });
    check(await page.evaluate((key) => localStorage.getItem(key) === null, 'kiwi:invoices:v1:' + venue), 'après l’import, la copie locale est supprimée');
    eq(fake.st.docs.map((d) => d.legacy_ref).sort(), ['#1041', '#1042'], 'le serveur a reçu les deux factures (legacy_ref #id)');
    check(/2 factures importées/.test(await toastText(page)), 'un message confirme l’import');
    await click(page, '[data-inv-act="filter"][data-v="draft"]');
    check((await page.$$('[data-inv-table] tbody tr')).length === 2, 'elles arrivent en brouillons (filtre Brouillons : 2 lignes)');
    check(/Brouillon/.test(await text(page, '[data-inv-table] tbody tr:first-child .inv-no')), 'un brouillon n’a pas de numéro');
    await click(page, '[data-inv-act="filter"][data-v="all"]');

    /* Nouvelle facture */
    tr.step('compose an invoice');
    await click(page, '[data-inv-act="new"]');
    await page.waitForSelector('[data-inv-compose]:not([hidden]) [data-f="name"]', { visible: true });
    check(/Nouvelle facture/.test(await text(page, '[data-compose-title]')), 'le composer s’ouvre sur « Nouvelle facture »');
    await page.type('[data-f="name"]', 'Hôtel Les Dunes');
    await page.select('[data-f="kind"]', 'business');
    check(/obligatoire/.test(await text(page, '[data-ice-label]')), 'client entreprise : l’ICE est signalé obligatoire');
    await page.type('[data-f="ice"]', '001561191000065');
    let msg = await text(page, '[data-ice-msg]');
    check(/ne passe pas le contrôle/.test(msg) && await page.$eval('[data-f="ice"]', (n) => n.getAttribute('aria-invalid')) === 'true', 'un ICE faux est refusé à la saisie : ' + msg);
    await page.click('[data-f="ice"]', { clickCount: 3 }); await page.keyboard.press('Backspace');
    await page.type('[data-f="ice"]', '0015 6119 1000 066');
    msg = await text(page, '[data-ice-msg]');
    check(/ICE valide/.test(msg) && await page.$eval('[data-f="ice"]', (n) => !n.hasAttribute('aria-invalid')), 'un ICE juste (espaces tolérés) passe : ' + msg);
    await page.type('[data-f="addr"]', 'Merzouga');
    await page.type('[data-f="email"]', 'achats@lesdunes.ma');
    await page.type('[data-f="phone"]', '0661112233');
    await page.type(L(1, 'desc'), 'Buffet séminaire');
    await setVal(page, L(1, 'qty'), '2'); await setVal(page, L(1, 'unit'), '1000');
    await click(page, '[data-inv-act="add-line"]');
    await page.type(L(2, 'desc'), 'Hébergement'); await setVal(page, L(2, 'unit'), '500'); await page.select(L(2, 'vat'), '10');
    check(await page.$eval('[data-exempt-wrap]', (n) => n.hidden), 'sans ligne exonérée, pas de champ de mention');
    await click(page, '[data-inv-act="add-line"]');
    await page.type(L(3, 'desc'), 'Location de matériel'); await setVal(page, L(3, 'unit'), '300'); await page.select(L(3, 'vat'), '0');
    check(await page.$eval('[data-exempt-wrap]', (n) => !n.hidden), 'une ligne exonérée fait apparaître la mention d’exonération');
    const sum = await text(page, '.inv-summary-card');
    check(/TVA 20 % sur 2 000,00/.test(sum) && /TVA 10 % sur 500,00/.test(sum) && /TVA 0 % sur 300,00/.test(sum), 'les totaux se groupent par taux de TVA');
    check(/3 250,00 MAD/.test(sum) && /2 800,00 MAD/.test(sum), 'Total HT 2 800,00 et TTC 3 250,00');
    check(await page.$$eval('[data-f="terms"] option', (o) => o.map((x) => x.value).join(',')) === '0,7,15,30,60,custom', 'conditions : à réception, 7, 15, 30, 60 jours, date précise');
    check(await page.$$eval(L(1, 'vat') + ' option', (o) => o.map((x) => x.value).join(',')) === '20,14,10,7,0', 'taux de TVA : 20, 14, 10, 7, 0 (exonéré)');

    tr.step('autosave');
    await sleep(800);
    check(await page.evaluate((v) => Object.keys(localStorage).some((k) => k.startsWith('kiwi:invoicing:draft:v2:' + v + ':invoice:new')), venue), 'la saisie est conservée sur l’appareil pendant qu’on tape');

    tr.step('issue without the exemption mention');
    await shot(page, 'composer-top'); await page.evaluate(() => document.querySelector('.inv-body').scrollTo(0, 99999)); await shot(page, 'composer-bottom');
    await click(page, '[data-inv-act="issue-composer"]');
    check(/mention d’exonération/.test(await toastText(page)) && !(await page.$('.inv-sheet')), 'émettre sans mention d’exonération est refusé avant toute confirmation');
    await page.type('[data-f="exempt"]', 'Exonération de TVA, article 91 du CGI');

    tr.step('save the draft');
    await click(page, '[data-inv-act="save-draft"]');
    await waitDetail(page);
    let save = fake.st.calls.filter((c) => c.action === 'save').pop();
    check(save.type === 'invoice' && save.lines.length === 3 && save.lines[0].unitHT === 100000 && save.lines[0].vatRate === 20 && save.lines[2].vatRate === 0, 'le brouillon part en centimes entiers, un taux par ligne');
    check(save.customer.ice === '001561191000066' && save.customer.name === 'Hôtel Les Dunes' && save.termsDays === 30, 'client, ICE compact et conditions envoyés');
    check(save.exemptionMention === 'Exonération de TVA, article 91 du CGI', 'la mention d’exonération part avec le document');
    check(!save.number && !('seq' in save), 'le client n’envoie jamais de numéro');
    check(await page.evaluate((v) => !Object.keys(localStorage).some((k) => k.startsWith('kiwi:invoicing:draft:v2:' + v + ':invoice:new')), venue), 'la copie de saisie est effacée une fois enregistrée');
    let d = await text(page, '[data-inv-detail]');
    check(/Brouillon/.test(await text(page, '[data-doc-number]')) && !/F-\d{4}-\d{4}/.test(d), 'le détail d’un brouillon n’affiche aucun numéro');
    check(await page.$eval('.inv-preview', (n) => n.classList.contains('is-draft')) && /BROUILLON/.test(await text(page, '.inv-watermark')), 'filigrane BROUILLON à l’écran');
    check(/Hôtel Les Dunes/.test(d) && /001561191000066/.test(d) && /TVA 20 % sur 2 000,00/.test(d), 'client, ICE et TVA par taux dans le détail');
    check(!!(await page.$('[data-inv-act="edit"]')) && !!(await page.$('[data-inv-act="issue-detail"]')) && !!(await page.$('[data-inv-act="delete"]')) && !!(await page.$('[data-inv-act="print"]')) && !(await page.$('[data-inv-act="pay"]')), 'brouillon : modifier, émettre, supprimer, imprimer, pas de paiement');

    tr.step('issue');
    await click(page, '[data-inv-act="issue-detail"]');
    await waitSheet(page);
    await shot(page, 'sheet-issue');
    const sheet = await text(page, '.inv-sheet');
    check(/numéro définitif est attribué maintenant/.test(sheet) && /ne peut plus être modifiée/.test(sheet) && /avoir/.test(sheet), 'la feuille de confirmation explique numéro, verrouillage et avoir');
    await click(page, '.inv-sheet [data-sheet-cancel]');
    check(fake.st.docs.every((x) => x.type !== 'invoice' || x.number === null), 'annuler la confirmation n’attribue aucun numéro');
    await click(page, '[data-inv-act="issue-detail"]'); await waitSheet(page);
    await click(page, '.inv-sheet [data-sheet-ok]');
    await page.waitForFunction(() => /F-\d{4}-\d{4}/.test(document.querySelector('[data-doc-number]')?.textContent || ''), { timeout: 6000 });
    const number = (await text(page, '[data-doc-number]')).match(/F-\d{4}-\d{4}/)[0];
    eq(number, `F-${YEAR}-0001`, 'le serveur attribue le numéro à l’émission');
    await shot(page, 'detail-issued');
    check(!(await page.$('[data-inv-act="edit"]')) && !(await page.$('[data-inv-act="issue-detail"]')) && !(await page.$('[data-inv-act="delete"]')), 'une facture émise n’offre ni modification, ni suppression, ni nouvelle émission');
    check(!!(await page.$('[data-inv-act="pay"]')) && !!(await page.$('[data-inv-act="credit"]')) && !!(await page.$('[data-inv-act="mark-sent"]')) && !!(await page.$('[data-inv-act="duplicate"]')) && !!(await page.$('[data-inv-act="print"]')), 'émise : paiement, avoir, envoyée, dupliquer, imprimer');
    check(/aucune modification|ne peut plus être modifié/.test(await text(page, '[data-locked-note]')), 'la note de verrouillage est affichée');
    check((await text(page, '.inv-detail-side')).includes('Aucun paiement'), 'aucun paiement au départ');

    tr.step('partial payment');
    await click(page, '[data-inv-act="pay"]'); await waitSheet(page);
    eq(await page.$eval('[data-sf="amount"]', (n) => n.value), '3250,00', 'le paiement propose le solde');
    await setVal(page, '[data-sf="amount"]', '5000');
    await click(page, '.inv-sheet [data-sheet-ok]');
    check(/dépasse le reste à payer/.test(await text(page, '[data-sheet-err]')) && !!(await page.$('.inv-sheet')), 'un paiement supérieur au solde est refusé dans la feuille');
    await setVal(page, '[data-sf="amount"]', '1000'); await setVal(page, '[data-sf="reference"]', 'VIR-221');
    await click(page, '.inv-sheet [data-sheet-ok]');
    await page.waitForFunction(() => document.querySelector('[data-balance]')?.textContent.replace(/[  \s]/g, '').startsWith('2250,00'), { timeout: 6000 });
    check(await page.$eval('.inv-composer-head .inv-status', (n) => n.dataset.ds) === 'partial', 'statut « partielle » après un paiement partiel');
    check(/Partielle/.test(await text(page, '.inv-composer-head .inv-status')) && /VIR-221/.test(await text(page, '[data-payments]')), 'le paiement est listé avec sa référence');
    eq(fake.st.calls.filter((c) => c.action === 'payment').pop().amountCents, 100000, 'le paiement part en centimes');
    await click(page, '[data-inv-act="delete-payment"]'); await waitSheet(page); await click(page, '.inv-sheet [data-sheet-ok]');
    await page.waitForFunction(() => document.querySelector('[data-balance]')?.textContent.replace(/[  \s]/g, '').startsWith('3250,00'), { timeout: 6000 });
    check(await page.$eval('.inv-composer-head .inv-status', (n) => n.dataset.ds) === 'issued', 'supprimer le paiement rend le solde et le statut « émise »');
    await click(page, '[data-inv-act="pay"]'); await waitSheet(page); await setVal(page, '[data-sf="amount"]', '1000'); await click(page, '.inv-sheet [data-sheet-ok]');
    await page.waitForFunction(() => document.querySelector('[data-balance]')?.textContent.replace(/[  \s]/g, '').startsWith('2250,00'), { timeout: 6000 });

    tr.step('credit note');
    await click(page, '[data-inv-act="credit"]'); await waitSheet(page);
    await click(page, '.inv-sheet [data-sheet-ok]');
    check(/Indiquez le motif/.test(await text(page, '[data-sheet-err]')), 'un avoir réclame son motif');
    await setVal(page, '[data-sf="reason"]', 'Remise accordée sur le buffet');
    await click(page, '.inv-sheet [data-sheet-ok]');
    await page.waitForSelector('[data-inv-compose]:not([hidden]) [data-f="name"]', { visible: true });
    check(new RegExp(`Avoir sur facture ${number}`).test(await text(page, '[data-compose-title]')), 'le composer d’avoir dit sur quelle facture il porte');
    check(await page.$eval('[data-f="name"]', (n) => n.disabled), 'le client d’un avoir est figé');
    await click(page, '[data-inv-lines] .inv-line-row:nth-child(3) [data-inv-act="remove-line"]');
    await click(page, '[data-inv-lines] .inv-line-row:nth-child(2) [data-inv-act="remove-line"]');
    await setVal(page, L(1, 'qty'), '1');
    check(/1 200,00 MAD/.test(await text(page, '.inv-summary-card')), 'avoir partiel : 1 ligne, 1 200,00 TTC');
    await click(page, '[data-inv-act="issue-composer"]'); await waitSheet(page);
    check(/Émettre cet avoir/.test(await text(page, '.inv-sheet')), 'émettre un avoir demande confirmation');
    await click(page, '.inv-sheet [data-sheet-ok]');
    await page.waitForFunction(() => /AV-\d{4}-\d{4}/.test(document.querySelector('[data-doc-number]')?.textContent || ''), { timeout: 6000 });
    eq((await text(page, '[data-doc-number]')).match(/AV-\d{4}-\d{4}/)[0], `AV-${YEAR}-0001`, 'l’avoir reçoit sa propre série (AV)');
    const ref = await text(page, '[data-credit-ref]');
    /* La date d'émission est celle du magasin (le vrai serveur, fuseau de
       Casablanca) ou celle du navigateur (le serveur simulé) : autour de
       minuit elles diffèrent d'un jour, et les deux sont justes. */
    const dmyIn = (tz) => new Intl.DateTimeFormat('fr-FR', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
    /* Et la date que le navigateur lui-même voit à Casablanca : le Maroc est
       passé de UTC+1 à UTC+0 le 20 septembre 2026, ce que savent la base de
       fuseaux de macOS et Chrome, pas celle de Node (2026b). Entre minuit et
       une heure, Node croit déjà au lendemain. */
    const pageDmy = await page.evaluate(() => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Casablanca', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date()));
    const dmys = [dmyIn(undefined), dmyIn('Africa/Casablanca'), pageDmy];
    check(dmys.some((dmy) => ref.includes(`Avoir sur facture ${number} du ${dmy}`)) && /Remise accordée/.test(ref), 'le détail d’un avoir cite la facture et le motif : ' + ref);
    check(!(await page.$('[data-inv-act="edit"]')) && !(await page.$('[data-inv-act="pay"]')), 'un avoir émis n’offre ni modification ni paiement');
    await click(page, '[data-inv-act="open-original"]'); await waitDetail(page);
    await page.waitForFunction(() => document.querySelector('[data-balance]')?.textContent.replace(/[  \s]/g, '').startsWith('1050,00'), { timeout: 6000 });
    check(/AV-\d{4}-0001/.test(await text(page, '.inv-detail-side')), 'la facture liste son avoir et son solde devient 1 050,00 (3 250 − 1 000 − 1 200)');

    tr.step('print');
    await page.evaluate(() => { window.__printed = []; window.open = () => ({ document: { open() {}, write(h) { window.__printed.push(h); }, close() {}, documentElement: { style: {} }, body: { style: {} } } }); });
    await click(page, '[data-inv-act="print"]');
    const html = await page.evaluate(() => window.__printed[0] || '');
    check(html.includes('FACTURE') && html.includes(number) && /TVA 10 % sur 500,00/.test(flat(html)) && /Déjà réglé/.test(html) && /Reste à payer/.test(html), 'l’impression porte le numéro, la TVA par taux, le réglé et le reste à payer');
    check(!/BROUILLON/.test(html), 'une facture émise ne porte pas de filigrane');

    tr.step('internal note after issue');
    await page.type('[data-f="internal"]', 'À relancer le 20');
    await click(page, '[data-inv-act="save-internal"]');
    await sleep(300);
    check(fake.st.docs.find((x) => x.number === number).internal_note === 'À relancer le 20', 'la note interne reste modifiable après émission');
    check(fake.st.calls.filter((c) => c.action === 'save').pop().lines === undefined, 'et ne renvoie ni lignes ni client');

    tr.step('quote to invoice');
    await click(page, '[data-inv-act="back"]');
    await page.waitForSelector('[data-inv-table]', { visible: true });
    await click(page, '.inv-tab[data-v="quote"]');
    check(/Nouveau devis/.test(await text(page, '[data-inv-act="new"]')), 'l’onglet Devis propose « Nouveau devis »');
    await click(page, '[data-inv-act="new"]');
    await page.waitForSelector('[data-f="valid"]', { visible: true });
    check(!(await page.$('[data-f="terms"]')) && !!(await page.$('[data-f="valid"]')), 'un devis a une date de validité, pas de conditions de paiement');
    await page.type('[data-f="name"]', 'Maison Noor');
    await page.type(L(1, 'desc'), 'Cocktail'); await setVal(page, L(1, 'unit'), '800'); await setVal(page, L(1, 'qty'), '3');
    check(/Envoyer le devis/.test(await text(page, '[data-inv-act="issue-composer"]')), 'le bouton dit « Envoyer le devis »');
    await click(page, '[data-inv-act="issue-composer"]'); await waitSheet(page);
    check(/reste modifiable/.test(await text(page, '.inv-sheet')), 'envoyer un devis dit qu’il reste modifiable');
    await click(page, '.inv-sheet [data-sheet-ok]');
    await page.waitForFunction(() => /D-\d{4}-\d{4}/.test(document.querySelector('[data-doc-number]')?.textContent || ''), { timeout: 6000 });
    eq((await text(page, '[data-doc-number]')).match(/D-\d{4}-\d{4}/)[0], `D-${YEAR}-0001`, 'le devis reçoit un numéro D');
    check(!!(await page.$('[data-inv-act="edit"]')) && !!(await page.$('[data-inv-act="convert"]')) && !!(await page.$('[data-inv-act="accept"]')) && !!(await page.$('[data-inv-act="reject"]')), 'un devis envoyé reste modifiable, avec accepter, refuser, convertir');
    await click(page, '[data-inv-act="convert"]'); await waitSheet(page); await click(page, '.inv-sheet [data-sheet-ok]');
    await page.waitForSelector('[data-inv-compose]:not([hidden]) [data-f="name"]', { visible: true });
    check(/Modifier le brouillon/.test(await text(page, '[data-compose-title]')) && await page.$eval('[data-f="name"]', (n) => n.value) === 'Maison Noor', 'la conversion ouvre un brouillon de facture avec le client du devis');
    check(fake.st.docs.find((x) => x.number === `D-${YEAR}-0001`).status === 'invoiced', 'le devis passe à « facturé » côté serveur');
    await click(page, '[data-inv-act="back"]'); await waitDetail(page);
    await click(page, '[data-inv-act="back"]');
    await page.waitForSelector('[data-inv-table]', { visible: true });
    await click(page, '.inv-tab[data-v="quote"]');
    check(/Facturé/.test(await text(page, '[data-inv-table] tbody tr:first-child')), 'la liste des devis le montre « Facturé »');
    await click(page, '.inv-tab[data-v="credit_note"]');
    check(/AV-\d{4}-0001/.test(await text(page, '[data-inv-table]')) && !(await page.$eval('[data-inv-act="new"]', (n) => !n.hidden)), 'l’onglet Avoirs liste l’avoir et ne propose pas d’en créer un à vide');
    check(/Avoir sur facture F-/.test(await text(page, '[data-inv-table]')), 'la ligne d’un avoir cite la facture d’origine');

    tr.step('tiles');
    await click(page, '.inv-tab[data-v="invoice"]');
    await shot(page, 'list');
    const out = await text(page, '[data-stat="outstanding"]');
    check(/1 050,00/.test(out), 'la tuile À encaisser suit les soldes de l’API : ' + out);

    tr.step('csv');
    await page.evaluate(() => { window.__csv = null; const o = URL.createObjectURL; URL.createObjectURL = (b) => { b.arrayBuffer().then((buf) => { window.__csvBytes = [...new Uint8Array(buf).slice(0, 3)]; window.__csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(buf); }); return o.call(URL, b); }; });
    await click(page, '[data-inv-act="export"]');
    await page.waitForFunction(() => window.__csv, { timeout: 4000 });
    const csv = await page.evaluate(() => window.__csv);
    eq(await page.evaluate(() => window.__csvBytes), [0xef, 0xbb, 0xbf], 'CSV : BOM UTF-8');
    const csvLines = csv.slice(1).split('\r\n');
    check(csvLines[0].split(';').length >= 8 && !csvLines[0].includes(','), 'CSV : séparateur point-virgule');
    const mine = csvLines.find((l) => l.includes(number));
    check(!!mine && mine.includes('"3250,00"') && mine.includes('"1050,00"'), 'CSV : virgule décimale, total et solde : ' + mine);
    check(mine.includes('="001561191000066"'), 'CSV : l’ICE reste du texte (="…")');

    tr.step('offline');
    await page.evaluate(() => document.querySelector('[data-inv-act="close"]').click());
    fake.st.offline = true;
    await openInvoicing(page);
    check(/Hors ligne/.test(await text(page, '[data-inv-offline]')), 'hors ligne : la mention est affichée');
    check((await page.$$('[data-inv-table] tbody tr')).length >= 3, 'hors ligne : la dernière liste reste affichée');
    fake.st.offline = false;
    await page.evaluate(() => document.querySelector('[data-inv-act="close"]').click());
    await openInvoicing(page);
    await page.waitForFunction(() => !document.querySelector('[data-inv-offline]'), { timeout: 6000 });
    await page.evaluate(() => [...document.querySelectorAll('[data-inv-table] tbody tr')].find((r) => /F-\d{4}-0001/.test(r.textContent))?.click());
    await waitDetail(page);
    fake.st.offline = true;
    const before = fake.st.docs.length;
    await click(page, '[data-inv-act="duplicate"]');
    await sleep(300);
    check(/Hors ligne/.test(await toastText(page)) && fake.st.docs.length === before, 'hors ligne : une écriture dit son échec et rien n’est créé en local');
    check(await page.evaluate(() => !Object.keys(localStorage).some((k) => /^kiwi:invoicing:demo/.test(k))), 'aucun repli local pour un compte réel');
    fake.st.offline = false;
  });

  /* 2 · Démonstration : aucun appel serveur, moteur local ──────────────────── */
  await S.run('démonstration · aucun appel à /api/invoices', async (tr) => {
    const { page, hits } = await dashboard(tr, {});
    await openInvoicing(page);
    check((await page.$$('[data-inv-table] tbody tr')).length >= 3, 'la démo montre des factures d’exemple');
    check(!(await page.$('[data-inv-legacy]')), 'pas de bannière d’import en démo');
    await click(page, '[data-inv-act="new"]');
    await page.type('[data-f="name"]', 'Client Démo');
    await page.type(L(1, 'desc'), 'Prestation'); await setVal(page, L(1, 'unit'), '100');
    await click(page, '[data-inv-act="issue-composer"]'); await waitSheet(page); await click(page, '.inv-sheet [data-sheet-ok]');
    await page.waitForFunction(() => /F-\d{4}-\d{4}/.test(document.querySelector('[data-doc-number]')?.textContent || ''), { timeout: 6000 });
    check(/F-\d{4}-0004/.test(await text(page, '[data-doc-number]')), 'le moteur local numérote à la suite de la série d’exemple');
    check(!(await page.$('[data-inv-act="edit"]')), 'en démo aussi, une facture émise n’est plus modifiable');
    /* Le carnet clients : choisir un client remplit le bloc client. */
    await click(page, '[data-inv-act="back"]');
    await page.waitForSelector('[data-inv-table]', { visible: true });
    await click(page, '[data-inv-act="new"]');
    await page.waitForSelector('[data-f="pick"]', { visible: true });
    const picked = await page.$eval('[data-f="pick"]', (sel) => { sel.value = '0'; sel.dispatchEvent(new Event('change', { bubbles: true })); return sel.options[1].textContent; });
    check(await page.$eval('[data-f="name"]', (n, p) => n.value.length > 3 && p.includes(n.value), picked), 'le carnet clients remplit le nom : ' + picked);
    check(await page.$eval('[data-f="phone"]', (n) => /\d/.test(n.value)), 'et le téléphone');
    await click(page, '[data-inv-act="back"]');
    await page.waitForSelector('[data-inv-table]', { visible: true });

    /* Le moteur local rejoue paiement, avoir et conversion de devis. */
    const openRow = async (needle) => { await page.evaluate((n) => [...document.querySelectorAll('[data-inv-table] tbody tr')].find((r) => r.textContent.includes(n))?.click(), needle); await waitDetail(page); };
    await openRow('Riad Zayna');
    await click(page, '[data-inv-act="pay"]'); await waitSheet(page);
    await setVal(page, '[data-sf="amount"]', '2000'); await click(page, '.inv-sheet [data-sheet-ok]');
    await page.waitForFunction(() => document.querySelector('[data-balance]')?.textContent.replace(/[\u00a0\u202f\s]/g, '').startsWith('5500,00'), { timeout: 6000 });
    check(true, 'démo : un paiement partiel de 2 000 ramène le solde de 7 500 à 5 500');
    await click(page, '[data-inv-act="credit"]'); await waitSheet(page);
    await setVal(page, '[data-sf="reason"]', 'Geste commercial'); await click(page, '.inv-sheet [data-sheet-ok]');
    await page.waitForSelector('[data-inv-compose]:not([hidden]) [data-f="name"]', { visible: true });
    await click(page, '[data-inv-act="issue-composer"]'); await waitSheet(page); await click(page, '.inv-sheet [data-sheet-ok]');
    await page.waitForFunction(() => /AV-\d{4}-0001/.test(document.querySelector('[data-doc-number]')?.textContent || ''), { timeout: 6000 });
    check(/Geste commercial/.test(await text(page, '[data-credit-ref]')), 'démo : l’avoir porte son motif et sa série AV');
    await click(page, '[data-inv-act="back"]');
    await page.waitForSelector('[data-inv-table]', { visible: true });
    await click(page, '.inv-tab[data-v="quote"]');
    await openRow('Hôtel Les Dunes');
    await click(page, '[data-inv-act="convert"]'); await waitSheet(page); await click(page, '.inv-sheet [data-sheet-ok]');
    await page.waitForSelector('[data-inv-compose]:not([hidden]) [data-f="name"]', { visible: true });
    check(await page.$eval('[data-f="name"]', (n) => n.value) === 'Hôtel Les Dunes', 'démo : un devis se convertit en brouillon de facture');
    eq(hits, [], 'aucun appel à /api/invoices en démonstration');
  });

  /* 3 · Arabe : de droite à gauche ────────────────────────────────────────── */
  await S.run('arabe · composer et impression en RTL', async (tr) => {
    const { page } = await dashboard(tr, { lang: 'ar' });
    await openInvoicing(page);
    check(await page.$eval('.inv-overlay', (n) => n.getAttribute('dir') === 'rtl' && getComputedStyle(n).direction === 'rtl'), 'la feuille Facturation est en RTL');
    check(/الفواتير/.test(await text(page, '.inv-tabs')) && /عروض الأسعار/.test(await text(page, '.inv-tabs')), 'onglets en arabe');
    await click(page, '[data-inv-act="new"]');
    await page.waitForSelector('[data-f="name"]', { visible: true });
    check(/فاتورة جديدة/.test(await text(page, '[data-compose-title]')), 'composer en arabe');
    await shot(page, 'ar-composer');
    const rtlBox = await page.evaluate(() => {
      const label = document.querySelector('.inv-field label'); const input = document.querySelector('[data-f="name"]');
      return { dir: getComputedStyle(input).direction, align: getComputedStyle(label).textAlign, labelRight: label.getBoundingClientRect().right, inputRight: input.getBoundingClientRect().right };
    });
    check(rtlBox.dir === 'rtl' && Math.abs(rtlBox.labelRight - rtlBox.inputRight) < 40, 'les champs s’alignent à droite');
    await click(page, '[data-inv-act="back"]');
    await page.evaluate(() => [...document.querySelectorAll('[data-inv-table] tbody tr')].find((r) => /F-\d{4}-0001/.test(r.textContent))?.click());
    await waitDetail(page);
    await shot(page, 'ar-detail');
    await page.evaluate(() => { window.__printed = []; window.open = () => ({ document: { open() {}, write(h) { window.__printed.push(h); }, close() {}, documentElement: { style: {} }, body: { style: {} } } }); });
    await click(page, '[data-inv-act="print"]');
    const html = await page.evaluate(() => window.__printed[0] || '');
    check(/<html lang="ar" dir="rtl">/.test(html) && html.includes('فاتورة') && /text-align:left/.test(html), 'le gabarit imprimé est en RTL, titre en arabe');
  });

  /* 3b · Un appareil à l’est du magasin, la nuit ──────────────────────────
     À 22 h 30 UTC, Dubaï (UTC+4, sans heure d'été) et Paris en été (UTC+2)
     sont déjà le lendemain, Casablanca (UTC+0 ou UTC+1 selon la base de fuseaux)
     pas encore. Le serveur juge « futur » dans le fuseau du magasin : chaque
     date proposée par défaut doit être la sienne. Une date fixe rend le scénario
     indépendant de la date d’exécution ; Dubaï ne change pas d’heure saisonnière
     et ce jour d’été maintient Paris à UTC+2, même lors d’un lancement en hiver. */
  for (const [city, tz] of [['Dubaï', 'Asia/Dubai'], ['Paris', 'Europe/Paris']]) {
    await S.run(`fuseau · à ${city} à 22 h 30 UTC, les dates par défaut sont celles du magasin`, async (tr) => {
      const day = '2026-07-15';
      const at = Date.parse(day + 'T22:30:00Z');
      const next = new Date(at + 864e5).toISOString().slice(0, 10);
      const { page } = await dashboard(tr, { tz, at });
      eq(await page.evaluate((timeZone) => new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date()), tz), next, 'l’appareil, lui, est déjà au lendemain');
      await openInvoicing(page);
      await click(page, '[data-inv-act="new"]');
      await page.waitForSelector('[data-f="issue"]', { visible: true });
      eq(await page.$eval('[data-f="issue"]', (n) => n.value), day, 'la date d’émission proposée est celle du magasin');
      await click(page, '[data-inv-act="back"]');
      await page.waitForSelector('[data-inv-table]', { visible: true });
      await page.evaluate(() => [...document.querySelectorAll('[data-inv-table] tbody tr')].find((r) => r.textContent.includes('Riad Zayna'))?.click());
      await waitDetail(page);
      await click(page, '[data-inv-act="pay"]'); await waitSheet(page);
      eq(await page.$eval('[data-sf="date"]', (n) => n.value), day, 'la date d’un règlement proposée est celle du magasin, pas « demain »');
      await click(page, '.inv-sheet [data-sheet-cancel]');
    });
  }

  /* 3 bis · Liste par pages : les documents au-delà de la première page ──── */
  await S.run('compte réel · « Afficher les documents plus anciens » charge la page suivante', async (tr) => {
    const doc = (i) => ({ id: 'inv_pg' + i, type: 'invoice', status: 'issued', displayStatus: 'issued', number: `F-2024-${String(i).padStart(4, '0')}`,
      issueDate: '2024-0' + (1 + (i % 9)) + '-10', dueDate: '2030-01-01', customer: { name: 'Client page ' + i, ice: '' }, totals: { ttcCents: 1000 * i }, balanceCents: 1000 * i, paidCents: 0 });
    const asked = [];
    const paged = { st: { calls: [], offline: false, docs: [] }, handle(method, u) {
      if (method !== 'GET') return { status: 400, body: { error: 'invalid-action' } };
      const ty = u.searchParams.get('type'), cur = u.searchParams.get('cursor');
      if (ty !== 'invoice') return { status: 200, body: { ok: true, docs: [], nextCursor: null } };
      asked.push(cur || '');
      if (!cur) return { status: 200, body: { ok: true, docs: [1, 2, 3].map(doc), nextCursor: 'page-2' } };
      if (cur === 'page-2') return { status: 200, body: { ok: true, docs: [4, 5].map(doc), nextCursor: null } };
      return { status: 400, body: { error: 'bad-cursor' } };
    } };
    const { page } = await dashboard(tr, { real: true, fake: paged });
    await openInvoicing(page);
    check((await page.$$('[data-inv-table] tbody tr')).length === 3, 'la première page : 3 documents');
    check(/Afficher les documents plus anciens/.test(await text(page, '[data-inv-act="more"]')), 'un bouton propose les documents plus anciens');
    await click(page, '[data-inv-act="more"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-inv-table] tbody tr').length === 5, { timeout: 6000 });
    check(/Client page 5/.test(await text(page, '[data-inv-table]')), 'la page suivante s’ajoute à la liste (5 documents)');
    eq(asked, ['', 'page-2'], 'le client renvoie le curseur reçu, tel quel');
    check(!(await page.$('[data-inv-act="more"]')), 'la dernière page atteinte, le bouton disparaît');
  });

  /* 4 · Téléphone : le composer tient dans l’écran ────────────────────────── */
  await S.run('téléphone · pas de défilement horizontal', async (tr) => {
    const { page } = await dashboard(tr, { width: 390 });
    await openInvoicing(page);
    await shot(page, 'phone-list');
    await click(page, '[data-inv-act="new"]');
    await page.waitForSelector('[data-f="name"]', { visible: true });
    await page.select(L(1, 'vat'), '0');
    await shot(page, 'phone-composer');
    const over = await page.evaluate(() => { const b = document.querySelector('.inv-body'); return { sw: b.scrollWidth, cw: b.clientWidth }; });
    check(over.sw <= over.cw + 1, `le composer ne déborde pas sur 390 px (${over.sw} / ${over.cw})`);
  });
} finally {
  server.close();
  console.log(`\ninvoicing-v2-browser-test · ${checks} checks green`);
  await S.finish();
}
