#!/usr/bin/env node

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TICKET_TAXONOMY } from '../functions/api/tickets/_taxonomy.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const now = Date.now();
const tickets = [
  { id: 9003, number: '#9003', body: 'Daily total differs from the cash drawer.', status: 'problem', kind: 'bug', area: 'reports-money', subkind: 'wrong-figures', moneyAtRisk: true, createdAt: now - 3000, updatedAt: now - 3000, completedAt: null, expiresAt: null, images: [], followups: [] },
  { id: 9002, number: '#9002', body: 'Make the stock adjustment flow clearer.', status: 'testing', kind: 'improvement', area: 'menu-stock', subkind: 'ux-flow', moneyAtRisk: false, createdAt: now - 5000, updatedAt: now - 5000, completedAt: null, expiresAt: null, images: [], followups: [] },
  { id: 9001, number: '#9001', body: 'A new hardware connector was delivered.', status: 'done', kind: 'feature', area: 'printing', subkind: 'hardware', moneyAtRisk: false, createdAt: now - 9000, updatedAt: now - 9000, completedAt: now - 1000, expiresAt: now + 10 * 86400000, images: [], followups: [] },
];

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};

function json(res, body, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function bodyOf(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/api/tickets') {
    return json(res, { tickets, taxonomy: TICKET_TAXONOMY, classificationSchemaReady: true, retentionDays: 20 });
  }
  const match = url.pathname.match(/^\/api\/tickets\/(\d+)$/);
  if (req.method === 'PATCH' && match) {
    let payload;
    try { payload = JSON.parse(await bodyOf(req)); } catch (_) { return json(res, { error: 'bad-json' }, 400); }
    const ticket = tickets.find((item) => item.id === Number(match[1]));
    if (!ticket) return json(res, { error: 'not-found' }, 404);
    if (payload.action !== 'classify') return json(res, { error: 'fixture-classify-only' }, 400);
    ticket.kind = payload.kind || 'unsorted';
    ticket.area = payload.area || null;
    ticket.subkind = payload.subkind || null;
    ticket.moneyAtRisk = payload.money_at_risk === true;
    ticket.updatedAt = Date.now();
    return json(res, { ok: true, id: ticket.id, number: ticket.number, status: ticket.status, classificationStored: true });
  }

  const requested = url.pathname === '/' ? '/tickets.html' : url.pathname;
  if (requested !== '/tickets.html' && !requested.startsWith('/assets/')) {
    res.writeHead(404); return res.end('not found');
  }
  const file = resolve(root, '.' + requested);
  if (!file.startsWith(root + '/') || !(await stat(file).catch(() => null))?.isFile()) {
    res.writeHead(404); return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(await readFile(file));
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  process.stdout.write(`KIWI_TICKETS_UI_QA_READY ${JSON.stringify({ base: `http://127.0.0.1:${address.port}`, merchant: 'synthetic-tickets' })}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));
