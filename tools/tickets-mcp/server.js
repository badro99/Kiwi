#!/usr/bin/env node
'use strict';

/*
 * Kiwi Tickets — local stdio MCP server.
 *
 * A thin, zero-dependency wrapper over the public ticket board API deployed at
 * kiwi-os.com (functions/api/tickets/*). It exists so coding agents — Claude
 * Code, Codex, Gemini — can read the shared problem board, file new problems,
 * hand solved ones to testing, and LOOK at screenshots without burning tokens:
 *
 *   - list_tickets / get_ticket return text only. Browsing the board is free.
 *   - view_ticket_image returns actual pixels ONLY when an agent asks, and
 *     downscales first (via macOS `sips`) so a screenshot costs a fraction of
 *     the vision tokens a full 4K PNG would.
 *
 * Transport: newline-delimited JSON-RPC 2.0 over stdio (the MCP stdio contract).
 * No SDK, no npm install — just `node tools/tickets-mcp/server.js`.
 *
 * Config (env):
 *   KIWI_TICKETS_BASE   Origin to talk to. Default https://kiwi-os.com
 *   KIWI_TICKETS_MAXPX  Default longest-edge px for downscaled images. Default 1024
 *
 * The board is deliberately public and unauthenticated (see functions/
 * _middleware.js), so this server carries no credentials. Screenshots are
 * internal POS captures — treat anything visible in them as sensitive.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { validateUiProof } = require('./ui-proof.js');

const BASE = String(process.env.KIWI_TICKETS_BASE || 'https://kiwi-os.com').replace(/\/+$/, '');
const DEFAULT_MAXPX = clampInt(process.env.KIWI_TICKETS_MAXPX, 1024, 256, 4096);
const SERVER_NAME = 'kiwi-tickets';
const SERVER_VERSION = '1.0.0';
const DEFAULT_PROTOCOL = '2024-11-05';

const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/* ── JSON-RPC over stdio ─────────────────────────────────────────────────── */

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line) handleLine(line);
  }
});
process.stdin.on('end', () => process.exit(0));

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }
function ok(id, res) { if (id !== undefined && id !== null) send({ jsonrpc: '2.0', id, result: res }); }
function fail(id, code, message) { if (id !== undefined && id !== null) send({ jsonrpc: '2.0', id, error: { code, message } }); }

async function handleLine(line) {
  let msg;
  try { msg = JSON.parse(line); } catch (_) { return; }
  const { id, method, params } = msg;
  try {
    switch (method) {
      case 'initialize':
        return ok(id, {
          protocolVersion: (params && params.protocolVersion) || DEFAULT_PROTOCOL,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        });
      case 'notifications/initialized':
      case 'initialized':
        return; // notification — no reply
      case 'ping':
        return ok(id, {});
      case 'tools/list':
        return ok(id, { tools: TOOLS });
      case 'tools/call':
        return await callTool(id, params || {});
      default:
        return fail(id, -32601, 'Method not found: ' + method);
    }
  } catch (e) {
    fail(id, -32603, String((e && e.message) || e));
  }
}

/* ── Tool registry ───────────────────────────────────────────────────────── */

const TOOLS = [
  {
    name: 'list_tickets',
    description:
      'List problem tickets from the shared Kiwi board (kiwi-os.com/tickets). ' +
      'Returns TEXT ONLY (id, status, screenshot count, truncated body) — cheap to call. ' +
      'Use get_ticket for the full text and view_ticket_image to actually see a screenshot.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'problem', 'testing', 'done', 'all'],
          description: "Filter. 'open' = problem+testing (default). 'done' tickets keep no screenshots and expire after 20 days.",
        },
      },
    },
  },
  {
    name: 'get_ticket',
    description:
      'Full text of one ticket plus the list of its screenshots (filename + index). ' +
      'Text only — call view_ticket_image to see the pixels.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'Ticket id, e.g. 2 for #0002.' } },
      required: ['id'],
    },
  },
  {
    name: 'view_ticket_image',
    description:
      "Return a ticket's screenshot(s) as image content, downscaled to save vision tokens. " +
      'Omit index to get every screenshot on the ticket. This is the only token-heavy tool — call it when you actually need to see the bug.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Ticket id.' },
        index: { type: 'number', description: '0-based screenshot index. Omit for all screenshots on the ticket.' },
        maxSize: { type: 'number', description: `Longest-edge pixels after downscaling. Default ${DEFAULT_MAXPX}.` },
        full: { type: 'boolean', description: 'Return original resolution, no downscaling. Costs many more tokens.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_ticket',
    description:
      'File a new problem on the shared board. Writes to the live board seen by the owner and partner.',
    inputSchema: {
      type: 'object',
      properties: {
        body: { type: 'string', description: 'The problem description (1–4000 chars).' },
        imagePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional local file paths of screenshots to attach (png/jpg/webp/gif, up to 6, ≤10MB each).',
        },
      },
      required: ['body'],
    },
  },
  {
    name: 'submit_for_testing',
    description:
      'Move a ticket you have SOLVED into the "Requiring testing" column, so a human can verify it. ' +
      'For UI-facing tickets pass a fresh synthetic rendered-UI proof from kiwi-ui-qa; for a genuinely backend-only ticket explain why no UI path applies. ' +
      'This is the only status move an agent may make: an agent never marks a ticket tested/done — ' +
      'only the person who verifies the fix does that, from the board itself.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Ticket id.' },
        uiProofPath: { type: 'string', description: 'Absolute proof.json path returned by kiwi-ui-qa finish_ui_proof, captured after a clean commit.' },
        backendOnlyReason: { type: 'string', description: 'For a truly non-UI ticket only: explain why browser verification is not applicable (30+ characters).' },
        note: { type: 'string', description: 'Optional short note on what was changed, for your own reply to the user. Not sent to the board.' },
      },
      required: ['id'],
    },
  },
];

