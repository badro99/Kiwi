#!/usr/bin/env node
'use strict';
// Local stdio MCP client for the PRIVATE agent gateway. This process never
// accepts a merchant slug from the agent: the server derives it from the key.
const BASE = String(process.env.KIWI_AGENT_BASE || 'https://kiwi-os.com').replace(/\/+$/, '');
const TOKEN = process.env.KIWI_AGENT_TOKEN || '';
const PROTOCOL = '2024-11-05';
const read = (name, description, properties, required = []) => ({
  name, description, inputSchema: { type: 'object', properties, required },
});
const str = description => ({ type: 'string', description });
const TOOLS = [
  read('merchant_overview', 'Merchant identity and plan only; no staff PINs or raw configuration.', {}),
  read('sales_summary', 'Non-voided daily sales by payment method. UTC, up to 31 days.',
    { from: str('YYYY-MM-DD'), to: str('YYYY-MM-DD') }, ['from','to']),
  read('catalog_search', 'Find up to 25 products by name; no full catalog dump.',
    { query: str('At least 2 characters'), limit: { type: 'integer', minimum: 1, maximum: 25 } }, ['query']),
  read('hotel_stays', 'Read up to 25 stays overlapping a date range (guest names included). UTC, up to 31 days.',
    { from: str('YYYY-MM-DD'), to: str('YYYY-MM-DD'), limit: { type: 'integer', minimum: 1, maximum: 25 } }, ['from','to']),
  read('clients_search', 'Search up to 25 customer records by name, phone or email.',
    { query: str('At least 2 characters'), limit: { type: 'integer', minimum: 1, maximum: 25 } }, ['query']),
  read('orders_list', 'Merchant orders with item lines and status, paged within 31 UTC days; no customer contact or guest session token.',
    { from: str('YYYY-MM-DD'), to: str('YYYY-MM-DD'), offset: { type: 'integer', minimum: 0, maximum: 1000 }, limit: { type: 'integer', minimum: 1, maximum: 25 } }, ['from','to']),
  read('order_detail', 'Read one merchant order by exact ID, including its item lines and payment/cancellation state.',
    { id: str('Exact order ID') }, ['id']),
  read('table_sessions', 'Operational table sessions, without bearer session IDs; paged within 31 UTC days.',
    { from: str('YYYY-MM-DD'), to: str('YYYY-MM-DD'), offset: { type: 'integer', minimum: 0, maximum: 1000 }, limit: { type: 'integer', minimum: 1, maximum: 25 } }, ['from','to']),
  read('active_tables', 'Currently open tables and order counts, without guest bearer session IDs.',
    { offset: { type: 'integer', minimum: 0, maximum: 1000 }, limit: { type: 'integer', minimum: 1, maximum: 25 } }),
  read('payment_events', 'Individual sale/payment postings, including void status; not just daily totals.',
    { from: str('YYYY-MM-DD'), to: str('YYYY-MM-DD'), offset: { type: 'integer', minimum: 0, maximum: 1000 }, limit: { type: 'integer', minimum: 1, maximum: 25 } }, ['from','to']),
  read('refund_events', 'Refund reservation/settlement statuses; read-only, no refund initiation.',
    { from: str('YYYY-MM-DD'), to: str('YYYY-MM-DD'), offset: { type: 'integer', minimum: 0, maximum: 1000 }, limit: { type: 'integer', minimum: 1, maximum: 25 } }, ['from','to']),
  read('cash_events', 'Cash drawer opening, movements, handovers and closing events.',
    { from: str('YYYY-MM-DD'), to: str('YYYY-MM-DD'), offset: { type: 'integer', minimum: 0, maximum: 1000 }, limit: { type: 'integer', minimum: 1, maximum: 25 } }, ['from','to']),
  read('operations_notes', 'Read recent operational notes for this merchant.',
    { from: str('YYYY-MM-DD'), to: str('YYYY-MM-DD'), offset: { type: 'integer', minimum: 0, maximum: 1000 }, limit: { type: 'integer', minimum: 1, maximum: 25 } }, ['from','to']),
  read('operations_tasks', 'Read operational tasks, status and assignee for this merchant.',
    { from: str('YYYY-MM-DD'), to: str('YYYY-MM-DD'), offset: { type: 'integer', minimum: 0, maximum: 1000 }, limit: { type: 'integer', minimum: 1, maximum: 25 } }, ['from','to']),
  read('create_client', 'Create a minimal customer record. Requires clients:create and a stable requestId for safe retries.',
    { requestId: str('Stable 16-100 character idempotency ID. Reuse on retry.'),
      name: str('Customer name'), phone: str('Phone or email required'), email: str('Email or phone required') },
    ['requestId','name']),
  read('create_operations_note', 'Append an audited operational note. Requires operations:write and a stable requestId; cannot change orders, payments or stock.',
    { requestId: str('Stable 16-100 character idempotency ID. Reuse on retry.'), note: str('3-1000 characters') },
    ['requestId','note']),
  read('create_task', 'Create an audited operational task. Requires operations:write and a stable requestId.',
    { requestId: str('Stable 16-100 character idempotency ID. Reuse on retry.'), title: str('3-160 characters'),
      detail: str('Optional detail, up to 1000 characters'), priority: { type: 'integer', minimum: 1, maximum: 4 } },
    ['requestId','title']),
];
let buffer = '';
let pending = 0, ended = false;
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
function maybeExit() { if (ended && pending === 0) process.exit(0); }
function respond(id, result) { if (id !== null && id !== undefined) send({ jsonrpc: '2.0', id, result }); }
async function call(name, args) {
  if (!TOOLS.some(t => t.name === name)) throw new Error('Unknown tool');
  if (!TOKEN) throw new Error('KIWI_AGENT_TOKEN is not configured');
  if (!/^https:\/\//.test(BASE) && !/^http:\/\/localhost(?::\d+)?$/.test(BASE)) throw new Error('Invalid KIWI_AGENT_BASE');
  const isWrite = name === 'create_client' || name === 'create_operations_note' || name === 'create_task';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(BASE + (isWrite ? '/api/agent/action' : '/api/agent/query'), {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ ...(args || {}), [isWrite ? 'action' : 'tool']: name }),
    });
    const data = await res.json().catch(() => ({ error: 'invalid-response' }));
    if (!res.ok || !data.ok) throw new Error('Gateway ' + res.status + ': ' + (data.error || 'failed'));
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  } finally { clearTimeout(timer); }
}
async function handle(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  const { id, method, params } = msg;
  if (id !== null && id !== undefined) pending++;
  try {
    if (method === 'initialize') respond(id, { protocolVersion: params?.protocolVersion || PROTOCOL,
      capabilities: { tools: {} }, serverInfo: { name: 'kiwi-agent', version: '0.1.0' } });
    else if (method === 'ping') respond(id, {});
    else if (method === 'tools/list') respond(id, { tools: TOOLS });
    else if (method === 'tools/call') respond(id, await call(params?.name, params?.arguments));
    else if (id !== null && id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  } catch (err) {
    if (id !== null && id !== undefined) respond(id, { content: [{ type: 'text', text: String(err?.message || err) }], isError: true });
  } finally {
    if (id !== null && id !== undefined) pending--;
    maybeExit();
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line) void handle(line);
  }
});
process.stdin.on('end', () => { ended = true; maybeExit(); });
