// Throwaway LOCAL mock of the Cloudflare Live-Link API (NOT committed / not prod).
// Same HTTP contract as functions/api/{sale,feed}.js but backed by an in-memory
// array, and it also serves the static site — so the caisse -> dashboard loop can
// be verified locally before any Cloudflare D1 is provisioned.
//   node tools/live-mock-server.js   ->  http://localhost:4181
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const sales = []; // { rowid, id, merchant, amount, method, label, ref, ts }

// ── in-memory operator-console state (mirrors the D1 tables) ─────────────────
function slug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'client';
}
const ACCOUNTS = [
  { business: 'Café Atlas', email: 'contact@cafeatlas.ma', name: 'Yassine' },
  { business: 'Snack Medina', email: 'medina@snack.ma', name: 'Karim' },
  { business: 'Riad Noor', email: 'noor@riad.ma', name: 'Salma' },
];
const pinsByMerchant = { 'cafe-atlas': [{ id: 'p1', pin: '0000', name: 'Plongeur', role: 'plongeur' }, { id: 'p2', pin: '1234', name: 'Yassine', role: 'serveur' }] };
const featuresByMerchant = { 'snack-medina': { stock: false, reservations: false, kds: false, tables: false, payroll: false } };
const planByMerchant = { 'cafe-atlas': 'pro', 'snack-medina': 'basic', 'riad-noor': 'ultra' };
const operators = [{ id: 'o1', label: 'Badr (mock)', created_ts: Date.now() }];
// Published customer menus (mock of the D1 `menus` table). Seeded for local test:
//   snack-medina → a real carte;  riad-noor → published but empty (coming-soon).
const menusByMerchant = {
  'snack-medina': {
    name: 'Snack Medina', type: 'fast-food',
    data: {
      cats: [
        { id: 'c-tacos', name: 'Tacos', sub: [] },
        { id: 'c-burgers', name: 'Burgers', sub: [] },
        { id: 'c-boissons', name: 'Boissons', sub: [] },
      ],
      items: [
        { id: 'i1', name: 'Tacos poulet', price: 35, catId: 'c-tacos', subId: null, desc: 'Poulet, frites, sauce algérienne', avail: true },
        { id: 'i2', name: 'Tacos viande hachée', price: 38, catId: 'c-tacos', subId: null, desc: 'Viande hachée, cheddar, frites', avail: true },
        { id: 'i3', name: 'Burger classic', price: 42, catId: 'c-burgers', subId: null, desc: 'Steak, cheddar, salade, tomate', avail: true },
        { id: 'i4', name: 'Double burger', price: 55, catId: 'c-burgers', subId: null, desc: 'Double steak, double cheddar', avail: true },
        { id: 'i5', name: 'Coca 33cl', price: 12, catId: 'c-boissons', subId: null, desc: '', avail: true },
        { id: 'i6', name: 'Eau minérale', price: 8, catId: 'c-boissons', subId: null, desc: '', avail: false },
      ],
    },
  },
  'riad-noor': { name: 'Riad Noor', type: 'restaurant', data: { cats: [], items: [] } },
};
let seq = 100;