async function callTool(id, params) {
  const name = params.name;
  const args = params.arguments || {};
  try {
    switch (name) {
      case 'list_tickets': return ok(id, text(await listTickets(args)));
      case 'get_ticket': return ok(id, text(await getTicket(args)));
      case 'view_ticket_image': return ok(id, await viewTicketImage(args));
      case 'create_ticket': return ok(id, text(await createTicket(args)));
      case 'submit_for_testing': return ok(id, text(await submitForTesting(args)));
      default: return ok(id, errText('Unknown tool: ' + name));
    }
  } catch (e) {
    return ok(id, errText(String((e && e.message) || e)));
  }
}

function text(t) { return { content: [{ type: 'text', text: t }] }; }
function errText(t) { return { content: [{ type: 'text', text: t }], isError: true }; }

/* ── Tool implementations ────────────────────────────────────────────────── */

async function fetchTickets() {
  const res = await fetch(BASE + '/api/tickets', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET /api/tickets → HTTP ${res.status}`);
  const data = await res.json();
  return data && Array.isArray(data.tickets) ? data : { tickets: [], retentionDays: 20 };
}

async function listTickets(args) {
  const filter = String(args.status || 'open');
  const { tickets, retentionDays } = await fetchTickets();
  const keep = tickets.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'open') return t.status === 'problem' || t.status === 'testing';
    return t.status === filter;
  });
  if (!keep.length) return `No tickets matching "${filter}" on ${BASE}/tickets.`;

  const lines = keep.map((t) => {
    const shots = (t.images || []).length;
    const shotStr = shots ? `${shots} screenshot${shots > 1 ? 's' : ''}` : 'no screenshots';
    const head = `${t.number} · ${t.status} · ${shotStr} · ${fmtTime(t.createdAt)}`;
    const body = oneLine(t.body, 160);
    return `${head}\n  ${body}`;
  });
  return (
    `${keep.length} ticket(s) [${filter}] on ${BASE}/tickets (screenshots kept ${retentionDays}d).\n` +
    `get_ticket(id) for full text · view_ticket_image(id) to see screenshots.\n\n` +
    lines.join('\n')
  );
}

async function getTicket(args) {
  const id = intOrThrow(args.id, 'id');
  const { tickets } = await fetchTickets();
  const t = tickets.find((x) => Number(x.id) === id);
  if (!t) return `No ticket ${id} (#${String(id).padStart(4, '0')}) on ${BASE}/tickets. It may be done and purged.`;
  const imgs = t.images || [];
  const imgLines = imgs.length
    ? imgs.map((im, i) => `  [${i}] ${im.filename || 'image'}`).join('\n')
    : '  (none)';
  return (
    `${t.number} · status: ${t.status}\n` +
    `created: ${fmtTime(t.createdAt)}   updated: ${fmtTime(t.updatedAt)}\n` +
    (t.completedAt ? `completed: ${fmtTime(t.completedAt)}   expires: ${fmtTime(t.expiresAt)}\n` : '') +
    `\n${t.body}\n\n` +
    `Screenshots (${imgs.length}):\n${imgLines}\n` +
    (imgs.length ? `\nCall view_ticket_image({id:${id}}) to see them.` : '')
  );
}

async function viewTicketImage(args) {
  const id = intOrThrow(args.id, 'id');
  const { tickets } = await fetchTickets();
  const t = tickets.find((x) => Number(x.id) === id);
  if (!t) return errText(`No ticket ${id} on ${BASE}/tickets.`);
  const imgs = t.images || [];
  if (!imgs.length) return errText(`Ticket ${t.number} has no screenshots (status: ${t.status}).`);

  let chosen;
  if (args.index === undefined || args.index === null) {
    chosen = imgs.map((im, i) => ({ im, i }));
  } else {
    const idx = intOrThrow(args.index, 'index');
    if (idx < 0 || idx >= imgs.length) return errText(`index ${idx} out of range (ticket ${t.number} has ${imgs.length}).`);
    chosen = [{ im: imgs[idx], i: idx }];
  }

  const maxSize = args.full ? 0 : clampInt(args.maxSize, DEFAULT_MAXPX, 256, 4096);
  const content = [];
  for (const { im, i } of chosen) {
    const url = im.url.startsWith('http') ? im.url : BASE + im.url;
    const res = await fetch(url);
    if (!res.ok) { content.push({ type: 'text', text: `[${i}] ${im.filename}: HTTP ${res.status}` }); continue; }
    let mime = String(res.headers.get('content-type') || 'image/png').split(';')[0].trim();
    let buf = Buffer.from(await res.arrayBuffer());
    if (!args.full) { const d = downscale(buf, mime, maxSize); buf = d.buf; mime = d.mime; }
    content.push({ type: 'text', text: `${t.number} screenshot [${i}] — ${im.filename || 'image'}${args.full ? '' : ` (≤${maxSize}px)`}` });
    content.push({ type: 'image', data: buf.toString('base64'), mimeType: mime });
  }
  return { content };
}

async function createTicket(args) {
  const body = String(args.body || '').trim();
  if (!body) throw new Error('body is required.');
  if (body.length > 4000) throw new Error('body too long (max 4000).');
  const paths = Array.isArray(args.imagePaths) ? args.imagePaths : [];
  if (paths.length > 6) throw new Error('too many images (max 6).');

  const form = new FormData();
  form.append('body', body);
  for (const p of paths) {
    const abs = path.resolve(p);
    if (!fs.existsSync(abs)) throw new Error('image not found: ' + p);
    const ext = path.extname(abs).slice(1).toLowerCase();
    const mime = Object.keys(IMAGE_EXT).find((m) => IMAGE_EXT[m] === (ext === 'jpeg' ? 'jpg' : ext));
    if (!mime) throw new Error('unsupported image type: ' + p + ' (use png/jpg/webp/gif)');
    const bytes = fs.readFileSync(abs);
    form.append('images', new Blob([bytes], { type: mime }), path.basename(abs));
  }

  const res = await fetch(BASE + '/api/tickets', { method: 'POST', body: form });
  const data = await safeJson(res);
  if (!res.ok) throw new Error(`create failed (HTTP ${res.status}): ${data.error || 'unknown'}`);
  return `Filed ${data.number || '#' + data.id} on ${BASE}/tickets${paths.length ? ` with ${paths.length} screenshot(s)` : ''}.`;
}

/* A solved ticket goes to "Requiring testing", never straight to done.
 *
 * The board's own API still exposes action:'tested' (testing → done), and that
 * move also destroys the ticket's screenshots — so it belongs to the person who
 * actually verified the fix, on the board, not to whichever agent believes it
 * finished. This server deliberately exposes only the first half of the walk.
 */
async function submitForTesting(args) {
  const id = intOrThrow(args.id, 'id');
  if (args.uiProofPath) validateUiProof(args.uiProofPath, id);
  else if (typeof args.backendOnlyReason !== 'string' || args.backendOnlyReason.trim().length < 30) {
    throw new Error('UI-facing ticket: supply a fresh kiwi-ui-qa uiProofPath. For a truly backend-only issue, explain why in backendOnlyReason (30+ characters).');
  }
  const res = await fetch(`${BASE}/api/tickets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'fixed' }),
  });
  const data = await safeJson(res);
  if (!res.ok) {
    if (data.error === 'wrong-status' && data.status === 'testing') {
      return `#${String(id).padStart(4, '0')} is already awaiting testing — nothing to do.`;
    }
    if (data.error === 'wrong-status' && data.status === 'done') {
      throw new Error(`#${String(id).padStart(4, '0')} is already done; an agent cannot reopen or re-close it.`);
    }
    throw new Error(`submit failed (HTTP ${res.status}): ${data.error || 'unknown'}${data.status ? ` (current status: ${data.status})` : ''}`);
  }
  return `${data.number || '#' + id} moved to "Requiring testing". A human marks it tested on the board once verified.`;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function downscale(buf, mime, maxSize) {
  if (process.platform !== 'darwin' || !maxSize) return { buf, mime };
  const ext = IMAGE_EXT[mime] || 'png';
  const tmp = path.join(os.tmpdir(), `kt-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  try {
    fs.writeFileSync(tmp, buf);
    const r = spawnSync('sips', ['-Z', String(maxSize), tmp], { stdio: 'ignore' });
    if (!r.error && r.status === 0) {
      const out = fs.readFileSync(tmp);
      if (out && out.length) return { buf: out, mime };
    }
    return { buf, mime };
  } catch (_) {
    return { buf, mime };
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

async function safeJson(res) { try { return await res.json(); } catch (_) { return {}; } }
function oneLine(s, max) { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > max ? t.slice(0, max - 1) + '…' : t; }
function fmtTime(ms) { if (!ms) return '—'; try { return new Date(Number(ms)).toISOString().replace('T', ' ').slice(0, 16) + 'Z'; } catch (_) { return String(ms); } }
function intOrThrow(v, name) { const n = Number(v); if (!Number.isInteger(n)) throw new Error(`${name} must be an integer.`); return n; }
function clampInt(v, dflt, lo, hi) { const n = Number(v); if (!Number.isFinite(n)) return dflt; return Math.min(hi, Math.max(lo, Math.round(n))); }
