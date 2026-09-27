#!/usr/bin/env node
/* #106 · The ticket board must not keep screenshots once a ticket is done.
 * Drives the real handlers against an in-memory D1 + R2 double and checks the
 * bucket, not the rows: "Tested" empties R2 at once, the 20-day purge drops the
 * text, and a file whose row never landed is swept after the grace period. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lib = await import(pathToFileURL(resolve(root, 'functions/api/tickets/_lib.js')));
const idApi = await import(pathToFileURL(resolve(root, 'functions/api/tickets/[id].js')));

let failures = 0;
const check = (label, ok) => { if (ok) console.log('  ✓ ' + label); else { failures++; console.error('  ✗ ' + label); } };

function makeEnv() {
  const tickets = new Map(); const images = []; const followups = [];
  const bucket = new Map();
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async first() { return (await this.all()).results[0] || null; },
    async all() {
      if (/SELECT id FROM kiwi_tickets/.test(sql)) return { results: [...tickets.values()].filter((t) => t.status === 'done' && t.expires_ts != null && t.expires_ts <= args[0]).map((t) => ({ id: t.id })) };
      if (/SELECT id, status FROM kiwi_tickets/.test(sql)) { const t = tickets.get(args[0]); return { results: t ? [t] : [] }; }
      if (/SELECT object_key FROM kiwi_ticket_images WHERE ticket_id IN/.test(sql)) return { results: images.filter((i) => args.includes(i.ticket_id)) };
      if (/SELECT object_key FROM kiwi_ticket_images WHERE ticket_id = \?/.test(sql)) return { results: images.filter((i) => i.ticket_id === args[0]) };
      if (/SELECT object_key FROM kiwi_ticket_images/.test(sql)) return { results: images.slice() };
      throw new Error('unexpected query ' + sql);
    },
    async run() {
      let changes = 0;
      if (/DELETE FROM kiwi_ticket_images WHERE ticket_id IN/.test(sql) || /DELETE FROM kiwi_ticket_images WHERE ticket_id = \?/.test(sql)) {
        for (let i = images.length - 1; i >= 0; i--) if (args.includes(images[i].ticket_id)) { images.splice(i, 1); changes++; }
      } else if (/DELETE FROM kiwi_ticket_followups/.test(sql)) {
        for (let i = followups.length - 1; i >= 0; i--) if (args.includes(followups[i].ticket_id)) { followups.splice(i, 1); changes++; }
      } else if (/DELETE FROM kiwi_tickets/.test(sql)) {
        args.forEach((id) => { if (tickets.delete(id)) changes++; });
      } else if (/SET status = 'done'/.test(sql)) {
        const t = tickets.get(args[3]);
        if (t && t.status === 'testing') { Object.assign(t, { status: 'done', completed_ts: args[1], expires_ts: args[2] }); changes = 1; }
      } else throw new Error('unexpected write ' + sql);
      return { meta: { changes } };
    },
  });
  const DB = { prepare: (sql) => stmt(sql), async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
  const MEDIA = {
    async put(key, body, opts) { bucket.set(key, { key, uploaded: new Date(opts && opts.uploaded || Date.now()) }); },
    async delete(keys) { [].concat(keys).forEach((k) => bucket.delete(k)); },
    async list({ prefix }) { return { objects: [...bucket.values()].filter((o) => o.key.startsWith(prefix)), truncated: false }; },
  };
  return { env: { DB, MEDIA }, tickets, images, bucket };
}

const hour = 3600 * 1000;
const now = Date.now();
const w = makeEnv();
w.tickets.set(1, { id: 1, status: 'testing', expires_ts: null });
w.tickets.set(2, { id: 2, status: 'problem', expires_ts: null });
for (const [ticket, key] of [[1, 'kiwi-tickets/1/a.png'], [1, 'kiwi-tickets/1/followups/b.png'], [2, 'kiwi-tickets/2/c.png']]) {
  await w.env.MEDIA.put(key, '', { uploaded: now - 3 * hour });
  w.images.push({ ticket_id: ticket, object_key: key });
}
await w.env.MEDIA.put('kiwi-tickets/9/orphan-old.png', '', { uploaded: now - 3 * hour });
await w.env.MEDIA.put('kiwi-tickets/9/in-flight.png', '', { uploaded: now - 60 * 1000 });

const req = new Request('https://x/api/tickets/1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'tested' }) });
const res = await idApi.onRequestPatch({ request: req, env: w.env, params: { id: '1' } });
const body = await res.json();
check('"Tested" answers done and reports both screenshots deleted', body.status === 'done' && body.imagesDeleted === 2);
check('"Tested" removes the original and the follow-up screenshot from R2', !w.bucket.has('kiwi-tickets/1/a.png') && !w.bucket.has('kiwi-tickets/1/followups/b.png'));
check('an open ticket keeps its screenshot', w.bucket.has('kiwi-tickets/2/c.png'));

const swept = await lib.sweepOrphanMedia(w.env, now);
check('a file with no row, older than an hour, is swept', swept === 1 && !w.bucket.has('kiwi-tickets/9/orphan-old.png'));
check('a file still being uploaded is left alone', w.bucket.has('kiwi-tickets/9/in-flight.png'));

const later = now + lib.RETENTION_MS + 1000;
const purged = await lib.purgeExpired(w.env, later);
check('20 days after "Tested" the ticket text itself is purged', purged === 1 && !w.tickets.has(1) && w.tickets.has(2));

if (failures) process.exit(1);
console.log('\n✓ Ticket screenshots leave storage when a ticket is done.');