function sendJson(res, obj, status) {
  res.statusCode = status || 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
function readBody(req, cb) {
  let body = ''; req.on('data', (c) => { body += c; });
  req.on('end', () => { let b = {}; try { b = JSON.parse(body || '{}'); } catch (_) {} cb(b); });
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (u.pathname === '/api/sale' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let b = {};
      try { b = JSON.parse(body || '{}'); } catch (_) {}
      const amount = Math.round(Number(b.amount) || 0);
      if (amount <= 0) return sendJson(res, { error: 'bad-amount' }, 400);
      const rowid = sales.length + 1;
      const rec = {
        rowid, id: b.id || ('sale-' + Date.now() + '-' + rowid),
        merchant: String(b.merchant || 'default'), amount,
        method: String(b.method || 'cash'), label: String(b.label || 'Vente'),
        ref: String(b.ref || ''), ts: Number(b.ts) || Date.now(),
      };
      sales.push(rec);
      sendJson(res, { ok: true, id: rec.id });
    });
    return;
  }

  if (u.pathname === '/api/feed' && req.method === 'GET') {
    const merchant = u.searchParams.get('merchant') || 'default';
    const since = Number(u.searchParams.get('since')) || 0;
    const rows = sales
      .filter((s) => s.merchant === merchant && s.rowid > since)
      .slice(0, 50)
      .map((s) => ({ cursor: s.rowid, id: s.id, amount: s.amount, method: s.method, label: s.label, ref: s.ref, ts: s.ts }));
    const cursor = rows.length ? rows[rows.length - 1].cursor : since;
    return sendJson(res, { sales: rows, cursor });
  }

  // ── operator unlock (mock accepts any non-empty code; no cookie gate local) ─
  if (u.pathname === '/auth/operator' && req.method === 'POST') {
    return readBody(req, (b) => {
      const code = String(b.code || '').trim();
      if (code.length < 4) return sendJson(res, { error: 'bad-code' }, 401);
      sendJson(res, { ok: true, redirect: '/kiwi-admin.html' });
    });
  }

  // ── client-app config read ────────────────────────────────────────────────
  if (u.pathname === '/api/config' && req.method === 'GET') {
    const m = u.searchParams.get('merchant') || 'default';
    return sendJson(res, { features: featuresByMerchant[m] || {}, pins: pinsByMerchant[m] || [] });
  }

  // ── customer self-order menu (kiwi-order.html?merchant=<slug>) ─────────────
  // GET is public (mirrors functions/api/menu.js); POST publishes. Seeded so the
  // tenant path is verifiable locally: 'snack-medina' has a carte, 'riad-noor' is
  // published-but-empty (→ coming-soon state).
  if (u.pathname === '/api/menu' && req.method === 'GET') {
    const m = u.searchParams.get('merchant') || '';
    const row = menusByMerchant[m];
    if (!row) return sendJson(res, { name: '', type: '', menu: null });
    const hasItems = row.data && row.data.items && row.data.items.length;
    return sendJson(res, { name: row.name || '', type: row.type || '', menu: hasItems ? row.data : null });
  }
  if (u.pathname === '/api/menu' && req.method === 'POST') {
    return readBody(req, (b) => {
      // Local mock has no session; key by a fixed test merchant so a dashboard
      // POST is observable. Prod derives the merchant from the session.
      const m = 'cafe-atlas';
      menusByMerchant[m] = { name: String(b.name || 'Café Atlas'), type: String(b.type || ''), data: b.data || { cats: [], items: [] } };
      sendJson(res, { ok: true, merchant: m, items: (b.data && b.data.items || []).length });
    });
  }

  // ── operator console (no auth in the local mock) ──────────────────────────
  if (u.pathname === '/api/admin/clients' && req.method === 'GET') {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const dayStart = startOfDay.getTime();
    const map = new Map();
    const row = (m) => { let r = map.get(m); if (!r) { r = { merchant: m, business: '', email: '', name: '', plan: planByMerchant[m] || '', today_amount: 0, today_count: 0, last_ts: 0 }; map.set(m, r); } return r; };
    sales.forEach((s) => { const r = row(s.merchant); if (s.ts >= dayStart) { r.today_amount += s.amount; r.today_count += 1; } if (s.ts > r.last_ts) r.last_ts = s.ts; });
    Object.keys(featuresByMerchant).forEach((m) => row(m));
    ACCOUNTS.forEach((a) => { const r = row(slug(a.business || a.email)); r.business = a.business; r.email = a.email; r.name = a.name; });
    const clients = [...map.values()].sort((a, b) => b.last_ts - a.last_ts);
    return sendJson(res, { clients, dayStart, now: Date.now() });
  }
  if (u.pathname === '/api/admin/pins' && req.method === 'GET') {
    const m = u.searchParams.get('merchant') || ''; return sendJson(res, { pins: pinsByMerchant[m] || [] });
  }
  if (u.pathname === '/api/admin/pins' && req.method === 'POST') {
    return readBody(req, (b) => {
      const m = String(b.merchant || ''); if (!/^\d{4}$/.test(String(b.pin || ''))) return sendJson(res, { error: 'bad-pin' }, 400);
      (pinsByMerchant[m] = pinsByMerchant[m] || []);
      if (pinsByMerchant[m].some((p) => p.pin === b.pin)) return sendJson(res, { error: 'pin-exists' }, 409);
      const rec = { id: 'pin-' + (seq++), pin: String(b.pin), name: String(b.name || ''), role: String(b.role || 'serveur') };
      pinsByMerchant[m].push(rec); sendJson(res, { ok: true, pin: rec });
    });
  }
  if (u.pathname === '/api/admin/pins' && req.method === 'DELETE') {
    const id = u.searchParams.get('id'); Object.keys(pinsByMerchant).forEach((m) => { pinsByMerchant[m] = pinsByMerchant[m].filter((p) => p.id !== id); }); return sendJson(res, { ok: true });
  }
  if (u.pathname === '/api/admin/config' && req.method === 'GET') {
    const m = u.searchParams.get('merchant') || ''; return sendJson(res, { features: featuresByMerchant[m] || {}, plan: planByMerchant[m] || '' });
  }
  if (u.pathname === '/api/admin/config' && req.method === 'PUT') {
    return readBody(req, (b) => { const m = String(b.merchant || ''); featuresByMerchant[m] = (b.features && typeof b.features === 'object') ? b.features : {}; if (b.plan) planByMerchant[m] = String(b.plan); sendJson(res, { ok: true, features: featuresByMerchant[m], plan: planByMerchant[m] || '' }); });
  }
  if (u.pathname === '/api/admin/operators' && req.method === 'GET') {
    return sendJson(res, { operators: operators.map((o) => ({ id: o.id, label: o.label, created_ts: o.created_ts })) });
  }
  if (u.pathname === '/api/admin/operators' && req.method === 'POST') {
    return readBody(req, (b) => { const rec = { id: 'op-' + (seq++), label: String(b.label || ''), created_ts: Date.now() }; operators.push(rec); sendJson(res, { ok: true, operator: rec }); });
  }
  if (u.pathname === '/api/admin/operators' && req.method === 'DELETE') {
    const id = u.searchParams.get('id'); const i = operators.findIndex((o) => o.id === id); if (i >= 0) operators.splice(i, 1); return sendJson(res, { ok: true });
  }

  // Static files (extensionless clean URLs mapped to .html, like Cloudflare Pages).
  let p = decodeURIComponent(u.pathname.split('?')[0]);
  if (p === '/') p = '/index.html';
  let file = path.join(root, p);
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file = file + '.html';
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(buf);
  });
}).listen(4181, () => console.log('kiwi live-mock on http://localhost:4181'));
